#!/usr/bin/env bash
# Huawei Cloud ECS（EulerOS / openEuler）一键准备脚本。
# 只安装运行时、创建目录、启动编排；不写入任何密钥。
#
# 用法：
#   sudo bash deploy/ecs-bootstrap.sh
#   cd /opt/check && cp deploy/env.example deploy/.env && vi deploy/.env
#   docker compose -f deploy/docker-compose.yml --env-file deploy/.env up -d --build
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/check}"
REPO_URL="${REPO_URL:-}"

if [[ "$(id -u)" -ne 0 ]]; then
  echo "请使用 root 或 sudo 运行" >&2
  exit 1
fi

echo "[1/5] 安装 Docker 与基础工具"
if command -v dnf >/dev/null 2>&1; then
  dnf install -y docker git curl tar
  dnf install -y docker-compose-plugin || true
elif command -v yum >/dev/null 2>&1; then
  yum install -y docker git curl tar
  yum install -y docker-compose-plugin || true
else
  echo "未识别包管理器，请手动安装 Docker 24+ 与 Compose v2" >&2
  exit 1
fi

echo "[2/5] 启动 Docker"
systemctl enable --now docker

echo "[3/5] 准备应用目录 ${APP_DIR}"
mkdir -p "${APP_DIR}"
if [[ -n "${REPO_URL}" && ! -d "${APP_DIR}/.git" ]]; then
  git clone "${REPO_URL}" "${APP_DIR}"
fi

echo "[4/5] 放行 HTTP/HTTPS（如启用了 firewalld）"
if command -v firewall-cmd >/dev/null 2>&1; then
  firewall-cmd --permanent --add-service=http || true
  firewall-cmd --permanent --add-service=https || true
  firewall-cmd --reload || true
fi

echo "[5/5] 完成。下一步："
echo "  cd ${APP_DIR}"
echo "  cp deploy/env.example deploy/.env && vi deploy/.env"
echo "  docker compose -f deploy/docker-compose.yml --env-file deploy/.env up -d --build"
echo
echo "注意：华为云安全组需放行 80/443；RDS/Redis 安全组需放行来自本 ECS 内网地址的 3306/6379。"
