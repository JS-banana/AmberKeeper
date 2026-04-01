import type { CaptureSessionRecord } from '@amberkeeper/shared-types';
import {
  formatSessionUpdatedAt,
  getProviderLabel,
  resolveSessionTitle,
} from '../lib/session-display';

export function ConversationList(props: {
  sessions: CaptureSessionRecord[];
  selectedSessionId: string | null;
  onSelect: (sessionId: string) => void;
}) {
  return (
    <article className="workspace-card workspace-card--sessions">
      <div className="section-header section-header--tight">
        <div>
          <h2>会话档案</h2>
          <p className="conversation-list__copy">跨 provider 浏览标题、消息数与最近更新时间</p>
        </div>
        <span className="panel-count">{props.sessions.length}</span>
      </div>

      {props.sessions.length === 0 ? (
        <div className="workspace-empty">
          <p>当前还没有可查看的历史会话。</p>
        </div>
      ) : (
        <ul className="conversation-list">
          {props.sessions.map((session) => (
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
                  <span className="conversation-item__title">
                  {resolveSessionTitle(session)}
                  </span>
                  <span className="conversation-item__meta">
                    <span>{getProviderLabel(session.provider)}</span>
                    <span>{session.messageCount} 条消息</span>
                    <span>更新于 {formatSessionUpdatedAt(session.updatedAt)}</span>
                  </span>
                </button>
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}
