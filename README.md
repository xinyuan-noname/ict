# 华为账号最小登录系统（ict）

React Native 客户端（Android / iOS / Windows）+ Go 服务端，使用华为账号登录的最小闭环。

## 目录

```
contracts/            契约单一源（openapi.json / error-codes.json + 生成产物）
server/               Go 服务端（标准库零依赖，四层架构）
  cmd/authd/          HTTP 服务
  cmd/hwsim/          华为账号服务本地模拟器（仅开发）
  internal/           config / domain / port / service / handler / adapter / middleware
app/                  React Native 客户端（TypeScript）
  src/api             接口客户端（超时、错误分流、traceId）
  src/auth            登录态机与平台授权策略
  src/screens         登录页 / 主页 / 设置页
scripts/              语法校验等本地脚本
docs/                 环境、验收与运维记录
```

## 快速开始（本地联调）

```bash
# 1. 启动华为侧模拟器（另开终端）
cd server && go run ./cmd/hwsim --addr :8081 --scenario success

# 2. 启动服务端（指向模拟器）
cd server
export ENV=development
export HUAWEI_CLIENT_ID=hwsim-client
export HUAWEI_CLIENT_SECRET=0123456789abcdef
export SESSION_PEPPER=pepper-0123456789abcdef
export HUAWEI_OAUTH_BASE_URL=http://127.0.0.1:8081
export DATABASE_DSN=./data/auth.json
go run ./cmd/authd

# 3. 验证
curl -s localhost:8443/v1/health
curl -s -X POST localhost:8443/v1/auth/huawei/login \
  -H 'Content-Type: application/json' \
  -d '{"platform":"android","authCode":"demo-code","clientVersion":"1.0.0"}'
```

客户端：

```bash
cd app
npm install
npm run typecheck
npm test
npx react-native run-android   # 或 run-windows
```

## 关键设计

- **唯一身份来源**：服务端向华为侧校验授权码后以 openID 建档；不信任客户端自报身份，不接受账号密码登录。
- **平台适配**：Android/iOS 走 Account Kit 原生授权；Windows 走 OAuth 2.0 网页授权 + `127.0.0.1:17890` 回环回调，能力探测失败即禁用登录。
- **会话安全**：`s1_` + 32 字节 CSPRNG（46 字符），库中只存 `HMAC-SHA256(pepper, token)`；校验顺序为格式 → 查库 → 吊销 → 过期 → 档案状态。
- **错误码**：14 个 `AUTH_xxx` 由 `contracts/error-codes.json` 单源生成，双端不得手写第二份。
- **不阻断**：审计为异步有界队列，丢弃只计数，不影响登录返回。

## 当前环境限制（务必阅读）

- Go 1.25.1 已通过 scoop 安装（系统 `GOROOT` 失效，需 `export GOROOT="$HOME/scoop/apps/go/current"`）。服务端保持标准库零依赖，`go build ./...`、`go vet ./...`、`go test ./...` 与端到端集成测试均已通过；`go test -race` 需要 cgo/gcc，未执行。
- 未登记华为 AGC 应用（client_id / 指纹 / 回调），真实华为账号授权码获取需外部条件；服务端链路由 `hwsim` 覆盖。
- iOS 构建需要 macOS + Xcode，本机不可用；Windows 构建需要 VS 2022 C++ 负载与 Windows SDK。
- 详见 `docs/env-setup.md` 与 `docs/acceptance-report.md`。