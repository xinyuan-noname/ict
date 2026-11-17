#!/usr/bin/env bash
# ECS 上执行：拉取 origin/main，重建并滚动启动 compose，健康检查失败自动回滚。
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

if [[ ! -f deploy/.env ]]; then
  echo "缺少 deploy/.env，请先从 deploy/env.example 复制并填写" >&2
  exit 1
fi

exec 9>/tmp/checkism-deploy.lock
if ! flock -n 9; then
  echo "已有部署任务在运行" >&2
  exit 1
fi

set -a
# shellcheck disable=SC1091
source deploy/.env
set +a

PREVIOUS="$(git rev-parse HEAD)"
echo "当前版本: $PREVIOUS"

git fetch --prune origin main
git reset --hard origin/main
REVISION="$(git rev-parse --short HEAD)"
echo "部署版本: $REVISION"

COMPOSE=(docker compose -f deploy/docker-compose.yml --env-file deploy/.env)
if ! docker compose version >/dev/null 2>&1; then
  COMPOSE=(docker-compose -f deploy/docker-compose.yml --env-file deploy/.env)
fi

"${COMPOSE[@]}" build
"${COMPOSE[@]}" up -d --remove-orphans

PORT="${WEB_PORT:-8088}"
URL="http://127.0.0.1:${PORT}/v1/health"
echo "等待健康检查: $URL"
for _ in $(seq 1 60); do
  if curl -fsS --max-time 5 "$URL" >/dev/null 2>&1; then
    echo "部署成功: $REVISION"
    exit 0
  fi
  sleep 5
done

echo "健康检查失败，回滚到 $PREVIOUS" >&2
git reset --hard "$PREVIOUS"
"${COMPOSE[@]}" up -d --remove-orphans
exit 1
