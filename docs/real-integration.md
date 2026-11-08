# 真实接入操作手册

## 1. 模式开关

| 模式 | 必需配置 | 用途 |
|---|---|---|
| `real`（默认） | 官方端点 + 平台凭据 | 真华为账号 |
| `mock` | `AUTH_MODE=mock`、`AUTH_ALLOW_MOCK=1`、`ENV=development`、`HWSIM_BASE_URL=http://127.0.0.1:<port>`、`AUTH_STORAGE_NAMESPACE=*-mock` | 本地联调 |

以下情况**拒绝启动**（只输出项名，不输出值）：
- real 模式设置了 `HWSIM_BASE_URL` 或端点不是官方精确地址
- mock 模式带真实凭据、非 development 环境、端点非回环
- 任一 `duration/integer/float` 解析失败
- 存储命名空间与模式不匹配

## 2. 启动自检

```bash
export GOROOT="$HOME/scoop/apps/go/current"
cd server
go run ./cmd/authd --selfcheck
# 成功：selfcheck ok mode=real env=staging
```

## 3. 真实配置（需 AGC 登记后填写）

```bash
export AUTH_MODE=real
export ENV=production
export HUAWEI_IDENTITY_MODE=shared          # 或 per-platform
export HUAWEI_CLIENT_ID=<AGC_CLIENT_ID>     # 仅通过密钥通道注入 secret
export HUAWEI_CLIENT_SECRET=<KMS_REF>
export SESSION_PEPPER=<KMS_REF>
export AUTH_APP_ID=<APP_ID>
export AUTH_ANDROID_PACKAGE_NAME=com.checkism.app
export AUTH_ANDROID_RELEASE_CERT_SHA256_DIGEST=<64_HEX>
export AUTH_IOS_BUNDLE_ID=com.checkism.app
export AUTH_IOS_TEAM_ID=<TEAM_ID>
export AUTH_TLS_VERIFY=1
export AUTH_STORAGE_NAMESPACE=real
```

完整清单见 `server/deploy/.env.example`，登记流程见 `docs/agc-registration.md`。

## 4. mock 联调

```bash
bash scripts/e2e-demo.sh
```

脚本会自动开启 mock 三要素、跑完登录→校验→重放→退出，并检查存储头。

## 5. 真实冒烟

```bash
AUTH_REAL_SMOKE_ALLOW=1 \
SMOKE_BASE_URL=https://<your-domain> \
SMOKE_PLATFORM=android \
SMOKE_AUTH_CODE=<真实授权码> \
node scripts/smoke-real.mjs
```

未设置 `AUTH_REAL_SMOKE_ALLOW=1` 时脚本直接拒绝执行。

## 6. 发布前检查

```bash
# 发布产物不得含 hwsim
go build -o server/bin/authd.exe ./server/cmd/authd
node scripts/check-release-artifacts.mjs server/bin

# 仓库不得含 secret
node scripts/secret-scan.mjs
```

`hwsim` 只构建到 `.tools/bin/`（开发目录，已 gitignore）。

## 7. 回滚

1. 停止 authd
2. 恢复上一版配置（端点、凭据、模式）
3. `go run ./cmd/authd --selfcheck` 通过
4. 启动 authd
5. 抽查 `/v1/health` 与一次会话校验
6. 记录变更与影响会话数（正常为 0）
7. 归档变更记录

## 8. 服务端实现现状

- 端点：`MatchesOfficial` 逐字节精确匹配，禁止后缀/镜像
- 验签：RS256 + `iss` 白名单 + `aud`（字符串/数组）+ `azp` + `exp`（含 60s 偏移）
- 回退：ID Token 验签失败才走 tokeninfo，并核对 `client_id`
- 凭据：`shared` / `per-platform` 二选一，旧 secret 仅用于轮换回退
- 存储：文件头写入 `namespace`/`mode`，跨模式打开返回 `storage namespace mismatch`

## 9. 未验证项

真实账号、iOS/Android/Windows 真机与真实端点复核均未完成，逐条记录见 `docs/acceptance-real.md`。**mock 与本地测试结论不得替代真实验收。**