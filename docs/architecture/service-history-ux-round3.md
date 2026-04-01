# Service / History UX Round 3 Review Notes

## Purpose

This note turns `.omx/plans/prd-service-history-ux-round3.md` into a reviewer-facing implementation contract. It captures the concrete gaps found in the current renderer and the target behavior that Lane A / B / C should preserve while they land the UI refresh.

## Current Code Review Findings

### 1. Utility navigation still needs the final left-rail shell

- `apps/desktop/src/renderer/src/App.tsx` already renders a utility nav for `服务管理 / 历史会话 / 诊断`.
- The current shell is still closer to tab treatment than a true compact utility left rail, so the round-3 CSS work needs to keep:
  - a stable vertical nav,
  - clear active-state affordances,
  - `min-height: 0` boundaries so the library view can scroll independently.

### 2. Settings still contains the noise called out in the PRD

`apps/desktop/src/renderer/src/pages/SettingsPage.tsx` still includes the exact content the user wanted removed:

- explanatory header copy,
- `provider.homeUrl`,
- drag-hint footer text per row.

The drag affordance and icon-only actions also still need the round-3 accessibility pass:

- drag handle should read as a full-height narrow grip instead of an inline glyph,
- icon buttons should keep `aria-label` and add hover text (`title` or shared tooltip semantics).

### 3. Library header and detail pane are still too text-heavy

The current library renderer still spends vertical space on:

- a copy-heavy page header in `LibraryPage.tsx`,
- text tabs instead of provider-logo-first switching,
- full text buttons for export actions,
- verbose session meta in both `ConversationList.tsx` and `ConversationMessagePane.tsx`,
- always-expanded source URL / session ID metadata in the detail pane.

Round 3 should treat these surfaces as dense archive tools rather than marketing copy.

### 4. Session freshness is still manual-once, not capture-aware

`apps/desktop/src/renderer/src/stores/workspace-store.ts` currently:

- performs the initial `refresh(null)` on mount,
- updates only `runtimeStatus` inside `onRuntimeStatus`,
- does **not** re-fetch sessions/messages after capture-driven runtime changes.

That means new DeepSeek activity can still land in persistence without surfacing in the archive until another explicit state-changing action triggers `refresh()`.

## Target Contract For Implementation

### Utility workbench

- Utility surfaces use a left-side nav for `服务管理`, `历史会话`, and `诊断` when diagnostics are enabled.
- The nav is persistent while the utility shell is open; the content pane owns scrolling.
- Library-specific layouts must keep independent scrolling without collapsing the shell height.

### Settings page

- Service rows focus on provider name, enabled state, active-state badge, drag affordance, and icon actions.
- Remove non-essential supporting copy:
  - page-level explainer paragraph,
  - provider URL text,
  - drag-hint footer text.
- Drag affordance should span the row height and remain discoverable.
- Every icon-only action must expose both:
  - `aria-label`,
  - hover text (`title` or equivalent tooltip contract).

### History archive page

- Replace the tall header block with a compact toolbar.
- Provider export targeting should become icon/logo-first while still exposing the provider name on hover/focus.
- Refresh belongs in the top toolbar as a first-class action.
- Export controls should prefer icon-first affordances and only keep text where required for clarity.

### Conversation list and detail density

- Conversation rows should bias toward a one-line summary:
  - title,
  - provider/logo,
  - only the most useful metadata.
- Detail-header metadata should stay compressed; source URL and session identifiers should be de-emphasized or collapsed.
- Delete/export actions must remain discoverable with accessible labels and hover descriptions.

### Refresh semantics

- `useWorkspaceStore()` should expose a reusable refresh action for archive UI controls.
- The archive page should offer an explicit manual refresh button.
- Runtime-status-driven refresh must stay lightweight:
  - only react to capture-relevant changes,
  - throttle/debounce repeated updates,
  - preserve the selected session where possible.

## Review Checklist

When implementation lands, confirm:

1. Settings no longer renders the removed explanatory text, URLs, or row-level drag hint copy.
2. Utility navigation is visibly left-aligned and not rendered as top pills.
3. Provider selection in the library is icon/logo-first with accessible naming.
4. Manual refresh re-fetches sessions and selected-session messages.
5. Capture-driven runtime updates can surface newly persisted sessions without requiring an unrelated action.
6. Icon-only controls consistently expose `aria-label` + hover text.
7. Renderer tests cover the compact navigation/settings/history flows called out in the PRD.

## Recommended Verification

From the repository root:

```bash
pnpm --dir apps/desktop exec tsc --noEmit
pnpm --dir apps/desktop test
pnpm --dir apps/desktop build
```

Manual spot-check after integration:

- open utility shell and verify left-nav switching,
- reorder/toggle a provider from settings,
- refresh the library after creating a new provider session,
- export/delete from the compact archive UI and verify hover labels on icon-only actions.
