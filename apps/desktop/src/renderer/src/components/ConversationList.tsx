import type { CaptureSessionRecord } from '@anychat/shared-types';

export function ConversationList(props: {
  sessions: CaptureSessionRecord[];
  selectedSessionId: string | null;
  onSelect: (sessionId: string) => void;
}) {
  return (
    <article className="workspace-card workspace-card--sessions">
      <div className="section-header section-header--tight">
        <h2>Sessions</h2>
        <span className="panel-count">{props.sessions.length}</span>
      </div>

      {props.sessions.length === 0 ? (
        <div className="workspace-empty">
          <p>No sessions for the current provider yet.</p>
        </div>
      ) : (
        <ul className="conversation-list">
          {props.sessions.map((session) => {
            const title = session.remoteConversationId ?? session.id;

            return (
              <li key={session.id}>
                <button
                  className={
                    session.id === props.selectedSessionId
                      ? 'conversation-item active'
                      : 'conversation-item'
                  }
                  type="button"
                  onClick={() => {
                    props.onSelect(session.id);
                  }}
                >
                  <span className="conversation-item__title">{title}</span>
                  <span className="conversation-item__meta">
                    {session.messageCount} message{session.messageCount === 1 ? '' : 's'}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </article>
  );
}
