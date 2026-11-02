#!/usr/bin/env bash
# 签到 / 积分 / 像素头像框 端到端演示（mock 模式，仅本地联调）。
set -u
cd "$(dirname "$0")/../server" || exit 1

export GOROOT="$HOME/scoop/apps/go/current"
export PATH="$GOROOT/bin:$PATH"

HWSIM_ADDR=":18081"
AUTHD_ADDR=":18443"
DSN="./data/demo-rewards.json"
rm -f "$DSN" "$DSN.rewards.json"

../.tools/bin/hwsim.exe --addr "$HWSIM_ADDR" --scenario success > /tmp/rewards-hwsim.log 2>&1 &
HWSIM_PID=$!

ENV=development AUTH_MODE=mock AUTH_ALLOW_MOCK=1 \
HWSIM_BASE_URL="http://127.0.0.1${HWSIM_ADDR}" \
AUTH_STORAGE_NAMESPACE=real-mock \
SERVER_ADDR="$AUTHD_ADDR" \
SESSION_PEPPER=pepper-0123456789abcdef \
DATABASE_DSN="$DSN" \
./bin/authd.exe > /tmp/rewards-authd.log 2>&1 &
AUTHD_PID=$!

cleanup() { kill "$AUTHD_PID" "$HWSIM_PID" 2>/dev/null; wait 2>/dev/null; }
trap cleanup EXIT

sleep 2
BASE="http://127.0.0.1${AUTHD_ADDR}"

LOGIN=$(curl -s -X POST "$BASE/v1/auth/huawei/login" -H 'Content-Type: application/json' \
  -d '{"platform":"android","authCode":"rewards-demo","clientVersion":"1.0.0"}')
TOKEN=$(printf '%s' "$LOGIN" | sed -n 's/.*"sessionToken":"\([^"]*\)".*/\1/p')
echo "== token length: ${#TOKEN}"

echo "== 1. status (before) =="
curl -s "$BASE/v1/rewards/checkin/status" -H "Authorization: Bearer $TOKEN"
echo

echo "== 2. check-in =="
curl -s -X POST "$BASE/v1/rewards/checkin" -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -d '{}'
echo

echo "== 3. check-in again (alreadyCheckedIn=true) =="
curl -s -X POST "$BASE/v1/rewards/checkin" -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -d '{}'
echo

echo "== 4. frames =="
curl -s "$BASE/v1/rewards/frames" -H "Authorization: Bearer $TOKEN"
echo

echo "== 5. redeem free frame =="
curl -s -X POST "$BASE/v1/rewards/frames/frame_pixel_cyan/redeem" \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -H 'Idempotency-Key: idem-demo-0001' -d '{"catalogVersion":"catalog-v1"}'
echo

echo "== 6. redeem replay (replayed=true) =="
curl -s -X POST "$BASE/v1/rewards/frames/frame_pixel_cyan/redeem" \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -H 'Idempotency-Key: idem-demo-0001' -d '{"catalogVersion":"catalog-v1"}'
echo

echo "== 7. redeem unaffordable (POINT_002) =="
curl -s -X POST "$BASE/v1/rewards/frames/frame_pixel_cat/redeem" \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -H 'Idempotency-Key: idem-demo-0002' -d '{"catalogVersion":"catalog-v1"}'
echo

echo "== 8. equip =="
curl -s -X PUT "$BASE/v1/rewards/avatar-frame" -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' -d '{"frameId":"frame_pixel_cyan"}'
echo

echo "== 9. ledger =="
curl -s "$BASE/v1/rewards/points/ledger?limit=5" -H "Authorization: Bearer $TOKEN"
echo

echo "== 10. pixel assets =="
curl -s -o /tmp/frame.png -w "http=%{http_code} bytes=%{size_download}\n" "$BASE/assets/frames/frame_pixel_cyan-3x.png"