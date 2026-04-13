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
    <section className="dark min-h-0">
      <div
        className="p-[18px] overflow-auto min-h-0 text-foreground"
        style={{
          background:
            'radial-gradient(circle at top right, rgba(91,168,255,0.2), transparent 24%), radial-gradient(circle at bottom left, rgba(66,216,177,0.14), transparent 22%), linear-gradient(180deg, rgba(7,11,19,0.98), rgba(4,7,13,0.98))',
        }}
      >
        <h1 className="sr-only">抓取调试台与对账控制台</h1>
        <RuntimeStatusCard
          status={store.runtimeStatus}
          snapshotFeedback={store.snapshotFeedback}
          onTriggerSnapshot={store.triggerSnapshot}
        />
        <div className="grid grid-cols-2 gap-4 [&>:last-child]:col-span-full mt-4">
          <AttemptLogPanel attempts={store.runtimeStatus.recentAttempts} />
          <SessionList
            sessions={store.sessions}
            selectedSessionId={store.selectedSessionId}
            onSelectSession={store.selectSession}
          />
          <MessageList messages={store.messages} sessionLabel={sessionLabel} />
        </div>
      </div>
    </section>
  );
}
