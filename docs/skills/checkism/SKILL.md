---
name: checkism-app
description: 开发与迭代 checkism（华为 ICT 每日清单 App）时使用的项目 skill：一级/二级信息架构、英语听说读写、洞察成就、条目级进度与目标、UI 统一规范、构建与验收流程。
---

# checkism App Development Skill

用于继续开发 `checkism` 时快速恢复产品结构与实现约束。每轮 UI/数据改动后更新本文件，避免风格和层级反复。

## 1. 产品层级

```text
一级：健康 / 英语
健康二级：喝水 / 服药 / 运动
英语二级：听 / 说 / 读 / 写
洞察二级：统计 / 成就
```

规则：

- 一级决定主色和头部标题。
- 英语的二级 `听 / 说 / 读 / 写` 放在清单页顶部；选中后头部图标和标题同步跟随（如 `🎧 听`、`📖 读`）。
- 洞察页**不再重复**显示 `听 / 说 / 读 / 写`；成就和统计都跟随清单页当前选中的技能。
- 清单页只负责日常记录和清单进度；成就在洞察页。
- 成就页顶部 hero 使用与喝水一致的 `Surface tone="soft"` + 奖杯 + 标题 + 计数 pill。
- 同技能多个分组时用 `AchievementGroupNav`；只有一组时隐藏分组 nav，直接用 `AchievementGrid` 的组头。

## 2. 英语数据模型

每个清单条目独立保存：

```ts
itemProgress: Record<itemId, number>
itemTargets: Record<itemId, number>
dailyBySkill: Partial<Record<EnglishSkill, Record<day, number>>>
targetsBySkill: Partial<Record<EnglishSkill, number>>
targetPeriod: 'day' | 'week' | 'month'
periodsBySkill: Partial<Record<EnglishSkill, 'day' | 'week' | 'month'>>
```

不要新增 `readingPages`、`vocabulary`、`movies` 这类固定字段，也不要把某个条目绑定到固定书名。新增条目只需在 `englishChecklist.ts` 注册：

```ts
{
  id, name, desc, icon, need, points, unit?, initial?
}
```

分组只需声明 `skill: 'listening' | 'speaking' | 'reading' | 'writing'`。

## 3. UI 规范

- 使用 `app/src/ui/primitives.tsx` 的 `Surface / SectionHeader / StatTile / Pill / AppButton / Segmented`。
- 不引入新的卡片视觉语言；成就卡片统一用 `AchievementGrid`。
- 颜色从 `useTheme().feature.english` 取，不写死紫色。
- 英语页字体、间距、圆角与喝水页保持一致。
- 顶部头部必须跟随当前清单/技能，不固定显示 `英语`。

## 4. 开发流程

源目录：

```text
D:\project\华为ICT\ict
```

Android 构建使用 ASCII 副本：

```text
D:\ict_build
```

每次改动：

1. 修改源目录，不直接改构建副本。
2. `npm run typecheck`
3. `npm test -- --silent`
4. 同步 `app/src` 到 `D:\ict_build\app\src`
5. Debug/Release 构建并安装到手机
6. 手机截图验证当前页面
7. `git add -A && git commit && git push ict main`

手机连接检查：

```powershell
adb devices -l
adb reverse tcp:8081 tcp:8081
```

构建：

```powershell
gradlew.bat assembleDebug -PreactNativeArchitectures=arm64-v8a --no-daemon -I ..\..\.dev\mirror.init.gradle
```

## 5. 迭代记录

- 2026-11-09：一级「学习」改为「英语」；英语二级定为听说读写；洞察不重复技能 nav；成就跟随当前技能；成就 hero 与喝水统一。
- 2026-11-09：清单页四个技能不再共用词汇内容；听/说/读/写分别记录章/次/词/篇，近 7 天和每日目标按技能切换。
- 2026-11-09：目标支持按天/按周/按月；周目标按本周一至今天累计，月目标按当月累计。
