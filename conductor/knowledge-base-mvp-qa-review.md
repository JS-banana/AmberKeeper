# Knowledge-base MVP QA / review notes

This worker lane stays in QA/review scope for the MVP from `.omx/plans/prd-knowledge-base-data-management-ui.md`.

## Automated coverage confirmed in the desktop suite

- `apps/desktop/src/renderer/src/App.test.tsx`
  - covers provider-scoped library behavior for the active provider
  - covers the empty-state path when the active provider has no captured sessions
  - keeps provider-settings regressions under test while navigating into and out of the library surface

## Current evidence-backed gaps to keep validating during integration

- Title persistence/display still needs dedicated proof for the PRD acceptance criteria around `session.title` and fallback rendering.
- Delete/export IPC flows still need focused tests once those APIs land.
- Provider changes from the left rail still return the operator to chat first, so provider-first library browsing works but is not yet a single-surface flow.

## Suggested integration checks after backend/renderer lanes land

1. Add storage + renderer coverage for persisted `title` and fallback title rendering.
2. Add focused tests for single-session export/delete and provider export actions.
3. Re-run provider settings regressions after the knowledge-base actions are wired in.
