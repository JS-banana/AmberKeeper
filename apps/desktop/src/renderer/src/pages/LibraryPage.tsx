import { useEffect, useState, type ReactNode } from 'react';
import { LayoutGrid, RefreshCw, Download, MessagesSquare, TrendingUp, Database, X } from 'lucide-react';
import type {
  CaptureExportFormat,
  CaptureExportMessageScope,
  CaptureMessageRecord,
  CaptureSessionRecord,
  ProviderRecord,
} from '@amberkeeper/shared-types';
import { cn } from '@/lib/cn';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { IconButton } from '@/components/ui/icon-button';
import { resolveSessionTitle } from '../lib/session-display';
import { ConversationList } from '../components/ConversationList';
import { ConversationMessagePane } from '../components/ConversationMessagePane';
import { ProviderIcon } from '../components/ProviderIcon';
import { CaptureTrendChart } from '../components/library/CaptureTrendChart';
import { ProviderShareChart } from '../components/library/ProviderShareChart';

type CaptureActionResult = { message: string; detail: string };
type HistoryScope = 'all' | ProviderRecord['id'];
type ExportTargetKind = 'session' | 'provider' | 'all';

const EXPORT_SCOPE_LABELS: Record<CaptureExportMessageScope, string> = {
  complete: '完整对话',
  user: '仅我的消息',
  assistant: '仅助手回复',
};

function KpiCard(props: { icon: ReactNode; label: string; value: number | string }) {
  return (
    <Card>
      <CardHeader className="space-y-1 px-4 pt-4 pb-1.5">
        <CardDescription className="flex items-center gap-2 text-[11px] leading-none">
          <span className="text-primary">{props.icon}</span>
          {props.label}
        </CardDescription>
      </CardHeader>
      <CardContent className="px-4 pb-4 pt-0">
        <div className="text-[1.4rem] font-bold leading-none tabular-nums text-foreground">
          {typeof props.value === 'number' ? props.value.toLocaleString() : props.value}
        </div>
      </CardContent>
    </Card>
  );
}

function RecentUpdateCard(props: {
  icon: ReactNode;
  label: string;
  providerId?: ProviderRecord['id'];
  providerName?: string;
  providerHomeUrl?: string;
  sessionTitle: string;
}) {
  return (
    <Card className="overflow-hidden">
      <CardHeader className="space-y-1 px-4 pt-4 pb-1.5">
        <CardDescription className="flex items-center gap-2 text-[11px] leading-none">
          <span className="text-primary">{props.icon}</span>
          {props.label}
        </CardDescription>
      </CardHeader>
      <CardContent className="px-4 pb-4 pt-0">
        <div className="flex min-h-[1.4rem] items-center gap-2.5 min-w-0">
          {props.providerId && props.providerName && props.providerHomeUrl ? (
            <ProviderIcon
              providerId={props.providerId}
              providerName={props.providerName}
              homeUrl={props.providerHomeUrl}
              variant="rail"
              className="!w-[15px] !h-[15px]"
            />
          ) : null}
          <p
            className="min-w-0 flex-1 text-[0.95rem] font-semibold leading-none text-foreground whitespace-nowrap overflow-hidden text-ellipsis"
            title={props.sessionTitle}
          >
            {props.sessionTitle}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

export function LibraryPage(props: {
  activeProvider: ProviderRecord | null;
  providers: ProviderRecord[];
  infoBanner?: string | null;
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
    format: CaptureExportFormat,
    messageScope?: CaptureExportMessageScope
  ) => Promise<CaptureActionResult>;
  onExportProviderSessions: (
    providerId: ProviderRecord['id'],
    format: CaptureExportFormat,
    messageScope?: CaptureExportMessageScope
  ) => Promise<CaptureActionResult>;
  onExportAllSessions: (
    format: CaptureExportFormat,
    messageScope?: CaptureExportMessageScope
  ) => Promise<CaptureActionResult>;
}) {
  const enabledProviders = props.providers.filter((provider) => provider.enabled);
  const cacheDisabledProviders = enabledProviders.filter((provider) => !provider.cacheEnabled);
  const cachedCount = enabledProviders.filter((provider) => provider.cacheEnabled).length;
  const totalMessageCount = props.sessions.reduce((sum, session) => sum + session.messageCount, 0);
  const now = new Date();

  const todaySessionCount = props.sessions.filter((session) => {
    const d = new Date(session.createdAt);
    return (
      d.getFullYear() === now.getFullYear() &&
      d.getMonth() === now.getMonth() &&
      d.getDate() === now.getDate()
    );
  }).length;
  const latestUpdatedSession = props.sessions.reduce<CaptureSessionRecord | null>((latest, session) => {
    const sessionTimestamp = Date.parse(session.updatedAt);
    if (Number.isNaN(sessionTimestamp)) {
      return latest;
    }

    if (!latest) {
      return session;
    }

    return sessionTimestamp > Date.parse(latest.updatedAt) ? session : latest;
  }, null);
  const latestUpdatedProvider = latestUpdatedSession
    ? props.providers.find((provider) => provider.id === latestUpdatedSession.provider) ?? null
    : null;
  const latestUpdatedProviderName = latestUpdatedProvider?.name;
  const latestUpdatedTitle = latestUpdatedSession
    ? resolveSessionTitle(latestUpdatedSession)
    : '等待首次本地采集';
  const [providerExportTarget, setProviderExportTarget] = useState<ProviderRecord['id'] | ''>(
    props.selectedSession?.provider ?? props.activeProvider?.id ?? enabledProviders[0]?.id ?? ''
  );
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const [exportTargetKind, setExportTargetKind] = useState<ExportTargetKind>('all');
  const [exportFormat, setExportFormat] = useState<CaptureExportFormat>('markdown');
  const [exportMessageScope, setExportMessageScope] =
    useState<CaptureExportMessageScope>('complete');
  const [exportBusy, setExportBusy] = useState(false);
  const [exportFeedback, setExportFeedback] = useState<string | null>(null);
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
  const exportSession = props.selectedSession;
  const canExportCurrentSession = Boolean(exportSession);
  const canExportProvider = Boolean(exportProvider);

  function openExportDialog(targetKind: ExportTargetKind) {
    setExportTargetKind(targetKind);
    setExportFeedback(null);
    setExportDialogOpen(true);
  }

  async function handleExport() {
    setExportBusy(true);
    try {
      const result =
        exportTargetKind === 'session'
          ? exportSession
            ? await props.onExportSession(exportSession.id, exportFormat, exportMessageScope)
            : null
          : exportTargetKind === 'provider'
            ? exportProvider
              ? await props.onExportProviderSessions(exportProvider.id, exportFormat, exportMessageScope)
              : null
            : await props.onExportAllSessions(exportFormat, exportMessageScope);

      if (result) {
        setExportFeedback(result.detail || result.message);
      }
    } catch (error) {
      setExportFeedback(error instanceof Error ? error.message : String(error));
    } finally {
      setExportBusy(false);
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
    <section className={props.historyScope === 'all'
      ? 'flex flex-col gap-5'
      : 'grid grid-rows-[auto_minmax(0,1fr)] gap-5 h-full overflow-hidden'
    }>
      <h1 className="sr-only">数据</h1>
      <div className="sticky top-0 z-[3] flex items-center justify-between gap-3 px-3 pt-2 pb-3 bg-white/85 backdrop-blur-[18px] border-b border-[rgba(153,127,76,0.08)] -mx-4 -mt-6 mb-3">
        <div className="flex min-w-0 items-center gap-1 overflow-x-auto pb-1"
            aria-label="按服务筛选数据"
          >
            <button
              type="button"
              aria-label="查看全部记录"
              aria-pressed={props.historyScope === 'all'}
              disabled={exportBusy || refreshBusy}
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
                  disabled={exportBusy || refreshBusy}
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
                    variant="rail"
                    className="!w-4 !h-4"
                  />
                  {provider.name}
                </button>
              );
            })}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <IconButton
            label="刷新会话"
            disabled={refreshBusy}
            onClick={() => void handleRefresh()}
          >
            <RefreshCw className="size-4" />
          </IconButton>
          <Button
            type="button"
            size="sm"
            className="gap-2"
            disabled={exportBusy || props.sessions.length === 0}
            onClick={() => openExportDialog(props.historyScope === 'all' ? 'all' : 'provider')}
          >
            <Download className="size-4" />
            导出
          </Button>
        </div>
      </div>

      {cacheDisabledProviders.length > 0 ? (
        <div
          className="mx-0 rounded-2xl px-3.5 py-3 text-sm leading-relaxed text-[#5b4c38] bg-white/70 border border-amber-200/50"
          role="status"
        >
          <strong>缓存提示：</strong>
          {cacheDisabledProviders.map((provider) => provider.name).join('、')}
          已关闭后续本地缓存，历史数据仍可在这里查看。
        </div>
      ) : null}

      {props.infoBanner ? (
        <div
          className="mx-0 rounded-2xl px-3.5 py-3 text-sm leading-relaxed text-[#30445f] bg-slate-50 border border-slate-200"
          role="status"
        >
          {props.infoBanner}
        </div>
      ) : null}

      {props.historyScope === 'all' ? (
        <div className="flex flex-col gap-6 p-2">
          {/* KPI Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <KpiCard
              icon={<MessagesSquare className="size-4" />}
              label="总消息数"
              value={totalMessageCount}
            />
            <KpiCard
              icon={<Database className="size-4" />}
              label="总会话数"
              value={props.sessions.length}
            />
            <KpiCard
              icon={<TrendingUp className="size-4" />}
              label="今日会话"
              value={todaySessionCount}
            />
            <RecentUpdateCard
              icon={<RefreshCw className="size-4" />}
              label="最近更新"
              providerId={latestUpdatedProvider?.id}
              providerName={latestUpdatedProviderName}
              providerHomeUrl={latestUpdatedProvider?.homeUrl}
              sessionTitle={latestUpdatedTitle}
            />
          </div>

          {/* Charts */}
          <div className="flex flex-col gap-4">
            <CaptureTrendChart sessions={props.sessions} />
            <ProviderShareChart sessions={props.sessions} providers={props.providers} />
          </div>

        </div>
      ) : (
        <div className="grid grid-cols-[minmax(220px,320px)_minmax(0,1fr)] gap-3 items-stretch flex-1 min-h-0 overflow-hidden">
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
            onExportSession={() => openExportDialog('session')}
          />
        </div>
      )}
      {exportDialogOpen ? (
        <ExportDialog
          targetKind={exportTargetKind}
          onChangeTargetKind={setExportTargetKind}
          selectedSession={exportSession}
          providerExportTarget={providerExportTarget}
          onChangeProviderExportTarget={setProviderExportTarget}
          exportProvider={exportProvider}
          providers={enabledProviders}
          format={exportFormat}
          onChangeFormat={setExportFormat}
          messageScope={exportMessageScope}
          onChangeMessageScope={setExportMessageScope}
          busy={exportBusy}
          feedback={exportFeedback}
          canExportCurrentSession={canExportCurrentSession}
          canExportProvider={canExportProvider}
          onClose={() => setExportDialogOpen(false)}
          onExport={() => void handleExport()}
        />
      ) : null}
    </section>
  );
}

function ExportDialog(props: {
  targetKind: ExportTargetKind;
  onChangeTargetKind: (targetKind: ExportTargetKind) => void;
  selectedSession: CaptureSessionRecord | null;
  providerExportTarget: ProviderRecord['id'] | '';
  onChangeProviderExportTarget: (providerId: ProviderRecord['id']) => void;
  exportProvider: ProviderRecord | null;
  providers: ProviderRecord[];
  format: CaptureExportFormat;
  onChangeFormat: (format: CaptureExportFormat) => void;
  messageScope: CaptureExportMessageScope;
  onChangeMessageScope: (messageScope: CaptureExportMessageScope) => void;
  busy: boolean;
  feedback: string | null;
  canExportCurrentSession: boolean;
  canExportProvider: boolean;
  onClose: () => void;
  onExport: () => void;
}) {
  const canExport =
    props.targetKind === 'session'
      ? props.canExportCurrentSession
      : props.targetKind === 'provider'
        ? props.canExportProvider
        : true;
  const targetLabel =
    props.targetKind === 'session'
      ? props.selectedSession
        ? resolveSessionTitle(props.selectedSession)
        : '未选择记录'
      : props.targetKind === 'provider'
        ? props.exportProvider?.name ?? '未选择服务'
        : '全部记录';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/25 p-4" role="presentation">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="export-dialog-title"
        className="w-full max-w-[520px] rounded-lg border border-border bg-white shadow-2xl"
      >
        <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
          <div className="min-w-0">
            <h2 id="export-dialog-title" className="m-0 text-base font-semibold text-foreground">
              导出记录
            </h2>
            <p className="mt-1 truncate text-xs text-muted-foreground">
              {targetLabel}
            </p>
          </div>
          <IconButton label="关闭导出面板" onClick={props.onClose} disabled={props.busy}>
            <X className="size-4" />
          </IconButton>
        </div>

        <div className="grid gap-4 px-4 py-4">
          <label className="grid gap-1.5 text-sm font-medium text-foreground">
            导出对象
            <Select
              value={props.targetKind}
              onValueChange={(value) => props.onChangeTargetKind(value as ExportTargetKind)}
              disabled={props.busy}
            >
              <SelectTrigger aria-label="选择导出对象">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="session" disabled={!props.canExportCurrentSession}>
                  当前记录
                </SelectItem>
                <SelectItem value="provider" disabled={props.providers.length === 0}>
                  当前服务
                </SelectItem>
                <SelectItem value="all">全部记录</SelectItem>
              </SelectContent>
            </Select>
          </label>

          {props.targetKind === 'provider' ? (
            <label className="grid gap-1.5 text-sm font-medium text-foreground">
              服务
              <Select
                value={props.providerExportTarget}
                onValueChange={(value) => props.onChangeProviderExportTarget(value as ProviderRecord['id'])}
                disabled={props.busy || props.providers.length === 0}
              >
                <SelectTrigger aria-label="选择导出的服务">
                  <SelectValue placeholder="选择服务" />
                </SelectTrigger>
                <SelectContent>
                  {props.providers.map((provider) => (
                    <SelectItem key={provider.id} value={provider.id}>
                      {provider.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>
          ) : null}

          <label className="grid gap-1.5 text-sm font-medium text-foreground">
            导出范围
            <Select
              value={props.messageScope}
              onValueChange={(value) => props.onChangeMessageScope(value as CaptureExportMessageScope)}
              disabled={props.busy}
            >
              <SelectTrigger aria-label="选择导出范围">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(EXPORT_SCOPE_LABELS).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>

          <label className="grid gap-1.5 text-sm font-medium text-foreground">
            格式
            <Select
              value={props.format}
              onValueChange={(value) => props.onChangeFormat(value as CaptureExportFormat)}
              disabled={props.busy}
            >
              <SelectTrigger aria-label="选择导出格式">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="markdown">Markdown 格式</SelectItem>
                <SelectItem value="json">JSON 格式</SelectItem>
              </SelectContent>
            </Select>
          </label>

          <p className="m-0 text-xs leading-relaxed text-muted-foreground">
            导出只包含本地已经保存的消息。若某个 provider 尚未成功采集助手回复，完整对话也不会凭空补出回复内容。
          </p>

          {props.feedback ? (
            <p className="m-0 rounded-md border border-border bg-muted/40 px-3 py-2 text-sm text-foreground" aria-live="polite">
              {props.feedback}
            </p>
          ) : null}
        </div>

        <div className="flex justify-end gap-2 border-t border-border px-4 py-3">
          <Button type="button" variant="ghost" onClick={props.onClose} disabled={props.busy}>
            取消
          </Button>
          <Button type="button" className="gap-2" onClick={props.onExport} disabled={props.busy || !canExport}>
            <Download className="size-4" />
            {props.busy ? '导出中...' : '导出'}
          </Button>
        </div>
      </section>
    </div>
  );
}
