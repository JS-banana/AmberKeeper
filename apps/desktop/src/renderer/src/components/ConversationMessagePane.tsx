import { useState } from 'react';
import { Download, Trash2 } from 'lucide-react';
import type {
  CaptureMessageRecord,
  CaptureSessionRecord,
} from '@amberkeeper/shared-types';
import {
  formatSessionUpdatedAt,
  getProviderLabel,
  resolveSessionTitle,
} from '../lib/session-display';
import { ProviderIcon } from './ProviderIcon';
import { cn } from '@/lib/cn';

type CaptureActionResult = { message: string; detail: string };

const emptyClass =
  'p-3.5 rounded-2xl text-[#586779] bg-white/60 border border-dashed border-[rgba(87,102,122,0.22)] [&>p]:m-0 [&>p]:leading-relaxed';

export function ConversationMessagePane(props: {
  session: CaptureSessionRecord | null;
  messages: CaptureMessageRecord[];
  loading: boolean;
  onDeleteSession: (sessionId: string) => Promise<CaptureActionResult>;
  onExportSession: (sessionId: string) => void;
}) {
  const [busyAction, setBusyAction] = useState<'delete' | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  async function handleDelete() {
    if (!props.session) return;
    if (!window.confirm('确认删除当前记录吗？此操作只会移除本地缓存。')) return;
    setBusyAction('delete');
    try {
      const result = await props.onDeleteSession(props.session.id);
      setFeedback(result.detail || result.message);
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : String(error));
    } finally {
      setBusyAction(null);
    }
  }

  return (
    <article className="h-full flex flex-col min-h-0 p-[18px] rounded-[20px] border border-[rgba(66,49,11,0.12)] bg-white/70 shadow-[0_18px_44px_rgba(68,54,26,0.1)] animate-[fade-up_420ms_ease_both] overflow-hidden">
      <div className="flex items-center justify-between gap-3 mb-3.5">
        <h2 className="text-sm tracking-[0.04em] m-0 font-bold">记录详情</h2>
        <span className="inline-flex items-center justify-center min-w-7 px-2 py-0.5 rounded-full text-[11px] font-bold tracking-[0.08em] text-[#6b4e06] bg-[rgba(255,204,101,0.18)]">
          {props.messages.length}
        </span>
      </div>

      {props.session ? (
        <>
          <div className="grid gap-2.5 mb-2.5 pb-2.5 border-b border-[rgba(92,104,123,0.16)]">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="grid gap-2 min-w-0">
                <div className="flex items-center gap-2.5 min-w-0">
                  <ProviderIcon
                    providerId={props.session.provider}
                    providerName={getProviderLabel(props.session.provider)}
                    homeUrl={props.session.pageUrl}
                    className="w-7 h-7 p-1"
                  />
                  <strong className="block m-0 text-lg text-[#202b3a] min-w-0 whitespace-nowrap overflow-hidden text-ellipsis">
                    {resolveSessionTitle(props.session)}
                  </strong>
                  {props.session.remoteConversationId ? (
                    <span className="sr-only">{props.session.remoteConversationId}</span>
                  ) : null}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <span className="inline-flex items-center min-h-6 px-2 rounded-full bg-white/80 border border-[rgba(84,99,124,0.1)] text-xs text-[#66758a] leading-snug">
                    {getProviderLabel(props.session.provider)}
                  </span>
                  <span className="inline-flex items-center min-h-6 px-2 rounded-full bg-white/80 border border-[rgba(84,99,124,0.1)] text-xs text-[#66758a] leading-snug">
                    {props.session.messageCount} 条消息
                  </span>
                  <span className="inline-flex items-center min-h-6 px-2 rounded-full bg-white/80 border border-[rgba(84,99,124,0.1)] text-xs text-[#66758a] leading-snug">
                    {formatSessionUpdatedAt(props.session.updatedAt)}
                  </span>
                </div>
                <p className="mt-1 text-[11px] text-[#8c7e6a]/80 font-mono break-all leading-snug" title="原始对话来源 URL">
                  {props.session.pageUrl}
                </p>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                <button
                  type="button"
                  aria-label="导出当前记录"
                  title="导出当前记录"
                  className={cn(
                    'inline-flex items-center justify-center w-8 h-8 rounded-lg border border-[rgba(84,99,124,0.12)] bg-white/80 text-[#5b6978] transition-colors',
                    'hover:bg-white hover:border-[rgba(84,99,124,0.2)] hover:text-[#2e3a4a]',
                    'disabled:opacity-40 disabled:cursor-not-allowed',
                  )}
                  disabled={busyAction !== null}
                  onClick={() => props.session && props.onExportSession(props.session.id)}
                >
                  <Download className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  aria-label="删除当前记录"
                  title="删除当前记录"
                  className={cn(
                    'inline-flex items-center justify-center w-8 h-8 rounded-lg border border-[rgba(84,99,124,0.12)] bg-white/80 text-[#5b6978] transition-colors',
                    'hover:bg-red-50 hover:border-red-200 hover:text-red-600',
                    'disabled:opacity-40 disabled:cursor-not-allowed',
                  )}
                  disabled={busyAction !== null}
                  onClick={() => void handleDelete()}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
            {feedback ? (
              <p className="m-0 p-3 px-3.5 rounded-2xl text-[13px] leading-relaxed text-[#5b4c38] bg-white/70 border border-[rgba(153,127,76,0.12)]" aria-live="polite">
                {feedback}
              </p>
            ) : null}
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden pr-2 mt-2">
            {props.loading ? (
              <div className={emptyClass}><p>正在加载记录…</p></div>
            ) : null}

            {!props.loading && props.messages.length === 0 ? (
              <div className={emptyClass}><p>当前记录还没有捕获到消息。</p></div>
            ) : null}

            {props.messages.length > 0 ? (
              <ol className="grid gap-3 list-none m-0 p-0">
                {props.messages.map((message) => (
                  <li
                    key={message.id}
                    className={cn(
                      'p-3.5 rounded-[18px] border',
                      message.role === 'user'
                        ? 'bg-[rgba(255,250,235,0.94)] border-[rgba(200,145,20,0.12)]'
                        : 'bg-[rgba(244,247,255,0.94)] border-[rgba(91,168,255,0.14)]',
                    )}
                  >
                    <div className="flex items-center justify-between gap-2.5 mb-2.5 text-[11px] uppercase tracking-[0.08em] text-[#738297]">
                      <span>{message.role === 'assistant' ? '助手' : '用户'}</span>
                      <span>{message.createdAt}</span>
                    </div>
                    <p className="m-0 leading-relaxed text-[#243346] whitespace-pre-wrap">{message.content}</p>
                  </li>
                ))}
              </ol>
            ) : null}
          </div>
        </>
      ) : (
        <div className={emptyClass}>
          <p>先从左侧选择一条记录。</p>
        </div>
      )}
    </article>
  );
}
