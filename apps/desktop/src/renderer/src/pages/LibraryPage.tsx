import { useEffect, useState } from 'react';
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
  providers: ProviderRecord[];
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
  const exportProviderOptions = props.providers.filter((provider) => provider.enabled);
  const [providerExportTarget, setProviderExportTarget] = useState<ProviderRecord['id'] | ''>(
    props.selectedSession?.provider ?? props.activeProvider?.id ?? exportProviderOptions[0]?.id ?? ''
  );
  const [providerExportFormat, setProviderExportFormat] =
    useState<CaptureExportFormat>('json');
  const [providerActionBusy, setProviderActionBusy] = useState(false);
  const [providerFeedback, setProviderFeedback] = useState<string | null>(null);

  useEffect(() => {
    const nextTarget =
      props.selectedSession?.provider ?? props.activeProvider?.id ?? exportProviderOptions[0]?.id ?? '';
    setProviderExportTarget((current) =>
      current && exportProviderOptions.some((provider) => provider.id === current) ? current : nextTarget
    );
  }, [exportProviderOptions, props.activeProvider?.id, props.selectedSession?.provider]);

  const exportProvider =
    exportProviderOptions.find((provider) => provider.id === providerExportTarget) ?? null;

  async function handleProviderExport() {
    if (!providerExportTarget) {
      return;
    }

    setProviderActionBusy(true);
    try {
      const result = await props.onExportProviderSessions(providerExportTarget, providerExportFormat);
      setProviderFeedback(result.detail || result.message);
    } catch (error) {
      setProviderFeedback(error instanceof Error ? error.message : String(error));
    } finally {
      setProviderActionBusy(false);
    }
  }

  return (
    <section className="utility-page utility-page--library">
      <div className="library-page__top">
        <header className="utility-page__header utility-page__header--compact">
          <div>
            <p className="utility-page__eyebrow">历史会话</p>
            <h1>历史会话档案</h1>
          </div>
          <p className="utility-page__copy">
            跨 provider 查看本地缓存，并按需导出单个 provider 的归档数据。
          </p>
        </header>

        <div className="library-page__provider">
          <div className="library-page__provider-copy">
            <strong>全部历史会话</strong>
            <span>
              {props.sessions.length} 条会话 · {exportProviderOptions.length} 个 provider
            </span>
            {exportProvider ? (
              <p className="library-page__provider-target">当前导出目标：{exportProvider.name}</p>
            ) : null}
          </div>

          <div className="library-page__provider-tabs" aria-label="选择要导出的 provider">
            {exportProviderOptions.map((provider) => {
              const active = provider.id === providerExportTarget;

              return (
                <button
                  key={provider.id}
                  type="button"
                  aria-pressed={active}
                  className={
                    active
                      ? 'library-page__provider-tab library-page__provider-tab--active'
                      : 'library-page__provider-tab'
                  }
                  disabled={providerActionBusy}
                  onClick={() => {
                    setProviderExportTarget(provider.id);
                  }}
                >
                  {provider.name}
                </button>
              );
            })}
          </div>

          <div className="library-page__provider-actions">
          <label className="field-select">
            <span>导出格式</span>
            <select
              aria-label="选择 provider 导出格式"
              value={providerExportFormat}
              disabled={!providerExportTarget || providerActionBusy}
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
            disabled={!providerExportTarget || providerActionBusy}
            onClick={() => {
              void handleProviderExport();
            }}
          >
            <ExportIcon />
            {providerActionBusy ? '正在导出…' : '导出所选 provider'}
          </button>
        </div>
        </div>

        {providerFeedback ? (
          <p className="library-page__feedback" aria-live="polite">
            {providerFeedback}
          </p>
        ) : null}
      </div>

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
