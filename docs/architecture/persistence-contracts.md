# AmberKeeper Persistence Contracts

## 1. 核心表

AmberKeeper 当前主库由以下几类表组成：

### Shell / settings 层

- `providers`
- `custom_services`
- `app_settings`

### Capture 业务层

- `conversations`
- `messages`

### 证据 / 诊断层

- `capture_events`
- `capture_attempt_logs`

## 2. 写入所有权

### Provider / Service / App settings

写入所有权规则：

- repository 只做单表/单域读写
- coordinator / service 拥有跨域事务边界

当前 owner：

- `provider-settings-repository.ts`
  - provider 单域更新
- `service-settings-repository.ts`
  - service / custom service 单域更新
- `app-settings-repository.ts`
  - interface language / active service id
- `settings-write-coordinator.ts`
  - built-in service/provider 联动写入的事务 owner
- `shell-settings-service.ts`
  - main 侧 shell mutation 命令边界

### Capture 写入

当前 owner：

- `CaptureStore.persistEnvelope()`
- `CaptureStore.replaceSessionEnvelope()`
- `persistCompletedTurn()` in `packages/capture-core`
- `history-capture-persistence-service.ts`
  - history hydration / auto-cache 持久化命令边界

## 3. 原子性约束

以下写入必须原子化：

1. `persistEnvelope`
2. `replaceSessionEnvelope`
3. completed-turn persistence

原子性覆盖的表：

- `conversations`
- `messages`
- `capture_events`

期望行为：

- 全部提交
- 或全部回滚

禁止留下：

- conversation 已更新但 messages 未完成
- messages 已替换但 capture_events 未写完
- title / remoteConversationId / message_count 部分更新

## 4. History hydration / auto-cache 合同

history hydration 与 auto-cache 当前拆成三层：

- `history-session-open-service.ts`
  - openSession 命令编排
- `history-dom-hydration-service.ts`
  - DOM polling / stabilization / diagnostics
- `history-capture-persistence-service.ts`
  - envelope 持久化

网络历史响应路径则由：

- `history-envelope-builder-service.ts`
  - response body → `CaptureEnvelope`
- `network-response-ingestion-service.ts`
  - response ingress orchestration

## 5. Repository 边界规则

Repository 必须遵守：

- 不跨 repository 互相递归写入
- 不拥有高层业务决策
- 不负责 shell active fallback 规则
- 不负责多表事务编排

## 6. 未来修改规则

修改持久化链路时，优先回答两个问题：

1. **这次写入的事务 owner 是谁？**
2. **失败时是否会留下部分状态？**

如果回答不清楚，就说明边界还不够清晰。
