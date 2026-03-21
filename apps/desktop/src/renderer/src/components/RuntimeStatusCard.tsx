import type { RuntimeStatus } from '@amberkeeper/shared-types';

export function RuntimeStatusCard(props: {
  status: RuntimeStatus;
  snapshotFeedback: string;
  onTriggerSnapshot: () => void;
}) {
  const { status, snapshotFeedback, onTriggerSnapshot } = props;

  return (
    <article className="panel-card runtime-status-card">
      <div className="section-header section-header--tight">
        <h3>Runtime Status</h3>
        <button className="primary-button" type="button" onClick={onTriggerSnapshot}>
          Trigger DOM Snapshot
        </button>
      </div>
      <div className="status-grid">
        <StatusItem label="Debugger" value={status.debuggerAttached ? 'Attached' : 'Detached'} />
        <StatusItem label="Pending" value={String(status.pendingRequestCount)} />
        <StatusItem label="Last Capture" value={status.lastCaptureAt ?? 'None yet'} />
      </div>
      <div className="runtime-path">
        <span>Current URL</span>
        <p className="mono">{status.currentUrl}</p>
      </div>
      <p className="feedback feedback--status">
        {snapshotFeedback || 'CDP network capture is the primary path.'}
      </p>
    </article>
  );
}

function StatusItem(props: { label: string; value: string }) {
  return (
    <div className="status-item">
      <span>{props.label}</span>
      <strong>{props.value}</strong>
    </div>
  );
}
