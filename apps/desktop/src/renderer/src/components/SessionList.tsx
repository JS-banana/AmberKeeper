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
        <h3>会话</h3>
        <span className="panel-count">{sessions.length}</span>
      </div>
      <ul className="session-list">
        {sessions.length === 0 ? (
          <li className="empty-state">暂时还没有缓存会话。</li>
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
                  <span>{session.remoteConversationId ?? '回退会话'}</span>
                  <small>{session.messageCount} 条消息</small>
                </button>
              </li>
            );
          })
        )}
      </ul>
    </article>
  );
}
