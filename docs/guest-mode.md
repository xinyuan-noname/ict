# 游客模式

## 入口

登录页主按钮下方「游客进入预览」，一次点击进入，不触发华为授权、不请求任何服务端接口。

## 行为

| 项 | 规则 |
|---|---|
| 身份 | 本地生成 `guest_` + 32 位十六进制，昵称固定「游客」 |
| 存储 | AsyncStorage 单键 `guest.profile.v1`，字段白名单、≤2 KB、`schemaVersion` 在 JSON 内 |
| 网络 | 游客窗口内 `ApiClient` 直接阻断并计数（`attempts/outbound`），不调用 `/v1/auth/*`、`/v1/rewards/*`、`/v1/health` |
| 可见性 | 游客主页为独立组件 `GuestHomeScreen`；签到/积分/商城入口不渲染 |
| 退出 | 仅本地清理，不调用 `/v1/auth/logout`，不产生 AUTH 码 |
| 升级 | 确认 → 离游客窗口 → 授权 → 写凭证 → 清档案 → `authenticated`；清理失败则吊销新会话、清凭证、回游客 |
| 取消/失败 | 回游客态并保留原 `guestId` |
| 冷启动 | 凭证优先 → 游客档案 → 能力探测；游客恢复不探测能力 |

## 状态机

`restoring / guest / authenticated / anonymous / unsupported`

- 游客态 `currentToken()` 恒为 `null`，`expiresAt` 为 `null`
- AppRoot 在非 `authenticated` 时 `rewardsStore.reset()`，游客不加载奖励数据

## 存储降级

- 读失败：提示「本机存储不可用，无法进入游客模式」，保持登录页
- 数据损坏/迁移失败：删除并提示「游客数据已重置」
- 写入后复核失败：视为存储不可用，禁止进入（不退化为内存态或 SecureVault）

## 文件

| 文件 | 职责 |
|---|---|
| `app/src/guest/types.ts` | 常量、文案、字节长度 |
| `app/src/guest/guestProfile.ts` | guestId 生成、schema 校验、2KB 限制 |
| `app/src/guest/GuestStorage.ts` | Port + AsyncStorage/Memory 实现 |
| `app/src/guest/GuestStore.ts` | 单飞加载、写后复核、损坏重建、清理复核 |
| `app/src/guest/GuestNetworkGuard.ts` | 游客窗口网络阻断与计数 |
| `app/src/screens/GuestHomeScreen.tsx` | 游客主页（像素头像、标签、本机说明） |
| `app/src/auth/AuthProvider.ts` | 五态、`enterGuest`/`exitGuest`、升级时序 |
| `app/App.tsx` | 注入 GuestStore 与 guard |

## 验证

```bash
cd app
npm run typecheck
npm test          # 55 项，含游客档案/存储/五态/零网络/升级回退
```

关键用例：
- 游客窗口内 `ApiClient` 抛 `ProtocolError`，`fetch` 未调用，`attempts=1 / outbound=0`
- 冷启动凭证优先于游客档案，且游客恢复不探测能力
- 升级清理失败 → `logout` 被调用、凭证被清、回 `guest`
- 存储损坏 → `reset` 并删除数据
- 退出游客不调用 `logout`

## 未验证

- 三端真机冷启动/重启恢复
- 卸载重装后全新 `guestId`
- 系统备份排除（Android/iOS 原生配置）
- 原生 CSPRNG 桥（当前 JS 优先 `crypto.getRandomValues`，缺失时用混合回退）
- APK/iOS/Windows 构建