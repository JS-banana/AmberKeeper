# Test Spec — AmberKeeper 知识库 / 历史缓存管理 MVP

## Test Objectives
验证知识库改造在以下方面成立：
1. provider 原生 title 能被持久化并返回到 renderer
2. 旧数据 title 缺失时仍有稳定 fallback
3. 知识库列表项展示标题、消息数、最后更新时间
4. session 详情页展示改进后的档案信息与管理动作
5. 单条删除 / 单条导出 / provider 全量导出行为成立
6. Settings provider 管理行为未回归

## Unit / Storage Tests
### Schema & repository
- `packages/capture-core/src/persistence/schema.ts`
  - 新库创建时包含 title 列
  - 旧库迁移后可读取，不破坏已有 conversations/messages
- `packages/capture-core/src/persistence/conversation-repository.ts`
  - `resolve(...)` 新建 conversation 时写入 title
  - 已存在 conversation 时更新 title/保留既有 title 的规则明确
- `apps/desktop/src/main/storage/capture-store.ts`
  - `listSessions()` 返回 title
  - 删除 session 后 messages 级联或显式清理符合预期

## Integration / IPC Tests
- `apps/desktop/src/main/ipc/capture-ipc.ts`
  - 新增 delete/export handlers 可被调用
- `apps/desktop/src/preload/renderer.ts`
  - 暴露 delete/export API
- renderer store
  - 删除后 refresh 与 selectedSessionId 重新计算正确
  - 导出参数透传正确
  - `json` / `markdown` 两种格式均能透传并执行

## Renderer / Component Tests
- `apps/desktop/src/renderer/src/App.test.tsx`
  - utility 导航显示知识库定位文案
  - Settings 仍可操作 provider
- `ConversationList`
  - 列表项显示标题、消息数、最后更新时间
  - legacy fallback title 显示正确
- `ConversationMessagePane`
  - 详情头部显示档案信息
  - 管理动作入口可见

## Manual / UX Verification
- 进入知识库后能快速看懂当前 provider 与 session 数量
- 列表项看起来像“档案记录”而不是技术 ID
- 删除操作有确认，结果可感知
- 导出动作与格式选择不混乱
- 删除当前选中 session 后，界面能稳定切换到下一条或空态
- URL 在详情中存在但不抢主信息层级

## Regression Focus
- provider 启停/排序/激活流程
- 选中 session 后 openSession + refresh 消息流程
- 无 session / 无消息空态
- diagnostics surface 不受影响

## Exit Criteria
- 自动化测试覆盖 schema/title/store/UI 关键路径
- 手动验证通过知识库主流程
- lint/typecheck/tests 通过
- 无已知 blocker 影响核心 acceptance criteria
