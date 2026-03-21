import { AttemptLogPanel } from '../components/AttemptLogPanel';
import { MessageList } from '../components/MessageList';
import { RuntimeStatusCard } from '../components/RuntimeStatusCard';
import { SessionList } from '../components/SessionList';
import { useDiagnosticsStore } from '../stores/diagnostics-store';

export function DiagnosticsPage() {
  const store = useDiagnosticsStore();
  const sessionLabel = store.selectedSession
    ? store.selectedSession.remoteConversationId ?? 'Fallback Session'
    : 'Pick a session after the first capture arrives.';

  return (
    <section className="diagnostics-page">
      <header className="page-header page-header--diagnostics">
        <p className="eyebrow eyebrow--diagnostics">Diagnostics</p>
        <h1>Capture lab and reconciliation console</h1>
        <p className="page-copy">
          This surface keeps runtime state, event logs, and captured conversations visible while
          the capture pipeline evolves.
        </p>
      </header>

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
