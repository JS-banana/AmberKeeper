# Mainstream Provider Management Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add phase-1 mainstream provider management to the Electron mainline so `ChatGPT / Claude / DeepSeek / Gemini` can be managed from the Workspace and their captured conversations can be viewed per active provider.

**Architecture:** Extend the current Electron app shell into a multi-provider runtime with one native view per built-in provider, keep persistence unified in the existing SQLite capture store, and implement provider-specific capture logic behind one adapter contract per provider package. Preserve the current separation between app shell, capture core, and provider adapters.

**Tech Stack:** Electron, electron-vite, TypeScript, React 19, Vitest, node:sqlite, pnpm workspace

### Task 1: Introduce Built-In Provider Registry and Persistent Provider Settings

**Files:**
- Create: `apps/desktop/tests/provider-settings.test.ts`
- Create: `apps/desktop/src/main/storage/provider-settings-repository.ts`
- Modify: `apps/desktop/src/main/storage/schema.ts`
- Modify: `apps/desktop/src/main/storage/capture-store.ts`
- Modify: `apps/desktop/src/main/runtime/browser-session.ts`
- Modify: `packages/shared-types/src/capture-types.ts`

**Step 1: Write the failing test**

Create `apps/desktop/tests/provider-settings.test.ts` with assertions that:

- the four built-in providers are seeded
- `chatgpt`, `claude`, `deepseek`, and `gemini` are present
- enable / disable updates persist
- provider configs expose a unique partition and home URL

**Step 2: Run test to verify it fails**

Run:

```bash
pnpm --dir apps/desktop test -- --run tests/provider-settings.test.ts
```

Expected: fail because provider settings storage does not exist yet.

**Step 3: Write minimal implementation**

Add a `providers` table and a repository that seeds:

- `chatgpt`
- `claude`
- `deepseek`
- `gemini`

Generalize provider ids in shared types and browser session config so the runtime is no longer hardcoded to `chatgpt`.

**Step 4: Run test to verify it passes**

Run:

```bash
pnpm --dir apps/desktop test -- --run tests/provider-settings.test.ts
pnpm --dir apps/desktop exec tsc --noEmit
```

Expected: pass.

**Step 5: Commit**

```bash
git add apps/desktop/tests/provider-settings.test.ts apps/desktop/src/main/storage/provider-settings-repository.ts apps/desktop/src/main/storage/schema.ts apps/desktop/src/main/storage/capture-store.ts apps/desktop/src/main/runtime/browser-session.ts packages/shared-types/src/capture-types.ts
git commit -m "feat: add provider registry and settings persistence"
```

### Task 2: Refactor the Main Process Into a Multi-Provider Runtime Switcher

**Files:**
- Create: `apps/desktop/tests/provider-runtime-registry.test.ts`
- Create: `apps/desktop/src/main/runtime/provider-runtime-registry.ts`
- Modify: `apps/desktop/src/main/index.ts`
- Modify: `apps/desktop/src/main/windows/main-window.ts`
- Modify: `apps/desktop/src/main/ipc/capture-ipc.ts`

**Step 1: Write the failing test**

Create `apps/desktop/tests/provider-runtime-registry.test.ts` with assertions that:

- a runtime can be resolved for each built-in provider
- only one provider is active at a time
- switching provider updates the visible native view bounds without destroying the underlying partition state

**Step 2: Run test to verify it fails**

Run:

```bash
pnpm --dir apps/desktop test -- --run tests/provider-runtime-registry.test.ts
```

Expected: fail because the app still manages only one ChatGPT view.

**Step 3: Write minimal implementation**

Add a provider runtime registry in the main process, expose IPC for:

- `providers:list`
- `providers:setActive`
- `providers:setEnabled`
- `providers:getActive`

Update window attachment so the native stage can host multiple `WebContentsView` instances and only show the current active provider.

**Step 4: Run test to verify it passes**

Run:

```bash
pnpm --dir apps/desktop test -- --run tests/provider-runtime-registry.test.ts
pnpm --dir apps/desktop build
```

Expected: pass.

**Step 5: Commit**

```bash
git add apps/desktop/tests/provider-runtime-registry.test.ts apps/desktop/src/main/runtime/provider-runtime-registry.ts apps/desktop/src/main/index.ts apps/desktop/src/main/windows/main-window.ts apps/desktop/src/main/ipc/capture-ipc.ts
git commit -m "refactor: add multi-provider runtime switching"
```

### Task 3: Build the Workspace Provider Management Surface

**Files:**
- Create: `apps/desktop/src/renderer/src/stores/workspace-store.ts`
- Create: `apps/desktop/src/renderer/src/components/ProviderRail.tsx`
- Create: `apps/desktop/src/renderer/src/components/ConversationList.tsx`
- Create: `apps/desktop/src/renderer/src/components/ConversationMessagePane.tsx`
- Modify: `apps/desktop/src/renderer/src/pages/WorkspacePage.tsx`
- Modify: `apps/desktop/src/renderer/src/App.test.tsx`
- Modify: `apps/desktop/src/renderer/src/styles.css`
- Modify: `apps/desktop/src/preload/renderer.ts`

**Step 1: Write the failing test**

Extend `apps/desktop/src/renderer/src/App.test.tsx` so it verifies:

- the Workspace renders the four built-in providers
- the active provider can be switched
- providers can be enabled / disabled
- only sessions and messages for the current active provider are shown

**Step 2: Run test to verify it fails**

Run:

```bash
pnpm --dir apps/desktop exec vitest run src/renderer/src/App.test.tsx --reporter=verbose
```

Expected: fail because Workspace is still static placeholder content.

**Step 3: Write minimal implementation**

Add a renderer store for workspace data and replace the placeholder Workspace with:

- provider rail
- active provider card
- provider enable toggle
- current-provider session list
- current-provider message panel

Wire these through preload IPC to the main process.

**Step 4: Run test to verify it passes**

Run:

```bash
pnpm --dir apps/desktop exec vitest run src/renderer/src/App.test.tsx --reporter=verbose
pnpm --dir apps/desktop test
```

Expected: pass.

**Step 5: Commit**

```bash
git add apps/desktop/src/renderer/src/stores/workspace-store.ts apps/desktop/src/renderer/src/components/ProviderRail.tsx apps/desktop/src/renderer/src/components/ConversationList.tsx apps/desktop/src/renderer/src/components/ConversationMessagePane.tsx apps/desktop/src/renderer/src/pages/WorkspacePage.tsx apps/desktop/src/renderer/src/App.test.tsx apps/desktop/src/renderer/src/styles.css apps/desktop/src/preload/renderer.ts
git commit -m "feat: add workspace provider management"
```

### Task 4: Generalize the Adapter Contract and Register ChatGPT Through It

**Files:**
- Create: `apps/desktop/tests/provider-adapter-registry.test.ts`
- Create: `packages/shared-types/src/provider-types.ts`
- Create: `apps/desktop/src/main/runtime/provider-adapters.ts`
- Modify: `packages/shared-types/src/index.ts`
- Modify: `apps/desktop/src/main/index.ts`
- Modify: `packages/provider-chatgpt/src/adapter.ts`

**Step 1: Write the failing test**

Create `apps/desktop/tests/provider-adapter-registry.test.ts` asserting that:

- adapters are resolved by provider id
- `chatgpt` remains wired
- missing provider adapters can be represented explicitly without crashing the runtime

**Step 2: Run test to verify it fails**

Run:

```bash
pnpm --dir apps/desktop test -- --run tests/provider-adapter-registry.test.ts
```

Expected: fail because only a direct `chatgptAdapter` import exists.

**Step 3: Write minimal implementation**

Define a shared provider adapter contract and route ChatGPT through a registry instead of hardcoded imports. This is required before adding `claude`, `deepseek`, and `gemini`.

**Step 4: Run test to verify it passes**

Run:

```bash
pnpm --dir apps/desktop test -- --run tests/provider-adapter-registry.test.ts
pnpm --dir packages/provider-chatgpt test
```

Expected: pass.

**Step 5: Commit**

```bash
git add apps/desktop/tests/provider-adapter-registry.test.ts packages/shared-types/src/provider-types.ts apps/desktop/src/main/runtime/provider-adapters.ts packages/shared-types/src/index.ts apps/desktop/src/main/index.ts packages/provider-chatgpt/src/adapter.ts
git commit -m "refactor: register provider adapters by provider id"
```

### Task 5: Implement `packages/provider-claude`

**Files:**
- Create: `packages/provider-claude/package.json`
- Create: `packages/provider-claude/tsconfig.json`
- Create: `packages/provider-claude/vitest.config.ts`
- Create: `packages/provider-claude/src/index.ts`
- Create: `packages/provider-claude/src/adapter.ts`
- Create: `packages/provider-claude/src/network.ts`
- Create: `packages/provider-claude/src/parser.ts`
- Create: `packages/provider-claude/src/dom.ts`
- Create: `packages/provider-claude/tests/adapter-contract.test.ts`
- Modify: `pnpm-workspace.yaml`
- Modify: `apps/desktop/src/main/runtime/provider-adapters.ts`

**Step 1: Write the failing test**

Create `packages/provider-claude/tests/adapter-contract.test.ts` that feeds representative Claude request / response / DOM fixtures and expects normalized provider signals.

**Step 2: Run test to verify it fails**

Run:

```bash
pnpm --dir packages/provider-claude test
```

Expected: fail because the package and adapter do not exist.

**Step 3: Write minimal implementation**

Implement Claude adapter modules and register them in the desktop runtime.

**Step 4: Run test to verify it passes**

Run:

```bash
pnpm --dir packages/provider-claude test
pnpm --dir apps/desktop test
```

Expected: pass.

**Step 5: Commit**

```bash
git add packages/provider-claude pnpm-workspace.yaml apps/desktop/src/main/runtime/provider-adapters.ts
git commit -m "feat: add claude provider adapter"
```

### Task 6: Implement `packages/provider-deepseek`

**Files:**
- Create: `packages/provider-deepseek/package.json`
- Create: `packages/provider-deepseek/tsconfig.json`
- Create: `packages/provider-deepseek/vitest.config.ts`
- Create: `packages/provider-deepseek/src/index.ts`
- Create: `packages/provider-deepseek/src/adapter.ts`
- Create: `packages/provider-deepseek/src/network.ts`
- Create: `packages/provider-deepseek/src/parser.ts`
- Create: `packages/provider-deepseek/src/dom.ts`
- Create: `packages/provider-deepseek/tests/adapter-contract.test.ts`
- Modify: `pnpm-workspace.yaml`
- Modify: `apps/desktop/src/main/runtime/provider-adapters.ts`

**Step 1: Write the failing test**

Create `packages/provider-deepseek/tests/adapter-contract.test.ts` using DeepSeek fixtures.

**Step 2: Run test to verify it fails**

Run:

```bash
pnpm --dir packages/provider-deepseek test
```

Expected: fail because the package and adapter do not exist.

**Step 3: Write minimal implementation**

Implement DeepSeek adapter modules and register them in the desktop runtime.

**Step 4: Run test to verify it passes**

Run:

```bash
pnpm --dir packages/provider-deepseek test
pnpm --dir apps/desktop test
```

Expected: pass.

**Step 5: Commit**

```bash
git add packages/provider-deepseek pnpm-workspace.yaml apps/desktop/src/main/runtime/provider-adapters.ts
git commit -m "feat: add deepseek provider adapter"
```

### Task 7: Implement `packages/provider-gemini`

**Files:**
- Create: `packages/provider-gemini/package.json`
- Create: `packages/provider-gemini/tsconfig.json`
- Create: `packages/provider-gemini/vitest.config.ts`
- Create: `packages/provider-gemini/src/index.ts`
- Create: `packages/provider-gemini/src/adapter.ts`
- Create: `packages/provider-gemini/src/network.ts`
- Create: `packages/provider-gemini/src/parser.ts`
- Create: `packages/provider-gemini/src/dom.ts`
- Create: `packages/provider-gemini/tests/adapter-contract.test.ts`
- Modify: `pnpm-workspace.yaml`
- Modify: `apps/desktop/src/main/runtime/provider-adapters.ts`

**Step 1: Write the failing test**

Create `packages/provider-gemini/tests/adapter-contract.test.ts` using Gemini fixtures.

**Step 2: Run test to verify it fails**

Run:

```bash
pnpm --dir packages/provider-gemini test
```

Expected: fail because the package and adapter do not exist.

**Step 3: Write minimal implementation**

Implement Gemini adapter modules and register them in the desktop runtime.

**Step 4: Run test to verify it passes**

Run:

```bash
pnpm --dir packages/provider-gemini test
pnpm --dir apps/desktop test
```

Expected: pass.

**Step 5: Commit**

```bash
git add packages/provider-gemini pnpm-workspace.yaml apps/desktop/src/main/runtime/provider-adapters.ts
git commit -m "feat: add gemini provider adapter"
```

### Task 8: Verify Real Multi-Provider Capture and Update Documentation

**Files:**
- Modify: `README.md`
- Modify: `docs/research/2026-03-19-electron-chatgpt-capture-log.md`
- Modify: `docs/architecture/electron-mainline-overview.md`

**Step 1: Write the failing verification checklist**

Record the manual acceptance checklist in the research log for:

- ChatGPT
- Claude
- DeepSeek
- Gemini

**Step 2: Run current checks and confirm remaining failures or gaps**

Run:

```bash
pnpm --dir packages/capture-core test
pnpm --dir packages/provider-chatgpt test
pnpm --dir packages/provider-claude test
pnpm --dir packages/provider-deepseek test
pnpm --dir packages/provider-gemini test
pnpm --dir apps/desktop test
pnpm --dir apps/desktop exec tsc --noEmit
pnpm desktop:test
pnpm desktop:build
```

Expected: all automated checks pass before manual provider verification starts.

**Step 3: Perform real validation**

For each built-in provider:

- log in if required
- send a prompt
- confirm user and assistant turns persist under the correct provider
- switch away and back
- restart the app and confirm per-provider sessions/messages remain available

**Step 4: Update docs to match reality**

Document:

- the four built-in providers in phase 1
- where provider adapters live
- how provider switching works
- current validation status by provider

**Step 5: Commit**

```bash
git add README.md docs/research/2026-03-19-electron-chatgpt-capture-log.md docs/architecture/electron-mainline-overview.md
git commit -m "docs: document mainstream provider management"
```

Plan complete and saved to `docs/plans/2026-03-19-mainstream-provider-management-plan.md`.
