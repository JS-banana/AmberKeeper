# AmberKeeper Repository Split Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Split the current Electron mainline out of `anyChat` into a standalone sibling repository named `amberkeeper`, rebrand the active workspace to AmberKeeper, and prepare an independent GitHub release pipeline without breaking the current local capture data or provider login state on day one.

**Architecture:** Use the current `electron` branch working tree as the source of truth, but create a fresh standalone repository snapshot at `/Users/sunss/my-code/myAPP/amberkeeper` instead of rewriting historical `anyChat` git history. Rebrand visible product, package, and documentation names to `AmberKeeper`, while keeping the legacy persisted storage root and `persist:anychat-*` partition keys for the first standalone release so existing SQLite data and provider sessions remain readable.

**Tech Stack:** Git, pnpm workspace, Electron, electron-vite, TypeScript, React 19, Vitest, node:sqlite, GitHub Actions

### Task 1: Seed a Fresh Sibling Repository Snapshot

**Files:**
- Create: `/Users/sunss/my-code/myAPP/amberkeeper/.editorconfig`
- Create: `/Users/sunss/my-code/myAPP/amberkeeper/.gitignore`
- Create: `/Users/sunss/my-code/myAPP/amberkeeper/.prettierignore`
- Create: `/Users/sunss/my-code/myAPP/amberkeeper/.prettierrc`
- Create: `/Users/sunss/my-code/myAPP/amberkeeper/AGENTS.md`
- Create: `/Users/sunss/my-code/myAPP/amberkeeper/README.md`
- Create: `/Users/sunss/my-code/myAPP/amberkeeper/package.json`
- Create: `/Users/sunss/my-code/myAPP/amberkeeper/pnpm-lock.yaml`
- Create: `/Users/sunss/my-code/myAPP/amberkeeper/pnpm-workspace.yaml`
- Create: `/Users/sunss/my-code/myAPP/amberkeeper/.github/workflows/release.yml`
- Create: `/Users/sunss/my-code/myAPP/amberkeeper/scripts/ci/next-version.mjs`
- Create: `/Users/sunss/my-code/myAPP/amberkeeper/apps/**`
- Create: `/Users/sunss/my-code/myAPP/amberkeeper/packages/**`
- Create: `/Users/sunss/my-code/myAPP/amberkeeper/docs/**`
- Create: `/Users/sunss/my-code/myAPP/amberkeeper/.agents/skills/vercel-*/**`

**Step 1: Record the exact source revision**

Run:

```bash
cd /Users/sunss/my-code/myAPP/anyChat
git branch --show-current
git rev-parse HEAD
git status --short
```

Expected:

- current branch is `electron`
- source SHA is printed
- only intentional local changes are present

**Step 2: Create the sibling directory**

Run:

```bash
mkdir -p /Users/sunss/my-code/myAPP/amberkeeper
```

Expected: the target directory exists and is empty or ready to be overwritten.

**Step 3: Copy only the active Electron workspace**

Run:

```bash
rsync -a --delete \
  /Users/sunss/my-code/myAPP/anyChat/.editorconfig \
  /Users/sunss/my-code/myAPP/anyChat/.gitignore \
  /Users/sunss/my-code/myAPP/anyChat/.prettierignore \
  /Users/sunss/my-code/myAPP/anyChat/.prettierrc \
  /Users/sunss/my-code/myAPP/anyChat/AGENTS.md \
  /Users/sunss/my-code/myAPP/anyChat/README.md \
  /Users/sunss/my-code/myAPP/anyChat/package.json \
  /Users/sunss/my-code/myAPP/anyChat/pnpm-lock.yaml \
  /Users/sunss/my-code/myAPP/anyChat/pnpm-workspace.yaml \
  /Users/sunss/my-code/myAPP/anyChat/.github \
  /Users/sunss/my-code/myAPP/anyChat/scripts \
  /Users/sunss/my-code/myAPP/anyChat/.agents \
  /Users/sunss/my-code/myAPP/anyChat/apps \
  /Users/sunss/my-code/myAPP/anyChat/packages \
  /Users/sunss/my-code/myAPP/anyChat/docs \
  /Users/sunss/my-code/myAPP/amberkeeper/
```

Expected: the target repo contains the active Electron workspace but does not contain `.git`, `.worktrees`, `archive`, `experiments`, `conductor`, `dist`, or `node_modules`.

**Step 4: Initialize a fresh git repository**

Run:

```bash
cd /Users/sunss/my-code/myAPP/amberkeeper
git init -b main
git status --short
```

Expected: all copied files appear as new files in a clean standalone repo.

**Step 5: Commit the raw import snapshot**

Run:

```bash
git add .
git commit -m "chore: import electron mainline snapshot from anychat"
```

### Task 2: Rebrand the Root Workspace and Product-Facing Metadata

**Files:**
- Modify: `/Users/sunss/my-code/myAPP/amberkeeper/README.md`
- Modify: `/Users/sunss/my-code/myAPP/amberkeeper/AGENTS.md`
- Modify: `/Users/sunss/my-code/myAPP/amberkeeper/package.json`
- Modify: `/Users/sunss/my-code/myAPP/amberkeeper/apps/desktop/package.json`
- Modify: `/Users/sunss/my-code/myAPP/amberkeeper/apps/desktop/src/renderer/src/App.tsx`
- Modify: `/Users/sunss/my-code/myAPP/amberkeeper/apps/desktop/src/renderer/index.html`
- Modify: `/Users/sunss/my-code/myAPP/amberkeeper/.github/workflows/release.yml`

**Step 1: Change the root workspace name**

Update `/Users/sunss/my-code/myAPP/amberkeeper/package.json`:

```json
{
  "name": "amberkeeper"
}
```

Update `/Users/sunss/my-code/myAPP/amberkeeper/apps/desktop/package.json`:

```json
{
  "name": "amberkeeper-desktop"
}
```

**Step 2: Rewrite the landing README and AGENTS metadata**

Required content:

- repo/project name is `AmberKeeper`
- target repo name is `amberkeeper`
- primary slogan is `让 AI 的灵光，凝成琥珀`
- short alternate line is `AmberKeeper —— 每一抹灵光，皆有所归`
- imported history is clearly described as originating from the `anyChat` Electron branch

**Step 3: Update visible product strings in the renderer shell**

Change `/Users/sunss/my-code/myAPP/amberkeeper/apps/desktop/src/renderer/src/App.tsx` and `/Users/sunss/my-code/myAPP/amberkeeper/apps/desktop/src/renderer/index.html` so the shell no longer says `AnyChat Electron Mainline` or `AnyChat Capture Lab`.

**Step 4: Update release artifact and release title naming**

In `/Users/sunss/my-code/myAPP/amberkeeper/.github/workflows/release.yml`, rename:

- archive prefix `anychat-...` -> `amberkeeper-...`
- artifact download pattern `anychat-*` -> `amberkeeper-*`
- release title `AnyChat $TAG_NAME` -> `AmberKeeper $TAG_NAME`

**Step 5: Verify visible branding**

Run:

```bash
cd /Users/sunss/my-code/myAPP/amberkeeper
rg -n "AnyChat|electron-chatgpt-capture|anychat-electron-mainline" README.md AGENTS.md package.json apps/desktop/src/renderer .github/workflows/release.yml
```

Expected: no hits remain in active landing docs, root metadata, renderer shell, or release workflow.

**Step 6: Commit**

```bash
git add README.md AGENTS.md package.json apps/desktop/package.json apps/desktop/src/renderer/src/App.tsx apps/desktop/src/renderer/index.html .github/workflows/release.yml
git commit -m "chore: rebrand workspace metadata to amberkeeper"
```

### Task 3: Rename Workspace Package Scope and Alias Wiring

**Files:**
- Modify: `/Users/sunss/my-code/myAPP/amberkeeper/packages/capture-core/package.json`
- Modify: `/Users/sunss/my-code/myAPP/amberkeeper/packages/shared-types/package.json`
- Modify: `/Users/sunss/my-code/myAPP/amberkeeper/packages/provider-chatgpt/package.json`
- Modify: `/Users/sunss/my-code/myAPP/amberkeeper/packages/provider-claude/package.json`
- Modify: `/Users/sunss/my-code/myAPP/amberkeeper/packages/provider-deepseek/package.json`
- Modify: `/Users/sunss/my-code/myAPP/amberkeeper/packages/provider-gemini/package.json`
- Modify: `/Users/sunss/my-code/myAPP/amberkeeper/apps/desktop/package.json`
- Modify: `/Users/sunss/my-code/myAPP/amberkeeper/apps/desktop/tsconfig.json`
- Modify: `/Users/sunss/my-code/myAPP/amberkeeper/apps/desktop/vitest.config.ts`
- Modify: `/Users/sunss/my-code/myAPP/amberkeeper/apps/desktop/electron.vite.config.ts`
- Modify: `/Users/sunss/my-code/myAPP/amberkeeper/apps/desktop/src/**/*.ts`
- Modify: `/Users/sunss/my-code/myAPP/amberkeeper/apps/desktop/src/**/*.tsx`
- Modify: `/Users/sunss/my-code/myAPP/amberkeeper/apps/desktop/tests/**/*.ts`
- Modify: `/Users/sunss/my-code/myAPP/amberkeeper/packages/**/src/**/*.ts`
- Modify: `/Users/sunss/my-code/myAPP/amberkeeper/packages/**/tests/**/*.ts`
- Modify: `/Users/sunss/my-code/myAPP/amberkeeper/pnpm-lock.yaml`

**Step 1: Write the failing grep check**

Run:

```bash
cd /Users/sunss/my-code/myAPP/amberkeeper
rg -n "@anychat/" apps packages package.json pnpm-lock.yaml
```

Expected: many hits across package manifests, TS path aliases, and imports.

**Step 2: Rename the package scope**

Replace:

- `@anychat/capture-core` -> `@amberkeeper/capture-core`
- `@anychat/shared-types` -> `@amberkeeper/shared-types`
- `@anychat/provider-chatgpt` -> `@amberkeeper/provider-chatgpt`
- `@anychat/provider-claude` -> `@amberkeeper/provider-claude`
- `@anychat/provider-deepseek` -> `@amberkeeper/provider-deepseek`
- `@anychat/provider-gemini` -> `@amberkeeper/provider-gemini`

**Step 3: Refresh the lockfile if importer names changed**

Run:

```bash
pnpm install
```

Expected: `pnpm-lock.yaml` updates only for workspace importer/scope name changes, not dependency graph surprises.

**Step 4: Verify scope cleanup**

Run:

```bash
rg -n "@anychat/" apps packages package.json pnpm-lock.yaml
```

Expected: zero hits.

**Step 5: Commit**

```bash
git add package.json pnpm-lock.yaml apps packages
git commit -m "refactor: rename workspace scope to amberkeeper"
```

### Task 4: Preserve Existing Local Data While Rebranding Runtime Bridges

**Files:**
- Modify: `/Users/sunss/my-code/myAPP/amberkeeper/apps/desktop/src/main/bootstrap/app.ts`
- Create: `/Users/sunss/my-code/myAPP/amberkeeper/apps/desktop/src/main/bootstrap/storage-compat.ts`
- Create: `/Users/sunss/my-code/myAPP/amberkeeper/apps/desktop/tests/storage-compat.test.ts`
- Modify: `/Users/sunss/my-code/myAPP/amberkeeper/apps/desktop/src/main/index.ts`
- Modify: `/Users/sunss/my-code/myAPP/amberkeeper/apps/desktop/src/main/runtime/browser-session.ts`
- Modify: `/Users/sunss/my-code/myAPP/amberkeeper/apps/desktop/src/preload/chat.ts`
- Modify: `/Users/sunss/my-code/myAPP/amberkeeper/apps/desktop/src/preload/page-network-capture.ts`
- Modify: `/Users/sunss/my-code/myAPP/amberkeeper/apps/desktop/src/renderer/src/global.d.ts`
- Modify: `/Users/sunss/my-code/myAPP/amberkeeper/apps/desktop/tests/page-network-capture.test.ts`
- Modify: `/Users/sunss/my-code/myAPP/amberkeeper/apps/desktop/scripts/gemini-dirty-data-dry-run.mjs`
- Modify: `/Users/sunss/my-code/myAPP/amberkeeper/apps/desktop/scripts/gemini-dirty-data-cleanup.mjs`

**Step 1: Write a failing test for storage compatibility**

Create `/Users/sunss/my-code/myAPP/amberkeeper/apps/desktop/tests/storage-compat.test.ts`:

```ts
import { describe, expect, test } from 'vitest';
import { resolveLegacyCompatibleUserDataPath } from '../src/main/bootstrap/storage-compat';

describe('storage compatibility', () => {
  test('keeps the legacy userData root for the first standalone AmberKeeper release', () => {
    expect(resolveLegacyCompatibleUserDataPath('/Users/demo/Library/Application Support')).toBe(
      '/Users/demo/Library/Application Support/electron-chatgpt-capture'
    );
  });
});
```

**Step 2: Wire the compatibility helper before `app.whenReady()`**

Implement a small helper in `/Users/sunss/my-code/myAPP/amberkeeper/apps/desktop/src/main/bootstrap/storage-compat.ts` and call it from `/Users/sunss/my-code/myAPP/amberkeeper/apps/desktop/src/main/bootstrap/app.ts` so the app explicitly uses the legacy `electron-chatgpt-capture` user data root for the first split release.

This keeps:

- `capture-lab.db`
- Electron cookies/session storage
- existing provider login state

available immediately after the repo split.

**Step 3: Keep persisted partition keys stable**

In `/Users/sunss/my-code/myAPP/amberkeeper/apps/desktop/src/main/runtime/browser-session.ts`, keep `persist:anychat-<provider>` as-is for the first standalone release, but add a comment explaining this is an intentional compatibility shim and not a branding bug.

**Step 4: Rename volatile bridge and preload globals**

Rename internal runtime-only identifiers in lockstep:

- `anychatChatCapture` -> `amberkeeperChatCapture`
- `anychatPageNetworkRelay` -> `amberkeeperPageNetworkRelay`
- `anychat:page-network-payload` -> `amberkeeper:page-network-payload`
- `window.__anychatPageNetworkCaptureInstalled` -> `window.__amberkeeperPageNetworkCaptureInstalled`
- dataset key `anychatPageNetworkCaptureInjected` -> `amberkeeperPageNetworkCaptureInjected`
- relay probe `anychat-relay-probe` -> `amberkeeper-relay-probe`

Update the corresponding TypeScript globals, main-process bridge introspection, and preload tests.

**Step 5: Prefer new env vars in maintenance scripts**

Update `/Users/sunss/my-code/myAPP/amberkeeper/apps/desktop/scripts/gemini-dirty-data-dry-run.mjs` and `/Users/sunss/my-code/myAPP/amberkeeper/apps/desktop/scripts/gemini-dirty-data-cleanup.mjs` so they read:

1. `AMBERKEEPER_CAPTURE_DB_PATH`
2. fallback `ANYCHAT_CAPTURE_DB_PATH`
3. fallback legacy default DB path

Expected behavior: new docs can teach the AmberKeeper variable immediately, while old shell scripts still work.

**Step 6: Run focused tests**

Run:

```bash
cd /Users/sunss/my-code/myAPP/amberkeeper
pnpm --dir apps/desktop test -- --run tests/storage-compat.test.ts tests/page-network-capture.test.ts tests/browser-session.test.ts
```

Expected: all targeted tests pass.

**Step 7: Commit**

```bash
git add apps/desktop/src/main/bootstrap apps/desktop/src/main/index.ts apps/desktop/src/main/runtime/browser-session.ts apps/desktop/src/preload apps/desktop/src/renderer/src/global.d.ts apps/desktop/tests apps/desktop/scripts
git commit -m "feat: preserve legacy data while rebranding amberkeeper runtime"
```

### Task 5: Make the Documentation and Active Architecture Standalone-Repo Correct

**Files:**
- Modify: `/Users/sunss/my-code/myAPP/amberkeeper/README.md`
- Modify: `/Users/sunss/my-code/myAPP/amberkeeper/AGENTS.md`
- Create: `/Users/sunss/my-code/myAPP/amberkeeper/docs/architecture/amberkeeper-overview.md`
- Modify: `/Users/sunss/my-code/myAPP/amberkeeper/docs/architecture/electron-mainline-overview.md`
- Create: `/Users/sunss/my-code/myAPP/amberkeeper/docs/research/2026-03-21-amberkeeper-split-log.md`

**Step 1: Create a new active architecture overview**

Create `/Users/sunss/my-code/myAPP/amberkeeper/docs/architecture/amberkeeper-overview.md` with:

- AmberKeeper positioning
- current workspace layout
- provider model
- storage compatibility decision for the first standalone release
- release and migration assumptions

**Step 2: Mark imported historical docs as historical**

Update `/Users/sunss/my-code/myAPP/amberkeeper/docs/architecture/electron-mainline-overview.md` to start with a short note explaining it was imported from the `anyChat` Electron branch and is preserved for history, not as the new landing architecture doc.

**Step 3: Add a split log**

Create `/Users/sunss/my-code/myAPP/amberkeeper/docs/research/2026-03-21-amberkeeper-split-log.md` recording:

- source repo path
- source branch and SHA
- date of import
- excluded directories
- compatibility choices kept for first release

**Step 4: Point the README at active AmberKeeper docs**

Replace README links so the first architecture reference is `docs/architecture/amberkeeper-overview.md`.

**Step 5: Verify docs branding**

Run:

```bash
cd /Users/sunss/my-code/myAPP/amberkeeper
rg -n "AnyChat 当前以 Electron|AnyChat Electron Mainline|目标仓库名：`amberkeeper`" README.md AGENTS.md docs/architecture docs/research
```

Expected:

- active README/AGENTS/docs reference AmberKeeper
- only explicitly historical docs still mention AnyChat

**Step 6: Commit**

```bash
git add README.md AGENTS.md docs/architecture docs/research
git commit -m "docs: establish amberkeeper standalone documentation"
```

### Task 6: Configure the New Repository and Release Remote

**Files:**
- Modify: `/Users/sunss/my-code/myAPP/amberkeeper/.git/config`
- Create: GitHub repo `git@github.com:JS-banana/amberkeeper.git`

**Step 1: Verify the repo is still standalone and local**

Run:

```bash
cd /Users/sunss/my-code/myAPP/amberkeeper
git remote -v
```

Expected: no `origin` is configured yet.

**Step 2: Create the GitHub repo**

Run one of:

```bash
gh repo create JS-banana/amberkeeper --private --source=. --remote=origin --push
```

or, if the repo already exists:

```bash
git remote add origin git@github.com:JS-banana/amberkeeper.git
git push -u origin main
```

**Step 3: Verify remote wiring**

Run:

```bash
git remote -v
git branch -vv
```

Expected: `origin` points to `JS-banana/amberkeeper`, and `main` tracks the new remote branch.

**Step 4: Commit any remote-only follow-up docs**

If `.github/workflows/release.yml` or README needs the final GitHub URL after repo creation, update it and commit:

```bash
git add README.md .github/workflows/release.yml
git commit -m "docs: point release metadata at amberkeeper repo"
git push
```

### Task 7: Verify the Standalone AmberKeeper Workspace End-to-End

**Files:**
- Verify only; no new source files required

**Step 1: Install dependencies fresh**

Run:

```bash
cd /Users/sunss/my-code/myAPP/amberkeeper
pnpm install
```

Expected: install completes without workspace resolution errors.

**Step 2: Run package-level tests**

Run:

```bash
pnpm --dir packages/capture-core test
pnpm --dir packages/provider-chatgpt test
pnpm --dir packages/provider-claude test
pnpm --dir packages/provider-deepseek test
pnpm --dir packages/provider-gemini test
```

Expected: all package tests pass.

**Step 3: Run desktop validation**

Run:

```bash
pnpm --dir apps/desktop test
pnpm --dir apps/desktop exec tsc --noEmit
pnpm desktop:build
```

Expected:

- app tests pass
- TypeScript completes with no errors
- build succeeds

**Step 4: Manual smoke-check the shell**

Run:

```bash
pnpm desktop:dev
```

Expected manual checks:

- shell title and landing copy say `AmberKeeper`
- provider switching still works
- Diagnostics still loads
- legacy local data is still visible without forcing a new login

**Step 5: Final verification sweep**

Run:

```bash
git status --short
rg -n "@anychat/|anychat-electron-mainline|electron-chatgpt-capture|AnyChat Electron Mainline" .
```

Expected:

- working tree is clean
- only intentionally historical docs contain legacy names

**Step 6: Final commit and push**

```bash
git add .
git commit -m "chore: finalize amberkeeper standalone split"
git push
```

