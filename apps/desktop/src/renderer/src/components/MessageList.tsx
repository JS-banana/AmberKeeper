import type { CaptureMessageRecord } from '@anychat/shared-types';

export function MessageList(props: {
  messages: CaptureMessageRecord[];
  sessionLabel: string;
}) {
  const { messages, sessionLabel } = props;

  return (
    <article className="panel-card">
      <div className="section-header section-header--tight">
        <h3>Messages</h3>
        <span className="panel-count">{messages.length}</span>
      </div>
      <p className="panel-caption">{sessionLabel}</p>
      <ul className="message-list">
        {messages.length === 0 ? (
          <li className="empty-state">Pick a session after the first capture arrives.</li>
        ) : (
          messages.map((message) => (
            <li key={message.id} className="message-item">
              <span className={`message-role role-${message.role}`}>{message.role}</span>
              <p>{message.content}</p>
            </li>
          ))
        )}
      </ul>
    </article>
  );
}
