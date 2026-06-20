# AmberKeeper

AmberKeeper is a local-first desktop workspace for retaining conversations from official AI provider web experiences as local records.

## Language

**会话活跃趋势**:
A time-series view of when retained provider conversations were last active. A conversation counts in the bucket for its latest activity, not only for the day it was first created.
_Avoid_: 会话趋势, 新增会话趋势

**保存范围**:
Controls which roles from provider conversations are retained as local records. It is a user-level setting, with canonical choices **仅我的消息** and **完整对话**, and changes apply only to future records.
_Avoid_: 缓存策略, 数据缓存策略

**本地记录**:
Durable local conversation text retained by AmberKeeper for later review, analysis, or export. Content that is not retained must not be preserved merely by hiding it from the interface.
_Avoid_: UI 可见记录, 页面展示数据

**仅我的消息**:
A save scope that retains the user's own prompts, questions, and follow-up instructions as local records while leaving assistant content available only as capture context. Sessions in this scope remain visible, manageable, and exportable.
_Avoid_: user-only, 只缓存用户消息

**完整对话**:
A save scope that retains both user messages and assistant messages so the conversation can be reviewed with its context intact.
_Avoid_: user + assistant, 全量缓存

**导出范围**:
Controls which retained message roles are included in a single export. The canonical choices are **完整对话**, **仅我的消息**, and **仅助手回复**.
_Avoid_: 导出缓存策略, 下载范围

**导出对象**:
Controls which retained records are included in a single export, such as one conversation, one provider, or all records.
_Avoid_: 导出类型, 下载对象

**仅助手回复**:
An export scope that includes assistant messages without user messages for users who want to reuse AI output as document or knowledge-base material.
_Avoid_: assistant-only 保存, 只保存助手消息

**会话标题**:
The provider-owned title for a retained conversation. If no meaningful provider title is available, the conversation may show an unnamed placeholder while user content remains preview text rather than a title.
_Avoid_: 用户消息摘要标题, 自动摘要标题
