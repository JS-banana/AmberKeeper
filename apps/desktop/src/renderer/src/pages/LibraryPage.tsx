import { useEffect, useState, type ReactNode } from 'react';
import { LayoutGrid, RefreshCw, Download, MessagesSquare, Server, TrendingUp, Database } from 'lucide-react';
import type {
  CaptureExportFormat,
  CaptureMessageRecord,
  CaptureSessionRecord,
  ProviderRecord,
} from '@amberkeeper/shared-types';
import { cn } from '@/lib/cn';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { IconButton } from '@/components/ui/icon-button';
import { ConversationList } from '../components/ConversationList';
import { ConversationMessagePane } from '../components/ConversationMessagePane';
import { ProviderIcon } from '../components/ProviderIcon';
import { CaptureTrendChart } from '../components/library/CaptureTrendChart';
import { ProviderShareChart } from '../components/library/ProviderShareChart';

type CaptureActionResult = { message: string; detail: string };
type HistoryScope = 'all' | ProviderRecord['id'];

function KpiCard(props: { icon: ReactNode; label: string; value: number | string }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardDescription className="flex items-center gap-2 text-xs">
          <span className="text-primary">{props.icon}</span>
          {props.label}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold tabular-nums text-foreground">
          {typeof props.value === 'number' ? props.value.toLocaleString() : props.value}
        </div>
      </CardContent>
    </Card>
  );
}

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
  const enabledProviders = props.providers.filter((provider) => provider.enabled);
  const cacheDisabledProviders = enabledProviders.filter((provider) => !provider.cacheEnabled);
  const cachedCount = enabledProviders.filter((provider) => provider.cacheEnabled).length;

  const todayCount = props.sessions.filter((session) => {
    const d = new Date(session.createdAt);
    const now = new Date();
    return (
      d.getFullYear() === now.getFullYear() &&
      d.getMonth() === now.getMonth() &&
      d.getDate() === now.getDate()
    );
  }).length;

  const [providerExportTarget, setProviderExportTarget] = useState<ProviderRecord['id'] | ''>(
    props.selectedSession?.provider ?? props.activeProvider?.id ?? enabledProviders[0]?.id ?? ''
  );
  const [providerExportFormat, setProviderExportFormat] =
    useState<CaptureExportFormat>('json');
  const [providerActionBusy, setProviderActionBusy] = useState(false);
  const [refreshBusy, setRefreshBusy] = useState(false);
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
      props.selectedSession?.provider ?? props.activeProvider?.id ?? enabledProviders[0]?.id ?? '';
    setProviderExportTarget((current) =>
      current && enabledProviders.some((provider) => provider.id === current) ? current : nextTarget
    );
  }, [enabledProviders, props.activeProvider?.id, props.selectedSession?.provider]);

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
    enabledProviders.find((provider) => provider.id === providerExportTarget) ?? null;

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

  return (
    <section className="utility-page utility-page--library">
      <h1 className="visually-hidden">数据</h1>
      <div className="library-page__top">
        <div className="flex items-center gap-1 overflow-x-auto pb-1"
            aria-label="按服务筛选数据"
          >
            <button
              type="button"
              aria-label="查看全部记录"
              aria-pressed={props.historyScope === 'all'}
              disabled={providerActionBusy || refreshBusy}
              onClick={() => props.onChangeHistoryScope('all')}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium transition-colors',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1',
                'disabled:pointer-events-none disabled:opacity-50',
                props.historyScope === 'all'
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground hover:bg-accent/20 hover:text-foreground'
              )}
            >
              <LayoutGrid className="size-4" />
              全部
            </button>
            {enabledProviders.map((provider) => {
              const active = provider.id === props.historyScope;
              return (
                <button
                  key={provider.id}
                  type="button"
                  aria-label={`查看 ${provider.name} 记录`}
                  aria-pressed={active}
                  disabled={providerActionBusy || refreshBusy}
                  onClick={() => props.onChangeHistoryScope(provider.id)}
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium transition-colors',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1',
                    'disabled:pointer-events-none disabled:opacity-50',
                    active
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted text-muted-foreground hover:bg-accent/20 hover:text-foreground'
                  )}
                >
                  <ProviderIcon
                    providerId={provider.id}
                    providerName={provider.name}
                    homeUrl={provider.homeUrl}
                    className="size-4"
                  />
                  {provider.name}
                </button>
              );
            })}
          </div>
      </div>

      {cacheDisabledProviders.length > 0 ? (
        <div
          className="mx-0 rounded-2xl px-3.5 py-3 text-sm leading-relaxed text-[#5b4c38] bg-white/70 border border-amber-200/50"
          role="status"
        >
          <strong>缓存提示：</strong>
          {cacheDisabledProviders.map((provider) => provider.name).join('、')}
          已关闭后续本地缓存，历史数据仍可在这里查看。界面语言设置仅作用于 AmberKeeper 自身。
        </div>
      ) : null}

      {props.historyScope === 'all' ? (
        <div className="flex flex-col gap-6 p-2">
          {/* KPI Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <KpiCard
              icon={<MessagesSquare className="size-4" />}
              label="总会话数"
              value={props.sessions.length}
            />
            <KpiCard
              icon={<Server className="size-4" />}
              label="接入服务"
              value={enabledProviders.length}
            />
            <KpiCard
              icon={<TrendingUp className="size-4" />}
              label="今日新增"
              value={todayCount}
            />
            <KpiCard
              icon={<Database className="size-4" />}
              label="缓存服务"
              value={`${cachedCount}/${enabledProviders.length}`}
            />
          </div>

          {/* Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="lg:col-span-2">
              <CaptureTrendChart sessions={props.sessions} />
            </div>
            <ProviderShareChart sessions={props.sessions} providers={props.providers} />
          </div>

          {/* Export Panel */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">数据操作</CardTitle>
              <CardDescription>按需刷新、导出和管理您的本地 AI 对话数据</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap items-center gap-3">
                <Select
                  value={providerExportTarget}
                  onValueChange={(v) => setProviderExportTarget(v as ProviderRecord['id'])}
                  disabled={providerActionBusy || enabledProviders.length === 0}
                >
                  <SelectTrigger className="w-40" aria-label="选择要导出的服务">
                    <SelectValue placeholder="选择服务" />
                  </SelectTrigger>
                  <SelectContent>
                    {enabledProviders.map((provider) => (
                      <SelectItem key={provider.id} value={provider.id}>
                        {provider.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select
                  value={providerExportFormat}
                  onValueChange={(v) => setProviderExportFormat(v as CaptureExportFormat)}
                  disabled={!providerExportTarget || providerActionBusy}
                >
                  <SelectTrigger className="w-36" aria-label="选择导出格式">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="json">JSON 格式</SelectItem>
                    <SelectItem value="markdown">Markdown 格式</SelectItem>
                  </SelectContent>
                </Select>

                <IconButton
                  label="刷新会话"
                  disabled={refreshBusy}
                  onClick={() => void handleRefresh()}
                >
                  <RefreshCw className="size-4" />
                </IconButton>

                <Button
                  variant="outline"
                  size="sm"
                  disabled={!providerExportTarget || providerActionBusy}
                  onClick={() => void handleProviderExport()}
                  className="gap-2"
                >
                  <Download className="size-4" />
                  {exportProvider ? `导出 ${exportProvider.name} 记录` : '导出记录'}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
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
