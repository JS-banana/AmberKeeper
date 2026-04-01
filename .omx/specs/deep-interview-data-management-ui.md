# Deep Interview Spec — AmberKeeper 知识库 / 历史缓存管理 UX

## Metadata
- Profile: standard
- Rounds: 9
- Final ambiguity: 0.099
- Threshold: 0.20
- Context type: brownfield
- Context snapshot: `.omx/context/data-management-ui-20260401T033520Z.md`
- Transcript: `.omx/interviews/data-management-ui-20260401T033520Z.md`

## Clarity breakdown
| Dimension | Score |
|---|---:|
| Intent | 0.90 |
| Outcome | 0.88 |
| Scope | 0.92 |
| Constraints | 0.80 |
| Success | 0.82 |
| Context | 0.92 |

## Intent
AmberKeeper 需要把多 provider / 多 session 的历史缓存从“基础记录查看器”升级为更像“知识库 / 档案馆”的产品能力，让用户更容易管理、理解、回看和使用旧对话数据。

## Desired Outcome
- 历史缓存成为一级知识库入口，而不是埋在设置中。
- 用户可以按 provider 进入历史 session 列表。
- session 列表像档案条目，而不是技术 ID 列表。
- 用户可以打开单个 session 查看完整对话历史。
- 用户可以对单个 session 执行导出 / 删除。
- 用户可以对某个 provider 执行全量导出。
- 界面应提供导出格式控制。

## In Scope (MVP)
1. **IA 调整**
   - 将现有 Library 升级为一级“知识库/历史档案”入口。
   - Settings 保持应用/Provider 配置职责。
2. **Session 列表升级**
   - 核心字段优先展示：标题、消息数、最后更新时间。
   - provider 维度浏览清晰。
   - 列表项整行可点击进入详情。
3. **Session 详情升级**
   - 打开后提供更适合回看历史的浏览体验。
   - 展示基础元信息与清晰的对话内容预览。
4. **基础数据管理能力**
   - 单个 session：删除、导出。
   - 单个 provider：导出全部 session。
   - 提供导出格式控制。
5. **数据模型演进**
   - 持久化 provider 原生 session 标题。
   - 旧数据没有 title 时提供降级显示策略。

## Out of Scope / Non-goals (MVP)
- 自动跳转并打开 provider 原站的对应历史对话
- 全文搜索
- AI 自动摘要 / 自动命名
- 复杂权限体系
- 回收站 / 软删除恢复系统
- 默认批量删除能力（如无额外需求）

## Decision Boundaries
以下内容 OMX 可在规划/实现中默认决定，无需再次确认：
- Library 升级为一级知识库入口，Settings 保持配置职责
- 删除能力 MVP 先做单条 session 删除
- 导出能力 MVP 先做单条 session 导出 + provider 全量导出
- 旧数据标题缺失时使用降级展示策略

以下内容已经被用户明确约束：
- session 标题不应以 UI 伪造为主路径，应优先使用 provider 原生标题
- provider 原生标题持久化属于 MVP 范围

## Constraints
- 项目为现有 Electron brownfield 应用，需尽量复用当前 renderer/main/preload 架构。
- 当前数据桥接主要暴露 list/open 能力，删除/导出需新增存储与 IPC 通道。
- 现有 `conversations` 表无 title 字段，需要 schema / repository 演进。
- MVP 应优先做“产品资产感”和浏览管理体验，不做复杂智能化与检索系统。

## Testable Acceptance Criteria
1. 应用存在独立且明确的一级“知识库/会话库”入口，Settings 不再承担历史数据管理主职责。
2. 某 provider 下的 session 列表项至少展示：标题、消息数、最后更新时间。
3. 新捕获的 session 若 provider 可提供标题，应在列表中展示该原生标题。
4. 历史旧数据在无 title 时，列表仍可稳定显示降级标题，不出现空白主标题。
5. 点击任一 session 列表项，可进入对应 session 详情浏览界面。
6. session 详情界面可清晰浏览完整消息历史，并展示必要基础元信息。
7. 单个 session 可执行导出操作。
8. 单个 session 可执行删除操作，且删除交互具备明确确认与结果反馈。
9. 某 provider 可执行“导出全部 session”操作。
10. 导出界面或导出触发流程中存在可见的导出格式控制。

## Assumptions Exposed + Resolutions
- **Assumption:** 数据管理应继续从设置进入。
  - **Resolution:** 否。知识库应成为一级入口，设置仅保留配置职责。
- **Assumption:** session 标题可暂时用 UI 规则生成。
  - **Resolution:** 否。优先持久化 provider 原生标题；UI 生成仅作旧数据 fallback。
- **Assumption:** MVP 需要复杂搜索/智能整理才算知识库。
  - **Resolution:** 否。MVP 先做高质量档案呈现与基础管理即可。

## Pressure-pass findings
- 通过对代码现状的证据回查，确认“capture 已拿到 title，但 persistence 未存 title”。
- 该发现改变了方案重点：MVP 必须包含最小必要的数据层演进，而不只是 UI 重绘。

## Brownfield evidence vs inference
### Evidence
- 当前 utility surface：`apps/desktop/src/renderer/src/App.tsx`
- 当前 Settings 仅 provider 配置：`apps/desktop/src/renderer/src/pages/SettingsPage.tsx`
- 当前 Library 基础两栏布局：`apps/desktop/src/renderer/src/pages/LibraryPage.tsx`
- 当前 session 列表字段不足：`apps/desktop/src/renderer/src/components/ConversationList.tsx`
- 当前详情 pane 缺少管理动作：`apps/desktop/src/renderer/src/components/ConversationMessagePane.tsx`
- 当前 conversations schema 无 title：`packages/capture-core/src/persistence/schema.ts`
- 当前 conversation repository 未处理 title：`packages/capture-core/src/persistence/conversation-repository.ts`

### Inference
- 知识库入口应优先沿用并升级现有 Library surface，而不是新增全新第三套 utility shell。
- 导出格式控制更适合放在知识库视图的显式操作区域，而不是埋进设置。

## Technical context findings
- 需要 touch 的高概率区域：
  - `apps/desktop/src/renderer/src/App.tsx`
  - `apps/desktop/src/renderer/src/pages/LibraryPage.tsx`
  - `apps/desktop/src/renderer/src/components/ConversationList.tsx`
  - `apps/desktop/src/renderer/src/components/ConversationMessagePane.tsx`
  - `apps/desktop/src/renderer/src/stores/workspace-store.ts`
  - `apps/desktop/src/preload/renderer.ts`
  - `apps/desktop/src/main/ipc/capture-ipc.ts`
  - `apps/desktop/src/main/storage/capture-store.ts`
  - `packages/capture-core/src/persistence/schema.ts`
  - `packages/capture-core/src/persistence/conversation-repository.ts`

## Execution Bridge Recommendation
**Recommended next step:** `$plan --consensus --direct .omx/specs/deep-interview-data-management-ui.md`

Reason:
- 需求、非目标、边界已经足够清楚
- 仍需要对 IA、数据模型演进、导出/删除交互、分阶段执行做结构化方案收敛
- 该任务跨 renderer/main/preload/storage，适合先产出高质量执行计划，再进入实现
