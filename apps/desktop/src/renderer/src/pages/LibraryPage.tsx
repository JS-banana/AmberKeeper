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
type HistoryScope = 'all' | ProviderRecord['id'];

export function LibraryPage(props: {
  activeProvider: ProviderRecord | null;
  providers: ProviderRecord[];
  historyScope: HistoryScope;
  onChangeHistoryScope: (scope: HistoryScope) => void;
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
  const scopedProvider =
    props.historyScope === 'all'
      ? null
      : exportProviderOptions.find((provider) => provider.id === props.historyScope) ?? null;
  const scopedSessions =
    props.historyScope === 'all'
      ? props.sessions
      : props.sessions.filter((session) => session.provider === props.historyScope);
  const scopedSelectedSession =
    props.historyScope === 'all'
      ? null
      : props.selectedSession && props.selectedSession.provider === props.historyScope
        ? props.selectedSession
        : scopedSessions[0] ?? null;
  const scopedMessages =
    scopedSelectedSession && scopedSelectedSession.id === props.selectedSessionId ? props.messages : [];

  useEffect(() => {
    const nextTarget =
      props.selectedSession?.provider ?? props.activeProvider?.id ?? exportProviderOptions[0]?.id ?? '';
    setProviderExportTarget((current) =>
      current && exportProviderOptions.some((provider) => provider.id === current) ? current : nextTarget
    );
  }, [exportProviderOptions, props.activeProvider?.id, props.selectedSession?.provider]);

  useEffect(() => {
    if (props.historyScope === 'all') {
      return;
    }

    setProviderExportTarget(props.historyScope);
  }, [props.historyScope]);

  useEffect(() => {
    if (props.historyScope === 'all') {
      return;
    }

    if (scopedSessions.length === 0) {
      return;
    }

    if (props.selectedSessionId && scopedSessions.some((session) => session.id === props.selectedSessionId)) {
      return;
    }

    props.onSelectSession(scopedSessions[0].id);
  }, [props.historyScope, props.onSelectSession, props.selectedSessionId, scopedSessions]);

  const exportProvider =
    exportProviderOptions.find((provider) => provider.id === providerExportTarget) ?? null;

  async function handleProviderExport() {
    if (!providerExportTarget) {
      return;
    }

    setProviderActionBusy(true);
    try {
      await props.onExportProviderSessions(providerExportTarget, providerExportFormat);
    } catch {
      // Error state is surfaced by the shared workspace store; avoid persistent top-level feedback strips here.
    } finally {
      setProviderActionBusy(false);
    }
  }

  async function handleRefresh() {
    setRefreshBusy(true);
    try {
      await props.onRefresh();
    } catch {
      // Error state is surfaced by the shared workspace store; keep the page header visually quiet.
    } finally {
      setRefreshBusy(false);
    }
  }

  const exportAndSyncTools = (
    <div className="library-page__toolbar-actions" style={props.historyScope === 'all' ? { justifyContent: 'flex-start', marginTop: 16 } : undefined}>
      <label className="field-select field-select--compact">
        <span className="visually-hidden">选择要导出的服务</span>
        <select
          aria-label="选择要导出的服务"
          value={providerExportTarget}
          disabled={providerActionBusy || exportProviderOptions.length === 0}
          onChange={(event) => {
            setProviderExportTarget(event.currentTarget.value as ProviderRecord['id']);
          }}
        >
          {exportProviderOptions.map((provider) => (
            <option key={provider.id} value={provider.id}>
              {provider.name}
            </option>
          ))}
        </select>
      </label>
      <label className="field-select field-select--compact">
        <span className="visually-hidden">选择导出格式</span>
        <select
          aria-label="选择导出格式"
          value={providerExportFormat}
          disabled={!providerExportTarget || providerActionBusy}
          onChange={(event) => {
            setProviderExportFormat(event.currentTarget.value as CaptureExportFormat);
          }}
        >
          <option value="json">JSON 格式</option>
          <option value="markdown">Markdown 格式</option>
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
          exportProvider ? `导出 ${exportProvider.name} 记录` : '导出服务记录'
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
  );

  return (
    <section className="utility-page utility-page--library">
      <h1 className="visually-hidden">历史记录</h1>
      <div className="library-page__top">
        <div className="library-page__toolbar">
          <div className="library-page__provider-tabs" aria-label="按服务筛选历史记录">
            <button
              type="button"
              aria-label="查看全部记录"
              aria-pressed={props.historyScope === 'all'}
              title="全部"
              className={
                props.historyScope === 'all'
                  ? 'library-page__provider-tab library-page__provider-tab--active'
                  : 'library-page__provider-tab'
              }
              disabled={providerActionBusy || refreshBusy}
              onClick={() => {
                props.onChangeHistoryScope('all');
              }}
            >
              全部
            </button>
            {exportProviderOptions.map((provider) => {
              const active = provider.id === props.historyScope;

              return (
                <button
                  key={provider.id}
                  type="button"
                  aria-label={`查看 ${provider.name} 记录`}
                  aria-pressed={active}
                  title={provider.name}
                  className={
                    active
                      ? 'library-page__provider-tab library-page__provider-tab--active'
                      : 'library-page__provider-tab'
                  }
                  disabled={providerActionBusy || refreshBusy}
                  onClick={() => {
                    props.onChangeHistoryScope(provider.id);
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

          {props.historyScope !== 'all' && exportAndSyncTools}
        </div>
      </div>

      {props.historyScope === 'all' ? (
        <LibraryOverview
          sessionCount={props.sessions.length}
          providerCount={exportProviderOptions.length}
          activeProviderName={props.activeProvider?.name ?? '未选择'}
        >
          {exportAndSyncTools}
        </LibraryOverview>
      ) : (
        <div className="library-grid">
          <ConversationList
            sessions={scopedSessions}
            selectedSessionId={scopedSelectedSession?.id ?? null}
            onSelect={props.onSelectSession}
          />
          <ConversationMessagePane
            session={scopedSelectedSession}
            messages={scopedMessages}
            loading={props.loading}
            onDeleteSession={props.onDeleteSession}
            onExportSession={props.onExportSession}
          />
        </div>
      )}
    </section>
  );
}

function LibraryOverview(props: {
  sessionCount: number;
  providerCount: number;
  activeProviderName: string;
  children?: ReactNode;
}) {
  return (
    <section className="library-overview-dashboard" aria-label="全部记录总览">
      <div className="library-overview-dashboard__tools-header">
        <h2>全部记录总览</h2>
        <p>{props.sessionCount} 条记录 · {props.providerCount} 个服务</p>
      </div>
      <div className="library-overview-dashboard__stats">
        <div className="stat-card stat-card--accent">
          <span className="stat-card__label">已收录记录</span>
          <div className="stat-card__value">
            {props.sessionCount}
            <span className="stat-card__unit">条</span>
          </div>
        </div>
        <div className="stat-card">
          <span className="stat-card__label">已接入服务</span>
          <div className="stat-card__value">
            {props.providerCount}
            <span className="stat-card__unit">个</span>
          </div>
        </div>
        <div className="stat-card">
          <span className="stat-card__label">当前工作服务</span>
          <div className="stat-card__value stat-card__value--text" style={{ fontSize: '24px', paddingTop: '10px' }}>
            {props.activeProviderName}
          </div>
        </div>
      </div>
      
      <div className="library-overview-dashboard__tools">
        <div className="library-overview-dashboard__tools-header">
          <h3>导出与同步</h3>
          <p>按需配置并导出您的本地 AI 对话数据</p>
        </div>
        {props.children}
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
