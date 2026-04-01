import type { ProviderRecord, RuntimeStatus } from '@amberkeeper/shared-types';

export function ChatPage(props: {
  activeProvider: ProviderRecord | null;
  runtimeStatus: RuntimeStatus | null;
  loading: boolean;
  onOpenLibrary: () => void;
}) {
  if (!props.activeProvider) {
    return (
      <section className="chat-overview">
        <p className="chat-overview__eyebrow">AmberKeeper</p>
        <h1>No provider is currently available.</h1>
        <p className="chat-overview__copy">
          Enable at least one built-in provider in Settings to bring the native chat stage online.
        </p>
      </section>
    );
  }

  return (
    <section className="chat-overview">
      <p className="chat-overview__eyebrow">AmberKeeper</p>
      <div className="chat-overview__headline">
        <div>
          <p className="chat-overview__label">Current Provider</p>
          <h1>{props.activeProvider.name}</h1>
        </div>
        <span className="chat-status-pill">
          {props.activeProvider.enabled ? 'Ready' : 'Paused'}
        </span>
      </div>

      <p className="chat-overview__copy">
        Keep the main chat view lightweight like anyChat while preserving AmberKeeper&apos;s
        session capture and local history tooling behind Library.
      </p>

      <dl className="chat-overview__facts">
        <div>
          <dt>Home URL</dt>
          <dd>{props.activeProvider.homeUrl}</dd>
        </div>
        <div>
          <dt>Current URL</dt>
          <dd>{props.runtimeStatus?.currentUrl ?? props.activeProvider.homeUrl}</dd>
        </div>
        <div>
          <dt>Pending Requests</dt>
          <dd>{props.runtimeStatus?.pendingRequestCount ?? 0}</dd>
        </div>
        <div>
          <dt>Debugger</dt>
          <dd>{props.runtimeStatus?.debuggerAttached ? 'Attached' : 'Detached'}</dd>
        </div>
      </dl>

      <div className="chat-overview__callout">
        <div>
          <strong>Captured chats stay local.</strong>
          <p>
            Open Library when you want to inspect sessions, hydrate older conversations, or verify
            what AmberKeeper has already collected.
          </p>
        </div>
        <button className="secondary-button" type="button" onClick={props.onOpenLibrary}>
          Open Library
        </button>
      </div>

      {props.loading ? <p className="chat-overview__loading">Refreshing provider state…</p> : null}
    </section>
  );
}
