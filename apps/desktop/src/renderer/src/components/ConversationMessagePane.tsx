import { useState, type ReactNode } from 'react';
import type {
  CaptureExportFormat,
  CaptureMessageRecord,
  CaptureSessionRecord,
} from '@amberkeeper/shared-types';
import {
  formatSessionUpdatedAt,
  getProviderLabel,
  resolveSessionTitle,
} from '../lib/session-display';
import { ProviderIcon } from './ProviderIcon';

type CaptureActionResult = { message: string; detail: string };

export function ConversationMessagePane(props: {
  session: CaptureSessionRecord | null;
  messages: CaptureMessageRecord[];
  loading: boolean;
  onDeleteSession: (sessionId: string) => Promise<CaptureActionResult>;
  onExportSession: (
    sessionId: string,
    format: CaptureExportFormat
  ) => Promise<CaptureActionResult>;
}) {
  const [exportFormat, setExportFormat] = useState<CaptureExportFormat>('json');
  const [busyAction, setBusyAction] = useState<'export' | 'delete' | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  async function handleExport() {
    if (!props.session) {
      return;
    }

    setBusyAction('export');
    try {
      const result = await props.onExportSession(props.session.id, exportFormat);
      const nextFeedback = result.detail || result.message;
      if (nextFeedback.includes('导出已取消') || result.message === 'cancelled') {
        setFeedback(null);
      } else {
        setFeedback(nextFeedback);
      }
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : String(error));
    } finally {
      setBusyAction(null);
    }
  }



  return (
    <article className="workspace-card workspace-card--messages">
      <div className="section-header section-header--tight">
        <h2>记录详情</h2>
        <span className="panel-count">{props.messages.length}</span>
      </div>

      {props.session ? (
        <>
          <div className="message-pane__header">
            <div className="message-pane__headline">
              <div className="message-pane__summary">
                <div className="message-pane__title-row">
                  <ProviderIcon
                    providerId={props.session.provider}
                    providerName={getProviderLabel(props.session.provider)}
                    homeUrl={props.session.pageUrl}
                    className="message-pane__provider-icon"
                  />
                  <strong>{resolveSessionTitle(props.session)}</strong>
                </div>
                <div className="message-pane__chips">
                  <span>{getProviderLabel(props.session.provider)}</span>
                  <span>{props.session.messageCount} 条消息</span>
                  <span>{formatSessionUpdatedAt(props.session.updatedAt)}</span>
                </div>
                <p className="message-pane__meta-inline" title="原始对话来源 URL">
                  {props.session.pageUrl}
                </p>
              </div>

              <div className="message-pane__actions">
                <label className="field-select field-select--compact">
                  <span className="visually-hidden">选择会话导出格式</span>
                  <select
                    aria-label="选择会话导出格式"
                    value={exportFormat}
                    disabled={busyAction !== null}
                    onChange={(event) => {
                      setExportFormat(event.currentTarget.value as CaptureExportFormat);
                    }}
                  >
                    <option value="json">JSON 格式</option>
                    <option value="markdown">Markdown 格式</option>
                  </select>
                </label>
                <IconActionButton
                  label="导出当前记录"
                  busy={busyAction === 'export'}
                  disabled={busyAction !== null}
                  onClick={() => {
                    void handleExport();
                  }}
                >
                  <ExportIcon />
                </IconActionButton>

              </div>
            </div>
            {feedback ? (
              <p className="message-pane__feedback" aria-live="polite">
                {feedback}
              </p>
            ) : null}
          </div>
          <div className="message-pane__body">
            {props.loading ? (
              <div className="workspace-empty">
                <p>正在加载记录…</p>
              </div>
            ) : null}

            {!props.loading && props.messages.length === 0 ? (
              <div className="workspace-empty">
                <p>当前记录还没有捕获到消息。</p>
              </div>
            ) : null}

            {props.messages.length > 0 ? (
              <ol className="message-list">
                {props.messages.map((message) => (
                  <li
                    key={message.id}
                    className={
                      message.role === 'assistant'
                        ? 'message-bubble assistant'
                        : 'message-bubble user'
                    }
                  >
                    <div className="message-bubble__meta">
                      <span>{message.role === 'assistant' ? '助手' : '用户'}</span>
                      <span>{message.createdAt}</span>
                    </div>
                    <p>{message.content}</p>
                  </li>
                ))}
              </ol>
            ) : null}
          </div>
        </>
      ) : (
        <div className="workspace-empty">
          <p>先从左侧选择一条记录。</p>
        </div>
      )}
    </article>
  );
}

function IconActionButton(props: {
  label: string;
  busy?: boolean;
  disabled?: boolean;
  danger?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      className={props.danger ? 'secondary-icon-button secondary-icon-button--danger' : 'secondary-icon-button'}
      type="button"
      aria-label={props.label}
      title={props.label}
      disabled={props.disabled || props.busy}
      onClick={props.onClick}
    >
      {props.children}
    </button>
  );
}

function ExportIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="button-icon">
      <path
        d="M12 4.5v10m0 0 4-4m-4 4-4-4M5.5 16.5v1.25A1.75 1.75 0 0 0 7.25 19.5h9.5a1.75 1.75 0 0 0 1.75-1.75V16.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function DeleteIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="button-icon">
      <path
        d="M5.5 7.5h13M9.5 7.5V5.75c0-.69.56-1.25 1.25-1.25h2.5c.69 0 1.25.56 1.25 1.25V7.5M8.5 10.25v7.25m7-7.25v7.25M7.75 19.5h8.5c.69 0 1.25-.56 1.25-1.25V7.5H6.5v10.75c0 .69.56 1.25 1.25 1.25Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
