import type { CaptureMessageRecord } from '@amberkeeper/shared-types';
import { cn } from '@/lib/cn';

const panelCard =
  'rounded-[20px] overflow-hidden p-[18px] border border-[rgba(147,168,194,0.16)] shadow-[0_20px_48px_rgba(0,0,0,0.32)] animate-[fade-up_420ms_ease_both]';
const panelBg = 'linear-gradient(180deg, rgba(12,18,30,0.92), rgba(9,13,22,0.98))';

export function MessageList(props: {
  messages: CaptureMessageRecord[];
  sessionLabel: string;
}) {
  const { messages, sessionLabel } = props;

  return (
    <article className={panelCard} style={{ background: panelBg }}>
      <div className="flex items-center justify-between gap-3 mb-3.5">
        <h3 className="m-0 text-sm font-bold tracking-[0.04em]">消息</h3>
        <span className="inline-flex items-center justify-center min-w-7 px-2 py-0.5 rounded-full text-[11px] font-bold tracking-[0.08em] text-foreground/70 bg-white/10">
          {messages.length}
        </span>
      </div>
      <p className="m-0 mb-3 text-xs leading-normal text-foreground/80">{sessionLabel}</p>
      <ul className="grid gap-2.5 list-none m-0 p-0">
        {messages.length === 0 ? (
          <li className="p-3 rounded-[14px] bg-white/5 text-foreground/60">
            等待首次捕获完成后，再选择一个会话查看消息。
          </li>
        ) : (
          messages.map((message) => (
            <li key={message.id} className="p-3 rounded-[14px] bg-white/5">
              <span
                className={cn(
                  'inline-flex min-w-[72px] mb-2 px-2 py-1 rounded-full text-[11px] uppercase tracking-[0.08em]',
                  message.role === 'user'
                    ? 'bg-[rgba(124,229,202,0.16)] text-[#89f0d9]'
                    : 'bg-[rgba(91,168,255,0.16)] text-[#95c7ff]',
                )}
              >
                {formatRoleLabel(message.role)}
              </span>
              <p className="m-0 leading-[1.55] break-words">{message.content}</p>
            </li>
          ))
        )}
      </ul>
    </article>
  );
}

function formatRoleLabel(role: CaptureMessageRecord['role']) {
  if (role === 'assistant') {
    return '助手';
  }

  if (role === 'user') {
    return '用户';
  }

  return role;
}
