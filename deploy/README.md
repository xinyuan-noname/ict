# 华为云部署手册（Track 1）

本项目是「check · 每日健康清单」：React Native（Web / Android / Windows）+ Go 四层服务端，面向华为云 ECS 部署，RDS / DCS Redis 作为托管数据与缓存资源。

> 目标：评委拿到仓库后，可以在 10 分钟内完成「本地可跑」；在有华为云资源时，按本手册完成「云上可演示」。

---

## 1. 资源清单

| 资源 | 规格建议 | 用途 | 环境变量 |
|---|---|---|---|
| ECS | 2 vCPU / 4 GiB，EulerOS 或 Ubuntu 22.04 | 运行 authd + Nginx | — |
| RDS for MySQL | 8.0，2 vCPU / 4 GiB，与 ECS 同 VPC | 用户、会话、审计、清单 schema | `RDS_ADDR` |
| DCS for Redis | 5.0+，1 GiB，与 ECS 同 VPC | 会话缓存 / 分布式限流（规划项） | `REDIS_ADDR` |
| ELB / WAF | 可选 | HTTPS 终止、域名与证书 | — |
| MaaS | 按需 | 模型能力（可选，不参与鉴权主链路） | `MAAS_HEALTH_URL`、`MAAS_API_KEY` |
| AGC | 已登记应用 | 华为账号 client_id / 指纹 / 回调 | `HUAWEI_CLIENT_ID` 等 |

安全组：

- ECS：入方向 80/443（公网），22（运维白名单）。
- RDS：入方向 3306，仅允许 ECS 内网地址。
- Redis：入方向 6379，仅允许 ECS 内网地址。

---

## 2. 本地一键启动（无云资源）

```bash
cp deploy/env.example deploy/.env
# 至少改 SESSION_PEPPER / MYSQL_PASSWORD / REDIS_PASSWORD
docker compose -f deploy/docker-compose.yml --env-file deploy/.env up -d --build
```

访问：

- Web Demo：`http://127.0.0.1:8088/?demo=guest`
- 健康检查：`http://127.0.0.1:8088/v1/health`
- 就绪探针：`http://127.0.0.1:8088/readyz`

离线模式说明：

- `AUTH_MODE=mock` + `hwsim` 仅用于本地演示；真实部署改为 `AUTH_MODE=real` 并填 AGC 凭据。
- 当前数据面默认是 `server/data/*.json` 文件存储，便于无云环境评审；RDS schema 与连接探活已就绪，SQL 仓储适配见 `server/internal/port` 与 `db/schema.sql`。
- `?demo=guest` 直接进入游客模式，不发起任何登录网络请求。

---

## 3. 华为云资源开通

### 3.1 RDS for MySQL

1. 控制台 → 数据库 → RDS for MySQL → 购买实例（同 VPC、同子网）。
2. 创建数据库 `check_app`，字符集 `utf8mb4`。
3. 用 DAS 或 `mysql` 客户端执行：

   ```bash
   mysql -h <rds-internal-host> -u check -p < db/schema.sql
   ```

4. 记录内网地址，填入 `deploy/.env` 的 `RDS_ADDR=<host>:3306`。

### 3.2 DCS for Redis

1. 控制台 → 分布式缓存服务 DCS → 购买 Redis 实例（同 VPC）。
2. 记录内网地址与密码，填入 `REDIS_ADDR=<host>:6379`。
3. 在 ECS 上用 `redis-cli -h <host> -a <password> ping` 验证 `PONG`。

### 3.3 MaaS（可选）

1. 开通 MaaS 服务，创建推理端点。
2. 将健康端点填入 `MAAS_HEALTH_URL`，API Key 填入 `MAAS_API_KEY`。
3. 未配置时 `/v1/health` 返回 `not_configured`，不影响 Demo。

---

## 4. ECS 部署

```bash
# 1) 准备 ECS（安装 Docker / 放行 80/443）
sudo bash deploy/ecs-bootstrap.sh

# 2) 拉取代码
sudo mkdir -p /opt/check && sudo chown "$USER" /opt/check
git clone <your-repo-url> /opt/check
cd /opt/check

# 3) 配置环境变量（不要提交 .env）
cp deploy/env.example deploy/.env
vi deploy/.env

# 4) 构建并启动
docker compose -f deploy/docker-compose.yml --env-file deploy/.env up -d --build

# 5) 验证
curl -fsS http://127.0.0.1:8088/v1/health | jq
curl -fsS http://127.0.0.1:8088/readyz
```

公网访问：

- 直接用 ECS 公网 IP + `8088`（仅演示，建议加安全组白名单）。
- 生产建议：ELB/WAF 监听 443，转发到 ECS `8088`；或在 Nginx 配置 443 证书。

---

## 5. CodeArts 代码智能体使用记录

赛题一要求体现「需求理解 → 代码生成 → 项目构建 → 问题修复 → 部署上线」。建议在 `docs/track1.md` 中记录每次 Prompt 与产出文件，截图放在 `docs/screenshots/`。

可复用的 Prompt：

```text
你是华为云 CodeArts 代码智能体。请阅读当前仓库的 README、contracts/openapi.json
与 server/internal/port，完成以下任务：
1. 为 /v1/health 增加 rds、redis、maas 三个只读检查项；
2. 不引入第三方依赖，不把连接串/密钥写入响应或日志；
3. 为新增逻辑补 Go 测试；
4. 给出构建、测试、Docker 部署命令。
```

```text
请基于 deploy/docker-compose.yml 生成华为云 ECS 部署清单：
- RDS/Redis 使用 VPC 内网地址；
- Nginx 同源反代 /v1；
- 给出安全组、健康检查、回滚步骤。
```

---

## 6. 回滚

```bash
cd /opt/check
docker compose -f deploy/docker-compose.yml --env-file deploy/.env down
git checkout <last-good-tag>
docker compose -f deploy/docker-compose.yml --env-file deploy/.env up -d --build
```

数据卷 `authd-data` / `mysql-data` / `redis-data` 保留；RDS 使用云备份恢复。

---

## 7. 验收清单

- [ ] `/v1/health` 返回 `checks.rds`、`checks.redis`、`checks.maas`
- [ ] `/readyz` 返回 `ready`
- [ ] 首页 `?demo=guest` 可完整操作饮水 / 服药 / 运动 / 英语
- [ ] 「我的 → 系统与云端」能看到 API / RDS / Redis 状态
- [ ] 源码、依赖、部署、使用文档、许可证齐全
- [ ] 截图或演示视频已放入 `docs/screenshots/` 或 README 链接
