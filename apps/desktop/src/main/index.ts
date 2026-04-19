import {
  createCaptureOrchestrator,
  createTurnPersistenceService,
  type CompletedTurn,
  type ProviderSignal,
  type RuntimeSignal,
} from '@amberkeeper/capture-core';
import type {
  CaptureEnvelope,
  CaptureExportArtifact,
  CaptureExportFormat,
  CaptureSessionRecord,
  InterfaceLanguage,
  ProviderId,
  ProviderMoveDirection,
  ProviderRecord,
  RuntimeStatus,
  ServiceMoveDirection,
  ServiceRecord,
  ShellInfo,
} from '@amberkeeper/shared-types';
import { app, BrowserWindow, dialog, nativeTheme } from 'electron';
nativeTheme.themeSource = 'light';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { registerAppLifecycle } from './bootstrap/app';
import { createCaptureSessionService } from './capture/capture-session-service';
import { createHistoryDomHydrationService } from './capture/history-dom-hydration-service';
import { createHistoryEnvelopeBuilderService } from './capture/history-envelope-builder-service';
import { createHistoryCapturePersistenceService } from './capture/history-capture-persistence-service';
import { createHistorySessionOpenService } from './capture/history-session-open-service';
import { createNetworkResponseIngestionService } from './capture/network-response-ingestion-service';
import { createRequestIngestionService } from './capture/request-ingestion-service';
import { createDiagnosticsService } from './diagnostics/diagnostics-service';
import { createLiveProbeService } from './diagnostics/live-probe-service';
import { registerCaptureIpc } from './ipc/capture-ipc';
import {
  applyInterfaceLanguageToWebContents,
  buildCustomBrowserSessionConfig,
  createBrowserSessionRuntime,
  createBrowserSessionRuntimeWithConfig,
  resolveEffectiveInterfaceLocale,
  resolveLocalePreferenceChain,
  resolveBrowserSessionConfig,
  type BrowserSessionProviderId,
  type BrowserSessionRuntime,
} from './runtime/browser-session';
import { getProviderAdapter, getProviderLiveAutomationSpec } from './runtime/provider-adapters';
import { createCdpObserver } from './runtime/cdp-observer';
import {
  buildGeminiThemeDiagnosticConfig,
  buildGeminiThemeProbeScript,
} from './runtime/gemini-theme-diagnostics';
import {
  createOldSessionAutoCacheKey,
  resolveDiscoveryAutoCacheCandidate,
} from './runtime/old-session-auto-cache';
import { discoverSiteIcon } from './runtime/site-icon-discovery';
import { createProviderRuntimeRegistry } from './runtime/provider-runtime-registry';
import { createServiceRuntimeRegistry } from './runtime/service-runtime-registry';
import {
  getActiveShellRuntime,
  isProviderRuntime,
  listResolvedShellRuntimes,
  syncCustomServiceRuntimes,
  syncShellStageController,
} from './runtime/shell-runtime-coordination';
import { CaptureStore } from './storage/capture-store';
import { createAppSettingsRepository } from './storage/app-settings-repository';
import { createShellSettingsService } from './storage/shell-settings-service';
import { createMainWindow, createProviderStageController } from './windows/main-window';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PANEL_WIDTH = 66;
const DOM_CAPTURE_POLL_INTERVAL_MS = 400;
const DOM_CAPTURE_POLL_ATTEMPTS = 24;
const DEV_APP_ICON_PATH = path.resolve(__dirname, '../../build/icons/icon.png');

type TrackedRequest = {
  provider: ProviderId;
  sourceSessionKey: string;
  url: string;
  method: string;
  postData?: string;
  pageUrl: string;
  capturedAt: string;
  resourceType: string;
  classification: 'capture' | 'discover';
};

type ShellRuntimeContext = {
  serviceId: string;
  providerId: ProviderId | null;
  homeUrl: string;
  view: BrowserSessionRuntime['view'];
  loadInitialUrl: () => Promise<void>;
  loadUrl: (url: string) => Promise<void>;
  evaluateJavaScript: <T = unknown>(code: string, userGesture?: boolean) => Promise<T>;
  runDomSnapshot: () => Promise<{ message: string; detail: string }>;
  readStructuredDomSnapshot: (
    fallbackUrl: string
  ) => Promise<{ url: string; title: string; messages: Array<{ role?: string; content?: string }> }>;
  browserSession: BrowserSessionRuntime;
  cdpObserver: ReturnType<typeof createCdpObserver> | null;
  currentUrl: string;
};

type ProviderRuntimeContext = ShellRuntimeContext & {
  providerId: BrowserSessionProviderId;
};

type CustomServiceRuntimeContext = ShellRuntimeContext & {
  providerId: null;
};

let mainWindow: BrowserWindow | null = null;
let stageController: ReturnType<typeof createProviderStageController> | null = null;
let browserSession: BrowserSessionRuntime | null = null;
let cdpObserver: ReturnType<typeof createCdpObserver> | null = null;
let runtimeRegistry: ReturnType<typeof createProviderRuntimeRegistry<ProviderRuntimeContext>> | null =
  null;
let customRuntimeRegistry: ReturnType<typeof createServiceRuntimeRegistry<CustomServiceRuntimeContext>> | null =
  null;
let captureStore: CaptureStore | null = null;
let appSettingsRepo: ReturnType<typeof createAppSettingsRepository> | null = null;
let shellSettingsService: ReturnType<typeof createShellSettingsService> | null = null;
let captureSessionService: ReturnType<typeof createCaptureSessionService> | null = null;
let historyDomHydrationService: ReturnType<typeof createHistoryDomHydrationService<ProviderRuntimeContext>> | null = null;
let historyEnvelopeBuilderService: ReturnType<typeof createHistoryEnvelopeBuilderService> | null = null;
let historyCapturePersistenceService: ReturnType<typeof createHistoryCapturePersistenceService> | null = null;
let historySessionOpenService: ReturnType<typeof createHistorySessionOpenService> | null = null;
let networkResponseIngestionService: ReturnType<typeof createNetworkResponseIngestionService> | null = null;
let requestIngestionService: ReturnType<typeof createRequestIngestionService> | null = null;
let diagnosticsService: ReturnType<typeof createDiagnosticsService> | null = null;
let liveProbeService: ReturnType<typeof createLiveProbeService> | null = null;
let captureOrchestrator: ReturnType<typeof createCaptureOrchestrator> | null = null;
let turnPersistenceService: ReturnType<typeof createTurnPersistenceService> | null = null;
let activeProviderId: ProviderId | null = null;
let selectedProviderId: ProviderId | null = null;
let activeServiceId: string | null = null;
let currentUrl = '';
let lastCaptureAt: string | null = null;
let domCaptureInFlight = false;
let nativeStageVisible = true;
const providerPageTitles = new Map<ProviderId, string>();

const trackedRequests = new Map<string, TrackedRequest>();
const oldSessionAutoCacheInFlight = new Map<string, Promise<{ message: string; detail: string }>>();
const seenObservationKeys: string[] = [];
const seenObservationKeySet = new Set<string>();

function createDesktopWindow(): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    return;
  }

  mainWindow = createMainWindow({
    rendererPreloadPath: path.join(__dirname, '../preload/renderer.cjs'),
    rendererHtmlPath: path.join(__dirname, '../renderer/index.html'),
    appIconPath: resolveAppIconPath(),
  });
  stageController = createProviderStageController(mainWindow, PANEL_WIDTH);

  mainWindow.on('closed', () => {
    disposeAllShellRuntimes();
    mainWindow = null;
    stageController = null;
    browserSession = null;
    cdpObserver = null;
    runtimeRegistry = null;
    customRuntimeRegistry = null;
    activeProviderId = null;
    selectedProviderId = null;
    activeServiceId = null;
    currentUrl = getPersistedActiveServiceLaunchUrl();
    domCaptureInFlight = false;
    nativeStageVisible = true;
    trackedRequests.clear();
    oldSessionAutoCacheInFlight.clear();
  });

  runtimeRegistry = createProviderRuntimeRegistry({
    providers: captureStore?.listProviders() ?? [],
    activeProviderId: captureStore?.getActiveProvider()?.id ?? null,
    createRuntime(provider) {
      return createProviderRuntime(provider);
    },
    onStateChanged({ runtimes, activeProviderId: nextActiveProviderId }) {
      activeProviderId = nextActiveProviderId;
      const activeRuntime = getActiveShellRuntime({
        activeServiceId,
        activeProviderId,
        runtimeRegistry,
        customRuntimeRegistry,
      }) as ShellRuntimeContext | null;

      if (isProviderRuntime(activeRuntime)) {
        void attachObserver(activeRuntime);
      }

      syncStageController();
    },
  });
  customRuntimeRegistry = createServiceRuntimeRegistry({
    services: (captureStore?.listServices() ?? []).filter((service) => service.kind === 'custom'),
    activeServiceId: null,
    createRuntime(service) {
      return createCustomServiceRuntime(service);
    },
    disposeRuntime(runtime) {
      disposeShellRuntime(runtime);
    },
    onStateChanged() {
      syncStageController();
    },
  });

  syncRuntimeRegistryFromStore();
}

function createProviderRuntime(provider: ProviderRecord): ProviderRuntimeContext {
  const config = resolveBrowserSessionConfig(provider.id);
  const providerAdapter = getProviderAdapter(provider.id);
  const runtime = {} as ProviderRuntimeContext;
  const browserSessionRuntime = createBrowserSessionRuntime({
    providerId: provider.id,
    chatPreloadPath: path.join(__dirname, '../preload/chat.cjs'),
    interfaceLanguage: getConfiguredInterfaceLanguage(),
    systemLocale: getConfiguredSystemLocale(),
    onUrlChanged(url) {
      runtime.currentUrl = url;

      if (activeServiceId === provider.id) {
        currentUrl = url;
        publishRuntimeStatus();
        void maybeAutoCacheRemoteConversation(provider.id, url);
      }
    },
  });

  const observer = providerAdapter
    ? createCdpObserver({
          debuggerTarget: browserSessionRuntime.view.webContents.debugger,
          provider: provider.id,
          sourceSessionKey: config.sourceSessionKey,
          getCurrentUrl: () => runtime.currentUrl,
          onSignal(signal) {
            void handleRuntimeSignal(signal);
          },
        })
    : null;

  runtime.providerId = provider.id;
  runtime.serviceId = provider.id;
  runtime.homeUrl = config.homeUrl;
  runtime.view = browserSessionRuntime.view;
  runtime.loadInitialUrl = browserSessionRuntime.loadInitialUrl;
  runtime.loadUrl = browserSessionRuntime.loadUrl;
  runtime.evaluateJavaScript = browserSessionRuntime.executeJavaScript;
  runtime.runDomSnapshot = browserSessionRuntime.runDomSnapshot;
  runtime.readStructuredDomSnapshot = browserSessionRuntime.readStructuredDomSnapshot;
  runtime.browserSession = browserSessionRuntime;
  runtime.cdpObserver = observer;
  runtime.currentUrl = config.homeUrl;

  return runtime;
}

function createCustomServiceRuntime(service: ServiceRecord): CustomServiceRuntimeContext {
  const config = buildCustomBrowserSessionConfig({
    id: service.id,
    name: service.name,
    launchUrl: service.launchUrl,
  });
  const runtime = {} as CustomServiceRuntimeContext;
  const browserSessionRuntime = createBrowserSessionRuntimeWithConfig({
    config,
    chatPreloadPath: path.join(__dirname, '../preload/chat.cjs'),
    interfaceLanguage: getConfiguredInterfaceLanguage(),
    systemLocale: getConfiguredSystemLocale(),
    onUrlChanged(url) {
      runtime.currentUrl = url;

      if (activeServiceId === service.id) {
        currentUrl = url;
        publishRuntimeStatus();
      }
    },
  });

  runtime.serviceId = service.id;
  runtime.providerId = null;
  runtime.homeUrl = config.homeUrl;
  runtime.view = browserSessionRuntime.view;
  runtime.loadInitialUrl = browserSessionRuntime.loadInitialUrl;
  runtime.loadUrl = browserSessionRuntime.loadUrl;
  runtime.evaluateJavaScript = browserSessionRuntime.executeJavaScript;
  runtime.runDomSnapshot = browserSessionRuntime.runDomSnapshot;
  runtime.readStructuredDomSnapshot = browserSessionRuntime.readStructuredDomSnapshot;
  runtime.browserSession = browserSessionRuntime;
  runtime.cdpObserver = null;
  runtime.currentUrl = config.homeUrl;

  return runtime;
}

function disposeShellRuntime(runtime: ShellRuntimeContext): void {
  stageController?.detach(runtime.view);
  runtime.browserSession.dispose();
}

function disposeAllShellRuntimes(): void {
  for (const runtime of runtimeRegistry?.listResolvedRuntimes() ?? []) {
    disposeShellRuntime(runtime);
  }

  for (const runtime of customRuntimeRegistry?.listResolvedRuntimes() ?? []) {
    disposeShellRuntime(runtime);
  }
}

async function attachObserver(runtime: ProviderRuntimeContext): Promise<void> {
  if (!runtime.cdpObserver || runtime.cdpObserver.isAttached()) {
    return;
  }

  try {
    await runtime.cdpObserver.attach();
    recordAttempt({
      source: 'runtime',
      stage: 'debugger',
      status: 'info',
      message: `Attached Chrome DevTools Protocol debugger for ${runtime.providerId}.`,
      createdAt: new Date().toISOString(),
    });
  } catch (error) {
    recordAttempt({
      source: 'runtime',
      stage: 'debugger',
      status: 'error',
      message: `Failed to attach Chrome DevTools Protocol debugger for ${runtime.providerId}.`,
      detail: formatError(error),
      createdAt: new Date().toISOString(),
    });
  }

  publishRuntimeStatus();
}

async function handleRuntimeSignal(signal: RuntimeSignal): Promise<void> {
  if (signal.kind === 'pageContextChanged') {
    return;
  }

  if (signal.provider !== activeProviderId) {
    return;
  }

  const adapter = getProviderAdapter(signal.provider);
  if (!adapter) {
    return;
  }

  if (signal.kind === 'requestSeen') {
    const tracked = requestIngestionService?.handleRequestSeen({
      signal,
      adapter,
    });
    if (!tracked) {
      return;
    }
    trackedRequests.set(getTrackedRequestKey(signal.provider, signal.requestId), tracked);

    publishRuntimeStatus();
    return;
  }

  if (signal.kind === 'responseMetaSeen') {
    const tracked = trackedRequests.get(getTrackedRequestKey(signal.provider, signal.requestId));
    if (!tracked) {
      return;
    }
    requestIngestionService?.handleResponseMetaSeen({
      signal,
      tracked,
      adapter,
    });

    return;
  }

  if (signal.kind === 'websocketSeen') {
    requestIngestionService?.handleWebsocketSeen({
      signal,
      adapter,
    });
    return;
  }

  if (signal.kind === 'responseBodyFailed') {
    const tracked = trackedRequests.get(getTrackedRequestKey(signal.provider, signal.requestId));
    trackedRequests.delete(getTrackedRequestKey(signal.provider, signal.requestId));
    networkResponseIngestionService?.handleResponseBodyFailed({
      tracked: tracked ?? null,
      signal,
    });
    publishRuntimeStatus();
    return;
  }

  if (signal.kind !== 'responseBodySeen') {
    return;
  }

  const tracked = trackedRequests.get(getTrackedRequestKey(signal.provider, signal.requestId));
  if (!tracked) {
    return;
  }

  trackedRequests.delete(getTrackedRequestKey(signal.provider, signal.requestId));
  await networkResponseIngestionService?.handleResponseBodySeen({
    tracked,
    signal,
    adapter,
  });

  publishRuntimeStatus();
}

function emitProviderSignals(signals: ProviderSignal[]): void {
  if (!captureOrchestrator) {
    return;
  }

  signals.forEach((signal) => {
    captureOrchestrator?.consume(signal);
  });
}

async function captureConversationFromDom(pageUrl: string): Promise<void> {
  const activeRuntime = getActiveRuntimeWithAdapter();
  if (!activeRuntime || domCaptureInFlight) {
    return;
  }

  domCaptureInFlight = true;
  const triggerUrl = activeRuntime.currentUrl;
  const adapter = activeRuntime.adapter;
  let previousAssistantContent: string | null = null;

  try {
    for (let attempt = 0; attempt < DOM_CAPTURE_POLL_ATTEMPTS; attempt += 1) {
      const snapshot = await activeRuntime.browserSession.readStructuredDomSnapshot(activeRuntime.currentUrl);
      const conversationId =
        adapter.extractConversationIdFromUrl(snapshot.url) ??
        adapter.extractConversationIdFromUrl(activeRuntime.currentUrl) ??
        adapter.extractConversationIdFromUrl(pageUrl) ??
        undefined;
      const capturedAt = new Date().toISOString();
      const interpreted = adapter.interpretDomSnapshot({
        pageUrl: snapshot.url || pageUrl,
        capturedAt,
        sourceSessionKey: activeRuntime.browserSession.config.sourceSessionKey,
        conversationId,
        messages: snapshot.messages,
        previousAssistantContent,
      });

      if (interpreted.signals.length > 0) {
        emitProviderSignals(interpreted.signals);
      }

      if (interpreted.signals.length > 0 && interpreted.stable) {
        recordAttempt({
          source: 'preload-dom',
          stage: 'dom-auto-capture',
          status: 'captured',
          message: 'Captured stabilized DOM message(s) after network trigger.',
          detail: `${snapshot.url || pageUrl}\ntrigger=${triggerUrl}`,
          createdAt: capturedAt,
        });
        return;
      }

      previousAssistantContent = interpreted.latestAssistantContent;
      await wait(DOM_CAPTURE_POLL_INTERVAL_MS);
    }

    recordAttempt({
      source: 'preload-dom',
      stage: 'dom-auto-capture',
      status: 'info',
      message: 'Network trigger observed but DOM capture never reached a stable assistant turn.',
      detail: `${pageUrl}\ntrigger=${triggerUrl}`,
      createdAt: new Date().toISOString(),
    });
  } finally {
    domCaptureInFlight = false;
  }
}

function persistTurn(turn: CompletedTurn): void {
  const title = resolveActiveRuntimeTitle(turn.provider);
  captureStore?.persistTurn({
    ...turn,
    title: title ?? turn.title,
    titleSource: title ? 'provider' : turn.titleSource,
  });
  lastCaptureAt = turn.capturedAt;
  recordAttempt({
    source: turn.source,
    stage: 'capture',
    status: 'captured',
    message: `Persisted ${turn.messages.length} message(s).`,
    detail: turn.conversationId ?? turn.pageUrl,
    createdAt: turn.capturedAt,
  });
}

function resolveActiveRuntimeTitle(providerId: ProviderId): string | null {
  const knownTitle = providerPageTitles.get(providerId)?.trim();
  if (knownTitle) {
    return knownTitle;
  }

  const runtime = runtimeRegistry?.getActiveRuntime() ?? null;

  if (!runtime || runtime.providerId !== providerId) {
    return null;
  }

  const title = runtime.view.webContents.getTitle().trim();
  return title || null;
}

async function openSession(sessionId: string): Promise<{ message: string; detail: string }> {
  return (
    historySessionOpenService?.openSession(sessionId) ?? {
      message: 'Capture store is not ready yet.',
      detail: '',
    }
  );
}

function maybeAutoCacheRemoteConversation(providerId: ProviderId, targetUrl: string): void {
  const adapter = getProviderAdapter(providerId);
  if (!adapter || !captureStore) {
    return;
  }

  const remoteConversationId = adapter.extractConversationIdFromUrl(targetUrl)?.trim();
  if (!remoteConversationId) {
    return;
  }

  const runtime = runtimeRegistry?.getActiveRuntime() ?? null;
  if (!runtime || runtime.providerId !== providerId) {
    return;
  }

  void captureConversationHistoryFromDom({
    providerId,
    runtime,
    targetUrl,
    preferredConversationId: remoteConversationId,
    existingSessionId: captureStore.findSessionByRemoteConversation(providerId, remoteConversationId)?.id ?? null,
    stage: 'history-auto-cache',
    emptyMessage: 'No DOM history was available for the selected remote conversation.',
  });
}

function maybeAutoCacheDiscoveredConversation(input: {
  classification: 'capture' | 'discover' | 'ignore';
  providerId: ProviderId;
  remoteConversationId: string | null;
  pageUrl: string;
}): void {
  const runtime = runtimeRegistry?.getActiveRuntime() ?? null;
  const candidate = resolveDiscoveryAutoCacheCandidate({
    classification: input.classification,
    activeProviderId,
    runtimeProviderId: runtime?.providerId ?? null,
    signalProviderId: input.providerId,
    remoteConversationId: input.remoteConversationId,
    pageUrl: input.pageUrl,
  });
  if (!candidate || !captureStore || !runtime) {
    return;
  }

  void captureConversationHistoryFromDom({
    providerId: candidate.providerId,
    runtime,
    targetUrl: candidate.targetUrl,
    preferredConversationId: candidate.remoteConversationId,
    existingSessionId:
      captureStore.findSessionByRemoteConversation(
        candidate.providerId,
        candidate.remoteConversationId
      )?.id ?? null,
    stage: 'history-auto-cache',
    emptyMessage: 'No DOM history was available for the discovered remote conversation.',
  });
}

function captureConversationHistoryFromDom(input: {
  providerId: ProviderId;
  runtime: ProviderRuntimeContext;
  targetUrl: string;
  preferredConversationId?: string | null;
  existingSessionId?: string | null;
  stage: 'history-hydration' | 'history-auto-cache';
  emptyMessage: string;
}): Promise<{ message: string; detail: string }> {
  const adapter = getProviderAdapter(input.providerId);
  const conversationKey =
    input.preferredConversationId?.trim() ??
    adapter?.extractConversationIdFromUrl(input.targetUrl) ??
    input.targetUrl;
  const key = createOldSessionAutoCacheKey(
    input.providerId,
    conversationKey
  );
  const inFlight = oldSessionAutoCacheInFlight.get(key);
  if (inFlight) {
    return inFlight;
  }

  const next = runConversationHistoryCaptureFromDom(input).finally(() => {
    oldSessionAutoCacheInFlight.delete(key);
  });
  oldSessionAutoCacheInFlight.set(key, next);

  return next;
}

async function runConversationHistoryCaptureFromDom(input: {
  providerId: ProviderId;
  runtime: ProviderRuntimeContext;
  targetUrl: string;
  preferredConversationId?: string | null;
  existingSessionId?: string | null;
  stage: 'history-hydration' | 'history-auto-cache';
  emptyMessage: string;
}): Promise<{ message: string; detail: string }> {
  return (
    historyDomHydrationService?.runConversationHistoryCaptureFromDom(input) ?? {
      message: input.emptyMessage,
      detail: input.targetUrl,
    }
  );
}

async function hydrateSessionHistory(
  session: CaptureSessionRecord,
  runtime: ProviderRuntimeContext,
  targetUrl: string
): Promise<{ message: string; detail: string }> {
  return captureConversationHistoryFromDom({
    providerId: session.provider,
    runtime,
    targetUrl,
    preferredConversationId: session.remoteConversationId,
    existingSessionId: session.id,
    stage: 'history-hydration',
    emptyMessage: 'No DOM history was available for the selected session.',
  });
}

async function collectDeepSeekHistoryFetchDiagnostics(
  runtime: ProviderRuntimeContext,
  remoteConversationId: string | null
): Promise<string | null> {
  return (
    historyDomHydrationService?.collectDeepSeekHistoryFetchDiagnostics(
      runtime,
      remoteConversationId
    ) ?? null
  );
}

function publishRuntimeStatus(): void {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return;
  }

  mainWindow.webContents.send('capture:runtime-status', diagnosticsService?.getRuntimeStatus() ?? {
    debuggerAttached: cdpObserver?.isAttached() ?? false,
    currentUrl,
    lastCaptureAt,
    pendingRequestCount: trackedRequests.size,
    recentAttempts: captureStore?.listAttemptLogs(8) ?? [],
  });
}

function createHydrationSignature(messages: Array<{ role?: string; content?: string }>): string {
  if (messages.length === 0) {
    return 'empty';
  }

  return JSON.stringify({
    count: messages.length,
    tail: messages.slice(-4).map((message) => ({
      role: message.role ?? '',
      content: message.content?.slice(0, 120) ?? '',
    })),
  });
}

function syncRuntimeRegistryFromStore(): void {
  const providers = captureStore?.listProviders() ?? [];
  const services = captureStore?.listServices() ?? [];
  const persistedActiveProvider = captureStore?.getActiveProvider() ?? null;
  const persistedActiveService = captureStore?.getActiveService() ?? null;

  selectedProviderId = persistedActiveProvider?.id ?? null;
  activeServiceId = persistedActiveService?.id ?? null;
  activeProviderId = persistedActiveService?.providerId ?? null;
  currentUrl = persistedActiveService?.launchUrl ?? persistedActiveProvider?.homeUrl ?? '';

  syncCustomServiceRuntimes({
    services,
    activeServiceId,
    customRuntimeRegistry,
  });
  runtimeRegistry?.syncProviders(providers, activeProviderId);
  syncStageController();
}

function getShellInfo(): ShellInfo {
  return {
    diagnosticsEnabled: !app.isPackaged || process.env.AMBERKEEPER_ENABLE_DIAGNOSTICS === '1',
    isPackaged: app.isPackaged,
    appVersion: app.getVersion(),
    interfaceLanguage: getConfiguredInterfaceLanguage(),
  };
}

function getConfiguredInterfaceLanguage(): InterfaceLanguage {
  return appSettingsRepo?.getInterfaceLanguage() ?? 'system';
}

function getConfiguredSystemLocale(): string {
  return app.getPreferredSystemLanguages()[0] ?? app.getLocale();
}

function getInterfaceLocaleConfig(): { locale: string; languages: string[] } {
  const interfaceLanguage = getConfiguredInterfaceLanguage();
  const systemLocale = getConfiguredSystemLocale();

  return {
    locale: resolveEffectiveInterfaceLocale(interfaceLanguage, systemLocale),
    languages: resolveLocalePreferenceChain(interfaceLanguage, systemLocale),
  };
}

function applyConfiguredInterfaceLanguageToResolvedRuntimes(): void {
  const interfaceLanguage = getConfiguredInterfaceLanguage();
  const systemLocale = getConfiguredSystemLocale();

  for (const runtime of listResolvedShellRuntimes({
    runtimeRegistry,
    customRuntimeRegistry,
  }) as ShellRuntimeContext[]) {
    applyInterfaceLanguageToWebContents(
      runtime.view.webContents,
      interfaceLanguage,
      systemLocale
    );
  }
}

async function reloadActiveRuntimeAfterLanguageChange(): Promise<void> {
  const activeRuntime = getActiveShellRuntime({
    activeServiceId,
    activeProviderId,
    runtimeRegistry,
    customRuntimeRegistry,
  }) as ShellRuntimeContext | null;

  if (!activeRuntime) {
    return;
  }

  const targetUrl = activeRuntime.currentUrl || activeRuntime.homeUrl;
  await activeRuntime.loadUrl(targetUrl);
}

function setNativeStageVisible(visible: boolean): void {
  nativeStageVisible = visible;
  syncStageController();
}

async function saveExportArtifact(artifact: CaptureExportArtifact): Promise<string> {
  const options = {
    defaultPath: path.join(app.getPath('downloads'), artifact.fileName),
    filters: [
      artifact.format === 'json'
        ? { name: 'JSON', extensions: ['json'] }
        : { name: 'Markdown', extensions: ['md'] },
    ],
  };
  const target = mainWindow
    ? await dialog.showSaveDialog(mainWindow, options)
    : await dialog.showSaveDialog(options);

  if (target.canceled || !target.filePath) {
    throw new Error('导出已取消。');
  }

  await writeFile(target.filePath, artifact.content, 'utf8');
  return target.filePath;
}

function getActiveRuntimeWithAdapter():
  | (ProviderRuntimeContext & { adapter: NonNullable<ReturnType<typeof getProviderAdapter>> })
  | null {
  const runtime = getActiveShellRuntime({
    activeServiceId,
    activeProviderId,
    runtimeRegistry,
    customRuntimeRegistry,
  }) as ShellRuntimeContext | null;

  if (!isProviderRuntime(runtime)) {
    return null;
  }

  const adapter = getProviderAdapter(runtime.providerId);
  if (!adapter) {
    return null;
  }

  return {
    ...runtime,
    adapter,
  };
}

function getPersistedActiveProviderHomeUrl(): string {
  return captureStore?.getActiveProvider()?.homeUrl ?? '';
}

function resolveAppIconPath(): string {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'build', 'icons', 'icon.png');
  }

  return DEV_APP_ICON_PATH;
}

function getPersistedActiveServiceLaunchUrl(): string {
  return captureStore?.getActiveService()?.launchUrl ?? getPersistedActiveProviderHomeUrl();
}

function syncStageController(): void {
  const { activeRuntime } = syncShellStageController({
    stageController,
    activeServiceId,
    activeProviderId,
    nativeStageVisible,
    runtimeRegistry,
    customRuntimeRegistry,
  });
  const resolvedActiveRuntime = activeRuntime as ShellRuntimeContext | null;

  browserSession = resolvedActiveRuntime?.browserSession ?? null;
  cdpObserver = resolvedActiveRuntime?.cdpObserver ?? null;
  currentUrl = resolvedActiveRuntime?.currentUrl ?? getPersistedActiveServiceLaunchUrl();

  publishRuntimeStatus();
}

function getTrackedRequestKey(providerId: ProviderId, requestId: string): string {
  return `${providerId}:${requestId}`;
}

function recordAttempt(input: {
  source: 'cdp-network' | 'preload-dom' | 'runtime';
  stage: string;
  status: 'info' | 'captured' | 'error';
  message: string;
  detail?: string | null;
  createdAt: string;
}): void {
  captureStore?.logAttempt(input);
  publishRuntimeStatus();
}

function recordUniqueObservation(
  key: string,
  input: {
    source: 'cdp-network' | 'preload-dom' | 'runtime';
    stage: string;
    status: 'info' | 'captured' | 'error';
    message: string;
    detail?: string | null;
    createdAt: string;
  }
): void {
  if (seenObservationKeySet.has(key)) {
    return;
  }

  seenObservationKeySet.add(key);
  seenObservationKeys.push(key);

  if (seenObservationKeys.length > 200) {
    const removed = seenObservationKeys.shift();
    if (removed) {
      seenObservationKeySet.delete(removed);
    }
  }

  recordAttempt(input);
}

function formatError(error: unknown): string {
  return error instanceof Error ? `${error.name}: ${error.message}` : String(error);
}

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

registerAppLifecycle({
  onReady: () => {
    captureStore = new CaptureStore(path.join(app.getPath('userData'), 'capture-lab.db'));
    appSettingsRepo = createAppSettingsRepository(captureStore.getDb());
    shellSettingsService = createShellSettingsService({
      getCaptureStore: () => captureStore,
      getAppSettingsRepository: () => appSettingsRepo,
      afterStoreMutation: () => syncRuntimeRegistryFromStore(),
      afterInterfaceLanguageMutation: () => {
        applyConfiguredInterfaceLanguageToResolvedRuntimes();
        void reloadActiveRuntimeAfterLanguageChange().catch((error) => {
          console.error('[settings] failed to reload active runtime after language change:', error);
        });
      },
    });
    captureSessionService = createCaptureSessionService({
      getCaptureStore: () => captureStore,
      publishRuntimeStatus,
      saveExportArtifact,
    });
    historyEnvelopeBuilderService = createHistoryEnvelopeBuilderService({
      getProviderAdapter,
      resolveActiveRuntimeTitle,
    });
    historyCapturePersistenceService = createHistoryCapturePersistenceService({
      getCaptureStore: () => captureStore,
      setLastCaptureAt: (capturedAt) => {
        lastCaptureAt = capturedAt;
      },
      recordAttempt,
    });
    networkResponseIngestionService = createNetworkResponseIngestionService({
      buildHistoryEnvelopeFromTrackedResponse: (tracked, body) =>
        historyEnvelopeBuilderService?.buildHistoryEnvelopeFromTrackedResponse(tracked, body) ?? null,
      persistAutoCachedEnvelope: (envelope, input) =>
        historyCapturePersistenceService?.persistAutoCachedEnvelope(envelope, input) ?? null,
      emitProviderSignals,
      captureConversationFromDom,
      recordAttempt: (input) => recordAttempt(input),
      formatError,
    });
    requestIngestionService = createRequestIngestionService({
      maybeAutoCacheDiscoveredConversation,
      emitProviderSignals,
      recordUniqueObservation: (key, input) => recordUniqueObservation(key, input),
      recordAttempt: (input) => recordAttempt(input),
      persistEnvelope: (envelope) => captureStore?.persistEnvelope(envelope),
      resolveActiveRuntimeTitle,
      captureConversationFromDom,
    });
    historyDomHydrationService = createHistoryDomHydrationService({
      getProviderAdapter,
      wait,
      formatError,
      recordAttempt: (input) => recordAttempt(input),
      persistHydratedConversationSnapshot: (input) =>
        historyCapturePersistenceService?.persistHydratedConversationSnapshot(input) ?? {
          message: 'Capture persistence service is not ready yet.',
          detail: input.targetUrl,
        },
      domCapturePollAttempts: DOM_CAPTURE_POLL_ATTEMPTS,
      domCapturePollIntervalMs: DOM_CAPTURE_POLL_INTERVAL_MS,
    });
    historySessionOpenService = createHistorySessionOpenService({
      getCaptureStore: () => captureStore,
      getSelectedProviderId: () => selectedProviderId,
      resolveRuntime: (providerId) => runtimeRegistry?.resolveRuntime(providerId) ?? null,
      hydrateSessionHistory,
      recordAttempt,
      formatError,
    });
    diagnosticsService = createDiagnosticsService({
      createBrowserSessionRuntime: ({ config }) =>
        createBrowserSessionRuntimeWithConfig({
          config,
          chatPreloadPath: path.join(__dirname, '../preload/chat.cjs'),
          interfaceLanguage: getConfiguredInterfaceLanguage(),
          systemLocale: getConfiguredSystemLocale(),
          onUrlChanged: () => undefined,
        }),
      getBrowserSession: () => browserSession,
      getRuntimeStatusInput: () => ({
        debuggerAttached: cdpObserver?.isAttached() ?? false,
        currentUrl,
        lastCaptureAt,
        pendingRequestCount: trackedRequests.size,
        recentAttempts: captureStore?.listAttemptLogs(8) ?? [],
      }),
      wait,
    });
    liveProbeService = createLiveProbeService({
      manifestPath: path.join(app.getPath('userData'), 'provider-live-probe-server.json'),
      diagnosticsEnabled: () => getShellInfo().diagnosticsEnabled,
      recordAttempt,
      formatError,
      activateProvider: async (providerId) => {
        shellSettingsService?.setActiveProvider(providerId);
        await wait(900);
      },
      resolveRuntime: (providerId) => {
        const runtime = runtimeRegistry?.resolveRuntime(providerId) ?? null;
        if (!runtime || runtime.providerId !== providerId) {
          return null;
        }

        return {
          providerId: runtime.providerId,
          currentUrl: runtime.currentUrl,
          homeUrl: runtime.browserSession.config.homeUrl,
          loadUrl: runtime.loadUrl,
          browserSession: runtime.browserSession,
          view: runtime.view,
        };
      },
      getAutomationSpec: getProviderLiveAutomationSpec,
      listProviderSessions: (providerId) =>
        captureStore?.listSessions().filter((session) => session.provider === providerId) ?? [],
      listAttemptLogs: (limit) => captureStore?.listAttemptLogs(limit) ?? [],
    });
    currentUrl = getPersistedActiveServiceLaunchUrl();
    turnPersistenceService = createTurnPersistenceService({
      persistTurn,
    });
    captureOrchestrator = createCaptureOrchestrator({
      persist(turn) {
        turnPersistenceService?.persist(turn);
      },
    });

    registerCaptureIpc({
      listSessions: () => captureStore?.listSessions() ?? [],
      listMessages: (sessionId) => captureStore?.listMessages(sessionId) ?? [],
      openSession,
      deleteSession: (sessionId) => captureSessionService?.deleteSession(sessionId) ?? Promise.reject(new Error('Capture session service is not ready yet.')),
      exportSession: (sessionId, format) =>
        captureSessionService?.exportSession(sessionId, format as CaptureExportFormat) ??
        Promise.reject(new Error('Capture session service is not ready yet.')),
      exportProviderSessions: (providerId, format) =>
        captureSessionService?.exportProviderSessions(providerId as ProviderId, format as CaptureExportFormat) ??
        Promise.reject(new Error('Capture session service is not ready yet.')),
      listServices: () => captureStore?.listServices() ?? [],
      getActiveService: () => captureStore?.getActiveService() ?? null,
      setActiveService: (serviceId) => shellSettingsService?.setActiveService(serviceId) ?? null,
      addCustomService: (input) => shellSettingsService?.addCustomService(input) ?? null,
      removeCustomService: (serviceId) => shellSettingsService?.removeCustomService(serviceId),
      setServiceEnabled: (serviceId, enabled) =>
        shellSettingsService?.setServiceEnabled(serviceId, enabled) ?? null,
      moveService: (serviceId, direction) =>
        shellSettingsService?.moveService(serviceId, direction as ServiceMoveDirection) ?? null,
      updateCustomServiceIcon: (serviceId, iconUrl) =>
        shellSettingsService?.updateCustomServiceIcon(serviceId, iconUrl) ?? null,
      discoverSiteIcon,
      listProviders: () => captureStore?.listProviders() ?? [],
      getActiveProvider: () => captureStore?.getActiveProvider() ?? null,
      setActiveProvider: (providerId) =>
        shellSettingsService?.setActiveProvider(providerId as ProviderId) ?? null,
      setProviderEnabled: (providerId, enabled) =>
        shellSettingsService?.setProviderEnabled(providerId as ProviderId, enabled) ?? null,
      setProviderCacheEnabled: (providerId, cacheEnabled) =>
        captureStore?.setProviderCacheEnabled(providerId as ProviderId, cacheEnabled) ?? null,
      moveProvider: (providerId, direction) =>
        shellSettingsService?.moveProvider(providerId as ProviderId, direction as ProviderMoveDirection) ?? null,
      getShellInfo,
      setInterfaceLanguage: (language) =>
        shellSettingsService?.setInterfaceLanguage(
          language as import('@amberkeeper/shared-types').InterfaceLanguage
        ) ?? 'system',
      getInterfaceLocaleConfig,
      setNativeStageVisible,
      getRuntimeStatus: () => diagnosticsService?.getRuntimeStatus() ?? {
        debuggerAttached: false,
        currentUrl,
        lastCaptureAt,
        pendingRequestCount: trackedRequests.size,
        recentAttempts: captureStore?.listAttemptLogs(8) ?? [],
      },
      triggerDomSnapshot: async () => {
        const snapshot = await (
          diagnosticsService?.runDomSnapshot() ?? Promise.resolve({ message: 'Chat view is not ready yet.', detail: '' })
        );

        recordAttempt({
          source: 'preload-dom',
          stage: 'manual-snapshot',
          status: 'info',
          message: snapshot.message,
          detail: snapshot.detail,
          createdAt: new Date().toISOString(),
        });

        return snapshot;
      },
      runGeminiThemeDiagnostic: () =>
        diagnosticsService?.runGeminiThemeDiagnostic() ??
        Promise.resolve({
          comparedAt: new Date().toISOString(),
          summary: 'none',
          entries: [],
        }),
      onPageContext: (payload) => {
        if (activeServiceId === activeProviderId && activeProviderId && payload.title?.trim()) {
          providerPageTitles.set(activeProviderId, payload.title.trim());
        }

        if (payload.url) {
          currentUrl = payload.url;
        }

        publishRuntimeStatus();
      },
    });

    createDesktopWindow();
    liveProbeService?.startIfEnabled();
    liveProbeService?.attachAppLifecycle();
  },
  onWindowAllClosed: () => {
    liveProbeService?.stop();
    captureStore?.close();
    if (process.platform !== 'darwin') {
      app.quit();
    }
  },
  onActivate: () => {
    createDesktopWindow();
  },
});
