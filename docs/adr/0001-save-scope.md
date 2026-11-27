# Default To Complete Conversation Save Scope

AmberKeeper defaults to retaining complete conversations because review and export need intact context, while the Settings page offers a global **保存范围** for users who prefer lower-noise records. Choosing **仅我的消息** applies only to future records and must not retain assistant message text as durable local content.

New capture attempt logs in **仅我的消息** retain statuses and explicitly selected body-free metadata, not request or response samples, DOM excerpts, or unclassified error text. **完整对话** keeps the existing diagnostic detail. Changing the scope does not rewrite earlier logs.
