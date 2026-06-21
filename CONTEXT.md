# AmberKeeper

AmberKeeper is a local-first desktop workspace for retaining conversations from official AI provider web experiences as local records.

## Language

**会话活跃趋势**:
A time-series view of when retained provider conversations were last active. A conversation counts in the bucket for its latest activity, not only for the day it was first created.
_Avoid_: 会话趋势, 新增会话趋势

**会话活跃热力图**:
A calendar-grid view of session activity over the last 365 local days. Each cell shows how many retained conversations were last active that day, using the same counting rule as **会话活跃趋势**.
_Avoid_: 贡献图, 打卡热力图, GitHub 贡献

**保存范围**:
Controls which roles from provider conversations are retained as local records. It is a user-level setting, with canonical choices **仅我的消息** and **完整对话**, and changes apply only to future records.
_Avoid_: 缓存策略, 数据缓存策略

**本地记录**:
Durable local conversation text retained by AmberKeeper for later review, analysis, or export. Content that is not retained must not be preserved merely by hiding it from the interface.
_Avoid_: UI 可见记录, 页面展示数据

**聊天数据位置**:
A user-selectable folder where AmberKeeper stores retained local conversation data artifacts. Changing it moves existing retained conversation data while leaving provider login state, browser cache, and provider-owned remote history outside its control.
_Avoid_: 数据库文件位置, 缓存位置, 应用数据位置

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

**聊天数据清理**:
A low-frequency destructive action that removes retained local conversation content traces from AmberKeeper for all providers or a selected provider while preserving app configuration, save policy, services, provider login state, and provider-owned remote history. It also removes related diagnostic content traces and requires deliberate confirmation because retained conversations are a core AmberKeeper asset.
_Avoid_: 清理数据, 清缓存, 清空列表
