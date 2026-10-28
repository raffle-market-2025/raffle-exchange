# Деплой на VPS Hetzner

Решение — [ADR-0004](../docs/adr/0004-hosting.md). Сейчас на сервер выкатывается только `exchange-api`; БД и исполнители добавляются по мере этапов.

## Как это работает

1. Push в `main` → workflow `image` собирает образ, проверяет его и публикует в GHCR с тегом SHA коммита.
2. Если переменная репозитория `DEPLOY_ENABLED` = `true`, запускается job `deploy` в GitHub Environment `production`. Она ждёт подтверждения в Actions.
3. Job копирует `compose.prod.yml` и `remote-deploy.sh` в `/opt/raffle-exchange` и запускает скрипт с SHA коммита.
4. Скрипт поднимает новую версию, проверяет `/health/live` и при неудаче возвращает прошлую. Если образ не скачался, работающая версия не трогается.

API на сервере слушает только `127.0.0.1:3100`. Наружу открыт только SSH.

## Настройка один раз

### 1. Сервер

В Hetzner Cloud: Ubuntu 24.04, ваш личный SSH-ключ для root. Для одного API хватит самого маленького x86-тарифа; браузерным исполнителям на этапе C понадобится больше памяти, тариф можно поднять без пересоздания.

### 2. Ключ деплоя

Отдельная пара ключей только для GitHub Actions, без пароля:

```bash
ssh-keygen -t ed25519 -N '' -C raffle-exchange-deploy -f ~/.ssh/raffle_exchange_deploy
```

### 3. Подготовка сервера

```bash
scp deploy/bootstrap-server.sh root@<IP>:/root/
ssh root@<IP> "bash /root/bootstrap-server.sh '$(cat ~/.ssh/raffle_exchange_deploy.pub)'"
```

Скрипт ставит Docker из официального репозитория, создаёт пользователя `deploy` с одним ключом в режиме `restrict`, включает ufw (только SSH), fail2ban и автообновления безопасности, отключает вход по паролю (если у root уже есть ключ) и печатает отпечаток ключа хоста.

### 4. GitHub

В репозитории → Settings:

1. **Environments → New environment** `production`. Включить **Required reviewers** (себя) и в **Deployment branches** оставить только `main`.
2. В этом окружении — **Environment secrets**:
   - `DEPLOY_HOST` — IP сервера;
   - `DEPLOY_USER` — `deploy`;
   - `DEPLOY_SSH_KEY` — содержимое `~/.ssh/raffle_exchange_deploy` (приватный ключ целиком);
   - `DEPLOY_KNOWN_HOSTS` — вывод `ssh-keyscan -t ed25519 <IP>`. Перед сохранением сверьте отпечаток (`ssh-keyscan -t ed25519 <IP> | ssh-keygen -lf -`) с тем, что напечатал скрипт на шаге 3.
3. **Secrets and variables → Actions → Variables** → `DEPLOY_ENABLED` = `true`.

После этого следующий push в `main` дойдёт до job `deploy` и будет ждать подтверждения.

## Проверка и откат вручную

```bash
ssh deploy@<IP> 'cat /opt/raffle-exchange/current-tag; curl -s 127.0.0.1:3100/health/live'
# откат на конкретную версию:
ssh deploy@<IP> 'bash /opt/raffle-exchange/remote-deploy.sh <SHA>'
```

Ключ `deploy` с правами группы docker равен по силе root на этом сервере: храните его только в секретах окружения и меняйте при подозрении на утечку (новый ключ → `authorized_keys` → секрет).
