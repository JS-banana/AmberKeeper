# AmberKeeper UI 架构升级方案 (V2)

## 1. 背景与目标 (Background & Motivation)
AmberKeeper 正在从开发调试阶段转向用户可用阶段。我们的目标是：
- **视觉风格**：复刻 `anyChat` 的轻量化、呼吸感 UI。
- **核心能力**：保留并强化 AmberKeeper 特有的“聊天数据管理”能力（即原本 Workspace 的功能）。
- **技术严谨**：彻底消费现有的主进程 IPC 状态真源，移植 anyChat 成熟的图标缓存体系。

## 2. 核心架构设计 (Architecture & Design)

### 2.1 模式化 UI 布局 (Modal Layout)
引入三层物理结构：
1. **Global Rail (64px)**：最左侧窄栏，用于顶层功能切换。
   - `Chat`: 进入实时模型会话。
   - `Library`: 进入数据管理模式（原 Workspace 能力）。
   - `Settings/Diagnostics`: 底部常驻，Diagnostics 仅在 `isDev` 模式下通过 `getShellInfo()` 唤出。
2. **Context Sidebar (240px)**：根据模式变化内容。
   - `Chat 模式`: 显示预置 Provider 图标列表（ChatGPT, Claude, Gemini, DeepSeek）。
   - `Library 模式`: 显示历史会话列表（ConversationList）。
3. **Main Stage (Flex: 1)**：
   - `Chat 模式`: 承载 Electron 原生 `WebContentsView` 视图。
   - `Library 模式`: 承载消息详情查看器（ConversationMessagePane）。

### 2.2 图标工程化策略 (Icon Engineering)
从 anyChat 完整移植以下逻辑：
- **四级解析**：本地 `/assets/` -> IndexedDB 缓存 -> 远程官网图标爬取 -> 首字母文本头像兜底。
- **本地持久化**：使用 IndexedDB 存储 Base64 后的图标数据，减少网络请求。

### 2.3 状态管理原则 (State Management)
- **真源绑定**：Sidebar 直接消费 `useWorkspaceStore()`。
- **单向控制流**：UI 点击 -> `captureApi.setActiveProvider` -> 主进程切换视图 -> Store 监听 `onRuntimeStatus` 并刷新。

## 3. 页面存续与门控 (Preservation & Gating)
- **WorkspacePage**: 物理保留，重组其子组件（ConversationList, MessagePane）至新的 `Library` 模式。
- **DiagnosticsPage**: 物理保留，入口从主导航移除，改为在“关于/设置”页面通过 `Alt+Click` 或 `isDev` 标志位控制显示。

---
## 4. 后续步骤 (Next Steps)
1. 建立 `ui-implementation-plan.md`。
2. 移植 `anyChat` 核心 Lib 工具类。
3. 重构 App 顶层 Shell 样式。
