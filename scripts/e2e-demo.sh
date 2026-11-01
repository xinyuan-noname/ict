#!/usr/bin/env bash
# 端到端演示：启动 hwsim + authd，跑完登录→校验→me→退出→再校验。
set -u
cd "$(dirname "$0")/../server" || exit 1

export GOROOT="$HOME/scoop/apps/go/current"
export PATH="$GOROOT/bin:$PATH"

HWSIM_ADDR=":18081"
AUTHD_ADDR=":18443"

./bin/hwsim.exe --addr "$HWSIM_ADDR" --scenario success > /tmp/demo-hwsim.log 2>&1 &
HWSIM_PID=$!

ENV=development \
SERVER_ADDR="$AUTHD_ADDR" \
HUAWEI_CLIENT_ID=hwsim-client \
HUAWEI_CLIENT_SECRET=0123456789abcdef \
SESSION_PEPPER=pepper-0123456789abcdef \
HUAWEI_OAUTH_BASE_URL="http://127.0.0.1${HWSIM_ADDR}" \
DATABASE_DSN=./data/demo.json \
LOG_LEVEL=info \
./bin/authd.exe > /tmp/demo-authd.log 2>&1 &
AUTHD_PID=$!

cleanup() {
  kill "$AUTHD_PID" "$HWSIM_PID" 2>/dev/null
  wait 2>/dev/null
}
trap cleanup EXIT

sleep 2

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

echo "== 4. me =="
curl -s "http://127.0.0.1${AUTHD_ADDR}/v1/auth/me" -H "Authorization: Bearer $TOKEN"
echo

echo "== 5. replay same code (expect AUTH_001) =="
curl -s -X POST "http://127.0.0.1${AUTHD_ADDR}/v1/auth/huawei/login" \
  -H 'Content-Type: application/json' \
  -d '{"platform":"android","authCode":"demo-code-001","clientVersion":"1.0.0"}'
echo

echo "== 6. logout =="
curl -s -X POST "http://127.0.0.1${AUTHD_ADDR}/v1/auth/logout" \
  -H 'Content-Type: application/json' -d "{\"sessionToken\":\"$TOKEN\"}"
echo

echo "== 7. validate after logout (expect AUTH_013) =="
curl -s -X POST "http://127.0.0.1${AUTHD_ADDR}/v1/auth/session/validate" \
  -H 'Content-Type: application/json' -d "{\"sessionToken\":\"$TOKEN\"}"
echo

echo "== 8. upstream call stats =="
curl -s "http://127.0.0.1${HWSIM_ADDR}/hwsim/stats"
echo

echo "== 9. stored data contains no plaintext token =="
if grep -q 's1_' ./data/demo.json 2>/dev/null; then
  echo "FAIL: plaintext token found"
else
  echo "OK: no plaintext token in storage"
fi