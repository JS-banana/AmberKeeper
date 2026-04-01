# AmberKeeper UI 升级实施计划 (V2)

> **注意：** 本计划严格遵循“能力保留”与“真源通信”原则。

**目标：** 实现具有 anyChat 视觉感的双层导航架构，并完成数据管理功能的 Library 化重组。

---

### Task 1: 图标缓存体系移植 (Porting Icon System)
**Files:**
- Create: `apps/desktop/src/renderer/src/lib/icon-cache.ts` (From anyChat)
- Create: `apps/desktop/src/renderer/src/lib/icon-utils.ts` (From anyChat)
- Create: `apps/desktop/src/renderer/src/hooks/useCachedIcon.ts` (From anyChat)

- [ ] **Step 1: 建立 IndexedDB 缓存层**
复刻 anyChat 的 `anychat-icon-cache` 数据库逻辑。
- [ ] **Step 2: 建立图标候选解析器**
实现 `resolveServiceIconCandidates` 逻辑，支持本地与远程解析。
- [ ] **Step 3: 导出 useCachedIcon 钩子**
确保支持 `onResolvedCandidate` 回调以更新本地缓存映射。

### Task 2: UI Foundation 与布局容器 (App Shell Foundation)
**Files:**
- Modify: `apps/desktop/src/renderer/src/styles.css`
- Create: `apps/desktop/src/renderer/src/components/AppLayout.tsx`
- Create: `apps/desktop/src/renderer/src/components/GlobalRail.tsx`

- [ ] **Step 1: 更新 Design Tokens**
定义 --rail-width, --sidebar-width 以及 anyChat 风格的变量。
- [ ] **Step 2: 实现三栏式 Flex 布局**
[Rail] | [Sidebar] | [Main Stage]
- [ ] **Step 3: 实现 GlobalRail 组件**
提供 Chat 和 Library 的顶级 Mode 切换。

### Task 3: 绑定真源 Sidebar (Real-Source Sidebar)
**Files:**
- Create: `apps/desktop/src/renderer/src/components/ProviderSidebar.tsx`
- Create: `apps/desktop/src/renderer/src/components/ProviderIcon.tsx`

- [ ] **Step 1: 封装 ProviderIcon**
集成 `useCachedIcon`，实现四级兜底显示逻辑。
- [ ] **Step 2: 绑定 WorkspaceStore**
Sidebar 循环 `state.providers`，点击调用 `actions.selectProvider(id)`。
- [ ] **Step 3: 实现高亮与状态同步**
监听 `state.activeProviderId` 实现 Sidebar 项的 Active 状态同步。

### Task 4: Library 模式重组 (Library Mode Implementation)
**Files:**
- Create: `apps/desktop/src/renderer/src/pages/LibraryPage.tsx`
- Modify: `apps/desktop/src/renderer/src/pages/WorkspacePage.tsx`

- [ ] **Step 1: 提取 Workspace 核心逻辑**
将 `ConversationList` 和 `ConversationMessagePane` 迁移至 `LibraryPage`。
- [ ] **Step 2: 重塑 WorkspacePage**
将其转变为 `Chat` 模式下的辅助面板或作为 `Library` 的别名引用，不再作为调试入口。

### Task 5: App.tsx 顶层逻辑重写 (Final Integration)
**Files:**
- Modify: `apps/desktop/src/renderer/src/App.tsx`

- [ ] **Step 1: 引入 Mode 状态**
`const [mode, setMode] = useState<'chat' | 'library'>('chat');`
- [ ] **Step 2: 实施环境门控**
通过 `window.api.getShellInfo()` 判断是否显示 Diagnostics 入口。
- [ ] **Step 3: 整合 AppLayout**
将 Rail、Sidebar 和主视图按 Mode 进行组装。

---
### 验证与测试 (Verification)
1. **真源校验**：点击 Sidebar 图标后，主进程的 `WebContentsView` 是否真实切换？
2. **缓存校验**：断开网络后，已加载过的 Provider 图标是否依然能从 IndexedDB 读取？
3. **数据存续**：切换到 Library 模式后，历史会话列表和消息内容是否显示正确？
4. **门控校验**：生产环境构建后，Diagnostics 入口是否已被隐藏？
