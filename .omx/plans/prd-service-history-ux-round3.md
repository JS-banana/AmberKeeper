# PRD — AmberKeeper 服务管理 / 历史会话 UX 第三轮收敛

## Requirements Summary
用户最新反馈集中在两类问题：
1. **服务管理页信息噪音过多**：URL、拖拽提示、解释性段落都在挤占注意力；拖拽手柄区域太小且高度不贴合整行；右侧 icon hover 缺少功能提示。现状集中在 `apps/desktop/src/renderer/src/pages/SettingsPage.tsx:54-169` 与 `apps/desktop/src/renderer/src/styles.css:721-867`。
2. **历史会话档案页空间效率不足**：顶部“全部历史会话”卡片和说明文案占高过多，provider 切换仍是纯文本标签，导出动作是大文字按钮，列表/详情都包含过多次要信息。现状集中在 `apps/desktop/src/renderer/src/pages/LibraryPage.tsx:68-167`、`apps/desktop/src/renderer/src/components/ConversationList.tsx:12-49`、`apps/desktop/src/renderer/src/components/ConversationMessagePane.tsx:69-180`、`apps/desktop/src/renderer/src/styles.css:607-706` 与 `:1681-1795`。
3. **utility 二级导航布局不对**：服务管理/历史会话/诊断目前是顶部胶囊切换，而不是用户要求的左侧导航栏。现状在 `apps/desktop/src/renderer/src/App.tsx:70-125` 与 `apps/desktop/src/renderer/src/styles.css:308-366`。
4. **历史会话新 session 可见性不足**：用户刚在 DeepSeek 发送消息，但 session 列表没有出现；现有 store 只在首次挂载或显式操作后调用 `refresh()`，runtime-status 回调并不会重拉 sessions/messages（`apps/desktop/src/renderer/src/stores/workspace-store.ts:42-91` 与 `:235-246`）。主进程 capture 持久化后会触发 runtime-status 广播（`apps/desktop/src/main/index.ts:541-557`、`:993-999`），因此问题更像 renderer 没有用这类事件刷新列表，而不是单纯缓存不可写。

## Acceptance Criteria
1. 设置/历史/诊断切换改成 **utility 区左侧导航栏**，而不是顶部 pills；诊断入口在可用时仍出现。
2. 服务管理列表不再展示 `provider.homeUrl`，不再显示“拖动整行即可调整服务顺序”等说明文案，也去掉页头参考 anyChat 的解释段落。
3. 服务管理拖拽手柄区域与整行高度契合，视觉更窄，但仍可清楚表示可拖拽；整行拖拽排序行为保持可用。
4. 服务管理右侧所有 icon 操作至少具备 `aria-label` + hover 描述（`title` 或统一 tooltip 语义）。
5. 历史会话顶部信息压缩为单行/紧凑工具条，不再让“全部历史会话”块占据明显垂直空间；非必要说明文字移除。
6. provider 切换改成 logo/icon 优先的选择器，hover 可说明 provider 名称；导出等操作优先使用 icon 按钮表达。
7. 会话列表单项尽量一行承载核心信息（标题 + provider/logo + 更新时间/计数中保留必要字段），移除或弱化多余元信息。
8. 详情区导出操作使用 icon 按钮，并为所有 icon-only 操作提供 hover 描述；来源页面/会话 ID 等次要信息压缩或折叠，不再挤占顶部主要空间。
9. 历史会话页提供 **刷新按钮**；点击后重新拉取 sessions/messages。若实现成本合适，同步在 runtime-status/capture 更新后触发轻量 refresh，以减少用户在 DeepSeek 等 provider 里发新消息后列表不更新的问题。
10. 现有回归能力保持：provider 启停、拖拽排序、历史会话导出/删除、会话打开、诊断入口显示逻辑全部仍有测试覆盖。

## Implementation Steps
1. **重做 utility workbench 布局**
   - 将 `App.tsx:70-125` 的 `UtilityWorkbench` 从顶部 pills 改为左右两栏结构：左侧竖向 nav，右侧内容区。
   - 在 `styles.css:308-366` 重写 `.utility-workbench*` 结构，保证 library 页面和其他 utility 页面都能在左侧导航存在时保持 `min-height: 0` 与内部滚动边界清晰。
2. **收敛服务管理噪音并压缩交互**
   - 更新 `SettingsPage.tsx:54-169`：删掉页头说明段、删掉 URL 文本、删掉底部 drag hint 文案；将 drag handle 设计成贯穿整行高度的窄列；给打开/启停 icon 加 hover 描述。
   - 在 `styles.css:721-867` 调整 item 高度、drag handle 宽度/高度、actions 尺寸与 hover/active 态。
3. **压缩历史会话页头并改成 icon-first 工具条**
   - 更新 `LibraryPage.tsx:68-167`：移除解释性 copy 和“全部历史会话”大块 header，改成更紧凑的统计 + provider icon strip + export/refresh icon actions。
   - 复用 `ProviderIcon`（`components/ProviderIcon.tsx:1-111`）给 provider 选择器展示 logo，必要时增加适合 toolbar/tab 的样式变体。
4. **压缩 session 列表与详情头**
   - 更新 `ConversationList.tsx:12-49`：单行展示为主，只保留标题和必要 meta；引入 provider logo 或 provider tag；减少说明文字。
   - 更新 `ConversationMessagePane.tsx:69-180`：导出/删除改为 icon-first actions，弱化来源页面/会话 ID，可折叠或缩成单行 meta；减少标题区垂直空间。
   - 在 `styles.css:1681-1795` 同步调整列表密度、头部 chips、action 样式和信息层级。
5. **补上 refresh 能力并改善 session 新鲜度**
   - 在 `workspace-store.ts:42-91` 与 `:235-246` 暴露可复用的 `refresh` 入口给 LibraryPage；新增 UI refresh action。
   - 评估并实现 runtime-status 驱动的轻量 session refresh（例如在 capture 相关状态变化时节流刷新一次），以解决用户在 DeepSeek 发新消息后列表不更新的问题；必要时只先做手动 refresh，但需保留实现点。
   - 如需更稳妥的触发依据，再补 main/preload 层的轻量刷新信号，但优先避免扩大 IPC 面。
6. **补充/更新测试与验证**
   - 更新 `apps/desktop/src/renderer/src/App.test.tsx`：覆盖左侧 utility nav、服务管理文案移除、icon hover/title、provider icon 切换、refresh 按钮、历史会话紧凑布局相关行为。
   - 必要时为独立组件新增测试，避免 App.test 过度膨胀。

## Risks and Mitigations
- **Risk:** 样式改动集中在单个 `styles.css`，容易互相影响。  
  **Mitigation:** 按 workbench / settings / library / conversation 四个区块顺序修改，并靠现有 App test 回归关键流程。
- **Risk:** runtime-status 自动 refresh 如果过于频繁，可能带来 renderer 抖动或重复 IPC。  
  **Mitigation:** 先实现手动 refresh；若增加自动 refresh，则加节流/条件判断，只在 utility surface 或 capture-related 状态变化时执行。
- **Risk:** icon-only 交互可能损失可发现性。  
  **Mitigation:** 所有 icon-only 按钮保留 `aria-label`，并补 `title`/tooltip 文案。
- **Risk:** provider icon strip 若资源加载失败会影响视觉一致性。  
  **Mitigation:** 继续复用 `ProviderIcon` 的 bundled/local fallback 机制，不新增远端依赖。

## Verification Steps
- `pnpm --dir apps/desktop test`
- `pnpm --dir apps/desktop build`
- 手工/测试关注点：
  - 设置页 provider 启停、拖拽排序仍可用。
  - utility 左侧导航能切到服务管理 / 历史会话 / 诊断。
  - 历史会话 provider icon 选择、刷新、导出、删除仍可操作。
  - DeepSeek 新会话至少可通过 refresh 按钮重新出现在列表中。

## Follow-up Staffing Guidance
### Available-Agent-Types Roster
- `executor` — renderer/main implementation
- `verifier` — completion validation
- `test-engineer` — targeted regression tests
- `architect` — read-only tradeoff review if layout/data-refresh coupling gets messy

### Recommended Team Shape
1. **Lane A — Utility/settings renderer** (`executor`, high)
   - Own: `App.tsx`, `SettingsPage.tsx`, utility/settings CSS, related App tests.
   - Goal: left nav + compact service-management row and hover affordances.
2. **Lane B — History archive renderer** (`executor`, high)
   - Own: `LibraryPage.tsx`, `ConversationList.tsx`, `ConversationMessagePane.tsx`, provider-icon usage, related CSS/tests.
   - Goal: compact header/list/detail layout with icon-first controls.
3. **Lane C — Refresh/data freshness** (`test-engineer` or `executor`, medium/high)
   - Own: `workspace-store.ts` and any minimal preload/main touchpoints plus focused tests.
   - Goal: manual refresh path and optional auto-refresh hook for new captures.

### Launch Hints
- `omx team 3:executor "Implement PRD .omx/plans/prd-service-history-ux-round3.md with dedicated lanes for utility nav/settings UI, history archive compaction, and session refresh/data freshness."`
- If roles must stay narrower, run a 2-lane team and keep verification in the leader after integration.

### Team Verification Path
- Team should prove: renderer tests updated/passing for nav/settings/history flows, build passes, and refresh path is wired.
- Leader should verify after handoff: final `pnpm --dir apps/desktop test` and `pnpm --dir apps/desktop build`, plus a quick audit of changed copy/icons against user feedback.
