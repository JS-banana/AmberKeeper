import type { CaptureSessionRecord } from '@amberkeeper/shared-types';
import {
  formatSessionUpdatedAt,
  resolveSessionTitle,
} from '../lib/session-display';
import { cn } from '@/lib/cn';

export function ConversationList(props: {
  sessions: CaptureSessionRecord[];
  selectedSessionId: string | null;
  onSelect: (sessionId: string) => void;
}) {
  return (
    <article className="h-full flex flex-col min-h-0 p-[18px] rounded-[20px] border border-[rgba(66,49,11,0.12)] bg-white/70 shadow-[0_18px_44px_rgba(68,54,26,0.1)] animate-[fade-up_420ms_ease_both]">
      <div className="flex items-center justify-between gap-3 mb-3.5">
        <h2 className="text-sm tracking-[0.04em] m-0 font-bold">聊天记录</h2>
        <span className="inline-flex items-center justify-center min-w-7 px-2 py-0.5 rounded-full text-[11px] font-bold tracking-[0.08em] text-[#6b4e06] bg-[rgba(255,204,101,0.18)]">
          {props.sessions.length}
        </span>
      </div>

      {props.sessions.length === 0 ? (
        <div className="p-3.5 rounded-2xl text-[#586779] bg-white/60 border border-dashed border-[rgba(87,102,122,0.22)] [&>p]:m-0 [&>p]:leading-relaxed">
          <p>当前还没有可查看的历史记录。</p>
        </div>
      ) : (
        <ul
          className="flex-1 overflow-y-auto overflow-x-hidden min-h-0 flex flex-col gap-3 list-none m-0 p-0 [scrollbar-gutter:stable] [&::-webkit-scrollbar]:w-[5px] [&::-webkit-scrollbar:horizontal]:hidden"
          aria-label="历史记录列表"
        >
          {props.sessions.map((session) => {
            const isActive = session.id === props.selectedSessionId;
            return (
              <li key={session.id}>
                <button
                  className={cn(
                    'w-full block p-3 px-3.5 rounded-xl text-left bg-white border border-[rgba(84,99,124,0.08)] transition-all duration-200 ease-in-out overflow-hidden cursor-pointer shrink-0',
                    'hover:bg-[#fffdf9] hover:border-[rgba(204,148,17,0.15)] hover:translate-x-0.5',
                    isActive && 'bg-gradient-to-br from-[#fffcf0] to-[#fffbf2] border-[rgba(204,148,17,0.32)] shadow-[0_4px_12px_rgba(204,148,17,0.04)]',
                  )}
                  type="button"
                  aria-pressed={isActive}
                  onClick={() => props.onSelect(session.id)}
                >
                  <div className="flex flex-col gap-1.5 w-full min-w-0">
                    <span
                      className="block w-full min-w-0 text-[14.5px] font-bold leading-[1.4] text-[#1a222d] whitespace-nowrap overflow-hidden text-ellipsis mb-1"
                      title={resolveSessionTitle(session)}
                    >
                      {resolveSessionTitle(session)}
                    </span>
                    <div className="flex items-center gap-2 min-w-0 text-[11px] text-[#758396]">
                      <span className="font-semibold text-[#5b6978]">{session.messageCount} 条记录</span>
                      <span className="opacity-80">{formatSessionUpdatedAt(session.updatedAt)}</span>
                    </div>
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </article>
  );
}
