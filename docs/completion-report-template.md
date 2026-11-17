# 华为 ICT 大赛 Track 1 项目完成报告

> 作品名称：**check · 每日健康清单**
> 参赛方向：生活服务 / 健康管理
> 团队成员：**陈皓庭、白德布鑫、潘振宇**
> 队长联系电话：18708477617
> 队长联系邮箱：3236256044@qq.com
> 学校 / 学院：天津工业大学
> 指导教师：李杰
> 提交日期：[请填写]

> 填写说明：本模板已按当前仓库的实际实现整理，方括号内容为提交前需要补充的信息；涉及“待完成”的条目请如实保留，不要改成已完成。

---

## 摘要

check 是一款面向日常健康与学习习惯的每日清单应用。项目以 React Native 实现 Web、Android 多端界面，以 Go 标准库构建四层服务端，围绕“记录足够轻、反馈足够快、成就能持续”设计饮水、服药、运动、英语听说读写和 AI 自定义清单等能力，并预留华为云 ECS、RDS、DCS Redis 与 Ollama 小模型的部署链路。

本项目重点解决了三个问题：

1. 把分散的健康与学习行为收进同一份清单，降低记录成本；
2. 用条目级进度、周期目标和成就体系提供持续反馈；
3. 用华为账号、华为云部署和 CodeArts 开发闭环完成从需求到上线的工程化验证。

当前已完成本地可运行版本、Android 真机验证、AI 自定义清单接口与本地小模型验证；华为云 ECS 实际部署和自动同步需要在获得云资源与 SSH 权限后执行。

---

## 1. 项目背景与目标

### 1.1 背景

日常健康与学习计划常见的问题是：

- 记录入口分散，喝水、吃药、运动、背单词各自使用一个工具；
- 目标只有“完成 / 未完成”，缺少连续反馈和阶段成就；
- 计划固定，难以适配考研、健身、阅读等个性化目标；
- 部署与运维门槛高，作品容易停留在本地演示。

### 1.2 项目目标

| 目标 | 说明 |
|---|---|
| 统一清单 | 健康与英语学习放在同一份每日清单中 |
| 轻量记录 | 一次点击即可记录，支持撤销和补录 |
| 可持续反馈 | 连续天数、周期目标、分组成就 |
| 可扩展 | 新增清单只需注册元数据与面板 |
| AI 生成 | 根据用户目标生成一级 / 二级清单和成就 |
| 云上闭环 | 华为云 ECS + Docker Compose + 自动部署 |

### 1.3 目标用户

- 需要同时管理饮水、服药、运动等健康习惯的用户；
- 备考英语、考研或六级的用户；
- 希望自行定义清单、而不是被固定模板限制的用户。

---

## 2. 需求分析

### 2.1 功能需求

| 编号 | 需求 | 实现情况 |
|---|---|---|
| F-01 | 华为账号登录与游客预览 | 已实现；Android 真机登录验证 |
| F-02 | 饮水记录、目标、周统计 | 已实现 |
| F-03 | 服药计划、四时段打卡、补打 | 已实现 |
| F-04 | 运动记录与多维度成就 | 已实现 |
| F-05 | 英语一级 + 听 / 说 / 读 / 写二级 | 已实现 |
| F-06 | 英语条目独立进度、目标、周期 | 已实现 |
| F-07 | 洞察页统计与成就 | 已实现 |
| F-08 | AI 自定义清单与成就 | 接口、回退与本地模型验证完成；云上待部署 |
| F-09 | 积分、签到、头像框、宠物 | 已实现 |
| F-10 | 云资源健康状态 | 已实现探活；云资源待开通 |

### 2.2 非功能需求

- **多端**：Web、Android 共用一套 React Native 代码；
- **可测试**：前端 Jest、后端 Go test、集成测试；
- **可部署**：Docker 多阶段构建、Compose、Nginx 同源反代；
- **可观测**：`/v1/health`、`/readyz`、traceId、结构化日志；
- **安全**：会话令牌、密钥扫描、生产环境不启用 mock 登录；
- **可扩展**：清单注册表、面板注册表、成就序列配置。

### 2.3 范围说明

当前版本不包含：

- iOS 原生构建；
- 完整 Windows 原生客户端；
- 云上真实 RDS / DCS 数据迁移；
- 大规模并发压测。

以上内容在报告中列为“待完成”，不作为已完成项。

---

## 3. 总体设计

### 3.1 系统架构

```text
React Native（Web / Android）
        │ HTTPS / JSON
        ▼
Nginx（静态资源 + /v1 同源反代）
        │
        ▼
authd（Go 标准库）
handler → service → port ← adapter
        │                    │
        │                    ├── filestore
        │                    ├── Huawei Account Kit
        │                    ├── WeChat
        │                    └── Ollama
        ▼
RDS MySQL / DCS Redis（云上）
```

### 3.2 分层设计

| 层 | 职责 |
|---|---|
| handler | HTTP 协议、鉴权、错误包络 |
| service | 业务规则、事务、限流 |
| port | 仓储与外部能力接口 |
| adapter | 文件存储、华为账号、Ollama 等具体实现 |
| domain | 领域模型、校验、统计算法 |

### 3.3 客户端设计

- `app/src/features/*`：按清单拆分 Today / Stats / Achievements；
- `app/src/features/registry.tsx`：统一注册清单元数据与面板；
- `app/src/ui/theme.tsx`、`primitives.tsx`：统一设计令牌与组件；
- `app/src/navigation/shellState.ts`：一级分类、二级清单、洞察二级状态；
- `app/src/model/*`：数据模型与纯函数算法。

### 3.4 数据设计

以英语为例，每条清单独立保存：

```ts
itemProgress: Record<itemId, number>
itemTargets: Record<itemId, number>
dailyBySkill: Record<skill, Record<day, number>>
targetsBySkill: Record<skill, number>
periodsBySkill: Record<skill, 'day' | 'week' | 'month'>
```

成就不再逐条写死阈值，而是由序列定义：

```ts
{ start, end, steps }
```

通过对数插值生成阶段阈值，便于后续扩展新的技能或成就系列。

---

## 4. 功能实现

### 4.1 健康清单

- **饮水**：按身体档案计算目标，支持杯 / 瓶 / 自定义单位；
- **服药**：早 / 中 / 晚 / 睡前四时段，支持补打和撤回；
- **运动**：步行 / 骑行 / 跑步，支持周 / 月 / 季度统计；
- **成就**：分组 nav、进度条、解锁状态。

### 4.2 英语清单

一级标题为「英语」，二级为「听 / 说 / 读 / 写」。

- 听：VOA、六级听力、精听；
- 说：口语练习、跟读；
- 读：百词斩、阅读、阅读词汇；
- 写：英语写作、仿写；
- 每条清单独立进度和目标；
- 目标支持按天 / 按周 / 按月；
- 顶部标题跟随当前技能；
- 洞察页不再重复技能 nav，直接展示当前技能的成就。

### 4.3 AI 自定义清单

用户输入目标后，由后端调用 Ollama 小模型生成：

```text
一级标题 + 图标
二级技能 + 单位 + 成就序列
```

服务端对模型输出做归一化：

- 非法 ID 自动生成；
- 缺少 `{need}` 自动补全；
- `steps` 限制在 3-8；
- 空技能 / 空序列补默认项；
- 重复项去重；
- 失败时按配置回退模板。

### 4.4 账号与游客

- 华为账号授权码登录，服务端换取会话；
- 游客模式零出网，数据只保存在本机；
- 登录失败、会话过期、限流均有统一错误码与提示。

### 4.5 洞察与成就

- 统计 / 成就二级页面；
- 按清单记忆浏览位置；
- 成就 hero 与分组样式统一；
- 进度卡片使用统一 `AchievementGrid`。

### 4.6 功能完成度

| 模块 | 状态 | 证据 |
|---|---|---|
| 饮水 | 已完成 | 页面、测试、截图 |
| 服药 | 已完成 | 页面、四时段逻辑 |
| 运动 | 已完成 | 记录、统计、成就 |
| 英语听说读写 | 已完成 | 分组、条目进度、周期目标 |
| 自定义清单 | 接口与本地模型验证 | `/v1/custom-plans/generate` |
| 华为账号 | 已完成 | Android 真机登录成功 |
| 云资源探活 | 已完成 | `/v1/health` |
| 华为云实际部署 | 待执行 | 需 ECS / SSH / 域名 |
| 自动同步 | 脚本与流水线已准备 | GitHub Actions / CodeArts |

---

## 5. 华为云与 CodeArts 使用

### 5.1 华为云资源规划

| 资源 | 用途 | 当前状态 |
|---|---|---|
| ECS | 运行 Web、authd、Ollama | 待开通 / 待部署 |
| RDS for MySQL | 用户、会话、清单数据 | 方案与 schema 已准备 |
| DCS for Redis | 缓存 / 限流 | 方案已准备 |
| ELB / WAF | HTTPS、域名 | 待配置 |
| AGC | 华为账号 Client ID / 回调 | 已登记应用，待生产配置 |
| Ollama | 自定义清单生成 | 本地已跑通，云端待部署 |

### 5.2 部署架构

```text
用户浏览器 / Android
        │
        ▼
ELB / WAF（HTTPS）
        │
        ▼
ECS: Nginx → authd
        │
        ├── MySQL / Redis
        └── Ollama (qwen2.5:0.5b)
```

### 5.3 自动同步

仓库提供：

- `.github/workflows/deploy-huaweicloud.yml`：push `main` 后 SSH 到 ECS；
- `deploy/auto-deploy.sh`：拉代码、构建、启动、健康检查、失败回滚；
- `deploy/docker-compose.yml`：web / authd / ollama / mysql / redis；
- `deploy/README.md`：ECS、RDS、DCS、自动同步完整步骤。

### 5.4 CodeArts 使用记录

| 阶段 | Prompt / 产出 | 结果 |
|---|---|---|
| 需求理解 | 阅读 README、contracts、port 接口 | 拆出登录、清单、统计、成就、云资源 |
| 代码生成 | 生成 React Native 页面与 Go 四层骨架 | 形成可运行工程 |
| 项目构建 | typecheck、Jest、Go test、Webpack | 构建通过 |
| 问题修复 | 依据错误码、traceId、测试失败定位 | 修复登录、契约、UI 问题 |
| 部署上线 | Compose + Nginx + ECS 部署文档 | 部署文件完成，云上执行待补 |

> 建议在提交前补充 1-2 张 CodeArts 对话截图，放到 `docs/screenshots/`。

---

## 6. 关键技术与创新

### 6.1 条目级清单模型

不是用一个总量代表全部成就，而是每条清单独立记录进度和目标，解决“必须固定几个量”的扩展问题。

### 6.2 对数插值成就

成就由起点、终点、阶数生成，避免手写大量阈值。英语 56 个成就由 12 个序列生成。

### 6.3 动态二级技能

一级「英语」下的「听 / 说 / 读 / 写」共享同一份状态：清单页选择技能后，顶部标题、洞察统计和成就同步跟随。

### 6.4 AI 清单生成

- Ollama JSON 模式；
- 服务端强校验 + 归一化；
- 前端对数插值生成具体成就；
- 失败回退保证 Demo 可用。

### 6.5 轻量四层架构

Go 标准库实现，无重型框架；端口 / 适配器隔离，便于从 JSON 文件迁移到 RDS。

---

## 7. 测试与验收

### 7.1 测试结果

| 项目 | 结果 |
|---|---|
| 前端 TypeScript 检查 | 通过 |
| 前端 Jest | 22 个测试文件、120 项通过 |
| 后端 Go test | 通过 |
| 集成测试 | 登录、鉴权、限流、traceId 覆盖 |
| 密钥扫描 | 0 命中 |
| Android 真机 | 华为账号登录成功、清单页面可用 |
| Ollama 本地 | qwen2.5:0.5b 生成清单成功 |
| 华为云 ECS | 待执行 |

### 7.2 验收清单

- [ ] 华为云 ECS 可访问
- [ ] `https://<domain>/v1/health` 返回 ok
- [ ] `https://<domain>/?demo=guest` 可演示
- [ ] 华为账号生产回调可用
- [ ] AI 自定义清单在云上生成成功
- [ ] 自动同步一次 push 验证通过
- [ ] 截图与演示视频归档

---

## 8. 部署与运维

### 8.1 首次部署

```bash
sudo mkdir -p /opt/check
sudo chown "$USER" /opt/check
git clone git@github.com:xinyuan-noname/ict.git /opt/check
cd /opt/check
cp deploy/env.example deploy/.env
vi deploy/.env
sudo bash deploy/ecs-bootstrap.sh
docker compose -f deploy/docker-compose.yml --env-file deploy/.env up -d --build
```

### 8.2 自动同步

GitHub Secrets：

```text
HUAWEI_ECS_HOST
HUAWEI_ECS_USER
HUAWEI_ECS_SSH_KEY
HUAWEI_ECS_PORT
HUAWEI_ECS_DEPLOY_PATH
```

之后 push `main` 自动部署。

### 8.3 回滚

```bash
cd /opt/check
git reset --hard <last-good-commit>
docker compose -f deploy/docker-compose.yml --env-file deploy/.env up -d --build
```

### 8.4 监控

- `/v1/health`
- `/readyz`
- Docker healthcheck
- Nginx access log
- authd 结构化日志与 traceId

---

## 9. 团队分工与进度

### 9.1 成员

| 成员 | 主要工作（请按实际调整） |
|---|---|
| 陈皓庭 | 项目统筹、后端与云部署、接口联调 |
| 白德布鑫 | 客户端页面、交互与设计系统 |
| 潘振宇 | 测试、文档、演示与验收 |

### 9.2 里程碑

| 阶段 | 内容 | 状态 |
|---|---|---|
| M1 | 需求拆分与原型 | 完成 |
| M2 | 健康清单与账号 | 完成 |
| M3 | 英语清单与成就 | 完成 |
| M4 | AI 自定义清单 | 本地验证完成 |
| M5 | 华为云部署 | 待执行 |
| M6 | 自动同步与验收 | 待执行 |

---

## 10. 问题与解决

| 问题 | 原因 | 解决 |
|---|---|---|
| 华为账号登录失败 | HMS 依赖版本不完整 | 固定 `hwid 6.12.0.300`，补齐依赖 |
| 游客模式误出网 | 登录态与网络守卫未联动 | 游客窗口阻断网络并计数 |
| 英语内容四个技能相同 | 页面共用同一套词汇内容 | 按技能独立日记录、目标和趋势 |
| 成就阈值难扩展 | 手写每一个阈值 | 改为起点 / 终点 / 阶数对数插值 |
| 小模型输出不合法 | 0.5B 模型不稳定 | 服务端归一化 + 提示词强化 + 回退 |
| 云上部署未完成 | 缺少 ECS / SSH / 域名 | 已提供 Compose、Actions、自动脚本 |

---

## 11. 总结与展望

### 11.1 已完成

- 一套可运行的 React Native 多端应用；
- 健康、英语、自定义清单与成就体系；
- Go 四层服务端与华为账号登录；
- Docker / Compose / Nginx 部署文件；
- 自动同步脚本和 GitHub Actions 模板；
- 本地 Ollama 小模型生成验证。

### 11.2 下一步

1. 开通华为云 ECS / RDS / DCS，完成首次云上部署；
2. 配置域名、HTTPS、AGC 生产回调；
3. 在 ECS 上验证 Ollama 与自动同步；
4. 补充 CodeArts 对话截图、演示视频和性能压测；
5. 根据评审反馈迭代清单与成就模板。

---

## 附录

### A. 主要目录

```text
app/                 React Native 客户端
server/              Go 服务端
deploy/              Docker / Compose / ECS 部署
docs/                设计、验收、部署文档
contracts/           OpenAPI 契约
db/                  MySQL schema
```

### B. 主要接口

```text
POST /v1/auth/huawei/login
GET  /v1/check/today
GET  /v1/check/water/week
GET  /v1/sport/achievements
POST /v1/custom-plans/generate
GET  /v1/health
GET  /readyz
```

### C. 截图

- `docs/screenshots/home.png`
- `docs/screenshots/data.png`
- `docs/screenshots/achievements.png`
- `docs/screenshots/android-checklist.png`
- `docs/screenshots/android-english.png`
- `docs/screenshots/android-login-success.png`

### D. 许可证

MIT License，详见 `LICENSE`。
