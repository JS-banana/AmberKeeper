import type { GeminiThemeDiagnosticReport, RuntimeStatus } from '@amberkeeper/shared-types';

const panelCard =
  'rounded-[20px] overflow-hidden p-[18px] border border-[rgba(147,168,194,0.16)] shadow-[0_20px_48px_rgba(0,0,0,0.32)] animate-[fade-up_420ms_ease_both]';
const panelBg = 'linear-gradient(180deg, rgba(12,18,30,0.92), rgba(9,13,22,0.98))';

export function RuntimeStatusCard(props: {
  status: RuntimeStatus;
  snapshotFeedback: string;
  onTriggerSnapshot: () => void;
  geminiDiagnosticFeedback: string;
  geminiDiagnosticReport: GeminiThemeDiagnosticReport | null;
  onRunGeminiThemeDiagnostic: () => void;
}) {
  const {
    status,
    snapshotFeedback,
    onTriggerSnapshot,
    geminiDiagnosticFeedback,
    geminiDiagnosticReport,
    onRunGeminiThemeDiagnostic,
  } = props;

  return (
    <article className={panelCard} style={{ background: panelBg }}>
      <div className="flex items-center justify-between gap-3 mb-3.5">
        <h3 className="m-0 text-sm font-bold tracking-[0.04em]">运行状态</h3>
        <div className="flex items-center gap-2">
          <button
            className="inline-flex items-center justify-center min-h-[42px] px-3.5 border-0 rounded-[14px] text-[#041118] bg-gradient-to-br from-[#88f0d6] to-[#5ba8ff] shadow-[0_10px_22px_rgba(91,168,255,0.24)] transition-[transform,box-shadow] duration-150 ease-out hover:-translate-y-px hover:shadow-[0_14px_26px_rgba(91,168,255,0.3)] focus-visible:outline-2 focus-visible:outline-[rgba(91,168,255,0.7)] focus-visible:outline-offset-2"
            type="button"
            onClick={onTriggerSnapshot}
          >
            触发 DOM 快照
          </button>
          <button
            className="inline-flex items-center justify-center min-h-[42px] px-3.5 border border-white/10 rounded-[14px] text-foreground bg-white/5 transition-colors hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-[rgba(91,168,255,0.7)] focus-visible:outline-offset-2"
            type="button"
            onClick={onRunGeminiThemeDiagnostic}
          >
            Gemini 主题诊断
          </button>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <StatusItem label="调试器" value={status.debuggerAttached ? '已连接' : '未连接'} />
        <StatusItem label="待处理请求" value={String(status.pendingRequestCount)} />
        <StatusItem label="最近捕获" value={status.lastCaptureAt ?? '尚无记录'} />
      </div>
      <div className="mt-3.5 pt-3.5 border-t border-white/[0.08]">
        <span className="block mb-2 text-[11px] uppercase tracking-[0.08em] text-foreground/60">
          当前地址
        </span>
        <p className="m-0 font-mono text-xs leading-relaxed break-all">{status.currentUrl}</p>
      </div>
      <p className="mt-3.5 text-[13px] text-foreground/80">
        {snapshotFeedback || '当前仍以 CDP network capture 作为主采集链路。'}
      </p>
      {geminiDiagnosticFeedback ? (
        <p className="mt-2 text-[13px] text-foreground/80">{geminiDiagnosticFeedback}</p>
      ) : null}
      {geminiDiagnosticReport ? (
        <div className="mt-3 grid gap-2 text-xs text-foreground/75">
          {geminiDiagnosticReport.entries.map((entry) => (
            <div key={entry.mode} className="rounded-xl border border-white/10 bg-white/5 px-3 py-2">
              <strong className="block text-[11px] uppercase tracking-[0.08em] text-foreground/70">
                {entry.mode === 'legacy' ? 'Legacy Partition' : 'Fresh Partition'}
              </strong>
              <span className="mt-1 block break-all">{entry.partition}</span>
              <span className="mt-1 block break-all">{entry.currentUrl}</span>
            </div>
          ))}
        </div>
      ) : null}
    </article>
  );
}

function StatusItem(props: { label: string; value: string }) {
  return (
    <div className="min-h-[76px] p-3 rounded-2xl bg-white/5">
      <span className="block text-[11px] uppercase tracking-[0.08em] opacity-80">{props.label}</span>
      <strong className="block mt-2 text-[13px] leading-[1.4] break-words">{props.value}</strong>
    </div>
  );
}
