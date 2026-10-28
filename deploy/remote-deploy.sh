#!/usr/bin/env bash
# Выполняется на сервере из workflow `image`: bash remote-deploy.sh <полный SHA коммита>.
# Поднимает образ с тегом SHA, проверяет /health/live и при неудаче возвращает прошлую версию.
set -euo pipefail

TAG="${1:-}"
DEPLOY_DIR="${DEPLOY_DIR:-/opt/raffle-exchange}"
COMPOSE=(docker compose -f compose.prod.yml)

if [[ ! "$TAG" =~ ^[0-9a-f]{40}$ ]]; then
  echo "Ожидается полный SHA коммита, получено: '${TAG}'" >&2
  exit 2
fi

cd "$DEPLOY_DIR"
PREV="$(cat current-tag 2>/dev/null || true)"

healthy() {
  for _ in $(seq 1 30); do
    if curl -fsS http://127.0.0.1:3100/health/live 2>/dev/null | grep -q '"live":true'; then
      return 0
    fi
    sleep 2
  done
  return 1
}

# Если образ не скачался, работающая версия не тронута.
IMAGE_TAG="$TAG" "${COMPOSE[@]}" pull

if IMAGE_TAG="$TAG" "${COMPOSE[@]}" up -d --wait --wait-timeout 90 && healthy; then
  echo "$TAG" > current-tag
  echo "Развёрнуто: $TAG"
  docker image prune -f --filter "until=168h" >/dev/null
  exit 0
fi

echo "Версия $TAG не прошла проверку здоровья" >&2
IMAGE_TAG="$TAG" "${COMPOSE[@]}" logs --tail 50 exchange-api >&2 || true
if [[ -n "$PREV" ]]; then
  echo "Откат на $PREV" >&2
  IMAGE_TAG="$PREV" "${COMPOSE[@]}" up -d --wait --wait-timeout 90 && healthy \
    && echo "Откат выполнен" >&2 || echo "Откат тоже не прошёл проверку — нужен ручной разбор" >&2
fi
exit 1
