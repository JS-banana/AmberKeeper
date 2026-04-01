import { useState } from 'react';
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
      setFeedback(result.detail || result.message);
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : String(error));
    } finally {
      setBusyAction(null);
    }
  }

  async function handleDelete() {
    if (!props.session) {
      return;
    }

    const confirmed = window.confirm(
      `确认删除「${resolveSessionTitle(props.session)}」吗？此操作会移除该会话的本地缓存。`
    );
    if (!confirmed) {
      return;
    }

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
    <article className="workspace-card workspace-card--messages">
      <div className="section-header section-header--tight">
        <div>
          <h2>档案详情</h2>
          <p className="conversation-list__copy">完整消息流、导出与删除操作</p>
        </div>
        <span className="panel-count">{props.messages.length}</span>
      </div>

      {props.session ? (
        <div className="message-pane__header">
          <div className="message-pane__headline">
            <div>
              <strong>{resolveSessionTitle(props.session)}</strong>
              <div className="message-pane__chips">
                <span>{getProviderLabel(props.session.provider)}</span>
                <span>{props.session.messageCount} 条消息</span>
                <span>更新于 {formatSessionUpdatedAt(props.session.updatedAt)}</span>
              </div>
            </div>
            <div className="message-pane__actions">
              <label className="field-select">
                <span>导出格式</span>
                <select
                  aria-label="选择会话导出格式"
                  value={exportFormat}
                  disabled={busyAction !== null}
                  onChange={(event) => {
                    setExportFormat(event.currentTarget.value as CaptureExportFormat);
                  }}
                >
                  <option value="json">JSON</option>
                  <option value="markdown">Markdown</option>
                </select>
              </label>
              <button
                className="secondary-button"
                type="button"
                disabled={busyAction !== null}
                onClick={() => {
                  void handleExport();
                }}
              >
                {busyAction === 'export' ? '导出中…' : '导出会话'}
              </button>
              <button
                className="secondary-button secondary-button--danger"
                type="button"
                disabled={busyAction !== null}
                onClick={() => {
                  void handleDelete();
                }}
              >
                {busyAction === 'delete' ? '删除中…' : '删除会话'}
              </button>
            </div>
          </div>
          <dl className="message-pane__meta-list">
            <div>
              <dt>来源页面</dt>
              <dd>{props.session.pageUrl}</dd>
            </div>
            <div>
              <dt>会话 ID</dt>
              <dd>{props.session.remoteConversationId ?? props.session.id}</dd>
            </div>
          </dl>
          {feedback ? (
            <p className="message-pane__feedback" aria-live="polite">
              {feedback}
            </p>
          ) : null}
          <div className="message-pane__body">
            {props.loading ? (
              <div className="workspace-empty">
                <p>正在加载消息…</p>
              </div>
            ) : null}

            {!props.loading && props.messages.length === 0 ? (
              <div className="workspace-empty">
                <p>当前会话还没有捕获到消息。</p>
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
          <p>选择左侧会话后，可在这里查看档案详情并执行导出或删除。</p>
        </div>
      )}
    </article>
  );
}
