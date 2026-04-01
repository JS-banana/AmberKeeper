import { useState } from 'react';
import type {
  CaptureExportFormat,
  CaptureMessageRecord,
  CaptureSessionRecord,
  ProviderRecord,
} from '@amberkeeper/shared-types';
import { ConversationList } from '../components/ConversationList';
import { ConversationMessagePane } from '../components/ConversationMessagePane';

type CaptureActionResult = { message: string; detail: string };

export function LibraryPage(props: {
  activeProvider: ProviderRecord | null;
  sessions: CaptureSessionRecord[];
  selectedSession: CaptureSessionRecord | null;
  selectedSessionId: string | null;
  messages: CaptureMessageRecord[];
  loading: boolean;
  onSelectSession: (sessionId: string) => void;
  onDeleteSession: (sessionId: string) => Promise<CaptureActionResult>;
  onExportSession: (
    sessionId: string,
    format: CaptureExportFormat
  ) => Promise<CaptureActionResult>;
  onExportProviderSessions: (
    providerId: ProviderRecord['id'],
    format: CaptureExportFormat
  ) => Promise<CaptureActionResult>;
}) {
  const [providerExportFormat, setProviderExportFormat] =
    useState<CaptureExportFormat>('json');
  const [providerActionBusy, setProviderActionBusy] = useState(false);
  const [providerFeedback, setProviderFeedback] = useState<string | null>(null);

  async function handleProviderExport() {
    if (!props.activeProvider) {
      return;
    }

    setProviderActionBusy(true);
    try {
      const result = await props.onExportProviderSessions(
        props.activeProvider.id,
        providerExportFormat
      );
      setProviderFeedback(result.detail || result.message);
    } catch (error) {
      setProviderFeedback(error instanceof Error ? error.message : String(error));
    } finally {
      setProviderActionBusy(false);
    }
  }

  return (
    <section className="utility-page">
      <header className="utility-page__header">
        <div>
          <p className="utility-page__eyebrow">知识库</p>
          <h1>历史会话档案</h1>
        </div>
        <p className="utility-page__copy">
          {props.activeProvider
            ? `当前按 provider 浏览 ${props.activeProvider.name} 的历史缓存。先把单个应用内的档案管理做好，再逐步扩展跨 provider 聚合。`
            : '当前还没有可用的应用，暂时无法进入 provider-first 知识库视图。'}
        </p>
      </header>

      <div className="library-page__provider">
        <div className="library-page__provider-copy">
          <strong>{props.activeProvider?.name ?? '未选择应用'}</strong>
          <span>
            {props.activeProvider
              ? `${props.sessions.length} 条会话 · provider-first MVP`
              : '请选择一个已启用的应用以浏览会话档案'}
          </span>
        </div>

        <div className="library-page__provider-actions">
          <label className="field-select">
            <span>导出格式</span>
            <select
              aria-label="选择 provider 导出格式"
              value={providerExportFormat}
              disabled={!props.activeProvider || providerActionBusy}
              onChange={(event) => {
                setProviderExportFormat(event.currentTarget.value as CaptureExportFormat);
              }}
            >
              <option value="json">JSON bundle</option>
              <option value="markdown">Markdown archive</option>
            </select>
          </label>
          <button
            className="primary-button"
            type="button"
            disabled={!props.activeProvider || providerActionBusy}
            onClick={() => {
              void handleProviderExport();
            }}
          >
            {providerActionBusy ? '正在导出…' : '导出当前 provider'}
          </button>
        </div>
      </div>

      {providerFeedback ? (
        <p className="library-page__feedback" aria-live="polite">
          {providerFeedback}
        </p>
      ) : null}

      <div className="library-grid">
        <ConversationList
          sessions={props.sessions}
          selectedSessionId={props.selectedSessionId}
          onSelect={props.onSelectSession}
        />
        <ConversationMessagePane
          session={props.selectedSession}
          messages={props.messages}
          loading={props.loading}
          onDeleteSession={props.onDeleteSession}
          onExportSession={props.onExportSession}
        />
      </div>
    </section>
  );
}
