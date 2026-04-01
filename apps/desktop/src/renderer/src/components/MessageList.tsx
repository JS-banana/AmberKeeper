import type { CaptureMessageRecord } from '@amberkeeper/shared-types';

export function MessageList(props: {
  messages: CaptureMessageRecord[];
  sessionLabel: string;
}) {
  const { messages, sessionLabel } = props;

  return (
    <article className="panel-card">
      <div className="section-header section-header--tight">
        <h3>消息</h3>
        <span className="panel-count">{messages.length}</span>
      </div>
      <p className="panel-caption">{sessionLabel}</p>
      <ul className="message-list">
        {messages.length === 0 ? (
          <li className="empty-state">等待首次捕获完成后，再选择一个会话查看消息。</li>
        ) : (
          messages.map((message) => (
            <li key={message.id} className="message-item">
              <span className={`message-role role-${message.role}`}>{formatRoleLabel(message.role)}</span>
              <p>{message.content}</p>
            </li>
          ))
        )}
      </ul>
    </article>
  );
}

function formatRoleLabel(role: CaptureMessageRecord['role']) {
  if (role === 'assistant') {
    return '助手';
  }

  if (role === 'user') {
    return '用户';
  }

  return role;
}
