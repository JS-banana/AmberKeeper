# Electron Mainline Overview

> 历史说明：这份文档来自 `anyChat` 的 Electron mainline 阶段，用于保留 AmberKeeper 独立拆仓前的架构背景。当前仓库的活跃入口文档请优先阅读 `docs/architecture/amberkeeper-overview.md`。

## 目标

AnyChat 当前以 Electron 作为唯一活跃桌面运行时。当前主线的目标不是继续验证 Electron 是否可行，而是把已经验证通过的 ChatGPT 抓取链路整理成可扩展、可持久化、可继续接入更多 mainstream provider 的正式架构。

## Workspace 布局

### `apps/desktop`

Electron 应用壳：

- `src/main`
  组合根、window lifecycle、browser session runtime、CDP observer、IPC、SQLite store
- `src/preload`
  renderer bridge 与 chat view preload
- `src/renderer`
  Workspace / Diagnostics 双界面

### `packages/capture-core`

跨 provider 复用的采集核心：

- runtime signals
- turn state
- capture orchestrator
- persistence repositories
- turn persistence service

### `packages/provider-*`

当前 phase 1 内建 provider package 为：

- `packages/provider-chatgpt`
- `packages/provider-claude`
- `packages/provider-deepseek`
- `packages/provider-gemini`

每个 package 只负责本 provider 的：

- request classification
- request / response body normalization
- DOM snapshot interpretation
- provider contract tests

### `packages/shared-types`

main / preload / renderer / provider 共享类型定义。

## 数据流

Electron 主线的采集流程分四层：

1. `browser-session` 与 `cdp-observer` 产出 runtime signals
2. `ProviderRuntimeRegistry` 选择当前 active provider runtime，并把原始 runtime signals 路由到对应 adapter
3. `capture-orchestrator` 驱动 `TurnState`，只在 turn 达到可持久化条件时输出 completed turn
4. `TurnPersistenceService` 将 completed turn 写入 `conversations`、`messages`、`capture_events`

当前持久化模型分为两层：

- 业务层：`conversations`、`messages`
- 证据层：`capture_events`

这样可以同时满足用户可见会话缓存和诊断回放。

## Renderer 结构

Renderer 不再把验证台当成正式首页，而是拆成两类界面：

### Workspace

未来产品面。当前 phase 1 已经承担正式产品壳角色，负责：

- provider rail
- active provider summary
- enable / disable built-in provider
- 仅查看当前 active provider 的 sessions / messages

### Diagnostics

开发与验证面。当前保留并继续展示：

- runtime status
- recent attempts
- conversations / messages cache
- 手动 DOM snapshot 触发入口

实际 provider 页面仍由 Electron 原生 view 承载，不直接渲染在 React DOM 中。当前 native stage 一次只显示 active provider 对应的 `WebContentsView`，未激活的 provider view 仅隐藏、不销毁，以保留登录态和页面上下文。

## 如何新增 Provider

新增 provider 时，按以下顺序扩展：

1. 新建 `packages/provider-<name>`
2. 实现 request / response / DOM adapter
3. 为 adapter 增加 fixtures 与 contract tests
4. 在 `apps/desktop/src/main/runtime/browser-session.ts` 增加 provider runtime 配置
5. 在 `apps/desktop` 接入对应 view、IPC 暴露与 diagnostics 展示

原则：

- provider 不直接依赖 Electron API
- provider 不直接写库
- 只有 `capture-core` 负责 turn aggregation 与 persistence policy

## 当前验证状态

自动化层已经覆盖：

- provider registry / runtime switching / provider settings persistence
- renderer workspace interaction
- `chatgpt`、`claude`、`deepseek`、`gemini` adapter contract
- `apps/desktop` test / typecheck / build

真实验证层当前状态：

- `ChatGPT` 已在 `2026-03-20` 的当前 Electron mainline shell 完成 fresh real round-trip 回归，验证了登录态、固定探针、正确 provider 落库、切 provider 再切回保持同一 session、重启后继续打开同一会话
- `Claude` 已在 `2026-03-21` 的当前 Electron mainline shell 完成 fresh real round-trip 回归，验证了登录态、固定探针 `ANYCHAT-CLAUDE-FRESH-PROBE-2026-03-21-R2`、正确 provider 落库、切 provider 再切回保持同一 session、重启后继续打开同一会话并实际 hydrate `2` 条消息
- `DeepSeek` 已在当前 Electron mainline shell 完成真实登录、发问、provider 正确落库、新会话时间戳验证与旧会话 history hydration 真机验证
- `Gemini` 已在当前 Electron mainline shell 完成真实登录、发问、provider 正确落库；真实 `StreamGenerate` 响应现可解析 `conversationId` 和单份完整 assistant 文本，并已在 `2026-03-20` 对历史脏数据完成 `dry-run + cleanup` 真库治理

已知实现边界：

- `apps/desktop/src/preload/chat.ts` 现在会按当前页面 host 路由到 `chatgpt`、`claude`、`deepseek`、`gemini` 各自的 DOM collector
- `Claude` 的 Browser session 导航现已串行化，避免 provider 激活首页与选中会话 URL 的并发导航竞态；DOM collector 也已兼容新版 `[data-testid="user-message"]` 与 `div[data-is-streaming] .font-claude-response` 结构
- `desktop:build` 已在 TTY 终端环境 fresh 验证通过；当前非 TTY 管道执行仍会命中 `electron-vite` reporter 对 `process.stdout.clearLine()` 的终端假设

## 开发命令

从仓库根目录执行：

```bash
pnpm install
pnpm desktop:dev
pnpm desktop:test
pnpm desktop:build
```

从 app 目录执行：

```bash
pnpm --dir apps/desktop test
pnpm --dir apps/desktop build
pnpm --dir apps/desktop exec tsc --noEmit
```

## 历史路径

旧的根级 Tauri/React runtime 已归档到 `archive/tauri-mainline`。它只作为历史参考，不再属于活跃主线，也不再参与默认验证流程。
