# Test Spec — 服务管理 / 历史会话 UX 第三轮收敛

## Automated Coverage Targets
1. **Utility nav layout / routing**
   - Assert utility area renders a left-side nav with 服务管理 / 历史会话 / 诊断 (when enabled).
   - Assert surface switching still hides native stage and preserves expected page content.
2. **Settings page compaction**
   - Assert the settings page no longer renders provider home URLs or the removed explanatory copy.
   - Assert service action buttons expose hover text (`title`) while keeping accessible names.
   - Assert drag reorder and enable/disable flows still work.
3. **Library toolbar compaction**
   - Assert large explanatory copy is removed.
   - Assert provider switcher can be clicked via icon-backed buttons.
   - Assert provider export and session export/delete remain invokable through icon-first controls.
4. **Refresh path**
   - Assert clicking refresh re-queries sessions (and selected-session messages if applicable).
   - If auto-refresh on runtime-status is added, assert capture-related status callback eventually refreshes list data without breaking selection.

## Manual/Visual Checks
1. Service rows feel single-line and drag handle visually spans the row height while staying narrower than current 34px square.
2. History header no longer consumes ~20%+ vertical space on common laptop viewport.
3. Provider selector shows recognizable logos for ChatGPT / Claude / DeepSeek / Gemini.
4. Icon-only actions reveal meaning on hover and remain keyboard focusable.
5. After sending a new DeepSeek message, refresh surfaces the session in the archive list.

## Verification Commands
- `pnpm --dir apps/desktop test`
- `pnpm --dir apps/desktop build`
