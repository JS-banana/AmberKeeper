# Electron Mainline Refactor Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Promote the validated Electron ChatGPT prototype into the main desktop application architecture, extract a reusable capture core, and prepare the codebase for additional providers without carrying forward Tauri/Rust as active runtime paths.

**Architecture:** Convert the repository into a pnpm workspace with `apps/desktop` as the Electron app, `packages/capture-core` as the runtime/capture orchestration layer, and `packages/provider-chatgpt` as the first provider adapter. Keep behavior stable while first relocating code, then splitting the main process, then introducing the turn-oriented state machine and upgraded persistence model.

**Tech Stack:** Electron, electron-vite, TypeScript, React, Vitest, node:sqlite, pnpm workspace

### Task 1: Promote Electron Prototype to `apps/desktop`

**Files:**
- Create: `pnpm-workspace.yaml`
- Modify: `package.json`
- Modify: `.gitignore`
- Move: `experiments/electron-chatgpt-capture/package.json` -> `apps/desktop/package.json`
- Move: `experiments/electron-chatgpt-capture/electron.vite.config.ts` -> `apps/desktop/electron.vite.config.ts`
- Move: `experiments/electron-chatgpt-capture/tsconfig.json` -> `apps/desktop/tsconfig.json`
- Move: `experiments/electron-chatgpt-capture/vitest.config.ts` -> `apps/desktop/vitest.config.ts`
- Move: `experiments/electron-chatgpt-capture/src/**` -> `apps/desktop/src/**`
- Move: `experiments/electron-chatgpt-capture/tests/**` -> `apps/desktop/tests/**`
- Modify: `README.md`

**Step 1: Add workspace shell**

Create `pnpm-workspace.yaml`:

```yaml
packages:
  - apps/*
  - packages/*
```

Update root `package.json` scripts:

```json
{
  "scripts": {
    "desktop:dev": "pnpm --dir apps/desktop dev",
    "desktop:test": "pnpm --dir apps/desktop test",
    "desktop:build": "pnpm --dir apps/desktop build"
  }
}
```

**Step 2: Move the Electron prototype into `apps/desktop`**

Move the whole validated package from `experiments/electron-chatgpt-capture` to `apps/desktop` without changing runtime behavior.

**Step 3: Run regression tests from the new path**

Run:

```bash
pnpm --dir apps/desktop test
```

Expected: initial failures only if imports or config paths still point at `experiments/electron-chatgpt-capture`.

**Step 4: Fix path/config breakage**

Adjust moved config files so these still work from `apps/desktop`:

- `electron.vite.config.ts`
- `tsconfig.json`
- `vitest.config.ts`
- renderer/preload entry paths

**Step 5: Re-run test and build**

Run:

```bash
pnpm --dir apps/desktop test
pnpm --dir apps/desktop build
```

Expected:

- tests pass
- build passes in PTY shell

**Step 6: Commit**

```bash
git add pnpm-workspace.yaml package.json .gitignore README.md apps/desktop
git commit -m "refactor: promote electron prototype to desktop app"
```

### Task 2: Extract Shared Types Package

**Files:**
- Create: `packages/shared-types/package.json`
- Create: `packages/shared-types/tsconfig.json`
- Create: `packages/shared-types/src/index.ts`
- Move: `apps/desktop/src/shared/capture-types.ts` -> `packages/shared-types/src/capture-types.ts`
- Modify: `apps/desktop/src/main/main.ts`
- Modify: `apps/desktop/src/renderer/src/App.tsx`
- Modify: `apps/desktop/src/renderer/src/global.d.ts`
- Modify: `apps/desktop/tests/chatgpt-parser.test.ts`
- Modify: `apps/desktop/tests/capture-store.test.ts`
- Modify: `apps/desktop/tests/chatgpt-network.test.ts`

**Step 1: Move shared types into a package**

Create `packages/shared-types/src/index.ts`:

```ts
export * from './capture-types';
```

**Step 2: Intentionally switch one consumer to the new import**

Change one file first, for example `apps/desktop/src/renderer/src/App.tsx`, to:

```ts
import type { RuntimeStatus } from '@anychat/shared-types';
```

**Step 3: Run tests to surface unresolved alias/package wiring**

Run:

```bash
pnpm --dir apps/desktop test -- --run tests/chatgpt-parser.test.ts
```

Expected: fail with module resolution error until workspace package aliases are wired.

**Step 4: Wire aliases and update all imports**

Update `apps/desktop/tsconfig.json`, `apps/desktop/vitest.config.ts`, and `apps/desktop/electron.vite.config.ts` if needed so all main / preload / renderer / tests import from `@anychat/shared-types`.

**Step 5: Re-run regression checks**

Run:

```bash
pnpm --dir apps/desktop test
pnpm --dir apps/desktop build
```

Expected: pass.

**Step 6: Commit**

```bash
git add packages/shared-types apps/desktop
git commit -m "refactor: extract shared capture types package"
```

### Task 3: Split the Main Process Into Bootstrap, Window, Runtime, and IPC Modules

**Files:**
- Create: `apps/desktop/src/main/index.ts`
- Create: `apps/desktop/src/main/bootstrap/app.ts`
- Create: `apps/desktop/src/main/windows/main-window.ts`
- Create: `apps/desktop/src/main/runtime/browser-session.ts`
- Create: `apps/desktop/src/main/runtime/cdp-observer.ts`
- Create: `apps/desktop/src/main/ipc/capture-ipc.ts`
- Create: `apps/desktop/tests/cdp-observer.test.ts`
- Create: `apps/desktop/tests/browser-session.test.ts`
- Modify: `apps/desktop/electron.vite.config.ts`
- Delete: `apps/desktop/src/main/main.ts`

**Step 1: Write failing tests for extracted runtime boundaries**

Create `apps/desktop/tests/cdp-observer.test.ts`:

```ts
import { describe, expect, test, vi } from 'vitest';
import { createCdpObserver } from '../src/main/runtime/cdp-observer';

describe('cdp-observer', () => {
  test('emits standardized request and response events', async () => {
    const emitted: string[] = [];
    const observer = createCdpObserver({
      debuggerTarget: fakeDebuggerTarget(),
      onSignal(signal) {
        emitted.push(signal.kind);
      },
    });

    await observer.attach();
    fakeDebuggerTarget().emitRequestWillBeSent();
    fakeDebuggerTarget().emitResponseReceived();

    expect(emitted).toContain('requestSeen');
    expect(emitted).toContain('responseMetaSeen');
  });
});
```

Create `apps/desktop/tests/browser-session.test.ts`:

```ts
import { describe, expect, test } from 'vitest';
import { resolveBrowserSessionConfig } from '../src/main/runtime/browser-session';

describe('browser-session', () => {
  test('uses a persistent partition for chat providers', () => {
    expect(resolveBrowserSessionConfig('chatgpt').partition).toBe('persist:anychat-chatgpt');
  });
});
```

**Step 2: Run the new tests and confirm they fail**

Run:

```bash
pnpm --dir apps/desktop test -- --run tests/cdp-observer.test.ts tests/browser-session.test.ts
```

Expected: fail because the new modules do not exist yet.

**Step 3: Extract modules with no behavior changes**

Implementation targets:

- `bootstrap/app.ts`: Electron app lifecycle
- `windows/main-window.ts`: `BrowserWindow` creation and layout
- `runtime/browser-session.ts`: `WebContentsView`, partition, popup config
- `runtime/cdp-observer.ts`: debugger attach and `Network` event bridging
- `ipc/capture-ipc.ts`: `capture:*` handlers
- `main/index.ts`: composition root

Keep the current behavior identical. This is a structural split, not a logic rewrite.

**Step 4: Update entrypoint**

Point `apps/desktop/electron.vite.config.ts` at:

```ts
index: resolve(__dirname, 'src/main/index.ts')
```

**Step 5: Run regression checks**

Run:

```bash
pnpm --dir apps/desktop test
pnpm --dir apps/desktop build
```

Expected: pass with no behavior regressions.

**Step 6: Commit**

```bash
git add apps/desktop/src/main apps/desktop/tests apps/desktop/electron.vite.config.ts
git commit -m "refactor: split electron main process modules"
```

### Task 4: Introduce `packages/capture-core` and Turn State Machine

**Files:**
- Create: `packages/capture-core/package.json`
- Create: `packages/capture-core/tsconfig.json`
- Create: `packages/capture-core/src/index.ts`
- Create: `packages/capture-core/src/signals.ts`
- Create: `packages/capture-core/src/turn-state.ts`
- Create: `packages/capture-core/src/capture-orchestrator.ts`
- Create: `packages/capture-core/src/turn-persistence-service.ts`
- Create: `packages/capture-core/tests/turn-state.test.ts`
- Create: `packages/capture-core/tests/capture-orchestrator.test.ts`
- Modify: `apps/desktop/src/main/index.ts`
- Modify: `apps/desktop/src/main/runtime/cdp-observer.ts`
- Modify: `apps/desktop/src/preload/chat.ts`

**Step 1: Write failing state-machine tests**

Create `packages/capture-core/tests/turn-state.test.ts`:

```ts
import { describe, expect, test } from 'vitest';
import { reduceTurn } from '../src/turn-state';

describe('turn-state', () => {
  test('does not become ready_to_persist until conversation id and stable assistant exist', () => {
    let state = reduceTurn(undefined, {
      kind: 'candidateUserMessage',
      conversationId: null,
      content: 'hello',
    });

    state = reduceTurn(state, {
      kind: 'assistantMayBeReady',
      conversationId: 'conv-1',
      content: 'partial',
      stable: false,
    });

    expect(state.status).not.toBe('ready_to_persist');
  });
});
```

Create `packages/capture-core/tests/capture-orchestrator.test.ts`:

```ts
import { describe, expect, test, vi } from 'vitest';
import { createCaptureOrchestrator } from '../src/capture-orchestrator';

describe('capture-orchestrator', () => {
  test('persists exactly once when a turn reaches stable completion', () => {
    const persist = vi.fn();
    const orchestrator = createCaptureOrchestrator({ persist });

    orchestrator.consume({ provider: 'chatgpt', kind: 'candidateUserMessage', content: 'hi' });
    orchestrator.consume({ provider: 'chatgpt', kind: 'conversationIdResolved', conversationId: 'conv-1' });
    orchestrator.consume({ provider: 'chatgpt', kind: 'assistantMayBeReady', content: 'done', stable: true });

    expect(persist).toHaveBeenCalledTimes(1);
  });
});
```

**Step 2: Run tests and confirm red**

Run:

```bash
pnpm --dir packages/capture-core test
```

Expected: fail because package and modules do not exist yet.

**Step 3: Implement the minimal capture-core**

Create:

- typed raw/runtime signals
- `TurnState`
- reducer
- orchestrator
- persistence boundary

Important rule:

- user message stays pending until `conversationId` and stable assistant are both resolved

**Step 4: Wire desktop app to emit core signals**

Do not yet move ChatGPT-specific parsing into its own package. Only route current main/preload signals through `capture-core`.

**Step 5: Run checks**

Run:

```bash
pnpm --dir packages/capture-core test
pnpm --dir apps/desktop test
pnpm --dir apps/desktop build
```

Expected: all pass.

**Step 6: Commit**

```bash
git add packages/capture-core apps/desktop
git commit -m "feat: add capture core turn state machine"
```

### Task 5: Extract `packages/provider-chatgpt`

**Files:**
- Create: `packages/provider-chatgpt/package.json`
- Create: `packages/provider-chatgpt/tsconfig.json`
- Create: `packages/provider-chatgpt/src/index.ts`
- Create: `packages/provider-chatgpt/src/adapter.ts`
- Create: `packages/provider-chatgpt/src/network.ts`
- Create: `packages/provider-chatgpt/src/parser.ts`
- Create: `packages/provider-chatgpt/src/dom.ts`
- Create: `packages/provider-chatgpt/tests/adapter-contract.test.ts`
- Create: `packages/provider-chatgpt/tests/fixtures/chatgpt-turn-request.json`
- Create: `packages/provider-chatgpt/tests/fixtures/chatgpt-turn-stream.txt`
- Move: `apps/desktop/src/shared/chatgpt-network.ts` -> `packages/provider-chatgpt/src/network.ts`
- Move: `apps/desktop/src/shared/chatgpt-parser.ts` -> `packages/provider-chatgpt/src/parser.ts`
- Modify: `apps/desktop/src/preload/chat.ts`
- Modify: `apps/desktop/src/main/index.ts`

**Step 1: Write failing adapter contract test**

Create `packages/provider-chatgpt/tests/adapter-contract.test.ts`:

```ts
import { describe, expect, test } from 'vitest';
import { chatgptAdapter } from '../src/adapter';
import requestFixture from './fixtures/chatgpt-turn-request.json';

describe('chatgpt-adapter', () => {
  test('turns request + dom signals into a stable completed turn', () => {
    const signals = chatgptAdapter.interpretRequest({
      url: 'https://chatgpt.com/backend-api/f/conversation',
      method: 'POST',
      body: JSON.stringify(requestFixture),
    });

    expect(signals.some((signal) => signal.kind === 'candidateUserMessage')).toBe(true);
  });
});
```

**Step 2: Run tests and confirm failure**

Run:

```bash
pnpm --dir packages/provider-chatgpt test
```

Expected: fail because package and adapter do not exist yet.

**Step 3: Move ChatGPT rules into provider package**

Extract:

- request classification
- request parsing
- response parsing
- DOM normalization
- completion detection

Expose a single `chatgptAdapter`.

**Step 4: Replace direct ChatGPT logic in desktop app**

The desktop runtime should call adapter APIs instead of importing ChatGPT helpers directly from app-local files.

**Step 5: Re-run checks**

Run:

```bash
pnpm --dir packages/provider-chatgpt test
pnpm --dir apps/desktop test
pnpm --dir apps/desktop build
```

Expected: pass.

**Step 6: Commit**

```bash
git add packages/provider-chatgpt apps/desktop
git commit -m "refactor: extract chatgpt provider adapter"
```

### Task 6: Upgrade Persistence Model to Conversations, Messages, and Capture Events

**Files:**
- Create: `packages/capture-core/src/persistence/conversation-repository.ts`
- Create: `packages/capture-core/src/persistence/message-repository.ts`
- Create: `packages/capture-core/src/persistence/capture-event-repository.ts`
- Create: `packages/capture-core/src/persistence/schema.ts`
- Create: `packages/capture-core/tests/turn-persistence-service.test.ts`
- Create: `packages/capture-core/tests/capture-event-repository.test.ts`
- Modify: `apps/desktop/src/main/storage/capture-store.ts`
- Modify: `apps/desktop/src/main/storage/schema.ts`
- Modify: `apps/desktop/tests/capture-store.test.ts`

**Step 1: Write failing persistence tests**

Create `packages/capture-core/tests/turn-persistence-service.test.ts`:

```ts
import { describe, expect, test } from 'vitest';
import { persistCompletedTurn } from '../src/turn-persistence-service';

describe('turn-persistence-service', () => {
  test('writes a conversation, two messages, and capture events for one completed turn', () => {
    const db = createTestDatabase();

    persistCompletedTurn(db, {
      provider: 'chatgpt',
      conversationId: 'conv-1',
      messages: [
        { role: 'user', content: 'hi' },
        { role: 'assistant', content: 'hello' },
      ],
    });

    expect(countRows(db, 'conversations')).toBe(1);
    expect(countRows(db, 'messages')).toBe(2);
    expect(countRows(db, 'capture_events')).toBeGreaterThan(0);
  });
});
```

**Step 2: Run tests and confirm failure**

Run:

```bash
pnpm --dir packages/capture-core test -- --run tests/turn-persistence-service.test.ts tests/capture-event-repository.test.ts
```

Expected: fail until repositories and schema exist.

**Step 3: Implement repositories and new schema**

Add:

- `conversations`
- `messages`
- `capture_events`

Keep legacy reads working during migration if needed, but write new completed turns to the new schema.

**Step 4: Add reconciliation behavior**

If a pending user message was previously captured before `conversationId` existed, merge it into the final conversation instead of creating a lasting fallback session.

**Step 5: Re-run checks**

Run:

```bash
pnpm --dir packages/capture-core test
pnpm --dir apps/desktop test
pnpm --dir apps/desktop build
```

Expected: pass.

**Step 6: Commit**

```bash
git add packages/capture-core apps/desktop
git commit -m "feat: upgrade capture persistence model"
```

### Task 7: Split Renderer Into Workspace and Diagnostics Surfaces

**Files:**
- Create: `apps/desktop/src/renderer/src/pages/WorkspacePage.tsx`
- Create: `apps/desktop/src/renderer/src/pages/DiagnosticsPage.tsx`
- Create: `apps/desktop/src/renderer/src/components/SessionList.tsx`
- Create: `apps/desktop/src/renderer/src/components/AttemptLogPanel.tsx`
- Create: `apps/desktop/src/renderer/src/components/MessageList.tsx`
- Create: `apps/desktop/src/renderer/src/components/RuntimeStatusCard.tsx`
- Create: `apps/desktop/src/renderer/src/stores/diagnostics-store.ts`
- Create: `apps/desktop/src/renderer/src/App.test.tsx`
- Modify: `apps/desktop/src/renderer/src/App.tsx`
- Modify: `apps/desktop/package.json`

**Step 1: Add renderer test dependencies**

Add to `apps/desktop/package.json`:

```json
{
  "devDependencies": {
    "@testing-library/react": "^16.3.1",
    "@testing-library/jest-dom": "^6.9.1",
    "jsdom": "^27.4.0"
  }
}
```

**Step 2: Write failing UI smoke test**

Create `apps/desktop/src/renderer/src/App.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { App } from './App';

test('renders diagnostics entry point separately from workspace shell', () => {
  render(<App />);
  expect(screen.getByText(/workspace/i)).toBeInTheDocument();
  expect(screen.getByText(/diagnostics/i)).toBeInTheDocument();
});
```

**Step 3: Run test and confirm red**

Run:

```bash
pnpm --dir apps/desktop test -- --run src/renderer/src/App.test.tsx
```

Expected: fail until the renderer is split.

**Step 4: Implement UI split**

Targets:

- `WorkspacePage`: future product surface
- `DiagnosticsPage`: current verification console
- smaller view components for sessions / messages / attempts / runtime status

For now, workspace can be lightweight. Diagnostics should preserve all current debug value.

**Step 5: Re-run checks**

Run:

```bash
pnpm --dir apps/desktop test
pnpm --dir apps/desktop build
```

Expected: pass.

**Step 6: Commit**

```bash
git add apps/desktop
git commit -m "refactor: split workspace and diagnostics renderer"
```

### Task 8: Retire Tauri/Rust From the Active Mainline

**Files:**
- Modify: `README.md`
- Delete or archive: `src/**`
- Delete or archive: `src-tauri/**`
- Delete: `vite.config.ts`
- Modify: root `package.json`

**Step 1: Remove active references to Tauri**

Update docs and scripts so the repository clearly presents Electron as the only active runtime path.

**Step 2: Run root command checks**

Run:

```bash
pnpm desktop:test
pnpm desktop:build
```

Expected: pass from repository root.

**Step 3: Delete or archive old runtime code**

Only after the workspace-based Electron app is green:

- delete root React/Tauri runtime files, or
- move them into a clearly named archive path if you need temporary local history

Do not leave Tauri as a half-live path.

**Step 4: Re-run root checks**

Run:

```bash
pnpm desktop:test
pnpm desktop:build
```

Expected: pass.

**Step 5: Commit**

```bash
git add -A
git commit -m "chore: retire tauri runtime from electron mainline"
```

### Task 9: Document the New Architecture and Developer Workflow

**Files:**
- Create: `docs/architecture/electron-mainline-overview.md`
- Modify: `docs/research/2026-03-19-electron-chatgpt-capture-log.md`
- Modify: `README.md`

**Step 1: Write architecture doc**

Document:

- app shell / capture core / provider adapter split
- data flow from runtime signal to persisted turn
- where to add a new provider
- where diagnostics live

**Step 2: Update research log**

Append the migration and refactor milestones as they land, so architectural decisions remain tied to validated evidence.

**Step 3: Update README**

Document:

- how to run desktop app
- how to run tests
- where provider adapters live
- where capture diagnostics live

**Step 4: Verify docs reflect actual commands**

Run:

```bash
pnpm desktop:test
pnpm desktop:build
```

Expected: commands match documentation.

**Step 5: Commit**

```bash
git add docs README.md
git commit -m "docs: document electron mainline architecture"
```
