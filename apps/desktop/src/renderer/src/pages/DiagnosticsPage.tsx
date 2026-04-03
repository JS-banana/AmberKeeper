import { AttemptLogPanel } from '../components/AttemptLogPanel';
import { MessageList } from '../components/MessageList';
import { RuntimeStatusCard } from '../components/RuntimeStatusCard';
import { SessionList } from '../components/SessionList';
import { useDiagnosticsStore } from '../stores/diagnostics-store';

export function DiagnosticsPage() {
  const store = useDiagnosticsStore();
  const sessionLabel = store.selectedSession
    ? store.selectedSession.remoteConversationId ?? '回退会话'
    : '请先在捕获后选择一个会话。';

  return (
    <section className="diagnostics-page">

      <RuntimeStatusCard
        status={store.runtimeStatus}
        snapshotFeedback={store.snapshotFeedback}
        onTriggerSnapshot={store.triggerSnapshot}
      />

      <div className="diagnostics-grid">
        <AttemptLogPanel attempts={store.runtimeStatus.recentAttempts} />
        <SessionList
          sessions={store.sessions}
          selectedSessionId={store.selectedSessionId}
          onSelectSession={store.selectSession}
        />
        <MessageList messages={store.messages} sessionLabel={sessionLabel} />
      </div>
    </section>
  );
}
