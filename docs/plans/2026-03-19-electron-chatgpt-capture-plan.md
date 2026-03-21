# Electron ChatGPT Capture Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build an isolated Electron prototype that captures complete ChatGPT turns and persists them locally.

**Architecture:** Keep the current Tauri app untouched. Add a standalone Electron prototype under `experiments/electron-chatgpt-capture` that uses `WebContentsView` for remote content, CDP `Network` events for primary capture, `preload` for diagnostics, and SQLite in the main process for persistence.

**Tech Stack:** Electron, TypeScript, React, Vite, node:sqlite, Vitest

### Task 1: Save design inputs and research log

**Files:**
- Create: `docs/research/2026-03-19-electron-chatgpt-capture-log.md`

**Step 1: Add a research log template**

Create a dated log with sections for hypothesis, method, observation, result, and next step.

**Step 2: Add the current baseline result**

Record that the isolated worktree was created from `electron`, `pnpm vitest run` passed, and `cargo test` passed before implementation started.

### Task 2: Define capture types and parser tests

**Files:**
- Create: `experiments/electron-chatgpt-capture/src/shared/capture-types.ts`
- Create: `experiments/electron-chatgpt-capture/src/shared/chatgpt-parser.ts`
- Test: `experiments/electron-chatgpt-capture/tests/chatgpt-parser.test.ts`

**Step 1: Write failing parser tests**

Cover:
- extracting user text from ChatGPT request JSON
- extracting assistant text from a final SSE payload
- extracting history messages from conversation JSON
- producing stable content hashes for de-duplication

**Step 2: Run parser tests to confirm failure**

Run: `pnpm --dir experiments/electron-chatgpt-capture test -- chatgpt-parser`

**Step 3: Implement the minimal parser**

Add just enough code to make the parser tests pass.

**Step 4: Re-run parser tests**

Run the same command and confirm green.

### Task 3: Define session merge and cache tests

**Files:**
- Create: `experiments/electron-chatgpt-capture/src/main/storage/schema.ts`
- Create: `experiments/electron-chatgpt-capture/src/main/storage/capture-store.ts`
- Test: `experiments/electron-chatgpt-capture/tests/capture-store.test.ts`

**Step 1: Write failing store tests**

Cover:
- create/update session using `remoteConversationId`
- fallback session creation when remote ID is missing
- de-duplication by provider + remote conversation + role + content hash
- list sessions/messages after restart against the same database file

**Step 2: Run store tests to confirm failure**

Run: `pnpm --dir experiments/electron-chatgpt-capture test -- capture-store`

**Step 3: Implement the minimal SQLite store**

Use `node:sqlite` in the main process and keep the schema scoped to the prototype.

**Step 4: Re-run store tests**

Run the same command and confirm green.

### Task 4: Build the minimal Electron shell

**Files:**
- Create: `experiments/electron-chatgpt-capture/package.json`
- Create: `experiments/electron-chatgpt-capture/electron.vite.config.ts`
- Create: `experiments/electron-chatgpt-capture/src/main/main.ts`
- Create: `experiments/electron-chatgpt-capture/src/preload/index.ts`
- Create: `experiments/electron-chatgpt-capture/src/renderer/*`

**Step 1: Add the Electron app scaffold**

Set up `electron-vite` scripts for `dev`, `build`, and `test`.

**Step 2: Render a minimal shell**

Show runtime status, recent capture attempts, and a message list beside a `WebContentsView`-hosted ChatGPT instance.

**Step 3: Expose minimal IPC**

Expose:
- `capture:listSessions`
- `capture:listMessages`
- `capture:getRuntimeStatus`
- `capture:triggerDomSnapshot`

**Step 4: Run the prototype tests**

Run: `pnpm --dir experiments/electron-chatgpt-capture test`

### Task 5: Wire primary capture and diagnostics

**Files:**
- Modify: `experiments/electron-chatgpt-capture/src/main/main.ts`
- Modify: `experiments/electron-chatgpt-capture/src/preload/index.ts`
- Modify: `experiments/electron-chatgpt-capture/src/shared/chatgpt-parser.ts`

**Step 1: Attach CDP network listeners**

Capture request payloads and final response bodies for the ChatGPT endpoints covered by the parser tests.

**Step 2: Persist normalized messages**

Convert network events into `CaptureEnvelope` records and store them in SQLite.

**Step 3: Add diagnostic fallback**

Implement a manual DOM snapshot action in `preload` and store a structured attempt log when network parsing fails.

**Step 4: Verify prototype tests stay green**

Run: `pnpm --dir experiments/electron-chatgpt-capture test`

### Task 6: Verify the prototype manually

**Files:**
- Modify: `docs/research/2026-03-19-electron-chatgpt-capture-log.md`

**Step 1: Run the prototype**

Run: `pnpm --dir experiments/electron-chatgpt-capture dev`

**Step 2: Execute the acceptance flow**

Confirm:
- ChatGPT loads
- a user message is captured
- an assistant reply is captured
- data persists after restart
- duplicate messages are not created

**Step 3: Record the result**

Append success/failure evidence and any blockers to the research log.
