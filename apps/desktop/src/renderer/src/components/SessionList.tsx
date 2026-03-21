import type { CaptureSessionRecord } from '@amberkeeper/shared-types';

export function SessionList(props: {
  sessions: CaptureSessionRecord[];
  selectedSessionId: string | null;
  onSelectSession: (sessionId: string) => void;
}) {
  const { sessions, selectedSessionId, onSelectSession } = props;

  return (
    <article className="panel-card">
      <div className="section-header section-header--tight">
        <h3>Sessions</h3>
        <span className="panel-count">{sessions.length}</span>
      </div>
      <ul className="session-list">
        {sessions.length === 0 ? (
          <li className="empty-state">No cached sessions yet.</li>
        ) : (
          sessions.map((session) => {
            const isSelected = session.id === selectedSessionId;

            return (
              <li key={session.id}>
                <button
                  className={isSelected ? 'session-button active' : 'session-button'}
                  type="button"
                  onClick={() => onSelectSession(session.id)}
                >
                  <span>{session.remoteConversationId ?? 'Fallback Session'}</span>
                  <small>{session.messageCount} msg</small>
                </button>
              </li>
            );
          })
        )}
      </ul>
    </article>
  );
}
