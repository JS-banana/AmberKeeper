# AmberKeeper Overview

## 定位

AmberKeeper 是一个本地优先的 Electron 桌面工作台，用于聚合、采集、沉淀和回看多个主流 AI provider 的对话数据。

当前阶段的核心目标不是继续验证 Electron 可行性，而是把已经完成真实 round-trip 验证的多 provider 采集链路，整理成一个可以独立发布、独立维护、继续扩展的正式产品仓库。

## 当前工作区

### `apps/desktop`

AmberKeeper 的正式桌面应用入口：

- `src/main`
  Electron 生命周期、browser session runtime、CDP observer、IPC、SQLite store
- `src/preload`
  renderer bridge、provider chat capture、page-owned network relay
- `src/renderer`
  `Workspace` / `Diagnostics` 双界面

### `packages/capture-core`

跨 provider 共享的采集核心：

- runtime signals
- turn state
- capture orchestrator
- persistence repositories
- turn persistence service

### `packages/provider-*`

当前内建 provider package：

- `packages/provider-chatgpt`
- `packages/provider-claude`
- `packages/provider-deepseek`
- `packages/provider-gemini`

每个 package 只负责本 provider 的 request classification、request/response normalization、DOM snapshot interpretation 和 contract tests。

### `packages/shared-types`

main / preload / renderer / provider 共享类型定义。

## 运行时数据流

AmberKeeper 当前的采集链路分四层：

1. `browser-session` 与 `cdp-observer` 产生 runtime signals
2. `ProviderRuntimeRegistry` 选择当前 active provider runtime，并将原始 signals 路由到对应 adapter
3. `capture-orchestrator` 驱动 `TurnState`，只在 turn 达到可持久化条件时输出 completed turn
4. `TurnPersistenceService` 将 completed turn 写入 `conversations`、`messages`、`capture_events`

其中：

- `conversations`、`messages` 是业务层
- `capture_events` 是证据层

这样既能支撑产品界面的历史回看，也能支撑诊断回放与调试。

## 独立拆仓后的兼容策略

AmberKeeper 目前已经独立出仓，但第一版独立发布保留了两类关键兼容层：

1. 继续使用旧的 Electron `userData` 根目录 `electron-chatgpt-capture`
2. 继续使用旧的 session partition key：`persist:anychat-<provider>`

这样做是刻意的，不是品牌遗留疏漏。目的只有一个：让当前 AnyChat Electron 主线已经积累下来的本地 SQLite 数据、Cookie 和 provider 登录态，在 AmberKeeper 第一次独立运行时仍然可读、可用。

## 后续迁移方向

AmberKeeper 后续独立化的重点包括：

- 独立 GitHub 仓库与 release pipeline
- 活跃文档从 AnyChat Electron mainline 叙事切换为 AmberKeeper 叙事
- 逐步清理历史命名与实验期材料
- 在稳定兼容的前提下，评估是否需要二阶段迁移到 `amberkeeper` 自有存储根目录与 partition key

## 推荐阅读顺序

1. 当前文档：`docs/architecture/amberkeeper-overview.md`
2. 仓库拆分计划：`docs/plans/2026-03-21-amberkeeper-repo-split-plan.md`
3. 历史架构背景：`docs/architecture/electron-mainline-overview.md`
