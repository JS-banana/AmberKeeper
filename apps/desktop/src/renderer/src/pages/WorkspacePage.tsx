import { ProviderRail } from '../components/ProviderRail';
import { ConversationList } from '../components/ConversationList';
import { ConversationMessagePane } from '../components/ConversationMessagePane';
import { useWorkspaceStore } from '../stores/workspace-store';

export function WorkspacePage() {
  const { state, activeProvider, selectedSession, actions } = useWorkspaceStore();

  return (
    <section className="workspace-page">
      <header className="page-header page-header--workspace">
        <p className="eyebrow eyebrow--workspace">Workspace</p>
        <h1>Mainstream provider management</h1>
        <p className="page-copy">
          Phase 1 keeps the shell narrow: built-in provider switching, enable and disable controls,
          and per-provider conversation inspection without leaking diagnostics into the product
          surface.
        </p>
      </header>

      {state.error ? (
        <div className="workspace-alert" role="alert">
          {state.error}
        </div>
      ) : null}

      <div className="workspace-grid workspace-grid--providers">
        <ProviderRail
          providers={state.providers}
          activeProviderId={state.activeProviderId}
          onSelect={actions.selectProvider}
          onToggleEnabled={actions.setProviderEnabled}
        />

        <article className="workspace-card workspace-card--summary">
          <div className="section-header section-header--tight">
            <h2>Active Provider</h2>
            <span className="panel-count">{activeProvider?.enabled ? 'Ready' : 'Idle'}</span>
          </div>

          {activeProvider ? (
            <div className="provider-summary">
              <div className="provider-summary__title">
                <strong>{activeProvider.name}</strong>
                <span>{activeProvider.enabled ? 'Enabled' : 'Disabled'}</span>
              </div>
              <dl className="provider-summary__facts">
                <div>
                  <dt>Home URL</dt>
                  <dd>{activeProvider.homeUrl}</dd>
                </div>
                <div>
                  <dt>Current URL</dt>
                  <dd>{state.runtimeStatus?.currentUrl ?? activeProvider.homeUrl}</dd>
                </div>
                <div>
                  <dt>Debugger</dt>
                  <dd>{state.runtimeStatus?.debuggerAttached ? 'Attached' : 'Detached'}</dd>
                </div>
                <div>
                  <dt>Pending Requests</dt>
                  <dd>{state.runtimeStatus?.pendingRequestCount ?? 0}</dd>
                </div>
              </dl>
            </div>
          ) : (
            <div className="workspace-empty">
              <p>No active provider available.</p>
            </div>
          )}
        </article>
      </div>

      <div className="workspace-grid workspace-grid--conversations">
        <ConversationList
          sessions={state.sessions}
          selectedSessionId={state.selectedSessionId}
          onSelect={actions.selectSession}
        />
        <ConversationMessagePane
          session={selectedSession}
          messages={state.messages}
          loading={state.loading}
          onDeleteSession={actions.deleteSession}
          onExportSession={actions.exportSession}
        />
      </div>
    </section>
  );
}
