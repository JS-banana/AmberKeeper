# AmberKeeper Agent Context

`AGENTS.md` 是本仓库的 canonical agent context；`CLAUDE.md` 只是 `@AGENTS.md` 适配入口，不要维护平行副本。

## Project Shape

- AmberKeeper 是本地优先的 Electron 桌面工作台，用于在官方 AI provider 网页体验之外保留本地对话记录。
- 主应用在 `apps/desktop`：`src/main` 负责 Electron lifecycle、runtime、IPC、SQLite store；`src/preload` 负责 bridge/capture preload；`src/renderer` 负责 chat stage 和 utility workbench。
- 跨 provider 采集核心在 `packages/capture-core`；各 provider adapter 在 `packages/provider-*`；main/preload/renderer 共享类型在 `packages/shared-types`。
- **Provider** 是具备采集 adapter 的内建能力对象；**Service** 是 shell rail 中的入口对象，可能是 built-in provider，也可能是 custom service。custom service 只做壳层浏览，不参与内建采集。
- 仍保留旧 Electron `userData` 根目录 `electron-chatgpt-capture` 和旧 partition key `persist:anychat-<provider>`；这是兼容既有 SQLite、Cookie 和登录态的刻意决策，不是命名遗漏。

## Stack

- Node 22、pnpm 10：来自 GitHub Actions 配置。
- Electron 41、React 19、TypeScript strict、Vitest、electron-vite。
- pnpm workspace 覆盖 `apps/*` 和 `packages/*`。

## Commands

- Install like CI: `pnpm install --frozen-lockfile`
- Desktop dev: `pnpm desktop:dev`
- Desktop test: `pnpm desktop:test`
- Desktop build: `pnpm desktop:build`
- Focused desktop test: `pnpm --dir apps/desktop test -- <pattern>`
- Desktop typecheck: `pnpm --dir apps/desktop exec tsc --noEmit -p tsconfig.json`
- Release hygiene: `pnpm desktop:release:hygiene`
- Release packaging: `pnpm desktop:dist`
- In local Codex sessions, apply any higher-level shell wrapper rule such as `rtk` to the same command body.

## Non-Obvious Patterns

- `apps/desktop/src/main/index.ts` is the composition root: lifecycle wiring, service assembly, IPC registration. Do not put new high-responsibility business logic there.
- Repositories own single-domain reads/writes only. Cross-domain transactions belong in a service/coordinator or an existing owner such as `CaptureStore` / capture-core persistence.
- Capture persistence has two durable business tables (`conversations`, `messages`) plus evidence/diagnostic layers (`capture_events`, `capture_attempt_logs`). Keep business data and diagnostics separate.
- Renderer shell mutations should usually call shell-state refresh paths, not broad session/message refresh. Broad refresh is for initial load, capture-driven updates, and delete-session selection convergence.
- Runtime/view changes must answer: who creates, activates, hides, detaches, and disposes the runtime. Custom service deletion must detach and dispose.
- Security-sensitive Electron flags must stay explicit: `contextIsolation`, `sandbox`, `nodeIntegration`, `webSecurity`, `webviewTag`. The main renderer `sandbox: false` is a documented exception, not a default policy.
- Chat data location is a retained-chat-data storage concern, not an Electron `userData` move. Read `docs/adr/0002-chat-data-location.md` before changing this path.

## Boundaries

### Always

- Use `CONTEXT.md` for canonical product language before naming user-facing storage, save, export, and cleanup concepts.
- Add or update behavior tests when changing capture, persistence, IPC contracts, or renderer settings flows.
- Run the smallest relevant focused test first, then broaden verification when public APIs or shared types change.
- Keep docs, tests, and code aligned when changing a system boundary.

### Ask First

- Adding/removing dependencies or changing package manager/runtime versions.
- Changing storage roots, session partition keys, release/versioning behavior, or database schema.
- Destructive retained-data operations, including Stage 2 chat-data cleanup.
- Reworking provider/service domain boundaries or moving logic across package boundaries.

### Never

- Silently fallback and create a new chat store when a configured chat-data location is unavailable.
- Move provider login state, browser cache, Electron `userData`, or provider-owned remote history as part of chat-data-location work.
- Merge or overwrite an existing target folder that already contains AmberKeeper chat-data artifacts.
- Put cross-domain transactions inside repositories or UI/IPC handlers.
- Edit `out/`, `dist/`, generated release artifacts, secrets, or local `.env` files by hand.

## Verification

- Storage location changes: `pnpm --dir apps/desktop test -- chat-data-location`
- Storage/lifecycle compatibility: `pnpm --dir apps/desktop test -- storage-compat app-lifecycle`
- Settings UI/API wiring: `pnpm --dir apps/desktop test -- SettingsPage App`
- Capture persistence changes: include `pnpm --dir apps/desktop test -- capture-store`
- Shared type or IPC/preload changes: run desktop typecheck.
- Before finishing broad code changes, run `pnpm desktop:test`, `pnpm desktop:build`, and `git diff --check`.
- If a verification command cannot run, report the exact command, failure, and what remains unverified.

## Reference Map

- `CONTEXT.md`: canonical product vocabulary and avoid-list terms.
- `docs/architecture/amberkeeper-overview.md`: repo shape, product model, recommended reading order.
- `docs/architecture/domain-model.md`: Provider vs Service model.
- `docs/architecture/persistence-contracts.md`: table ownership, transaction boundaries, capture persistence rules.
- `docs/architecture/runtime-lifecycle.md`: runtime/view lifecycle and Electron security boundaries.
- `docs/engineering/boundary-rules.md`: composition root, repository, renderer refresh, capture ingress, runtime, and documentation policies.
- `docs/adr/0001-save-scope.md`: save/export scope and provider-owned title decisions.
- `docs/adr/0002-chat-data-location.md`: chat data location, restart migration, pointer, and no-silent-fallback decisions.
