#!/usr/bin/env bash
# mock 模式端到端演示：hwsim + authd（AUTH_MODE=mock 必须显式开启）。
# 该结果仅用于本地联调，不得替代真实验收。
set -u
cd "$(dirname "$0")/../server" || exit 1

export GOROOT="$HOME/scoop/apps/go/current"
export PATH="$GOROOT/bin:$PATH"

HWSIM_ADDR=":18081"
AUTHD_ADDR=":18443"
DSN="./data/demo-mock.json"

rm -f "$DSN"
../.tools/bin/hwsim.exe --addr "$HWSIM_ADDR" --scenario success > /tmp/demo-hwsim.log 2>&1 &
HWSIM_PID=$!

ENV=development \
AUTH_MODE=mock \
AUTH_ALLOW_MOCK=1 \
HWSIM_BASE_URL="http://127.0.0.1${HWSIM_ADDR}" \
AUTH_STORAGE_NAMESPACE=real-mock \
SERVER_ADDR="$AUTHD_ADDR" \
SESSION_PEPPER=pepper-0123456789abcdef \
DATABASE_DSN="$DSN" \
LOG_LEVEL=info \
./bin/authd.exe > /tmp/demo-authd.log 2>&1 &
AUTHD_PID=$!

cleanup() {
  kill "$AUTHD_PID" "$HWSIM_PID" 2>/dev/null
  wait 2>/dev/null
}
trap cleanup EXIT

sleep 2

echo "== 0. boot log (must show mode=mock, no secret) =="
head -1 /tmp/demo-authd.log

echo "== 1. health =="
curl -s "http://127.0.0.1${AUTHD_ADDR}/v1/health"
echo

echo "== 2. login =="
LOGIN=$(curl -s -X POST "http://127.0.0.1${AUTHD_ADDR}/v1/auth/huawei/login" \
  -H 'Content-Type: application/json' \
  -d '{"platform":"android","authCode":"demo-code-001","clientVersion":"1.0.0"}')
echo "$LOGIN"
TOKEN=$(printf '%s' "$LOGIN" | sed -n 's/.*"sessionToken":"\([^"]*\)".*/\1/p')
echo "token-length: ${#TOKEN}"

echo "== 3. validate =="
curl -s -X POST "http://127.0.0.1${AUTHD_ADDR}/v1/auth/session/validate" \
  -H 'Content-Type: application/json' -d "{\"sessionToken\":\"$TOKEN\"}"
echo

echo "== 4. replay same code (expect AUTH_001) =="
curl -s -X POST "http://127.0.0.1${AUTHD_ADDR}/v1/auth/huawei/login" \
  -H 'Content-Type: application/json' \
  -d '{"platform":"android","authCode":"demo-code-001","clientVersion":"1.0.0"}'
echo

echo "== 5. logout + revoked validate (expect AUTH_013) =="
curl -s -X POST "http://127.0.0.1${AUTHD_ADDR}/v1/auth/logout" \
  -H 'Content-Type: application/json' -d "{\"sessionToken\":\"$TOKEN\"}" > /dev/null
curl -s -X POST "http://127.0.0.1${AUTHD_ADDR}/v1/auth/session/validate" \
  -H 'Content-Type: application/json' -d "{\"sessionToken\":\"$TOKEN\"}"
echo

echo "== 6. storage header =="
head -4 "$DSN"