# AmberKeeper

<p align="center">
  <strong>让 AI 的灵光，凝成琥珀</strong>
</p>

AmberKeeper 是一个面向多 AI provider 对话的本地优先桌面工作台，用于采集、沉淀、管理和回看 `ChatGPT`、`Claude`、`DeepSeek`、`Gemini` 等主流服务中的聊天记录。

## 品牌定稿

- 项目名称：`AmberKeeper`
- 仓库名称：`amberkeeper`
- 当前品牌标语：`让 AI 的灵光，凝成琥珀`
- 备选短句：`AmberKeeper —— 每一抹灵光，皆有所归`

## 项目来源

AmberKeeper 由 `anyChat` 的 `electron` 主线拆分而来。当前仓库承接的是已经验证通过的 Electron 多 provider 采集架构，并在此基础上独立维护产品、运行时与后续扩展。

## 当前方向

- Electron 是当前唯一活跃桌面运行时
- `apps/desktop` 是 AmberKeeper 的正式桌面应用入口
- `packages/capture-core` 承载采集状态机与持久化服务
- 第一阶段内建 provider 固定为 `chatgpt`、`claude`、`deepseek`、`gemini`
- `packages/provider-chatgpt`、`packages/provider-claude`、`packages/provider-deepseek`、`packages/provider-gemini` 分别承载 provider adapter
- `packages/shared-types` 承载 main / preload / renderer / provider 共享类型

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

## 相关文档

- AmberKeeper 架构总览：`docs/architecture/amberkeeper-overview.md`
- 仓库拆分计划：`docs/plans/2026-03-21-amberkeeper-repo-split-plan.md`
- Electron 主线重构计划：`docs/plans/2026-03-19-electron-mainline-refactor-plan.md`
- Electron 主线架构设计：`docs/plans/2026-03-19-electron-mainline-architecture-design.md`
- 历史 Electron 架构总览：`docs/architecture/electron-mainline-overview.md`
- 拆仓日志：`docs/research/2026-03-21-amberkeeper-split-log.md`
- 历史研究日志：见 `docs/research/`

---

_当前文档会随着 AmberKeeper 独立化推进持续更新，命令与结论均以实际验证结果为准。_
