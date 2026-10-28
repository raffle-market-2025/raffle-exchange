#!/usr/bin/env bash
# Одноразовая подготовка свежего VPS Hetzner (Ubuntu 24.04) под деплой raffle-exchange.
# Запуск от root на сервере:
#   bash bootstrap-server.sh "ssh-ed25519 AAAA... raffle-exchange-deploy"
# Аргумент — ПУБЛИЧНЫЙ ключ деплоя. Приватный ключ на сервер не копируется.
set -euo pipefail

PUBKEY="${1:-}"
DEPLOY_USER=deploy
DEPLOY_DIR=/opt/raffle-exchange

if [[ $EUID -ne 0 ]]; then
  echo "Запускать от root" >&2
  exit 1
fi
if [[ ! "$PUBKEY" =~ ^ssh-ed25519\ [A-Za-z0-9+/=]+(\ .*)?$ ]]; then
  echo "Первым аргументом нужен публичный ключ ssh-ed25519" >&2
  exit 1
fi
# shellcheck source=/dev/null
. /etc/os-release
if [[ "${ID}" != "ubuntu" ]]; then
  echo "Скрипт рассчитан на Ubuntu, обнаружено: ${ID}" >&2
  exit 1
fi

export DEBIAN_FRONTEND=noninteractive
apt-get update -q
apt-get upgrade -yq
apt-get install -yq ca-certificates curl ufw unattended-upgrades fail2ban

# Docker из официального репозитория Docker.
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
chmod a+r /etc/apt/keyrings/docker.asc
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu ${VERSION_CODENAME} stable" \
  > /etc/apt/sources.list.d/docker.list
apt-get update -q
apt-get install -yq docker-ce docker-ce-cli containerd.io docker-compose-plugin

cat > /etc/docker/daemon.json <<'JSON'
{
  "log-driver": "json-file",
  "log-opts": { "max-size": "10m", "max-file": "5" },
  "live-restore": true
}
JSON
systemctl restart docker

# Пользователь деплоя. Группа docker даёт права, равные root, — ключ хранится только в секретах GitHub Environment.
id "$DEPLOY_USER" >/dev/null 2>&1 || useradd -m -s /bin/bash "$DEPLOY_USER"
usermod -aG docker "$DEPLOY_USER"
install -d -m 700 -o "$DEPLOY_USER" -g "$DEPLOY_USER" "/home/$DEPLOY_USER/.ssh"
# restrict: без проброса портов, агента и pty — только команды и scp.
echo "restrict ${PUBKEY}" > "/home/$DEPLOY_USER/.ssh/authorized_keys"
chown "$DEPLOY_USER:$DEPLOY_USER" "/home/$DEPLOY_USER/.ssh/authorized_keys"
chmod 600 "/home/$DEPLOY_USER/.ssh/authorized_keys"
install -d -m 750 -o "$DEPLOY_USER" -g "$DEPLOY_USER" "$DEPLOY_DIR"

# Файрвол: снаружи открыт только SSH. Порты контейнеров публикуются на 127.0.0.1,
# поэтому то, что Docker обходит ufw для опубликованных портов, здесь ничего не открывает.
ufw default deny incoming
ufw default allow outgoing
ufw allow OpenSSH
ufw --force enable

dpkg-reconfigure -f noninteractive unattended-upgrades
systemctl enable --now fail2ban

# Вход только по ключам. Включается лишь если у root уже есть ключ, чтобы не потерять доступ.
if [[ -s /root/.ssh/authorized_keys ]]; then
  cat > /etc/ssh/sshd_config.d/10-raffle-hardening.conf <<'CONF'
PasswordAuthentication no
KbdInteractiveAuthentication no
PermitRootLogin prohibit-password
CONF
  sshd -t
  systemctl reload ssh
  SSH_NOTE="Вход по паролю отключён."
else
  SSH_NOTE="ВНИМАНИЕ: у root нет SSH-ключа, вход по паролю оставлен включённым. Добавьте ключ и перезапустите скрипт."
fi

echo
echo "Готово. Docker $(docker --version | cut -d' ' -f3 | tr -d ,), пользователь ${DEPLOY_USER}, каталог ${DEPLOY_DIR}."
echo "${SSH_NOTE}"
echo "Отпечаток ключа хоста для DEPLOY_KNOWN_HOSTS (сверьте с тем, что видите при первом входе):"
ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub
