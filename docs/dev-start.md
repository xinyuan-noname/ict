# 一键调试启动

## 三种方式

| 方式 | 命令 | 说明 |
|---|---|---|
| 双击 | `start.bat` | Windows 下双击即可 |
| npm | `npm start`（项目根目录） | 等同于 start.bat |
| 仅后端 | `npm run start:api` | 只启动 Go 服务，不启动 Metro |
| 自检 | `npm run start:test` | 构建 + 启动 + 登录/签到冒烟，完成后自动退出 |

## `npm start` 做了什么

1. 自动定位 Go（优先 `%USERPROFILE%\scoop\apps\go\current\bin\go.exe`，兼容已配置的 `GOROOT`）
2. 编译 `server/bin/authd.exe` 与 `.tools/bin/hwsim.exe`
3. 启动 hwsim（`127.0.0.1:18081`，`--scenario success`）
4. 以 mock 模式启动 authd（`127.0.0.1:18443`）：
   - `AUTH_MODE=mock`、`AUTH_ALLOW_MOCK=1`、`ENV=development`
   - `HWSIM_BASE_URL=http://127.0.0.1:18081`
   - `AUTH_STORAGE_NAMESPACE=real-mock`、`DATABASE_DSN=./data/dev.json`
5. 轮询 `/v1/health`，就绪后启动 Metro（`127.0.0.1:8081`）
6. 打开 `preview/index.html` 静态 UI 预览
7. `Ctrl+C` 一次停止全部子进程（Windows 下按进程树结束）

日志：`.dev/logs/hwsim.log`、`.dev/logs/authd.log`、`.dev/logs/metro.log`（已 gitignore）。

## 常用参数

```bash
node scripts/dev.mjs --no-open        # 不自动打开浏览器
node scripts/dev.mjs --no-metro       # 只起后端
node scripts/dev.mjs --api-only       # 同上，等价别名
node scripts/dev.mjs --self-test      # 冒烟后自动退出
node scripts/dev.mjs --build-only     # 只编译，不启动
```

## 启动后可用的地址

| 地址 | 用途 |
|---|---|
| `http://127.0.0.1:18443/v1/health` | 服务健康 |
| `http://127.0.0.1:18443/v1/rewards/checkin/status` | 需 Bearer |
| `http://127.0.0.1:18081/hwsim/stats` | 模拟器调用计数 |
| `http://127.0.0.1:8081` | Metro |

快速验证：

```bash
curl http://127.0.0.1:18443/v1/health
bash scripts/rewards-demo.sh   # 独立演示（自带启停，不占用 18081/18443 之外端口）
```

## 前置条件

- Node 20+（当前 24.18.0）
- Go 1.23+（当前 1.25.1，支持 scoop 路径或 `GOROOT` 环境变量）
- 端口 `8081` / `18081` / `18443` 未被占用

## 说明

- mock 模式仅供本地调试，**不得替代真实验收**；真实接入见 `docs/real-integration.md`。
- 真机运行仍需构建 APK/Windows 应用（见 `docs/native-build.md`）；`npm start` 负责后端与 Metro。
- 启动器的健康检查依赖本机回环网络；若被安全软件拦截，请放行 `127.0.0.1:18443`。