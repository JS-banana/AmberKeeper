# Deep Interview Transcript Summary — data-management-ui

- Profile: standard
- Context type: brownfield
- Final ambiguity: 0.099
- Threshold: 0.20
- Context snapshot: `.omx/context/data-management-ui-20260401T033520Z.md`

## Condensed transcript

1. **Intent**
   - User wants AmberKeeper to better manage multiple historical cached chat datasets and feel more like a knowledge base, improving overall UX.

2. **Desired outcome**
   - Users should browse provider-scoped session lists, open a session into a readable historical conversation view, and have clear actions such as export/delete.
   - Reopening the original remote conversation may be useful later, but is not core for MVP.

3. **Information architecture**
   - User prefers **B**: elevate Library into a first-class **知识库** / archive entry, instead of embedding data management under Settings.
   - Rationale: data management is central to AmberKeeper’s value, so it should not be buried under configuration.

4. **Non-goals / out of scope for MVP**
   - Do not implement auto-jump back into the original provider history page.
   - Do not implement full-text search.
   - Do not implement AI auto-summary / auto-naming.
   - Do not implement complex permissions / recycle-bin systems.

5. **Decision boundaries**
   - AmberKeeper may autonomously:
     - Keep Settings focused on app/provider configuration.
     - Promote Library to a first-class knowledge-base surface.
     - Limit deletion to single-session deletion for MVP.
     - Support export at two scopes for MVP: single session + provider-wide export.
   - Session title handling is important and should prefer provider-native titles, not purely UI-generated labels.

6. **Technical clarification discovered from repo**
   - Current capture paths already observe title/document title signals in several places.
   - But current `conversations` persistence schema does **not** store a title field.
   - User approved adding persistence for provider-native session titles in MVP, with fallback rendering for legacy records.

7. **Primary success theme**
   - The first release should make cached conversations feel like **real product assets**, not raw technical records.
   - The three most important visible fields in a session list item are:
     1. 标题
     2. 消息数
     3. 最后更新时间

## Pressure-pass findings

- Earlier assumption: session titles could be UI-derived from message content.
- Revisited with evidence from codebase: title signals exist in capture pipeline but are not persisted in storage.
- Resolution: MVP should include **provider-native title persistence** rather than relying on generated fallback as the primary path.

## Brownfield evidence notes

- Utility surfaces currently live in `apps/desktop/src/renderer/src/App.tsx`.
- Settings is provider enable/disable/reorder only in `apps/desktop/src/renderer/src/pages/SettingsPage.tsx`.
- Library is a basic 2-pane session/message viewer in `apps/desktop/src/renderer/src/pages/LibraryPage.tsx`.
- Session list is currently weak (`remoteConversationId/id + message count`) in `apps/desktop/src/renderer/src/components/ConversationList.tsx`.
- Message pane lacks archive-management affordances in `apps/desktop/src/renderer/src/components/ConversationMessagePane.tsx`.
- Title persistence is absent from `packages/capture-core/src/persistence/schema.ts` and `packages/capture-core/src/persistence/conversation-repository.ts`.
