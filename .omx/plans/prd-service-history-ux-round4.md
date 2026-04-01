# PRD — AmberKeeper 服务管理 / 历史记录 UX 第四轮收敛

## Requirements Summary
用户基于 anyChat 参考图（Image #1）与当前 AmberKeeper 实拍图（Image #2）给出了更具体的 UI 方向：
1. **左侧 provider rail 与 utility nav 仍不够清晰**。当前实现里 utility nav 只有文字且与内容区有割裂感，宽度偏大，左 rail 图标边距与大小也不够统一（`apps/desktop/src/renderer/src/App.tsx:75-128`, `styles.css:308-377`）。
2. **服务管理行信息仍然过多且风格不统一**。当前仍显示“当前使用 / 已启用 / 已停用”文字徽章、保留打开箭头按钮、页头“服务管理”大标题也仍存在（`SettingsPage.tsx:54-156`）。拖拽把手还有独立背景/边框，不符合“保持一致且不需要背景色”的要求（`styles.css:838-878`）。
3. **历史页信息架构仍偏错位**。当前默认就进入 provider 明细式 split view，没有显式“全部”模式；provider 过滤没有“全部”选项，英文导出格式文案仍是 `JSON bundle / Markdown archive`；错误区会显示“导出已取消”之类反馈（`LibraryPage.tsx:34-53`, `:83-193`）。
4. **历史列表交互感知不足**。当前 provider icon 点击虽有状态切换逻辑，但 active 视觉不够明显；左侧列表宽度偏大、滚动感不明确，术语仍是“会话/档案”，不符合更自然的中文表达（`LibraryPage.tsx:96-127`, `ConversationList.tsx`, `ConversationMessagePane.tsx`, `styles.css:644-725`, `:1733-1909`）。
5. **“全部”视图需要成为默认首页态**。当选择“全部”时，下方不应再展示左右两栏聊天记录，而应展示汇总统计、导出配置、筛选入口等总览操作；只有切到某个 provider 后才显示对应聊天历史列表与详情。

## Acceptance Criteria
1. Utility 区左侧菜单改成 **icon + 中文名称** 的纵向导航，宽度进一步缩小，并与右侧内容区无明显割裂缝隙。
2. 左侧 provider rail 的 logo 大小、留白、边距更统一，视觉接近参考图；左下角设置入口样式也向参考图靠拢。
3. 服务管理页不再显示顶部大标题；每行保留统一 URL 副文本，但移除“当前使用 / 已启用 / 已停用”文字与打开箭头操作，只保留必要的启停 icon，且 icon 统一中性配色。
4. 服务管理拖拽把手区域高度与每行完全一致，宽度统一，不再使用突兀背景色。
5. 历史页顶部不再显示“导出已取消”这类反馈区；导出格式改成中文文案（例如“JSON 格式”“Markdown 格式”）。
6. 历史页提供显式 **全部 / 各 provider** 切换；默认进入“全部”。
7. 处于“全部”时，下方显示总览卡片/导出配置/统计信息，而不是左右两栏聊天明细；切到某个 provider 后，再显示该 provider 的历史列表和详情区。
8. 历史页命名改得更自然，弱化“会话/档案”措辞，优先用“历史记录/聊天记录/记录详情”等中文表达。
9. 左侧历史列表宽度进一步收窄且可明确滚动；provider 顶部切换点击后有清晰生效反馈，active UI 明显。
10. 所有主要交互继续具备 hover 说明、键盘可访问性与现有回归能力。

## Implementation Steps
1. **重构 utility 左侧壳层与 rail 视觉**
   - 更新 `App.tsx:75-128` 与 `styles.css:308-377`，把 utility nav 做成更窄、更贴合内容区的 attached sidebar，并加入每个菜单项的图标。
   - 校正 provider rail 与底部设置入口的 spacing / size / hover / active 风格，使之更接近参考图的节奏。
2. **服务管理列表去文字噪音**
   - 更新 `SettingsPage.tsx:54-156`：移除页头大标题、移除当前使用/启用状态文字徽章、移除打开箭头按钮，仅保留 URL 与中性 icon 操作。
   - 更新 `styles.css:727-878`：拖拽把手改成无背景、统一高度的窄列；菜单列宽进一步缩窄并去除割裂感。
3. **把历史页改成“全部/单 provider”双模式**
   - 更新 `LibraryPage.tsx:34-193`：引入 `all` 过滤项作为默认状态；顶部 provider 切换包含“全部”按钮；点击单个 provider 时才进入记录列表/详情模式。
   - 在“全部”模式下，用总览区替代 `ConversationList + ConversationMessagePane` split view，展示统计、导出配置、筛选/刷新等功能。
4. **收敛历史页命名、反馈和导出语言**
   - 将 UI 文案统一为中文自然表达：例如“历史记录”“记录详情”“JSON 格式”“Markdown 格式”。
   - 去除“导出已取消”之类不必要的持久反馈区，只保留成功或真正异常的必要反馈。
5. **优化 provider 筛选交互与历史列表滚动**
   - 强化 provider filter active 态、hover 态与点击命中区域。
   - 收窄左侧历史列表宽度并确保其容器明确可滚动；必要时调整 `library-grid`、列表卡片、body overflow 边界。
6. **补回测试与验证**
   - 更新 `App.test.tsx`：覆盖 icon+label 左导航、全部/单 provider 模式切换、中文导出文案、错误反馈隐藏、provider active 切换、默认全部模式。
   - 按需更新组件测试，覆盖新的列表/详情命名与行为。

## Risks and Mitigations
- **Risk:** “全部”模式切换会改变现有 history 选择模型。  
  **Mitigation:** 将 `all` 视为 UI filter 状态，不直接改底层 session 数据模型；provider 详情模式才使用现有 selectedSession 逻辑。
- **Risk:** 过度贴近参考图可能破坏 AmberKeeper 现有 provider rail 逻辑。  
  **Mitigation:** 只调整 renderer 布局与样式，不改 provider/IPC 数据结构。
- **Risk:** 去掉错误反馈后会丢失必要错误感知。  
  **Mitigation:** 只移除“导出已取消”等低价值反馈，对真实失败保留更克制的 inline 提示或 toast 入口。
- **Risk:** provider 顶部切换与默认“全部”模式可能让测试大量失效。  
  **Mitigation:** 先改测试夹具与基础状态，再逐步切 UI，确保一次只打通一个分支。

## Verification Steps
- `pnpm --dir apps/desktop test`
- `pnpm --dir apps/desktop exec tsc --noEmit`
- `pnpm --dir apps/desktop build`
- 重点人工/回归点：
  - 左 rail 与 utility 左侧菜单视觉是否更接近参考图；
  - 服务管理行是否只保留必要信息与中性 icon；
  - 默认“全部”模式是否不再直接显示聊天明细；
  - provider 切换是否有明显 active 态且点击生效；
  - 左侧记录列表是否可滚动；
  - DeepSeek 等新增记录在 provider 模式中仍可通过刷新与自动刷新看到。

## Follow-up Staffing Guidance
### Available-Agent-Types Roster
- `executor` — renderer implementation
- `test-engineer` — regression tests / interaction validation
- `verifier` — final completion evidence
- `designer` — UI/IA polish review if needed

### Recommended Team Shape
1. **Lane A — utility shell + settings polish** (`executor`, high)
   - Own: `App.tsx`, `SettingsPage.tsx`, utility/settings/provider-rail CSS/tests.
2. **Lane B — history IA + provider mode switching** (`executor`, high)
   - Own: `LibraryPage.tsx`, `ConversationList.tsx`, `ConversationMessagePane.tsx`, history CSS/tests.
3. **Lane C — verification + state coupling support** (`test-engineer` or `executor`, medium/high)
   - Own: `App.test.tsx`, related component tests, and any minimal state glue needed for all/provider mode.

### Launch Hints
- `omx team 3:executor "Implement .omx/plans/prd-service-history-ux-round4.md with lanes for utility shell/settings polish, history all/provider mode + list/detail redesign, and regression verification."`

### Team Verification Path
- Team should prove: default 全部模式、provider 切换、服务管理精简行、中文导出文案、滚动与 active 态都已覆盖并通过 tests/build/typecheck。
- Leader should verify after handoff: 与用户截图逐条对照，确认不再保留被点名否定的文案/布局。
