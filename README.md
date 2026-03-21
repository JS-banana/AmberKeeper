# AmberKeeper

<p align="center">
  <strong>让 AI 的灵光，凝成琥珀</strong>
</p>

这个工作区当前仍位于 `anyChat` 仓库中，但 Electron 主线后续将以 **AmberKeeper** 的独立项目形态继续维护。

## 品牌定稿

- 项目名称：`AmberKeeper`
- 目标仓库名：`amberkeeper`
- 当前品牌标语：`让 AI 的灵光，凝成琥珀`
- 备选短句：`AmberKeeper —— 每一抹灵光，皆有所归`

AmberKeeper 的定位不再只是一个“多 AI 聊天窗口”，而是一个面向多 provider 对话的采集、沉淀、管理与回看工作台。

## 当前方向

- Electron 是当前活跃运行时路径
- `apps/desktop` 是新的桌面应用入口
- `packages/capture-core` 承载采集状态机与持久化服务
- 第一阶段内建 provider 固定为 `chatgpt`、`claude`、`deepseek`、`gemini`
- `packages/provider-chatgpt`、`packages/provider-claude`、`packages/provider-deepseek`、`packages/provider-gemini` 分别承载 provider adapter
- `packages/shared-types` 承载 main / preload / renderer / provider 共享类型
- 历史 Tauri / Rust runtime 已退出主线，仅保留 archive 级历史材料

## Workspace 布局

- `apps/desktop`
  Electron 桌面壳、主进程、preload 和 renderer
- `packages/capture-core`
  runtime signals、turn state、orchestrator、persistence repositories
- `packages/provider-chatgpt`
  ChatGPT 的 request/response/DOM adapter
- `packages/provider-claude`
  Claude 的 request/response/DOM adapter
- `packages/provider-deepseek`
  DeepSeek 的 request/response/DOM adapter
- `packages/provider-gemini`
  Gemini 的 request/response/DOM adapter
- `packages/shared-types`
  capture records、runtime status 和 renderer bridge types
- `archive/tauri-mainline`
  已退役的根级 Tauri/React runtime 归档

## 当前命令

```bash
pnpm install
pnpm desktop:dev
pnpm desktop:test
pnpm desktop:build
```

## Provider 扩展入口

新增 provider 时，优先按以下边界扩展：

1. 在 `packages/provider-<name>` 中实现 adapter
2. 复用 `packages/capture-core` 的 signals / orchestrator / persistence
3. 在 `apps/desktop` 中接入新的 runtime 配置、view 和 diagnostics 展示

## Phase 1 Provider Management

- `Workspace` 现在承载 provider rail、active provider summary、enable / disable，以及当前 active provider 的 sessions / messages
- Main process 通过 `ProviderRuntimeRegistry` 管理四个内建 provider 的持久分区与 native stage 切换
- `capture-core` 继续保持 provider-agnostic，provider-specific 规则只放在 `packages/provider-*`

## 当前验证状态

- 自动化验证已通过：
  - `pnpm --dir packages/capture-core test`
  - `pnpm --dir packages/provider-chatgpt test`
  - `pnpm --dir packages/provider-claude test`
  - `pnpm --dir packages/provider-deepseek test`
  - `pnpm --dir packages/provider-gemini test`
  - `pnpm --dir apps/desktop test`
  - `pnpm --dir apps/desktop exec tsc --noEmit`
  - `pnpm desktop:test`
  - `pnpm desktop:build`
- 真实 provider round-trip 验证状态：
  - `ChatGPT`：已在 `2026-03-20` 的当前 Electron mainline shell 完成 fresh real round-trip 回归，验证了登录态、固定探针、正确 provider 落库、provider 切换后保持同一 session，以及重启后继续打开同一会话
  - `Claude`：已在 `2026-03-21` 的当前 Electron mainline shell 完成 fresh real round-trip 回归，验证了登录态、固定探针 `ANYCHAT-CLAUDE-FRESH-PROBE-2026-03-21-R2`、正确 provider 落库、切 provider 再切回保持同一 session，以及重启后 `openSession` 重新打开并补抓同一会话
  - `DeepSeek`：已在当前 Electron mainline shell 完成真实登录、发问、正确 provider 落库、新会话时间戳验证，以及旧会话 history hydration 真机验证
  - `Gemini`：已在当前 Electron mainline shell 完成真实登录、发问、正确 provider 落库；`StreamGenerate` 已能正确解析 `conversationId` 和单份完整 assistant 文本，并已在 `2026-03-20` 对历史脏数据完成 `dry-run + cleanup` 真库治理
- 已知边界：
  - `apps/desktop/src/preload/chat.ts` 现在已通过 provider-aware registry 选择四个 provider 的 DOM collector
  - `Claude` 当前已完成两处真机收口：Browser session 导航会串行执行，避免 `loadInitialUrl(homeUrl)` 与 `openSession(loadUrl(chat))` 竞态；DOM collector 也已适配新版 Claude 页面结构，重启后 `openSession` 可实际回填 `Hydrated 2 message(s)` 
  - `desktop:build` 已在 TTY 终端环境 fresh 验证通过；当前非 TTY 管道执行仍会命中 `electron-vite` reporter 对 `process.stdout.clearLine()` 的终端假设

## Diagnostics 位置

- Renderer 中保留 `Workspace` 与 `Diagnostics` 双界面
- Diagnostics 展示 runtime status、attempt logs、本地 conversation/messages 等验证信息
- ChatGPT 实际网页仍由 Electron 原生 view 承载，不嵌在 React DOM 内

## 相关文档

- 仓库拆分计划: `docs/plans/2026-03-21-amberkeeper-repo-split-plan.md`
- 重构计划: `docs/plans/2026-03-19-electron-mainline-refactor-plan.md`
- 架构设计: `docs/plans/2026-03-19-electron-mainline-architecture-design.md`
- 架构总览: `docs/architecture/electron-mainline-overview.md`
- 研究日志: `docs/research/2026-03-19-electron-chatgpt-capture-log.md`
- 技术调研: `.sisyphus/plans/003-plan-b-electron.md`
- 历史研究报告: `docs/research/data-capture-implementation-report.md`
- 任务跟踪记录: `docs/plans/2026-01-28-anychat-triage.md`

---

_当前文档会随着重构推进继续更新，命令与结论均以实际验证结果为准。_
