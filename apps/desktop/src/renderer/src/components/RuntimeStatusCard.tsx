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
        <h3>运行状态</h3>
        <button className="primary-button" type="button" onClick={onTriggerSnapshot}>
          触发 DOM 快照
        </button>
      </div>
      <div className="status-grid">
        <StatusItem label="调试器" value={status.debuggerAttached ? '已连接' : '未连接'} />
        <StatusItem label="待处理请求" value={String(status.pendingRequestCount)} />
        <StatusItem label="最近捕获" value={status.lastCaptureAt ?? '尚无记录'} />
      </div>
      <div className="runtime-path">
        <span>当前地址</span>
        <p className="mono">{status.currentUrl}</p>
      </div>
      <p className="feedback feedback--status">
        {snapshotFeedback || '当前仍以 CDP network capture 作为主采集链路。'}
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
