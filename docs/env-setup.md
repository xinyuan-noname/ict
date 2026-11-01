# 环境基线（env-setup）

实测日期：2026-11-01

## 可用

| 项 | 版本 / 结论 |
|---|---|
| Node | v24.18.0 |
| npm | 11.17.0 |
| Python | 3.14.7 |
| Git | 2.55.0.windows.2，仓库已初始化 |
| npm registry | 可达（唯一可用的外网通道） |

## 阻塞 / 缺口

| 项 | 实测结果 | 影响 | 处理 |
|---|---|---|---|
| Go 工具链 | 已通过 scoop 安装，`go1.25.1 windows/amd64`；系统 `GOROOT` 指向无效的 `D:\develop_golang`，需手工导出 `GOROOT=$HOME/scoop/apps/go/current` | 正常编译 | 使用时先 export GOROOT 与 PATH |
| Go 模块代理 | proxy.golang.org、goproxy.cn 均被拦截 | 无法引入 chi / modernc.org/sqlite / gobreaker | 以 net/http、encoding/json、crypto/* 实现同等能力；存储改为原子写入的 JSON 文件仓储（保留 port 接口，后续可替换 SQLite） |
| Docker | CLI 存在，daemon 未运行 | 无法用容器编译 Go | 未使用 |
| 华为 AGC 登记 | 未登记 | 真实授权码获取不可用 | 以 `cmd/hwsim` 覆盖服务端全链路 |
| Visual Studio 2022 + C++ 负载 / Windows SDK | 未确认 | RNW 构建阻塞 | 未验证 |
| Android SDK / JDK 17 | 未确认 | Android 构建阻塞 | 未验证 |
| iOS 构建（macOS + Xcode） | 本机 Windows，不可用 | iOS 闭环为外部条件 | 标注未验证 |

## 验证命令

| 范围 | 命令 | 当前结果 |
|---|---|---|
| 客户端类型 | `cd app && npm run typecheck` | 通过 |
| 客户端单测 | `cd app && npm test` | 25 项通过 |
| Go 语法 | `NODE_PATH=/tmp/node_modules node scripts/check-go-syntax.mjs server` | 20 文件，0 语法错误 |
| Go 构建/单测 | `cd server && go build ./... && go vet ./... && go test ./...` | 通过（`-race` 需 cgo/gcc，未执行） |
| 契约生成 | `npm run gen:contracts` | 可运行（Node） |
| 密钥扫描 | `npm run secret:scan` | 可运行（Node） |

> 临时依赖说明：语法校验脚本依赖临时安装的 tree-sitter（`/tmp/node_modules`），项目未将其列入正式依赖。