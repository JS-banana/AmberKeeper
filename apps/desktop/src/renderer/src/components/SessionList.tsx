import type { CaptureSessionRecord } from '@amberkeeper/shared-types';
import { cn } from '@/lib/cn';

const panelCard =
  'rounded-[20px] overflow-hidden p-[18px] border border-[rgba(147,168,194,0.16)] shadow-[0_20px_48px_rgba(0,0,0,0.32)] animate-[fade-up_420ms_ease_both]';
const panelBg = 'linear-gradient(180deg, rgba(12,18,30,0.92), rgba(9,13,22,0.98))';

export function SessionList(props: {
  sessions: CaptureSessionRecord[];
  selectedSessionId: string | null;
  onSelectSession: (sessionId: string) => void;
}) {
  const { sessions, selectedSessionId, onSelectSession } = props;

  return (
    <article className={panelCard} style={{ background: panelBg }}>
      <div className="flex items-center justify-between gap-3 mb-3.5">
        <h3 className="m-0 text-sm font-bold tracking-[0.04em]">会话</h3>
        <span className="inline-flex items-center justify-center min-w-7 px-2 py-0.5 rounded-full text-[11px] font-bold tracking-[0.08em] text-foreground/70 bg-white/10">
          {sessions.length}
        </span>
      </div>
      <ul className="grid gap-2.5 list-none m-0 p-0">
        {sessions.length === 0 ? (
          <li className="p-3 rounded-[14px] bg-white/5 text-foreground/60">暂时还没有缓存会话。</li>
        ) : (
          sessions.map((session) => {
            const isSelected = session.id === selectedSessionId;
            return (
              <li key={session.id}>
                <button
                  className={cn(
                    'w-full flex items-center justify-between gap-3 px-3.5 py-3 border border-white/[0.08] rounded-[14px] text-inherit bg-white/[0.04] text-left transition-[transform,border-color,background] duration-150 ease-out hover:-translate-y-px hover:border-[rgba(91,168,255,0.4)] focus-visible:outline-2 focus-visible:outline-[rgba(91,168,255,0.7)] focus-visible:outline-offset-2',
                    isSelected && 'border-[rgba(91,168,255,0.62)] bg-[rgba(91,168,255,0.14)]',
                  )}
                  type="button"
                  onClick={() => onSelectSession(session.id)}
                >
                  <span className="font-bold">{session.remoteConversationId ?? '回退会话'}</span>
                  <small className="text-foreground/60">{session.messageCount} 条消息</small>
                </button>
              </li>
            );
          })
        )}
      </ul>
    </article>
  );
}
