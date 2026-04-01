# PRD — AmberKeeper 知识库 / 历史缓存管理 MVP

## Requirements Summary
AmberKeeper 现有 utility 区域同时包含 Library 与 Settings，但两者职责不均：Settings 仅处理 provider 开关与排序（`apps/desktop/src/renderer/src/pages/SettingsPage.tsx:3-76`），而 Library 仍停留在基础的两栏浏览器（`apps/desktop/src/renderer/src/pages/LibraryPage.tsx:9-50`）。当前 session 列表只显示 `remoteConversationId ?? id` 与消息数（`apps/desktop/src/renderer/src/components/ConversationList.tsx:21-40`），详情区只展示 URL 与消息气泡（`apps/desktop/src/renderer/src/components/ConversationMessagePane.tsx:15-55`），无法支撑“知识库/档案馆”定位。

本次规划的目标是：把历史缓存提升为一级“知识库”能力，使用户可以基于 provider 浏览历史 session，把 session 当作可管理的产品资产而不是技术记录；同时补齐必要的数据结构与 IPC，支持原生标题持久化、单 session 删除/导出、provider 全量导出。

## Preferred MVP Layout
- **一级入口层**：保持 UtilityWorkbench 的双主域心智——`知识库` 与 `设置`；其中知识库承载历史数据浏览与管理，设置只承载 provider 配置。
- **知识库工作区层**：采用 **顶部工具区 + 左侧 session 档案列表 + 右侧详情阅读区** 的三段式结构，延续当前双栏基础（`apps/desktop/src/renderer/src/pages/LibraryPage.tsx:32-48`），但把顶部升级为 provider 级管理区。
- **顶部工具区**：展示当前 provider、session 数量、provider 级导出入口、导出格式选择；不放破坏性删除。
- **左侧列表区**：只负责浏览与选择，列表项突出标题、消息数、最后更新时间；如保留次级操作，优先导出而非删除。
- **右侧详情区**：展示 session 标题、provider、更新时间、来源信息与完整消息流；单 session 删除/导出放在这里，避免误触。
- **范围约束**：MVP 保持 provider 内浏览，不做跨 provider 聚合时间线。

## Explicit MVP Format Scope
- 单 session 导出：优先支持 `JSON` 与 `Markdown` 两种格式。
- provider 全量导出：优先支持 `JSON bundle`；如 Markdown 批量导出成本过高，可在 MVP 中只对单 session 提供 Markdown。
- 不在 MVP 中引入自定义模板、压缩包结构定制或第三方同步。

## RALPLAN-DR Summary

### Principles
1. **数据优先于配置**：历史缓存是 AmberKeeper 的核心资产，应作为一级工作区，而非设置子项。
2. **先做档案感，再做智能化**：先把标题、消息数、更新时间、详情浏览和导出删除做扎实，再考虑搜索与 AI 能力。
3. **最小必要数据演进**：只为知识库体验新增必要字段与 IPC，避免一次性引入复杂内容管理系统。
4. **旧数据可用性优先**：新增 title 持久化不能让已有记录退化，必须提供稳定 fallback。
5. **操作可理解、可逆预警**：删除、导出等管理动作必须显式、清晰、可确认。

### Decision Drivers
1. 让历史 session 看起来像真正档案，而不是 ID 列表。
2. 在不引入全文搜索/AI 摘要的前提下，显著提升回看与管理体验。
3. 复用现有 Electron renderer/main/preload/storage 架构，控制 MVP 风险。

### Architectural tension
- **Tension:** 用户希望知识库是一级入口，但当前 store/浏览流仍是“activeProvider 决定一切”的 provider-scoped 模式（`apps/desktop/src/renderer/src/stores/workspace-store.ts:48-67,187-201`）。若在 MVP 中直接承诺完整跨 provider 知识库语义，容易让 IA 宣传超前于实际数据浏览能力。
- **Synthesis:** MVP 采用 **provider-first knowledge base**：知识库是一级入口，但首屏仍明确当前 provider 上下文；未来再扩展为跨 provider 聚合视图，而不是本期一次性做全局知识库索引。

### Recommended UX Layout
1. **一级入口层**：知识库与 Settings 并列，Settings 只做配置。
2. **知识库工作区层**：延续 `LibraryPage` 的左右结构，但升级为 **2.5 层布局**：
   - 顶部：知识库标题、当前 provider、provider 级导出、格式控制
   - 左侧：session 档案列表（标题 / 消息数 / 最后更新时间）
   - 右侧：session 详情阅读区（标题、元信息、消息历史、单条导出/删除）
3. **动作分层**：
   - provider 级动作放头部或列表工具区
   - 单 session 动作放详情头部或列表次级操作区
   - 不把会话管理动作回流进 Settings

### Viable Options
#### Option A — 升级现有 Library 为知识库主工作区（Favored）
- **Pros**
  - 直接复用现有 `library` surface 与 state 流程（`apps/desktop/src/renderer/src/App.tsx:64-143`, `apps/desktop/src/renderer/src/stores/workspace-store.ts:36-203`）
  - 与用户明确偏好一致
  - 改动边界清晰：IA、列表、详情、IPC、schema
- **Cons**
  - 需要把当前以“当前 activeProvider 过滤”为中心的 store 升级为更面向知识库的浏览模型
  - 需要重新设计 utility 导航文案与层次

#### Option B — 在 Settings 下新增“数据管理”子页
- **Pros**
  - 入口少，短期操作简单
  - 对现有 library surface 改动更少
- **Cons**
  - 与“数据是核心资产”的产品定位冲突
  - 会让 Settings 混入大量浏览/管理职责
  - 随后扩展会持续挤压配置页清晰度

**Why Option B is rejected:** 用户已明确希望知识库成为一级入口；同时当前 Settings 页面在代码中是纯 provider 配置页，继续塞入数据工作流会破坏职责边界（`apps/desktop/src/renderer/src/pages/SettingsPage.tsx:11-73`）。

## ADR
### Decision
将现有 Library 升级为一级“知识库”入口，并在 MVP 内补齐原生 session 标题持久化、session 详情优化、单条删除/导出、provider 全量导出。

### Drivers
- 用户优先目标是多历史缓存管理 + 知识库体验
- 用户明确选择知识库作为一级入口
- MVP 成功标准偏向“数据像真正产品资产”

### Alternatives considered
- Settings 统一入口 + 数据管理子页
- 仅做 UI 重绘，不动数据结构
- 直接做搜索/AI 摘要以强化“知识库感”

### Why chosen
升级现有 Library 能最小化结构重建成本，同时与用户认知一致；而“只做 UI 不动数据结构”无法解决标题缺失这一核心感知问题。

### Consequences
- 需要 renderer/main/preload/storage/shared-types 跨层联动
- 需要数据库 schema 迁移与旧数据 fallback
- MVP 不含复杂搜索与智能整理，后续可作为 Phase 2 扩展

### Follow-ups
- Phase 2 评估全文搜索、批量操作、标签/收藏、跳回原站点
- 评估是否需要跨 provider 聚合视图与时间线视图
- 评估 provider 原生标题质量不稳定时，是否需要 `displayTitle` / `titleSource` 机制

## Acceptance Criteria
1. Utility 区域中，`library` 被明确表达为一级“知识库/会话库”入口，而 Settings 保持配置职责（基于 `apps/desktop/src/renderer/src/App.tsx:70-72,115-137`）。
1a. MVP 的知识库浏览模型明确为 **provider-first**：进入知识库后，用户始终能识别当前 provider 上下文，而不误解为已经支持完整跨 provider 聚合。
2. session 列表项展示至少 3 个核心档案字段：标题、消息数、最后更新时间，替代当前仅 `remoteConversationId/id + messageCount` 的显示（`apps/desktop/src/renderer/src/components/ConversationList.tsx:21-40`）。
3. 新捕获的数据能保存 provider 原生标题；旧数据在无 title 时能回退到稳定占位策略，而非出现空白标题（当前 schema 缺 title：`packages/capture-core/src/persistence/schema.ts:4-13`; 当前 repo resolve 无 title：`packages/capture-core/src/persistence/conversation-repository.ts:8-151`）。
4. session 详情页可清晰浏览完整消息历史，并比当前只显示 URL + 气泡的状态有更明确的档案元信息与操作区（`apps/desktop/src/renderer/src/components/ConversationMessagePane.tsx:15-55`）。
5. UI 提供单 session 导出、单 session 删除、provider 全量导出，且每个动作都有清晰入口和反馈。
6. 删除为显式确认型交互，不实现回收站/复杂恢复。
7. 导出流程存在明确的格式控制。
8. 现有 provider 配置（启停/排序/激活）行为保持可用，不被知识库改造破坏（`apps/desktop/src/renderer/src/pages/SettingsPage.tsx:23-73`, `apps/desktop/src/renderer/src/stores/workspace-store.ts:93-133`）。

## Non-goals
- 自动跳转并打开 provider 原站的对应历史对话
- 全文搜索
- AI 自动摘要 / 自动命名
- 复杂权限体系
- 回收站 / 软删除恢复
- 默认批量删除

## Implementation Steps

### Step 1 — 定义知识库数据契约与持久化扩展
**Why first:** 当前 `CaptureSessionRecord` 没有 title，也没有导出/删除管理所需契约（`packages/shared-types/src/capture-types.ts:26-35`; `apps/desktop/src/preload/renderer.ts:14-40`）。

**Touchpoints**
- `packages/shared-types/src/capture-types.ts`
- `packages/capture-core/src/persistence/schema.ts`
- `packages/capture-core/src/persistence/conversation-repository.ts`
- `apps/desktop/src/main/storage/capture-store.ts`

**Plan**
- 为 `CaptureSessionRecord` 增加 `title`；若实现成本可控，同时预留 `titleSource` 以区分 `provider` 与 `fallback`。
- 为 `conversations` 表增加 `title` 列与迁移逻辑。
- 扩展 `conversationRepository.resolve(...)` 接收并 upsert title。
- 扩展 `CaptureStore.listSessions()` 返回 title。
- 设计 legacy fallback：若 title 为空，则 renderer 侧回退到 `remoteConversationId ?? id`。

### Step 2 — 把 capture 链路中的标题落到 session persistence
**Why:** 代码已能观察到标题信号，但尚未入库（`apps/desktop/src/preload/provider-chat-capture.ts:77-145`；`apps/desktop/src/main/storage/capture-store.ts:40-105`）。

**Touchpoints**
- `packages/shared-types/src/capture-types.ts`
- 相关 envelope / persistence 传递路径
- `apps/desktop/src/main/storage/capture-store.ts`
- 可能涉及 `packages/capture-core/src/turn-persistence-service.ts`（若 turn 路径也需统一）

**Plan**
- 在 capture envelope 或相邻 session persistence 输入中加入 title。
- 确保 network/dom/hydration 路径都不会丢 title。
- 对 provider 标题不可靠的情况保留 provenance，避免未来把 fallback 误当成原生标题。
- 为旧数据保持兼容，不强制回填历史 title。

### Step 3 — 扩展 IPC 与 store，支持删除/导出/知识库浏览态
**Why:** 当前 preload / IPC 仅暴露 list/open 能力（`apps/desktop/src/preload/renderer.ts:14-40`; `apps/desktop/src/main/ipc/capture-ipc.ts:3-63`）。

**Touchpoints**
- `apps/desktop/src/main/ipc/capture-ipc.ts`
- `apps/desktop/src/preload/renderer.ts`
- `apps/desktop/src/main/storage/capture-store.ts`
- `apps/desktop/src/renderer/src/stores/workspace-store.ts`

**Plan**
- 新增 IPC：`capture:deleteSession`、`capture:exportSession`、`capture:exportProviderSessions`。
- renderer store 新增对应 actions，并在成功后刷新 session/message 状态。
- 明确导出格式参数传递方式；MVP 先支持最小集合：`json` + `markdown`。
- 删除当前选中 session 后，重新计算 `selectedSessionId`，优先落到同 provider 的下一条可用 session，否则进入空态。

### Step 4 — 重构知识库 IA 与导航
**Why:** 当前 UtilityWorkbench 文案与导航仍是“会话库/应用设置”基础形态（`apps/desktop/src/renderer/src/App.tsx:64-103`）。

**Touchpoints**
- `apps/desktop/src/renderer/src/App.tsx`
- `apps/desktop/src/renderer/src/components/AppSidebar.tsx`
- `apps/desktop/src/renderer/src/pages/LibraryPage.tsx`
- `apps/desktop/src/renderer/src/styles.css`

**Plan**
- 将 `library` surface 在 UI 文案上升级为“知识库”或同等强定位名称。
- 在页面结构上明确“当前 provider”上下文，避免一级知识库入口与 provider-first 数据模型产生认知冲突。
- 保持 Settings 为 provider 配置页，不把数据管理动作回流进设置。
- 重新梳理 utility 页面头部文案与导航层级，让“数据资产”定位明显。
- 保持 provider-first 浏览模型，不在 MVP 混入跨 provider 聚合视图。

### Step 5 — 升级 session 列表为档案式列表
**Why:** 这是用户第一验收重点；当前列表信息不足（`apps/desktop/src/renderer/src/components/ConversationList.tsx:20-41`）。

**Touchpoints**
- `apps/desktop/src/renderer/src/components/ConversationList.tsx`
- `apps/desktop/src/renderer/src/pages/LibraryPage.tsx`
- `apps/desktop/src/renderer/src/styles.css`

**Plan**
- 列表项整行可点，主标题使用 `session.title` fallback。
- 列表保持 `updatedAt DESC` 排序，与当前存储顺序保持一致（`apps/desktop/src/main/storage/capture-store.ts:111-128`）。
- 元信息优先展示：消息数、最后更新时间。
- 预留右侧操作区或 hover/inline 操作入口，挂单条导出/删除，但默认视觉重点仍是标题与档案元信息。
- 空态文案从“当前应用还没有可查看的会话”升级为更面向知识库的说明。

### Step 6 — 升级 session 详情页为档案阅读视图
**Why:** 当前详情页更像裸消息面板（`apps/desktop/src/renderer/src/components/ConversationMessagePane.tsx:9-55`）。

**Touchpoints**
- `apps/desktop/src/renderer/src/components/ConversationMessagePane.tsx`
- `apps/desktop/src/renderer/src/pages/LibraryPage.tsx`
- `apps/desktop/src/renderer/src/styles.css`

**Plan**
- 详情头部展示标题、provider、更新时间、来源 URL（必要时弱化 URL 权重）。
- 将操作区（导出/删除）放在详情页头部或侧边，避免和消息正文混淆。
- 优化消息展示层级，使其更适合“回看历史档案”而非“实时聊天”。

### Step 7 — 补齐测试与验证
**Why:** 本任务横跨 schema、IPC、store、UI，回归风险较大。

**Touchpoints**
- `apps/desktop/src/renderer/src/App.test.tsx`
- renderer component tests（若已有）
- storage / schema tests
- IPC / integration tests

**Plan**
- 增加 title 持久化与旧数据 fallback 测试。
- 增加知识库列表展示测试（标题、消息数、更新时间）。
- 增加删除/导出 action 的行为测试。
- 增加 Settings/provider 配置未回归的回归测试。

## Risks and Mitigations
- **Risk:** title 来源不一致，某些 provider 页面标题不稳定。
  - **Mitigation:** title 持久化为 best-effort；UI fallback 始终可用；provider 侧标题质量问题作为后续增强。
- **Risk:** schema 迁移影响已有用户数据。
  - **Mitigation:** 采用向后兼容列新增；不重写旧记录；用 migration test 验证。
- **Risk:** 删除操作破坏当前选中态或 provider 过滤态。
  - **Mitigation:** store 在删除成功后调用统一 refresh，并重新计算 selectedSessionId（现有逻辑位于 `apps/desktop/src/renderer/src/stores/workspace-store.ts:39-67,206-214`）。
- **Risk:** 导出格式范围失控。
  - **Mitigation:** MVP 先限制 1~2 种格式，明确后续扩展点，不引入通用模板系统。
- **Risk:** 把过多管理功能塞回 Settings。
  - **Mitigation:** 所有会话数据管理动作只放知识库 surface；Settings 仅保留 provider 配置。

## Verification Steps
1. 数据库迁移验证：新库和旧库均能读取 session 列表，且旧库 title 缺失时界面不空白。
2. capture 持久化验证：新捕获 session 能显示 provider 原生标题。
3. UI 验证：知识库列表项显示标题、消息数、最后更新时间。
4. 交互验证：session 详情页能触发单条导出/删除；provider 级导出入口可见，且 `json` / `markdown` 两种格式都可走通。
5. 回归验证：Settings 中 provider 启停/排序/激活行为仍正常。
6. 删除当前选中 session 后，选中态与空态切换符合预期。
7. UX 验证：provider-first 提示、删除确认、导出格式选择不会造成知识库范围误解。
8. 运行 lint、typecheck、相关测试套件。

## Available-Agent-Types Roster
- `architect` — IA、跨层边界、演进策略
- `executor` — renderer/main/preload/storage 实作
- `test-engineer` — 回归与测试覆盖
- `verifier` — 完成证据与验收
- `designer` — 交互层次、信息密度、可读性细化
- `critic` — 计划与验收口径挑战

## Follow-up Staffing Guidance
### For `$ralph`
- **Lane 1 / Schema + IPC**: `executor` high
- **Lane 2 / Knowledge-base UI**: `executor` high + `designer` high advisory
- **Lane 3 / Tests + verification**: `test-engineer` medium, then `verifier` high
- **Why**: 数据契约和 UI 浏览体验可并行，但删除/导出验证需在接口稳定后收口。

### For `$team`
- **2-3 lanes recommended**
  1. Storage/IPC lane — schema, repo, capture-store, preload/ipc
  2. Renderer lane — App, LibraryPage, ConversationList, MessagePane, styles
  3. QA lane — tests, migration coverage, UX verification
- **Suggested reasoning**
  - Storage lane: high
  - Renderer lane: high
  - QA lane: medium/high

## Launch Hints
- Ralph path:
  - `$ralph .omx/plans/prd-knowledge-base-data-management-ui.md`
- Team path:
  - `$team .omx/plans/prd-knowledge-base-data-management-ui.md`
  - `omx team start .omx/plans/prd-knowledge-base-data-management-ui.md` (if using CLI surface)

## Team Verification Path
- Team proves before shutdown:
  - title persistence end-to-end works
  - knowledge-base list shows title/messageCount/updatedAt
  - single delete/export and provider export are wired and test-covered
  - `json` / `markdown` 导出路径都被验证
  - settings/provider management regression checks pass
- Ralph/verifier follow-up should confirm:
  - acceptance criteria are met on real flows
  - no known regressions remain
  - verification evidence is recorded in final report

## Improvement Changelog
- Added explicit provider-first knowledge-base synthesis to resolve IA vs current store-model tension.
- Strengthened title-persistence plan with title provenance consideration (`titleSource` optional).
- Tightened acceptance and verification language around provider context, list ordering, and export/delete UX clarity.


## Applied Improvements After Review
- 明确了 MVP 首选布局：顶部工具区 + 左侧档案列表 + 右侧详情阅读区。
- 明确了导出格式边界：单 session `JSON/Markdown`，provider 全量导出优先 `JSON bundle`。
- 明确了 provider-first 浏览模型，MVP 不做跨 provider 聚合。
- 明确了删除动作更适合放在详情区而非列表主操作位，以降低误删风险。
