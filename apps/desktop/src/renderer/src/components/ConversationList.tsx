import type { CaptureSessionRecord } from '@amberkeeper/shared-types';

export function ConversationList(props: {
  sessions: CaptureSessionRecord[];
  selectedSessionId: string | null;
  onSelect: (sessionId: string) => void;
}) {
  return (
    <article className="workspace-card workspace-card--sessions">
      <div className="section-header section-header--tight">
        <h2>会话</h2>
        <span className="panel-count">{props.sessions.length}</span>
      </div>

      {props.sessions.length === 0 ? (
        <div className="workspace-empty">
          <p>当前应用还没有可查看的会话。</p>
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
                    {session.messageCount} 条消息
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
