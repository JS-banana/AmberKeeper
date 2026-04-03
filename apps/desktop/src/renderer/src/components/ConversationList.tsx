import type { CaptureSessionRecord } from '@amberkeeper/shared-types';
import {
  formatSessionUpdatedAt,
  getProviderLabel,
  resolveSessionTitle,
} from '../lib/session-display';
import { ProviderIcon } from './ProviderIcon';

export function ConversationList(props: {
  sessions: CaptureSessionRecord[];
  selectedSessionId: string | null;
  onSelect: (sessionId: string) => void;
}) {
  return (
    <article className="workspace-card workspace-card--sessions">
      <div className="section-header section-header--tight">
        <h2>聊天记录</h2>
        <span className="panel-count">{props.sessions.length}</span>
      </div>

      {props.sessions.length === 0 ? (
        <div className="workspace-empty">
          <p>当前还没有可查看的历史记录。</p>
        </div>
      ) : (
        <ul className="conversation-list conversation-list--scroll" aria-label="历史记录列表">
          {props.sessions.map((session) => (
            <li key={session.id}>
              <button
                className={
                  session.id === props.selectedSessionId
                    ? 'conversation-item active'
                    : 'conversation-item'
                }
                type="button"
                aria-pressed={session.id === props.selectedSessionId}
                onClick={() => {
                  props.onSelect(session.id);
                }}
              >
                <div className="conversation-item__body">
                  <span className="conversation-item__title" title={resolveSessionTitle(session)}>
                    {resolveSessionTitle(session)}
                  </span>
                  <div className="conversation-item__meta">
                    <span className="conversation-item__count">{session.messageCount} 条记录</span>
                    <span className="conversation-item__date">{formatSessionUpdatedAt(session.updatedAt)}</span>
                  </div>
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}
