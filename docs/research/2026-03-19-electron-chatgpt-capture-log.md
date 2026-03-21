# 2026-03-19 Electron Mainline Capture Log

## Baseline

- Branch: `feature/electron-chatgpt-capture` (from `electron`)
- Worktree: `/Users/sunss/my-code/myAPP/anyChat/.worktrees/electron-chatgpt-capture`
- Baseline checks:
  - `pnpm vitest run` -> pass (`44/44`)
  - `cargo test` -> pass

## Experiment Entry Template

### Experiment N

- Hypothesis:
- Method:
- Observation:
- Result:
- Next step:

### Experiment 1

- Hypothesis: `better-sqlite3` can be used for both Vitest (Node) and Electron runtime if we allow native builds and rebuild against Electron.
- Method:
  - Added `better-sqlite3` store implementation and passing parser/store tests.
  - Allowed native builds through `pnpm.onlyBuiltDependencies`.
  - Rebuilt the module with `@electron/rebuild`.
- Observation:
  - Node tests passed when the module targeted Node ABI 127.
  - Electron smoke run failed until rebuilt for Electron ABI 145.
  - After rebuilding for Electron, Node tests failed because the same binary was no longer compatible with Node.
- Result: Failed as a stable architecture for this prototype. One shared native dependency created a Node-vs-Electron ABI split between test and runtime environments.
- Next step: Replace the storage driver with an ABI-neutral option available to both runtimes.

### Experiment 2

- Hypothesis: `node:sqlite` can remove the native rebuild split while keeping the same synchronous local-cache design.
- Method:
  - Replaced `better-sqlite3` with `node:sqlite` in the capture store.
  - Removed native rebuild scripts and dependency complexity from the experiment package.
  - Re-ran the full verification chain.
- Observation:
  - `pnpm test` passed (`8/8`).
  - `pnpm build` passed.
  - `pnpm exec electron out/main/index.js` stayed up in smoke run; only the expected experimental warning for `node:sqlite` appeared.
- Result: Success for the prototype baseline. This is the current storage approach for the Electron ChatGPT capture lab.
- Next step: Manual login and real ChatGPT round-trip verification inside the Electron window.

### Experiment 3

- Hypothesis: Triggering DOM capture as soon as `POST /backend-api/f/conversation` reaches `responseReceived(text/event-stream)` should avoid waiting on `loadingFinished`, which is too late or inconsistent for the new ChatGPT transport.
- Method:
  - Moved DOM auto-capture trigger from `loadingFinished` to the `responseReceived` phase of the main conversation stream.
  - Used DOM snapshot normalization as the primary assistant extraction path, keeping CDP request parsing for the user message.
- Observation:
  - The new trigger consistently fired and created DOM capture attempts.
  - It was able to capture a completed assistant reply in at least one real conversation.
  - But it could also fire too early and persist an older visible assistant reply from the page before the current turn had finished.
- Result: Partial success. The trigger point is correct, but the DOM success condition was too weak because "any visible assistant exists" is not equivalent to "current turn finished".
- Next step: Tighten DOM capture so it only accepts the latest completed turn and rejects snapshots where the latest user message has no matching assistant yet.

### Experiment 4

- Hypothesis: If DOM capture only returns the latest visible turn, and requires the assistant text to remain identical across two polls before persisting, it should stop writing stale or partial assistant data.
- Method:
  - Added regression tests for two failure modes:
    - the latest DOM turn contains only a new user message
    - the latest DOM turn has an assistant reply that appears only once and may still be streaming
  - Changed DOM normalization to slice only the latest visible turn.
  - Added stability gating so the latest assistant content must repeat across two polls before the capture is accepted.
  - Rebuilt the Electron prototype and validated with a fresh manual conversation.
- Observation:
  - `pnpm test` in `experiments/electron-chatgpt-capture` passed (`22/22`).
  - `pnpm build` passed in a PTY shell; non-PTY pipes still expose an unrelated `electron-vite` progress reporter issue (`process.stdout.clearLine is not a function`).
  - Real verification succeeded:
    - new conversation id: `69bbcbb6-22a8-8324-ab07-53e9a555371f`
    - persisted DOM turn:
      - user: `hi i m 帅哥`
      - assistant: `哈哈，你好呀，帅哥 😎！看来今天心情不错啊。想聊点什么，还是只是来炫耀一下颜值的？`
    - attempt log evidence:
      - `2026-03-19T10:11:04.867Z` `response-candidate` for `POST /backend-api/f/conversation`
      - `2026-03-19T10:11:12.170Z` `preload-dom capture` persisted `2 message(s)`
      - `2026-03-19T10:11:12.170Z` `preload-dom dom-auto-capture` captured `2 stabilized DOM message(s)`
- Result: Success for the current Electron prototype goal. A fresh ChatGPT turn can now be captured and cached as a `user + assistant` pair via `CDP request + stabilized DOM` flow.
- Next step: Fix session reconciliation so the early network-captured user message is moved or merged into the final session once the real `conversationId` becomes known.

### Experiment 5

- Hypothesis: After the DOM stability fix, follow-up turns in the same conversation should continue to capture reliably, and the fallback null-conversation session issue may no longer reproduce once the page is already on a concrete `/c/<id>` route.
- Method:
  - Kept the same Electron runtime alive after the first successful turn.
  - Sent one more prompt inside the same ChatGPT conversation.
  - Re-read SQLite messages, sessions, and attempt logs immediately after the assistant finished.
- Observation:
  - Real verification succeeded again in the same conversation `69bbcbb6-22a8-8324-ab07-53e9a555371f`.
  - New persisted turn:
    - user: `帅哦`
    - assistant: `哈哈，帅气指数满格啊 🌟！你这是在自夸呢，还是让我也来配合夸你呢？`
  - Evidence:
    - `2026-03-19T10:14:18.468Z` `cdp-network capture` persisted `1 message(s)` with the real conversation id
    - `2026-03-19T10:14:23.151Z` `preload-dom capture` persisted `2 message(s)`
    - `2026-03-19T10:14:23.151Z` `preload-dom dom-auto-capture` captured `2 stabilized DOM message(s)`
  - The existing session `session-18594ee5-f777-4565-8bd7-dcea8102fada` grew from `2` messages to `4`.
  - The older fallback null-conversation session still exists from a previous run, but this follow-up turn did not create a new fallback record.
- Result: Success. The stabilized DOM approach is reproducible across at least two consecutive real turns, and the fallback-session duplication did not recur for an in-conversation follow-up turn.
- Next step: Verify restart persistence for the newly captured conversation, then decide whether session reconciliation still needs code changes or only a one-time cleanup path for legacy fallback rows.

### Experiment 6

- Hypothesis: The newly captured conversation should survive a cold restart because all normalized messages are already written into the local SQLite store before process exit.
- Method:
  - Queried the latest successful conversation `69bbcbb6-22a8-8324-ab07-53e9a555371f` before restart.
  - Confirmed the Electron prototype process was not running.
  - Performed a fresh launch with `pnpm exec electron out/main/index.js`.
  - Re-queried the same session and message rows from SQLite immediately after startup.
- Observation:
  - Before restart, the target session `session-18594ee5-f777-4565-8bd7-dcea8102fada` contained `4` messages.
  - After cold start, the same session id, conversation id, message count, and message contents were still present.
  - Post-restart runtime evidence:
    - `2026-03-19T10:18:12.646Z` `runtime debugger info` -> `Attached Chrome DevTools Protocol debugger.`
  - The preserved messages after restart were:
    - `hi i m 帅哥`
    - `哈哈，你好呀，帅哥 😎！看来今天心情不错啊。想聊点什么，还是只是来炫耀一下颜值的？`
    - `帅哦`
    - `哈哈，帅气指数满格啊 🌟！你这是在自夸呢，还是让我也来配合夸你呢？`
- Result: Success. The current Electron prototype now has verified restart persistence for a real captured ChatGPT conversation.
- Next step: Clean up historical fallback-session rows and decide whether to implement runtime reconciliation or a one-time migration/maintenance command.

## Prototype Verification Snapshot (Historical)

- This snapshot reflects the prototype state before the Electron mainline promotion.
- Automated:
  - `pnpm vitest run` in repository root -> pass (`44/44`)
  - `cargo test` in `src-tauri` -> pass
  - `pnpm test` in `experiments/electron-chatgpt-capture` -> pass (`22/22`)
  - `pnpm build` in `experiments/electron-chatgpt-capture` -> pass in a PTY shell
- Smoke:
  - `pnpm exec electron out/main/index.js` -> process started successfully and stayed alive until manual stop
- Verified manually:
  - Log into ChatGPT in the Electron prototype
  - Send a fresh prompt
  - Confirm user message capture, assistant message capture, and session creation
  - Confirm a second follow-up turn in the same conversation also captures correctly
  - Confirm persistence after restart for the newest successful conversation
- Remaining acceptance gaps:
  - Decide whether to eliminate the historical fallback null-conversation session via runtime reconciliation or one-time cleanup

## Mainline Refactor Milestones

### Mainline Promotion

- Hypothesis: The validated Electron ChatGPT capture prototype can be promoted into the main repository as a pnpm workspace desktop app without reintroducing runtime ambiguity.
- Method:
  - Moved the Electron prototype into `apps/desktop`.
  - Added workspace packages for `shared-types`, `capture-core`, and `provider-chatgpt`.
  - Split Electron main process into bootstrap / runtime / IPC / window modules.
- Observation:
  - `apps/desktop` now builds and tests independently from the repository root.
  - Shared types no longer live inside the app shell.
  - Provider-specific parsing moved behind a dedicated adapter package.
- Result: Success. Electron is now structured as the active application shell instead of an experiment-only directory.

### Persistence Upgrade

- Hypothesis: The prototype persistence layer can be upgraded from `capture_sessions / capture_messages` to `conversations / messages / capture_events` without losing renderer compatibility.
- Method:
  - Added `ConversationRepository`, `MessageRepository`, `CaptureEventRepository`, and `TurnPersistenceService` into `packages/capture-core`.
  - Migrated `apps/desktop` store reads and writes to the new schema.
  - Added reconciliation so a fallback no-conversation record is upgraded into the final remote conversation.
- Observation:
  - New automated tests covered turn persistence, capture event writes, fallback reconciliation, and legacy-table migration.
  - Renderer-facing session/message queries remained compatible after the store swap.
- Result: Success. The desktop app now writes final turns to the new business/evidence data model while preserving diagnostics reads.

### Renderer Split

- Hypothesis: The renderer can stop acting as a single verification console and instead expose separate `Workspace` and `Diagnostics` surfaces without losing debugging utility.
- Method:
  - Added a renderer smoke test asserting separate `Workspace` and `Diagnostics` entry points.
  - Split the renderer into pages, smaller diagnostics components, and a local diagnostics store.
- Observation:
  - `pnpm --dir apps/desktop exec vitest run src/renderer/src/App.test.tsx --reporter=verbose` passed after the split.
  - `Diagnostics` still retains runtime status, attempt logs, sessions, messages, and manual snapshot actions.
- Result: Success. The renderer now has a future product surface and a dedicated diagnostics surface instead of one undifferentiated lab screen.

### Tauri Runtime Retirement

- Hypothesis: The repository can retire Tauri/Rust from the active mainline while keeping historical code in an explicit archive path.
- Method:
  - Reduced the root package scripts to Electron-only commands.
  - Archived the old root `src`, `src-tauri`, Vite, test, and related UI config files under `archive/tauri-mainline`.
  - Rewrote README and added an architecture overview for the Electron mainline.
- Observation:
  - `pnpm install` removed 136 root-level packages that were only needed by the old Tauri runtime.
  - Root verification now flows only through `pnpm desktop:test` and `pnpm desktop:build`.
- Result: Success. Tauri/Rust is no longer a half-live root runtime path.

## Electron Mainline Verification Snapshot

- `pnpm install` -> pass
- `pnpm --dir packages/capture-core test` -> pass (`4/4`)
- `pnpm --dir packages/provider-chatgpt test` -> pass (`1/1`)
- `pnpm --dir packages/provider-claude test` -> pass (`1/1`)
- `pnpm --dir packages/provider-deepseek test` -> pass (`1/1`)
- `pnpm --dir packages/provider-gemini test` -> pass (`1/1`)
- `pnpm --dir apps/desktop exec vitest run src/renderer/src/App.test.tsx --reporter=verbose` -> pass (`1/1`)
- `pnpm --dir apps/desktop test` -> pass (`9` test files, `34` tests)
- `pnpm --dir apps/desktop exec tsc --noEmit` -> pass
- `pnpm --dir apps/desktop build` -> pass in a PTY shell
- `pnpm desktop:test` -> pass
- `pnpm desktop:build` -> pass in a PTY shell

## Mainstream Provider Management Validation

### Automated Checklist

- `pnpm --dir packages/capture-core test` -> pass
- `pnpm --dir packages/provider-chatgpt test` -> pass
- `pnpm --dir packages/provider-claude test` -> pass
- `pnpm --dir packages/provider-deepseek test` -> pass
- `pnpm --dir packages/provider-gemini test` -> pass
- `pnpm --dir apps/desktop test` -> pass
- `pnpm --dir apps/desktop exec tsc --noEmit` -> pass
- `pnpm desktop:test` -> pass
- `pnpm desktop:build` -> pass in a PTY shell
- `pnpm --dir apps/desktop test -- --run tests/chat-preload-provider-routing.test.ts` -> pass (`5/5`)

### Manual Acceptance Checklist

The following checklist is intentionally recorded before claiming phase-1 completion. Items are only marked done when the exact provider round-trip is manually re-verified in the current Electron mainline shell.

| Provider | Login/session partition | Send real prompt | Persist user+assistant under correct provider | Switch away/back keeps session | Restart keeps provider data | Status |
| --- | --- | --- | --- | --- | --- | --- |
| ChatGPT | Verified in current shell | Verified in current shell | Verified in current shell | Verified in current shell | Verified in current shell | Verified after fresh 2026-03-20 regression |
| Claude | Verified in current shell | Verified in current shell | Verified in current shell | Verified in current shell | Verified in current shell | Verified after fresh 2026-03-21 regression, navigation serialization, and current-DOM hydration fix |
| DeepSeek | Verified in current shell | Verified in current shell | Verified in current shell | Verified through provider switching during debug iterations | Verified through repeated dev restarts | Verified, including old-session hydration |
| Gemini | Verified in current shell | Verified in current shell | Verified in current shell | Verified through provider switching during debug iterations | Verified through repeated dev restarts | Verified after response parser fixes and cleanup |

### Current Reality Notes

- The desktop shell now exposes four built-in providers: `chatgpt`, `claude`, `deepseek`, `gemini`.
- Provider adapters live in `packages/provider-chatgpt`, `packages/provider-claude`, `packages/provider-deepseek`, and `packages/provider-gemini`.
- Main process provider switching is live and automatedly verified through the provider registry, runtime registry, renderer workspace, typecheck, and build flows.
- `apps/desktop/src/preload/chat.ts` now routes DOM capture by provider host and has automated coverage in `tests/chat-preload-provider-routing.test.ts`.
- `ChatGPT` fresh mainline regression was completed on `2026-03-20`: login/session state was valid, probe `ANYCHAT-CHATGPT-FRESH-PROBE-2026-03-20` round-tripped, local persistence wrote the real conversation `69bd245f-bbc4-8322-a3b3-a336a051103f`, provider switching preserved the active session, and restart re-opened the same conversation.
- `Claude` real round-trip now passes through both the network path and the selected-session reopen path. On `2026-03-21`, a regression test first proved the Claude DOM collector was previously mixing hidden control text such as `Copy response` into assistant content; the collector was tightened to prefer visible text and now also recognizes the current Claude page structure via `[data-testid="user-message"]` and `div[data-is-streaming] .font-claude-response`.
- A same-day root-cause investigation traced the failed Claude fresh rerun to overlapping navigations on the same `webContents`: provider activation kicked off `loadInitialUrl(https://claude.ai)` while `openSession()` immediately tried to load `https://claude.ai/chat/...`. Browser-session navigations are now serialized, and fire-and-forget initial loads no longer leak aborted-navigation rejections.
- After that fix, fresh Claude verification completed against the live desktop database with probe `ANYCHAT-CLAUDE-FRESH-PROBE-2026-03-21-R2`: the real conversation `53e295aa-7e48-4df6-9655-7d065863e70b` round-tripped with assistant ack `ACK-ANYCHAT-CLAUDE-FRESH-PROBE-2026-03-21-R2`, provider switching preserved the same session URL, and restart reopened the same conversation with `openSession()` hydrating `2` messages from the selected session.
- `DeepSeek` real round-trip now passes for new conversations, and selected old sessions can be re-opened and re-hydrated without duplicating stale local messages.
- `Gemini` real round-trip now passes after two real-shape parser fixes: extracting `conversationId` from current `StreamGenerate` responses and collapsing cumulative stream updates to the latest complete assistant text.
- Historical Gemini debug data was governed on `2026-03-20` through a one-time maintenance path: `dry-run` identified `5` candidate conversations from `6` Gemini conversations / `16` Gemini messages, then cleanup created backup `~/Library/Application Support/electron-chatgpt-capture/capture-lab.gemini-dirty-data-backup-2026-03-20T11-20-14-917Z.db` and removed `5` Gemini conversations, `14` Gemini messages, and `27` Gemini capture events.
- Post-cleanup verification on the live dev database shows `1` remaining Gemini conversation, `2` Gemini messages, `3` Gemini capture events, and `0` remaining cleanup candidates.
- `desktop:build` was fresh-verified in a TTY shell on `2026-03-20`; non-TTY command pipes still hit the known `electron-vite` reporter assumption around `process.stdout.clearLine()`.
