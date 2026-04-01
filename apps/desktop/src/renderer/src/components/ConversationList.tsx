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
        <h2>会话档案</h2>
        <span className="panel-count">{props.sessions.length}</span>
      </div>

      {props.sessions.length === 0 ? (
        <div className="workspace-empty">
          <p>当前还没有可查看的历史会话。</p>
        </div>
      ) : (
        <ul className="conversation-list conversation-list--scroll">
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
                <span className="conversation-item__row">
                  <span className="conversation-item__identity">
                    <ProviderIcon
                      providerId={session.provider}
                      providerName={getProviderLabel(session.provider)}
                      homeUrl={session.pageUrl}
                      className="conversation-item__provider-icon"
                    />
                    <span className="conversation-item__title">
                      {resolveSessionTitle(session)}
                    </span>
                  </span>
                  <span className="conversation-item__meta">
                    <span>{session.messageCount} 条</span>
                    <span>{formatSessionUpdatedAt(session.updatedAt)}</span>
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}
