import type {
  CaptureMessageRecord,
  CaptureSessionRecord,
  ProviderRecord,
} from '@amberkeeper/shared-types';
import { ConversationList } from '../components/ConversationList';
import { ConversationMessagePane } from '../components/ConversationMessagePane';

export function LibraryPage(props: {
  activeProvider: ProviderRecord | null;
  sessions: CaptureSessionRecord[];
  selectedSession: CaptureSessionRecord | null;
  selectedSessionId: string | null;
  messages: CaptureMessageRecord[];
  loading: boolean;
  onSelectSession: (sessionId: string) => void;
}) {
  return (
    <section className="utility-page">
      <header className="utility-page__header">
        <div>
          <p className="utility-page__eyebrow">会话库</p>
          <h1>聊天记录</h1>
        </div>
        <p className="utility-page__copy">
          {props.activeProvider
            ? `这里展示 ${props.activeProvider.name} 的已捕获会话。切换左侧应用即可查看其他应用的数据。`
            : '当前还没有可用的应用。'}
        </p>
      </header>

      <div className="library-page__provider">
        <strong>{props.activeProvider?.name ?? '未选择应用'}</strong>
        <span>{props.sessions.length} 条已缓存会话</span>
      </div>

      <div className="library-grid">
        <ConversationList
          sessions={props.sessions}
          selectedSessionId={props.selectedSessionId}
          onSelect={props.onSelectSession}
        />
        <ConversationMessagePane
          session={props.selectedSession}
          messages={props.messages}
          loading={props.loading}
        />
      </div>
    </section>
  );
}
