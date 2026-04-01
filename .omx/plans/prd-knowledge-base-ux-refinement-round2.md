# PRD — AmberKeeper 知识库 / 设置 UI 第二轮优化

## Requirements Summary
基于用户对第一版知识库 MVP 的实测反馈，需要对信息架构、设置页交互、会话标题策略以及整体视觉层级做第二轮收敛。核心变化有四类：
1. **历史会话入口回撤到设置域内**，不再作为一级 rail 入口。
2. **应用设置页** 需要更接近 anyChat `src/components/SettingsPage.tsx:268-320` 的服务管理交互：更紧凑的单行布局、明确的拖拽排序、hover 提示、图标优先、弱化大块文字按钮。
3. **历史会话页** 需要从“全局档案平铺 + select 导出”进一步提升为更清晰的 provider 切换工作区：顶部固定、provider 切换入口明显可点、左侧 session 列表可滚动、右侧详情可滚动、弱化来源页面/会话 ID 等次要元信息。
4. **session 标题策略** 需要继续修正：不能让 UUID 或 provider 页面固定标题（例如 `DeepSeek - Into the Unknown`）主导列表展示，应优先显示更接近对话语义的标题。

## Brownfield Evidence
- 当前设置页仍是自定义紧凑卡片，但 provider 项高度偏大，且拖拽手柄只在局部，整体行密度仍不如 anyChat 服务管理参考：
  - `apps/desktop/src/renderer/src/pages/SettingsPage.tsx`
  - anyChat 参考：`/Users/sunss/my-code/myAPP/anyChat/src/components/SettingsPage.tsx:268-320`
- 当前知识库已改成 all-provider 档案视图，但用户希望历史会话入口收回设置域，不再作为一级入口：
  - `apps/desktop/src/renderer/src/components/AppSidebar.tsx`
  - `apps/desktop/src/renderer/src/App.tsx`
- 当前知识库列表/详情已支持导出删除，但顶部和详情头部占高偏大、元信息权重偏高：
  - `apps/desktop/src/renderer/src/pages/LibraryPage.tsx`
  - `apps/desktop/src/renderer/src/components/ConversationList.tsx`
  - `apps/desktop/src/renderer/src/components/ConversationMessagePane.tsx`
- 当前标题 fallback 逻辑已屏蔽 UUID，但仍可能被 provider 固定页面标题污染：
  - `apps/desktop/src/renderer/src/lib/session-display.ts`
  - `apps/desktop/src/main/storage/capture-store.ts`

## RALPLAN-DR Summary
### Principles
1. 历史会话是重要能力，但入口层级要服从整体产品导航清晰度。
2. 设置页交互优先学习已验证的 anyChat 服务管理模式，而非继续堆叠文字按钮。
3. 历史会话页要更像“工作台”：顶部固定、左右分区清晰、滚动边界明确。
4. 标题必须尽量贴近真实对话语义，避免机器 ID 或 provider 固定页标题主导。
5. 视觉上压缩高度、统一字号层级、用 icon 优先表达次级操作。

### Decision Drivers
1. 用户已经明确否定一级知识库入口。
2. anyChat 的服务管理布局在同类交互上已有参考价值。
3. 当前问题主要是导航层级、视觉密度、标题质量与滚动结构，而不是底层存储能力不足。

### Viable Options
#### Option A — 历史会话入口收回设置域（Favored）
- Pros: 减少左侧 rail 复杂度；符合用户最新偏好；保持 chat/provider 为主入口。
- Cons: 历史会话入口层级变深一层，需要在设置里做更清晰的二级导航。

#### Option B — 保留一级知识库入口，仅优化视觉
- Pros: 访问更快。
- Cons: 与用户当前明确要求冲突；会让 rail 入口过多。

## ADR
### Decision
采用 Option A：历史会话入口收回设置域；设置页参考 anyChat 服务管理交互做紧凑重排；历史会话页改成顶部固定 + provider tabs + 左侧列表滚动 + 右侧详情滚动；继续优化 session 标题规则，压制 UUID 和 provider 固定页标题。

### Alternatives considered
- 保留一级知识库入口
- 继续用 select 做 provider 切换
- 继续把来源页面 / 会话 ID 作为详情头部主信息

### Why chosen
这些替代方案都直接对应用户明确否定的实测体验问题。

### Consequences
- 需要再次调整 AppSidebar / UtilityWorkbench / SettingsPage / LibraryPage / workspace-store / tests。
- 需要修正标题推断逻辑，必要时引入“忽略 provider 固定页标题”的规则。

## Acceptance Criteria
1. 左侧 rail 不再提供一级“知识库”入口。
2. 设置页提供清晰的二级导航，至少包含“服务管理 / 历史会话 / 关于(如保留)”。
3. 服务管理项改成更紧凑的单行布局，拖拽控制更自然，操作 icon 优先，hover 状态可感知。
4. 历史会话页顶部固定，左侧 session 列表可独立滚动，右侧消息详情可独立滚动。
5. 历史会话页提供明显的 provider 切换入口，不使用隐蔽 select 作为主切换手段。
6. session 标题不再优先显示 UUID，且对明显的 provider 固定页标题做降级处理。
7. 详情页的来源页面 / 会话 ID 弱化展示，不再占据过高视觉高度。
8. 字号与间距层级明显比上一版更协调。

## Implementation Steps
1. 回收知识库一级入口，调整设置内二级导航结构。
2. 参考 anyChat 服务管理，重构 SettingsPage item 布局与拖拽交互。
3. 重构知识库页顶部固定布局，提供 provider tabs/segmented controls。
4. 调整 workspace-store，使历史会话视图与 active chat provider 解耦但仍支持清晰切换。
5. 优化标题策略：忽略 UUID 与 provider 固定页标题，优先语义化 fallback。
6. 弱化详情元信息，压缩顶部高度，明确双滚动区域。
7. 运行 tests / typecheck / build，并做一次 architect verification。

## Verification Steps
- `pnpm --dir apps/desktop exec tsc --noEmit --project tsconfig.json`
- `pnpm --dir apps/desktop test`
- `pnpm --dir apps/desktop build`
- 重点回归：设置页排序/启停、历史会话入口、provider 切换、session 详情导出删除、标题显示
