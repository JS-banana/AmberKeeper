# AmberKeeper Overview

## 定位

AmberKeeper 是一个本地优先的 Electron 桌面工作台，用于聚合、采集、沉淀和回看多个主流 AI provider 的对话数据。

当前阶段的核心目标不是继续验证 Electron 可行性，而是把已经完成真实 round-trip 验证的多 provider 采集链路，整理成一个可以独立发布、独立维护、继续扩展的正式产品仓库。

## 当前工作区

### `apps/desktop`

AmberKeeper 的正式桌面应用入口：

- `src/main`
  Electron 生命周期、browser session runtime、CDP observer、IPC、SQLite store，以及已经按域拆分出的 settings / capture / diagnostics services
- `src/preload`
  renderer bridge、provider chat capture、page-owned network relay
- `src/renderer`
  原生 chat stage + utility workbench

当前 renderer 产品面包括：

- `数据`
- `服务`
- `设置`
- `关于`
- `诊断`（仅 diagnostics enabled 时）

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
- `packages/provider-grok`
- `packages/provider-kimi`
- `packages/provider-qianwen`
- `packages/provider-doubao`
- `packages/provider-xiaomi-aistudio`

每个 package 只负责本 provider 的 request classification、request/response normalization、DOM snapshot interpretation 和 contract tests。

### `packages/shared-types`

main / preload / renderer / provider 共享类型定义。

## 当前产品模型

AmberKeeper 当前不是“provider 列表 + 历史页”的简单壳层，而是一个本地优先工作台：

- 左侧原生 rail 负责在 **built-in service** 与 **custom service** 之间切换
- `数据` 页面负责本地缓存的 sessions / messages / 导出
- `服务` 页面负责 built-in / custom service 管理
- `设置` 页面负责 shell 级设置
- `关于` 页面负责产品信息
- `诊断` 页面负责 runtime status、attempt logs、manual snapshot、Gemini diagnostics、live probe 入口

Provider 与 Service 已被明确区分：

- **Provider**：采集能力与 adapter 绑定的内建模型
- **Service**：实际出现在 shell rail 里的入口对象，可能是 built-in，也可能是 custom

详见：`docs/architecture/domain-model.md`

## 运行时数据流

AmberKeeper 当前的采集链路分五层：

1. `browser-session` / `cdp-observer` 产生 runtime signals
2. provider adapter 解释 request / response / DOM snapshot
3. capture ingress services 负责 request-side / response-side / history hydration orchestration
4. `capture-orchestrator` 驱动 `TurnState`，只在 turn 达到可持久化条件时输出 completed turn
5. 持久化服务将结果写入 `conversations`、`messages`、`capture_events`

其中：

- `conversations`、`messages` 是业务层
- `capture_events` 是证据层
- `capture_attempt_logs` 是运行时诊断层

这样既能支撑产品界面的历史回看，也能支撑诊断回放与调试。

详见：`docs/architecture/persistence-contracts.md`

## 独立拆仓后的兼容策略

AmberKeeper 目前已经独立出仓，但第一版独立发布保留了两类关键兼容层：

1. 继续使用旧的 Electron `userData` 根目录 `electron-chatgpt-capture`
2. 继续使用旧的 session partition key：`persist:anychat-<provider>`

这样做是刻意的，不是品牌遗留疏漏。目的只有一个：让当前 AnyChat Electron 主线已经积累下来的本地 SQLite 数据、Cookie 和 provider 登录态，在 AmberKeeper 第一次独立运行时仍然可读、可用。

## 运行时生命周期

AmberKeeper 当前已经把 runtime 生命周期显式化：

- create
- attach
- activate
- hide
- detach
- dispose

其中：

- built-in provider runtime 与 custom service runtime 共享原生 stage 协调规则
- custom service 删除会触发 runtime dispose + view detach
- main renderer、remote provider/custom surfaces、auth popup 的安全决策也已有显式记录

详见：`docs/architecture/runtime-lifecycle.md`

## 工程约束

AmberKeeper 当前明确采用以下工程规则：

- transaction boundary 只属于 coordinator / service
- repository 只负责单域读写
- `apps/desktop/src/main/index.ts` 是 composition root，不再新增高权责业务逻辑
- renderer routine shell actions 不再依赖 whole-app broad refresh

详见：`docs/engineering/boundary-rules.md`

## 后续迁移方向

AmberKeeper 后续独立化的重点包括：

- 独立 GitHub 仓库与 release pipeline
- 活跃文档从 AnyChat Electron mainline 叙事切换为 AmberKeeper 叙事
- 逐步清理历史命名与实验期材料
- 在稳定兼容的前提下，评估是否需要二阶段迁移到 `amberkeeper` 自有存储根目录与 partition key

## 推荐阅读顺序

1. 当前文档：`docs/architecture/amberkeeper-overview.md`
2. `docs/architecture/domain-model.md`
3. `docs/architecture/persistence-contracts.md`
4. `docs/architecture/runtime-lifecycle.md`
5. `docs/engineering/boundary-rules.md`
6. 服务管理 / 历史会话 round-3 UX 评审契约：`docs/architecture/service-history-ux-round3.md`
7. 仓库拆分计划：`docs/plans/2026-03-21-amberkeeper-repo-split-plan.md`
8. 历史架构背景：`docs/architecture/electron-mainline-overview.md`
