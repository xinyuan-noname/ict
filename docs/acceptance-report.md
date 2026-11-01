# 验收报告（acceptance-report）

执行日期：2026-11-01
结论口径：**未验证项不得记为通过**。

## 已验证

| 项 | 方法 | 结果 |
|---|---|---|
| 服务端编译 | `cd server && go build ./...`（Go 1.25.1） | 通过 |
| 服务端静态检查 | `go vet ./...` | 通过，无告警 |
| 服务端单测 | `go test ./...` | 全部通过；service 覆盖率 **71.7%**、config **79.4%**、apperr 33.3% |
| 端到端集成测试 | `go test ./test/integration -v`，`httptest` 模拟华为侧 + 真实 HTTP 栈 | **6/6 通过** |
| 集成覆盖场景 | 登录→校验→me→退出→再校验 AUTH_013；码重放 AUTH_001；无凭证 me AUTH_004 且无用户数据；Windows 回调不匹配 AUTH_006 且不调上游；非法平台 AUTH_009；traceId 透传；限流 429 + Retry-After | 通过 |
| 客户端类型检查 | `cd app && npm run typecheck` | 通过（0 错误） |
| 客户端单元测试 | `cd app && npm test` | 25/25 通过 |
| 契约码表 | `node scripts/gen-contracts.mjs` | 14 个错误码生成成功 |
| 密钥扫描 | `node scripts/secret-scan.mjs` | 0 命中 |

## 未验证（有明确原因）

| 项 | 原因 | 后续条件 |
|---|---|---|
| `go test -race` | Windows 下 `-race` 需要 cgo/gcc，本机未安装 C 编译器 | 安装 MinGW-w64 或使用 Linux 容器 |
| 真实华为账号登录（8.1 / 8.2 / 8.5） | 未登记 AGC 应用，无 client_id 与回调白名单 | 完成 AGC 登记与三端签名指纹 |
| Android 端到端（登录→冷启动→退出） | 无 Android SDK / JDK 17 | 安装后执行 `npx react-native run-android` |
| Windows 端到端（网页授权 + 回环回调） | 无 VS C++ 负载 / Windows SDK，且 `app/windows/` 原生工程未生成 | 安装后执行 `npx react-native run-windows` |
| iOS 构建 | 需要 macOS + Xcode | 具备 macOS 构建机后补验 |
| 性能（50 QPS、P95 指标） | 尚未压测 | 按 tasks 任务 38 执行 k6 |
| 原生安全存储（Keychain / DPAPI） | 原生工程未构建 | 三端原生工程生成后验证 |

## 已知设计偏差（环境驱动）

1. **存储**：设计为 SQLite（modernc.org/sqlite），实际为 JSON 文件原子仓储；`port` 接口保持不变，替换成本可控。
2. **HTTP 框架**：设计为 chi，实际为 `net/http` + Go 1.22+ 路由模式；中间件顺序保持不变。
3. **熔断参数**：实现为「连续失败 5 次 / 退避 15s」，未实现 30s 窗口失败率统计（无第三方依赖）。
4. **PostgreSQL**：按范围外处理，未实现。

## 环境说明

Go 通过 scoop 安装（`~/scoop/apps/go/current`，版本 1.25.1）。系统环境变量 `GOROOT` 仍指向不存在的 `D:\develop_golang`，运行前需设置：

```bash
export GOROOT="$HOME/scoop/apps/go/current"
export PATH="$GOROOT/bin:$PATH"
```