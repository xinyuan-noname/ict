# 赛题一 · 交付说明与验收索引

> 作品：**check · 每日健康清单**
> 方向：生活服务 / 健康管理
> 技术栈：React Native（Web / Android / Windows）+ Go 标准库四层服务端 + 华为云 ECS / RDS / DCS Redis
> 一句话：把饮水、服药、运动、英语做成一份真正能坚持的每日清单，并用华为云码道 CodeArts 完成从想法到云上 Demo 的闭环。

---

## 1. 对照赛题要求

| 赛题要求 | 本项目落点 | 证据 |
|---|---|---|
| 休闲娱乐 / 办公 / 行业 / 生活应用不限 | 生活服务 · 每日健康清单 | `app/src/features/*`、首页 / 数据 / 我的 |
| 云上部署，可视化 Demo | Web 产物 + Nginx + ECS 部署手册 | `deploy/`、`app/dist/`、`?demo=guest` |
| 体现需求理解 | 赛题拆成登录、清单、统计、成就、云资源五类验收项 | `.codeartsdoer/specs/huawei_id_login/spec.md`、`docs/` |
| 体现代码生成 | CodeArts 生成 React Native 页面、Go 四层骨架、契约与测试 | `app/src`、`server/internal`、`contracts/` |
| 体现项目构建 | 类型检查、Jest、Go build/test、Webpack | `npm run typecheck/test/web:build`、`go test ./...` |
| 体现问题修复 | traceId + 错误码 + 测试失败点驱动修复 | `app/src/shared/errorCatalog.ts`、`server/internal/platform/apperr` |
| 体现部署上线 | Docker 多阶段构建 + Compose + Nginx 同源反代 | `deploy/Dockerfile.*`、`deploy/docker-compose.yml` |
| 关联 RDS / Redis 等云服务 | RDS schema + 连接探活；Redis 地址探活；MaaS 可选 | `db/schema.sql`、`server/internal/adapter/cloud`、`/v1/health` |
| 使用码道 CodeArts 代码智能体（必选） | Prompt / 产出 / 修复记录见第 5 节 | 本文第 5 节 |
| 开源要求（总决赛） | MIT License、源码、依赖、部署、文档、截图 | `LICENSE`、`README.md`、`deploy/`、`docs/screenshots/` |

### 当前状态（务必如实阅读）

- **已实现**：本地可运行的完整 App、Go 服务端、契约、测试、Web 构建、Docker/Compose/Nginx 部署文件、RDS schema、云资源健康探活、系统与云端页面。
- **移动端**：x86_64 / arm64-v8a APK 已构建；x86_64 已安装到 Android 15 模拟器，验证游客主页、洞察、运动成就 nav 栏、我的、系统与云端与 250 ml 饮水记录；arm64 已安装到华为 PPA-AL20，完成华为账号授权并登录成功（服务端 `login_success`，用户 `hid36683688`）。
- **云上待执行**：RDS / DCS 实例需要账号与代金券，仓库内提供开通与部署步骤；`/v1/health` 在未配置时返回 `not_configured`，不会伪造“已连接”。
- **数据面**：为了无云环境也能评审，当前默认使用 `server/data/*.json` 文件存储；`server/internal/port` 已把仓储接口与实现分离，`db/schema.sql` 是迁移到 RDS 的字段基线。

---

## 2. 架构

```text
┌──────────────────────────────┐
│ React Native (Web / Android) │
│  features: water / med / ... │
└──────────────┬───────────────┘
               │ HTTPS / JSON
┌──────────────▼───────────────┐
│ Nginx (同源反代 / 静态资源)   │
└──────────────┬───────────────┘
               │ /v1
┌──────────────▼───────────────┐
│ authd (Go, 标准库)            │
│ handler → service → port     │
│                    ↑ adapter │
│  filestore / huawei / wechat │
└───────┬──────────────┬───────┘
        │              │
┌───────▼──────┐ ┌─────▼──────┐
│ RDS MySQL 8  │ │ DCS Redis  │
│ schema 基线  │ │ 探活/缓存  │
└──────────────┘ └────────────┘
        │
┌───────▼──────┐
│ MaaS（可选） │
└──────────────┘
```

设计要点：

- **端口 / 适配器分离**：`server/internal/port` 只定义仓储与外部能力，`adapter` 实现；换成 RDS / Redis 不改业务服务。
- **前端 feature 化**：`app/src/features/registry.tsx` 把「清单元数据 → 今日 / 统计 / 成就面板」集中注册，新增清单不改主页与数据页。
- **设计令牌**：`app/src/ui/theme.tsx` 统一颜色、字号、圆角、阴影；页面不写死视觉值。
- **Demo 外壳**：`app/src/app/AppFrame.tsx` 在宽屏展示「产品叙事 + 手机预览」，窄屏回落到移动端。

---

## 3. 可视化 Demo

启动后打开：

- 登录页：`http://<host>:8088/`
- 游客直达：`http://<host>:8088/?demo=guest`
- 云端状态：登录后「我的 → 系统与云端」

推荐演示路径（3 分钟）：

1. **游客进入**：打开 `?demo=guest`，展示首页环形进度、清单切换。
2. **记录一次饮水**：点「杯 250ml」或拖动滑杆 → 「记录 250ml」，看首页数字与记录列表变化。
3. **切换洞察**：底部「洞察」→ 查看周记 / 月记 / 季度记、达成率；在「运动 → 洞察 → 成就」用顶部 nav 栏切换步行 / 骑行 / 配速 / 距离 / 连击成就。
4. **我的 → 系统与云端**：展示 API / RDS / Redis / 华为账号 / MaaS 状态与 CodeArts 五步闭环。
5. **宽屏演示**：1440px 下展示左侧产品叙事 + 右侧手机实时预览，适合投屏。

截图：

- `docs/screenshots/home.png`
- `docs/screenshots/data.png`
- `docs/screenshots/achievements.png`
- `docs/screenshots/profile.png`
- `docs/screenshots/system.png`
- `docs/screenshots/android-home.png`
- `docs/screenshots/android-achievements.png`
- `docs/screenshots/android-system.png`
- `docs/screenshots/android-checklist.png`
- `docs/screenshots/android-english.png`
- `docs/screenshots/android-login-success.png`
- `docs/screenshots/login.png`

---

## 4. 云端资源与配置

| 变量 | 说明 | 未配置时 |
|---|---|---|
| `RDS_ADDR` | RDS MySQL 内网 `host:port` | `checks.rds=not_configured` |
| `REDIS_ADDR` | DCS Redis 内网 `host:port` | `checks.redis=not_configured` |
| `MAAS_HEALTH_URL` | MaaS 健康端点（完整 URL） | `checks.maas=not_configured` |
| `MAAS_API_KEY` | MaaS API Key（只用于探活 Header） | 空 |
| `CLOUD_REGION` | 区域，默认 `cn-north-4` | 默认值 |
| `DEPLOYMENT_ID` | 本次部署标识，展示在健康检查 | `local` |

> mock 演示必须设置 `AUTH_STORAGE_NAMESPACE=cloud-mock`，且不要注入真实 AGC 凭据；切 `AUTH_MODE=real` 后改为 `cloud`。

健康检查示例：

```json
{
  "status": "ok",
  "version": "1.0.0",
  "env": "production",
  "checks": {
    "config": "ok",
    "storage": "ok",
    "huawei": "ok",
    "rds": "ok",
    "redis": "ok",
    "maas": "not_configured"
  },
  "cloud": {
    "provider": "huaweicloud",
    "region": "cn-north-4",
    "deploymentId": "check-demo-001"
  }
}
```

安全约束：

- 探活只返回 `ok / degraded / fail / not_configured`，不返回连接串、账号、密钥。
- RDS / Redis 只通过 VPC 内网访问；安全组仅放行 ECS 内网地址。
- 生产必须 `AUTH_MODE=real`，`AUTH_ALLOW_MOCK=0`；`mock` 仅用于离线演示。
- 所有密钥通过 `deploy/.env` 或环境变量注入，`.env` 已在 `.gitignore` 中。

---

## 5. CodeArts 代码智能体使用记录

> 说明：以下是本作品开发时实际采用的任务拆解与 Prompt 模板。提交总决赛时建议补充 CodeArts 会话截图与 commit 链接，形成「Prompt → 产出 → 验证」证据链。

### 5.1 需求理解

Prompt：

```text
阅读赛题一与当前仓库 README、contracts/openapi.json、.codeartsdoer/specs。
把作品拆成：
1) 用户可感知的核心交互；
2) 云上部署必须的资源；
3) 可量化的验收项（构建、测试、健康检查、Demo 路径）。
输出一个不超过 10 项的验收清单，并指出当前仓库缺口。
```

产出：

- 赛题要求 → 页面 / 接口 / 部署映射（本文第 1 节）。
- 缺口清单：云资源探活、部署文件、系统状态页、开源许可证。

### 5.2 代码生成

Prompt：

```text
在不引入第三方依赖的前提下，为 Go 服务端增加华为云资源只读探活：
- 新增 internal/adapter/cloud，提供 TCPProbe 与 HTTPProbe；
- handler.Deps 增加 Cloud map，/v1/health 返回 rds/redis/maas；
- 探活失败只降级，不阻断登录；
- 不返回连接串与密钥；
- 补测试并给出构建命令。
```

产出：

- `server/internal/adapter/cloud/probe.go`
- `server/internal/handler/handler.go`
- `server/cmd/authd/main.go`
- `server/internal/config/config.go`

### 5.3 项目构建

Prompt：

```text
为当前仓库补一键构建与校验：
- 前端 typecheck / jest / webpack；
- 服务端 go build / go test；
- 生成 Docker 镜像并通过 /readyz 健康检查；
- 失败时输出最小修复建议。
```

产出：

- `deploy/Dockerfile.server`、`deploy/Dockerfile.web`
- `deploy/docker-compose.yml`、`deploy/nginx.conf`
- 构建命令见第 6 节。

### 5.4 问题修复

Prompt：

```text
以下是构建/测试失败日志与 traceId。请定位根因，只改必要文件，
补一个能复现的测试，并说明为什么不会回归。
```

产出示例：

- Web 端 `file://` 下 origin 为 `null` 导致微信能力探测异常 → 增加回环判断与降级。
- 游客模式零出网 → `GuestNetworkGuard` 阻断系统健康检查，改为游客态展示静态架构。
- 数据页在小屏被顶部清单卡片挤压 → 数据页独立清单切换，主页与数据页信息层级分离。

### 5.5 部署上线

Prompt：

```text
基于 deploy/docker-compose.yml 生成华为云 ECS 部署清单：
- ECS 安全组、RDS/DCS 内网安全组；
- Nginx 同源反代 /v1 与 /readyz；
- 健康检查、日志、回滚；
- 不把密钥写入镜像或仓库。
```

产出：

- `deploy/README.md`（资源开通、部署、回滚、验收）
- `deploy/ecs-bootstrap.sh`

---

## 6. 本地构建与验证

```bash
# 前端
cd app
npm ci
npm run typecheck
npm test
npm run web:build

# 服务端
cd ../server
go build ./...
go test ./...

# 一键 Demo（Docker）
cd ..
cp deploy/env.example deploy/.env
docker compose -f deploy/docker-compose.yml --env-file deploy/.env up -d --build
curl -fsS http://127.0.0.1:8088/v1/health
```

---

## 7. 开源清单

- [x] 源代码：`app/`、`server/`、`contracts/`
- [x] 依赖环境：`app/package.json`、`server/go.mod`、`deploy/env.example`
- [x] 部署指导：`deploy/README.md`、`deploy/docker-compose.yml`
- [x] 使用文档：`README.md`、`docs/`
- [x] 许可证：`LICENSE`（MIT）
- [x] Demo 截图：`docs/screenshots/home.png`、`data.png`、`profile.png`、`system.png`、`login.png`
- [ ] 演示视频链接：待补充
- [ ] CodeArts 会话截图 / commit 链接：待补充

---

## 8. 后续里程碑（诚实边界）

1. **RDS 数据面**：将 `filestore` 的 `UserRepository` / `SessionRepository` / `AuthCodeRepository` 替换为 `sqlstore`，按 `db/schema.sql` 迁移；当前已完成 schema 与连接探活。
2. **Redis 数据面**：把会话查询缓存与登录限流迁移到 Redis；当前已完成地址探活。
3. **MaaS 能力**：接入一个「今日建议」生成场景，模型调用失败时回落到规则文案；当前只做健康探活。
4. **HTTPS / 域名**：在 ELB/WAF 或 Nginx 443 终止，补充 HSTS 与证书轮换。
5. **开源发布**：补充 `docs/screenshots/`、演示视频、CodeArts 会话记录与 Gitee/GitHub 仓库地址。
