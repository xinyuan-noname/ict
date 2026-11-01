# 本地联调（local-debug）

前置：已安装 Go 1.23+（`go version` 可执行）与 Node 20+/24。

## 1. 启动华为侧模拟器

```bash
cd server
go run ./cmd/hwsim --addr :8081 --scenario success
```

场景通过 `X-Hwsim-Scenario` 头切换：

| 场景 | 预期结果 |
|---|---|
| `success` | 换票成功，返回 access_token + id_token |
| `invalid_grant` | 服务端 AUTH_001 |
| `invalid_client` | 服务端 AUTH_008（配置 previous 密钥时触发一次回退） |
| `server_error` | 服务端 AUTH_003 |
| `rate_limited` | 服务端 AUTH_003 |
| `timeout` | 服务端 ≤3s 返回 AUTH_003 |
| `missing_openid` | 服务端 AUTH_011 |
| `bad_signature` | 验签失败后回退 tokeninfo |
| `http_avatar` | 头像被置空，登录成功 |
| `no_profile` | 昵称头像为空，登录成功 |

调用计数：`curl -s localhost:8081/hwsim/stats`。

## 2. 启动服务端

```bash
cd server
export ENV=development
export HUAWEI_CLIENT_ID=hwsim-client
export HUAWEI_CLIENT_SECRET=0123456789abcdef
export SESSION_PEPPER=pepper-0123456789abcdef
export HUAWEI_OAUTH_BASE_URL=http://127.0.0.1:8081
export DATABASE_DSN=./data/auth.json
go run ./cmd/authd
```

注意：`ENV=production` 时 `HUAWEI_OAUTH_BASE_URL` 必须是官方域名，且 `AUDIT_SINK=discard`、`LOG_LEVEL=debug` 会被拒绝启动。

## 3. 闭环验证

```bash
# 健康检查
curl -s localhost:8443/v1/health

# 登录
TOKEN=$(curl -s -X POST localhost:8443/v1/auth/huawei/login \
  -H 'Content-Type: application/json' \
  -d '{"platform":"android","authCode":"demo-code","clientVersion":"1.0.0"}' | jq -r .sessionToken)

# 静默校验
curl -s -X POST localhost:8443/v1/auth/session/validate \
  -H 'Content-Type: application/json' -d "{\"sessionToken\":\"$TOKEN\"}"

# 当前用户
curl -s localhost:8443/v1/auth/me -H "Authorization: Bearer $TOKEN"

# 退出并验证吊销生效
curl -s -X POST localhost:8443/v1/auth/logout \
  -H 'Content-Type: application/json' -d "{\"sessionToken\":\"$TOKEN\"}"
curl -s -X POST localhost:8443/v1/auth/session/validate \
  -H 'Content-Type: application/json' -d "{\"sessionToken\":\"$TOKEN\"}"   # 期望 AUTH_013
```

## 4. 客户端地址

| 目标 | API_BASE_URL |
|---|---|
| Android 模拟器 | `http://10.0.2.2:8443` |
| iOS 模拟器 / Windows | `http://127.0.0.1:8443` |
| 生产 | `https://<domain>` |

仅开发环境允许 http；`assertBaseUrl` 会拒绝其他非 https 地址。

## 5. 已知限制

- 真实华为授权码需要 AGC 应用登记（包名 / BundleID / 签名指纹 / 回调白名单），未登记时只能用 hwsim 覆盖服务端链路。
- Windows 回环授权需生成 `app/windows` 原生工程（`npx react-native init-windows`）后接入 `NativeModules.cs`。
- `app/android`、`app/ios` 的原生工程与 Gradle/Pod 配置需按 RN 0.76 模板补齐后再构建。