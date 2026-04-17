# AmberKeeper Domain Model

## 1. Provider

`ProviderRecord` 描述一个具备采集能力的内建 provider。

关键字段：

- `id`
- `name`
- `homeUrl`
- `enabled`
- `cacheEnabled`
- `active`

Provider 的职责：

- 绑定一个 browser session partition
- 绑定一个 provider adapter
- 参与本地采集、历史回看、导出、runtime diagnostics

当前内建 provider：

- `chatgpt`
- `claude`
- `deepseek`
- `gemini`
- `grok`
- `kimi`
- `qianwen`
- `doubao`
- `xiaomi-aistudio`

## 2. Service

`ServiceRecord` 描述实际出现在桌面壳左侧 rail 中的入口对象。

Service 分两类：

- `builtin`
- `custom`

### Built-in service

built-in service 与 provider 一一对应：

- `service.id === provider.id`
- `service.providerId === provider.id`

它继承 provider 的采集能力，因此：

- `supportsCapture = true`
- `supportsDataManagement = true`

### Custom service

custom service 是纯壳层入口：

- 没有 provider adapter
- 不参与本地采集
- 不参与历史回看与导出

因此：

- `supportsCapture = false`
- `supportsDataManagement = false`

custom service 仍然可以：

- 出现在 rail 中
- 持久化名称 / URL / icon
- 被启用 / 停用 / 删除 / 排序

## 3. Active Provider vs Active Service

AmberKeeper 显式区分两个激活概念：

### `activeProvider`

表示当前内建 provider 语义上的活动对象。

用途：

- capture signal 路由
- provider runtime 选择
- 数据页 provider 维度操作

### `activeService`

表示当前 shell rail 中真正激活的入口对象。

用途：

- 原生 stage 当前显示哪一个 runtime/view
- custom service 与 built-in service 的统一切换

关系：

- 当 active service 是 built-in 时，`activeService.providerId === activeProvider.id`
- 当 active service 是 custom 时，`activeProvider` 仍保留最近有效的 built-in provider 语义上下文

## 4. Session / Message / Event

### Conversation / Session

`CaptureSessionRecord` 对应持久化表 `conversations` 中的一条会话记录。

包含：

- `provider`
- `remoteConversationId`
- `pageUrl`
- `title`
- `messageCount`

### Message

`CaptureMessageRecord` 对应持久化表 `messages` 中的一条消息。

包含：

- `role`
- `content`
- `remoteMessageId`
- `createdAt`
- `capturedAt`

### Capture Event

`capture_events` 不是用户层 message，而是证据层事件：

- request / response / history hydration 对应的持久化证据
- 用于调试与回放

## 5. Runtime status

`RuntimeStatus` 是 renderer 读取的运行时诊断快照，而不是业务数据模型。

它主要承载：

- `debuggerAttached`
- `currentUrl`
- `lastCaptureAt`
- `pendingRequestCount`
- `recentAttempts`

## 6. 设计意图

AmberKeeper 的 domain model 目标是：

1. provider 负责“采集能力”
2. service 负责“壳层入口”
3. session/message 负责“业务记录”
4. capture event / attempt log 负责“证据与诊断”

后续改动不应再把这些概念重新混在一起。
