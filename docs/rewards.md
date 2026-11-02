# 每日签到 · 积分 · 像素头像框

## 功能范围

- 每日签到（业务时区 `Asia/Shanghai`，服务端判定日期）
- 积分余额与只追加流水
- 6 个像素头像框：兑换、装备、卸下、主页展示
- 不做：排行榜、补签、付费、积分过期/转赠、运营后台、自定义上传

## 规则

| 项 | 规则 |
|---|---|
| 签到频率 | 每用户每业务日 1 次；重复请求返回 `alreadyCheckedIn=true`、0 积分 |
| 连签积分 | 第 n 天 `min(10 + 2*(n-1), 30)`；漏签一天重置为 1；连签上限 365 |
| 余额上限 | 1,000,000；超出部分截断但签到仍成功（`balanceCapped=true`） |
| 兑换 | 必须携带 `Idempotency-Key`（24h 重放）；余额不足不占用幂等键 |
| 装备 | 每用户同时最多 1 个；已拥有但已下架的框仍可装备 |
| 免费框 | `price=0`，不产生 `amount=0` 的流水 |

## 接口

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/v1/rewards/checkin/status` | 今日签到状态 + 余额 + 连签 |
| POST | `/v1/rewards/checkin` | 签到 |
| GET | `/v1/rewards/points/ledger` | 流水分页（`cursor`/`limit`） |
| GET | `/v1/rewards/frames` | 头像框目录（`status=on_sale|all`） |
| POST | `/v1/rewards/frames/{frameId}/redeem` | 兑换（需 `Idempotency-Key` + `catalogVersion`） |
| PUT | `/v1/rewards/avatar-frame` | 装备 / 卸下（`frameId: null`） |

鉴权统一 Bearer 会话；续期时服务端回传 `X-Session-Token`。

## 错误码（独立命名空间）

`POINT_001`–`POINT_006`、`REWARD_001`–`REWARD_008`，定义见 `contracts/reward-error-codes.json`。
**禁止新增 `AUTH_015+`**；鉴权失败仍使用既有 `AUTH_004/005/010/013`。

## 像素资源

- 路径：`server/assets/frames/{frameId}-{1,2,3}x.png`
- 规格：96×96 画布、24×24 网格（每格 4×4）、≤16 色、8bit RGBA、alpha 仅 0/255、≤64 KB
- 生成：`node scripts/gen-pixel-frames.mjs`
- 校验：`node scripts/check-pixel-frames.mjs`
- 目录：`server/conf/frames.json`

| 头像框 | 价格 | 形状 |
|---|---|---|
| 青岚光环 | 0 | 圆环（青） |
| 樱瓣 | 100 | 四角花瓣（粉） |
| 电路 | 300 | 线路节点（绿） |
| 晨曦门扉 | 500 | 拱门（橙金） |
| 星巢 | 800 | 星点环（深蓝） |
| 猫爪 | 1200 | 猫耳+肉垫（粉白） |

## 存储

- 独立子空间文件：`<DATABASE_DSN>.rewards.json`
- 文件头：`namespace` / `mode` / `subspace=rewards`，与认证存储隔离
- 事务：快照回滚 + 先落盘后返回；并发由存储锁保证
- 迁移边界：`port.RewardStore` 是唯一接口，替换 SQLite 时只换适配器

## 验证

```bash
export GOROOT="$HOME/scoop/apps/go/current"
cd server && go test ./...
bash scripts/rewards-demo.sh          # mock 模式全链路
node scripts/check-pixel-frames.mjs
cd app && npm run typecheck && npm test
```

## 未验证项

- 真机渲染像素框（RN 真机/模拟器）
- Android APK / iOS / Windows 构建
- 压测（每用户限流、并发兑换）
- 昼夜跨时区实测（当前以固定 +08:00 实现，中国无夏令时）