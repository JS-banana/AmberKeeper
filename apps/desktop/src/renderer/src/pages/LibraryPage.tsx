import { useEffect, useState, type ReactNode } from 'react';
import type {
  CaptureExportFormat,
  CaptureMessageRecord,
  CaptureSessionRecord,
  ProviderRecord,
} from '@amberkeeper/shared-types';
import { ConversationList } from '../components/ConversationList';
import { ConversationMessagePane } from '../components/ConversationMessagePane';
import { ProviderIcon } from '../components/ProviderIcon';

type CaptureActionResult = { message: string; detail: string };

export function LibraryPage(props: {
  activeProvider: ProviderRecord | null;
  providers: ProviderRecord[];
  sessions: CaptureSessionRecord[];
  selectedSession: CaptureSessionRecord | null;
  selectedSessionId: string | null;
  messages: CaptureMessageRecord[];
  loading: boolean;
  onRefresh: () => Promise<void> | void;
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
  const [refreshBusy, setRefreshBusy] = useState(false);
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

  async function handleRefresh() {
    setRefreshBusy(true);
    try {
      await props.onRefresh();
      setProviderFeedback('已刷新历史会话列表。');
    } catch (error) {
      setProviderFeedback(error instanceof Error ? error.message : String(error));
    } finally {
      setRefreshBusy(false);
    }
  }

  return (
    <section className="utility-page utility-page--library">
      <div className="library-page__top">
        <header className="utility-page__header utility-page__header--compact library-page__header">
          <div>
            <p className="utility-page__eyebrow">历史会话</p>
            <h1>历史会话档案</h1>
          </div>
          <span className="library-page__summary">
            {props.sessions.length} 条会话 · {exportProviderOptions.length} 个 provider
          </span>
        </header>

        <div className="library-page__toolbar">
          <div className="library-page__provider-tabs" aria-label="选择要导出的 provider">
            {exportProviderOptions.map((provider) => {
              const active = provider.id === providerExportTarget;

              return (
                <button
                  key={provider.id}
                  type="button"
                  aria-label={`选择 ${provider.name}`}
                  aria-pressed={active}
                  title={provider.name}
                  className={
                    active
                      ? 'library-page__provider-tab library-page__provider-tab--active'
                      : 'library-page__provider-tab'
                  }
                  disabled={providerActionBusy || refreshBusy}
                  onClick={() => {
                    setProviderExportTarget(provider.id);
                  }}
                >
                  <ProviderIcon
                    providerId={provider.id}
                    providerName={provider.name}
                    homeUrl={provider.homeUrl}
                    className="library-page__provider-icon"
                  />
                </button>
              );
            })}
          </div>

          <div className="library-page__toolbar-actions">
            <label className="field-select field-select--compact">
              <span className="visually-hidden">选择 provider 导出格式</span>
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

            <IconActionButton
              label="刷新会话"
              busy={refreshBusy}
              onClick={() => {
                void handleRefresh();
              }}
            >
              <RefreshIcon />
            </IconActionButton>

            <IconActionButton
              label={
                exportProvider
                  ? `导出 ${exportProvider.name} 会话档案`
                  : '导出当前 provider 会话档案'
              }
              busy={providerActionBusy}
              disabled={!providerExportTarget}
              onClick={() => {
                void handleProviderExport();
              }}
            >
              <ExportIcon />
            </IconActionButton>
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

function IconActionButton(props: {
  label: string;
  busy?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      className="secondary-icon-button"
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

function RefreshIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="button-icon">
      <path
        d="M19 8.5V4.75m0 0H15.25M19 4.75 14.8 8.9A7 7 0 1 0 18.25 16"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
