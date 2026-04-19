import type { CaptureAttemptLogRecord } from '@amberkeeper/shared-types';
import { cn } from '@/lib/cn';

const panelCard =
  'rounded-[20px] overflow-hidden p-[18px] border border-[rgba(147,168,194,0.16)] shadow-[0_20px_48px_rgba(0,0,0,0.32)] animate-[fade-up_420ms_ease_both]';
const panelBg = 'linear-gradient(180deg, rgba(12,18,30,0.92), rgba(9,13,22,0.98))';

export function AttemptLogPanel(props: { attempts: CaptureAttemptLogRecord[] }) {
  const { attempts } = props;

  return (
    <article className={panelCard} style={{ background: panelBg }}>
      <div className="flex items-center justify-between gap-3 mb-3.5">
        <h3 className="m-0 text-sm font-bold tracking-[0.04em]">最近尝试</h3>
        <span className="inline-flex items-center justify-center min-w-7 px-2 py-0.5 rounded-full text-[11px] font-bold tracking-[0.08em] text-[#72e2d5] bg-[rgba(114,226,213,0.16)]">
          {attempts.length}
        </span>
      </div>
      <ul className="grid gap-2.5 list-none m-0 p-0">
        {attempts.length === 0 ? (
          <li className="p-3 rounded-[14px] bg-white/5 text-foreground/60">暂时还没有捕获尝试记录。</li>
        ) : (
          attempts.map((attempt) => (
            <li
              key={attempt.id}
              className={cn(
                'p-3 rounded-[14px] bg-white/5',
                attempt.status === 'captured' && 'border border-[rgba(111,242,217,0.24)]',
                attempt.status === 'error' && 'border border-[rgba(255,114,114,0.32)]',
              )}
            >
              <div className="flex justify-between gap-3 mb-2 text-foreground/55 text-[11px] uppercase tracking-[0.06em]">
                <span>{attempt.source}</span>
                <span>{attempt.stage}</span>
              </div>
              <strong className="block text-[13px] leading-[1.45] break-words">{attempt.message}</strong>
              {attempt.detail ? (
                <p className="m-0 mt-2 text-foreground/75 text-xs leading-[1.55] whitespace-pre-wrap break-words">
                  {attempt.detail}
                </p>
              ) : null}
            </li>
          ))
        )}
      </ul>
    </article>
  );
}
