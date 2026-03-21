# Mainstream Provider Management Design

**Date:** 2026-03-19

## Goal

Promote the Electron mainline from a single-provider ChatGPT capture prototype into a multi-provider desktop shell that can manage and capture mainstream chat products. Phase 1 scope is limited to four built-in providers:

- `chatgpt`
- `claude`
- `deepseek`
- `gemini`

Phase 1 management scope is intentionally narrow:

- built-in provider list
- active provider switching
- enable / disable provider
- view sessions and messages for the current active provider only

Phase 1 explicitly excludes:

- custom provider creation
- drag reorder
- global search / export / delete
- long-tail provider migration from the historical Tauri UI shell

## Architecture

The Electron desktop app should keep the existing three-layer split and extend it rather than collapse back into one large main process:

- `app shell`
  - owns provider metadata, active-provider state, native view switching, and renderer IPC
- `capture core`
  - remains provider-agnostic and continues to own signal normalization, turn completion, and persistence
- `provider adapters`
  - one adapter package per provider, each responsible only for network / DOM interpretation rules

The key change from the current state is that the app shell can no longer hardcode `chatgpt`. It must manage a provider registry for the four built-in providers, create a persistent session partition for each provider, and switch the visible `WebContentsView` based on the current active provider.

## Runtime Model

The main process should maintain a `ProviderRuntimeRegistry` keyed by provider id. Each runtime owns:

- provider metadata
- persistent partition
- source session key
- home URL
- `WebContentsView`
- optional adapter

All four providers should be switchable in the same native stage. Runtimes may be created lazily, but once created they should preserve login/session state via `persist:anychat-<provider>`.

Capture should remain adapter-driven:

- `chatgpt`, `claude`, `deepseek`, and `gemini` each emit provider signals through the same `capture-core` contract
- the main process routes CDP / DOM observations into the active provider adapter
- persistence remains unified in one SQLite store, keyed by `provider`

## Data Model

The current `conversations / messages / capture_events` model is already close to what phase 1 needs because it is provider-keyed. The missing piece is a first-class provider settings model.

Phase 1 should add a `providers` table that persists:

- `id`
- `name`
- `home_url`
- `enabled`
- `builtin`
- `created_at`
- `updated_at`

The desktop app should seed the four built-in providers on first run. Renderer-side provider state should come from the main process, not from ad-hoc local state, so that UI state and native runtime state stay aligned.

## Renderer Model

`WorkspacePage` should become the real product surface for phase 1. It should render:

- provider rail with the four built-in providers
- active provider summary
- enable / disable controls
- session list for the active provider
- message list for the selected session of the active provider

`DiagnosticsPage` stays separate and continues to expose capture/runtime details for debugging.

The renderer should not directly know provider-specific capture logic. It only consumes:

- provider list
- active provider id
- sessions for active provider
- messages for selected session
- runtime status

## Verification

Phase 1 should be treated as complete only when both automated and real verification succeed.

Automated verification:

- provider registry tests
- runtime switching tests
- provider settings persistence tests
- renderer workspace interaction tests
- adapter contract tests for `claude`, `deepseek`, and `gemini`
- existing ChatGPT tests remain green

Real verification:

- switch among the four providers in Electron
- confirm each provider keeps its own logged-in session partition
- send a real prompt in each provider
- confirm user and assistant turns persist under the correct `provider`
- restart the desktop app and confirm conversations remain queryable per provider
