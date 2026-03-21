# 2026-03-19 Electron Mainline Architecture Design

## 背景与结论

当前分支已经基于 Electron 原型验证了 ChatGPT 的核心闭环：

- 官方网页可通过 `WebContentsView` 正常承载
- 可实时捕获 `user + assistant` 对话
- 数据可落本地 SQLite
- 应用重启后历史仍可读取

因此，接下来的方向不再是“继续论证 Electron 是否可行”，而是明确将 **Electron 作为正式主线壳**，并停止让 Tauri/Rust 继续承载核心能力。

同时，当前原型已经暴露出结构性信号：

- `src/main/main.ts` 已经同时承担窗口管理、运行时编排、CDP 监听、DOM 兜底、IPC 和持久化调用
- ChatGPT 专属规则分散在多个文件中，但仍然通过主进程直接耦合
- 当前存储模型足以支撑验证，但还不适合多 provider 扩展和后续回放调试

结论：

1. 仓库应从“Electron 实验包 + Tauri 主体”转向“Electron 正式主仓”
2. 需要立即建立 `app shell / capture core / provider adapters` 三层架构
3. 后续接入 Claude、DeepSeek 等 provider 时，应复制 adapter 模板，而不是继续堆大主进程

## 总体目标

本阶段目标不是立刻做完整产品，而是先把验证后的成功链路产品化，形成一个可以持续扩展的 Electron 主干。

目标包括：

- 将当前 Electron 原型升格为正式桌面应用主干
- 将捕获能力沉淀为可复用的 capture core
- 将 ChatGPT 规则整理为首个 provider adapter
- 为后续 Claude / DeepSeek 接入提供稳定模板
- 保留调试和验证能力，但不让其污染正式产品界面

非目标：

- 不继续兼顾 Tauri 主线
- 不为未来 Swift 现在做跨端抽象
- 不在当前阶段为了“通用性”提前设计过多无验证接口

## 推荐分层

推荐采用三层结构：

### 1. App Shell

负责 Electron 应用本身的产品层：

- 主窗口和布局
- tabs / services / workspace
- 账号管理
- 设置页
- diagnostics 页面入口

这一层不关心 ChatGPT 的接口路径，也不关心某一条 network body 怎么解析。

### 2. Capture Core

负责通用捕获运行时和数据编排：

- 浏览器运行时生命周期
- CDP 和 preload 信号接入
- turn state machine
- conversation/session 归并
- 最终持久化调度
- attempt logs / raw capture events

这一层不应该直接写 ChatGPT 的 if/else。

### 3. Provider Adapters

每个 provider 一套规则，至少包括：

- 路由识别
- request/response 解析
- DOM 提取
- completion signal 判定
- conversation id 解析
- turn reducer 特化逻辑

当前第一个 adapter 是 `provider-chatgpt`，后续新增：

- `provider-claude`
- `provider-deepseek`

## 仓库结构建议

推荐将当前仓库整理为 pnpm workspace，并将 Electron 代码升格为主应用：

```text
apps/
  desktop/

packages/
  capture-core/
  provider-chatgpt/
  provider-claude/
  provider-deepseek/
  shared-types/
  ui/

docs/
  architecture/
  plans/
  research/
```

说明：

- `apps/desktop`：Electron 正式应用，当前 `experiments/electron-chatgpt-capture` 的代码整体迁入这里
- `packages/capture-core`：通用信号、状态机、持久化服务、capture event 模型
- `packages/provider-chatgpt`：ChatGPT adapter
- `packages/shared-types`：main / preload / renderer / adapters 共享类型
- `packages/ui`：正式产品 UI 与 diagnostics 共享组件

对于 Tauri/Rust：

- 不建议继续保留在主仓开发路径中
- 推荐保留在历史分支或归档目录，不参与后续主线构建和 CI

## 主进程拆分建议

当前主进程已接近原型上限，建议尽快拆分。

推荐拆为：

```text
apps/desktop/src/main/
  bootstrap/
    app.ts
  windows/
    main-window.ts
  runtime/
    browser-session.ts
    cdp-observer.ts
  capture/
    capture-orchestrator.ts
  ipc/
    capture-ipc.ts
```

职责划分：

- `bootstrap/app.ts`
  - 负责 Electron app 生命周期
  - 初始化窗口、store、runtime

- `windows/main-window.ts`
  - 负责主窗口和视图布局
  - 不包含 provider 逻辑

- `runtime/browser-session.ts`
  - 负责 `WebContentsView`
  - 负责 partition / popup / login persistence

- `runtime/cdp-observer.ts`
  - attach debugger
  - 读取 `Network` 事件和 response body
  - 向上发标准化 runtime signals

- `capture/capture-orchestrator.ts`
  - 接收所有 signals
  - 驱动 turn state machine
  - 决定何时持久化

- `ipc/capture-ipc.ts`
  - 暴露 renderer 侧查询接口

## Capture Core 设计

### 核心对象

建议 capture core 只围绕四个对象组织：

- `ViewRuntime`
- `TurnState`
- `ProviderAdapter`
- `CaptureStore`

### 推荐数据流

所有底层能力先发出原始信号：

- `requestSeen`
- `responseMetaSeen`
- `responseBodySeen`
- `domSnapshotSeen`
- `pageContextChanged`

然后由 `capture-orchestrator` 接管：

1. 接收原始 signals
2. 交给 provider adapter 解释
3. adapter 输出标准化语义
4. orchestrator 推进 `TurnState`
5. 到达 `ready_to_persist` 才写库

### Turn State 建议

最少包含：

- `idle`
- `collecting`
- `awaiting_conversation_id`
- `awaiting_assistant`
- `ready_to_persist`
- `persisted`
- `abandoned`

最关键规则：

- 用户消息先进入 pending turn，不立即写库
- 只有当 `conversationId` 和 assistant 都达到稳定状态后，整轮一次性持久化

这样可以自然解决此前出现的 fallback session 问题。

## Provider Adapter 契约

每个 provider 应实现一组明确接口，而不是直接操作 Electron 对象。

推荐接口：

```ts
interface ProviderAdapter {
  id: string;
  matchesView(url: string): boolean;
  classifyRequest(input: RequestMeta): RequestClassification;
  interpretRequest(input: RequestSignal): ProviderSignal[];
  interpretResponseMeta(input: ResponseMetaSignal): ProviderSignal[];
  interpretResponseBody(input: ResponseBodySignal): ProviderSignal[];
  interpretDomSnapshot(input: DomSnapshotSignal): ProviderSignal[];
  reduceTurn(state: TurnState, signal: ProviderSignal): TurnState;
}
```

原则：

- provider 只负责解释，不负责写库
- provider 不依赖 Electron API
- provider 测试以 fixtures 和 contract tests 为核心

这意味着未来扩 Claude / DeepSeek 时，新增的是新 adapter，而不是继续修改主进程。

## 数据库与持久化设计

当前 `capture_sessions / capture_messages / capture_attempt_logs` 适合验证阶段，但正式主线建议升级为双层模型：

### 业务层

- `conversations`
- `messages`

### 证据层

- `capture_events`

推荐职责：

- `ConversationRepository`
- `MessageRepository`
- `CaptureEventRepository`
- `TurnPersistenceService`

原则：

- repository 只负责 CRUD
- “何时创建会话、何时 merge、何时落最终消息”由 service 负责

这样后续才能支持：

- 失败回放
- 归并调试
- provider 对比验证
- 数据导出和恢复

## UI 组织建议

正式应用不要直接沿用当前验证台界面。

建议拆成两套：

### 1. Workspace

用户真正使用的产品界面：

- 多服务 tabs
- 会话列表
- 搜索与过滤
- 收藏 / 标签
- 账号与服务管理

### 2. Diagnostics

开发和验证专用：

- recent attempts
- raw events
- dom snapshots
- capture pipeline 状态
- merge/reconciliation 记录

当前验证台应保留，但作为 diagnostics 页而不是正式首页。

## 工程与测试建议

测试分层建议：

- `unit`
  - parser
  - reducer
  - repositories

- `fixtures`
  - 真实脱敏 request/response/body 样本

- `contract`
  - provider adapter 输入输出约束

- `integration`
  - orchestrator + store

- `manual verification`
  - 文档化验收流程

CI 建议：

- 只保留 Electron 主线相关命令
- 不再继续跑 Tauri/Rust 流程

## 立即执行的第一批重构任务

### Phase 1: 仓库升格

- 将 `experiments/electron-chatgpt-capture` 迁移为 `apps/desktop`
- 将根仓改为 pnpm workspace
- 将 Tauri/Rust 移出主路径

### Phase 2: 主进程拆分

- 在不改变行为的前提下拆分 `main.ts`
- 抽出：
  - app bootstrap
  - window manager
  - browser session
  - cdp observer
  - ipc handlers

### Phase 3: 抽 capture core

- 建立标准 signals
- 建立 turn state machine
- 建立 orchestrator 和 persistence service

### Phase 4: 抽 provider-chatgpt

- 收口 ChatGPT route matching
- 收口 request/response parser
- 收口 DOM extractor
- 建立 adapter contract tests

### Phase 5: 升级存储模型

- 保持当前消息数据可读
- 新增 `capture_events`
- 准备 session reconciliation / cleanup 路径

### Phase 6: UI 双层化

- 保留 diagnostics
- 开始单独设计 workspace

## 当前建议

从全局看，当前方向不需要推翻重来，但已经到了必须“从成功原型转向正式架构”的节点。

如果继续按当前原型文件组织追加 provider，短期还能前进，长期一定会积累成高耦合主进程和难以回放的问题。

因此，建议下一步不是“继续直接接 Claude”，而是先完成：

1. Electron 主仓升格
2. `main.ts` 无行为拆分
3. `capture-core` 与 `provider-chatgpt` 第一轮抽离

完成这三步之后，再接第二个 provider，速度反而会更快，且不会返工。
