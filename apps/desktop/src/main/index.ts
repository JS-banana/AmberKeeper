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
  NormalizedMessage,
  ProviderId,
  ProviderMoveDirection,
  ProviderRecord,
  RuntimeStatus,
  ShellInfo,
} from '@amberkeeper/shared-types';
import { app, BrowserWindow, dialog } from 'electron';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { registerAppLifecycle } from './bootstrap/app';
import { registerCaptureIpc } from './ipc/capture-ipc';
import {
  createBrowserSessionRuntime,
  resolveBrowserSessionConfig,
  type BrowserSessionProviderId,
  type BrowserSessionRuntime,
} from './runtime/browser-session';
import { createProviderLiveAutomation, evaluateProviderPage } from './runtime/provider-live-automation';
import { createProviderLiveProbeServer } from './runtime/provider-live-probe-server';
import { getProviderAdapter, getProviderLiveAutomationSpec } from './runtime/provider-adapters';
import { createCdpObserver } from './runtime/cdp-observer';
import {
  createOldSessionAutoCacheKey,
  resolveAutoCachedTitle,
  resolveDiscoveryAutoCacheCandidate,
  shouldAcceptAutoCacheSnapshot,
  shouldPersistAutoCachedMessages,
} from './runtime/old-session-auto-cache';
import {
  normalizeHydratedDomMessages,
  resolveSessionNavigationUrl,
  summarizeDeepSeekHydrationDiagnostics,
} from './runtime/history-hydration';
import { resolveConversationIdSignal } from './runtime/conversation-id-resolution';
import { shouldRecordParsedResponseDiagnostics } from './runtime/response-diagnostics';
import { createProviderRuntimeRegistry } from './runtime/provider-runtime-registry';
import { CaptureStore } from './storage/capture-store';
import { createMainWindow, createProviderStageController } from './windows/main-window';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PANEL_WIDTH = 66;
const DOM_CAPTURE_POLL_INTERVAL_MS = 400;
const DOM_CAPTURE_POLL_ATTEMPTS = 24;

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

type ProviderRuntimeContext = {
  providerId: BrowserSessionProviderId;
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

let mainWindow: BrowserWindow | null = null;
let stageController: ReturnType<typeof createProviderStageController> | null = null;
let browserSession: BrowserSessionRuntime | null = null;
let cdpObserver: ReturnType<typeof createCdpObserver> | null = null;
let runtimeRegistry: ReturnType<typeof createProviderRuntimeRegistry<ProviderRuntimeContext>> | null =
  null;
let captureStore: CaptureStore | null = null;
let captureOrchestrator: ReturnType<typeof createCaptureOrchestrator> | null = null;
let turnPersistenceService: ReturnType<typeof createTurnPersistenceService> | null = null;
let providerLiveAutomation: ReturnType<typeof createProviderLiveAutomation> | null = null;
let providerLiveProbeServer: ReturnType<typeof createProviderLiveProbeServer> | null = null;
let activeProviderId: ProviderId | null = null;
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
    rendererPreloadPath: path.join(__dirname, '../preload/renderer.mjs'),
    rendererHtmlPath: path.join(__dirname, '../renderer/index.html'),
  });
  stageController = createProviderStageController(mainWindow, PANEL_WIDTH);

  mainWindow.on('closed', () => {
    mainWindow = null;
    stageController = null;
    browserSession = null;
    cdpObserver = null;
    runtimeRegistry = null;
    activeProviderId = null;
    currentUrl = getPersistedActiveProviderHomeUrl();
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
      const activeRuntime =
        nextActiveProviderId === null
          ? null
          : runtimes.find((runtime) => runtime.providerId === nextActiveProviderId) ?? null;

      stageController?.sync(
        runtimes.map(({ providerId, view }) => ({
          providerId,
          view,
        })),
        nativeStageVisible ? nextActiveProviderId : null
      );

      browserSession = activeRuntime?.browserSession ?? null;
      cdpObserver = activeRuntime?.cdpObserver ?? null;
      currentUrl = activeRuntime?.currentUrl ?? getPersistedActiveProviderHomeUrl();

      if (activeRuntime) {
        void attachObserver(activeRuntime);
      }

      publishRuntimeStatus();
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
    chatPreloadPath: path.join(__dirname, '../preload/chat.mjs'),
    onUrlChanged(url) {
      runtime.currentUrl = url;

      if (activeProviderId === provider.id) {
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
    const classification = adapter.classifyRequest({
      url: signal.url,
      method: signal.method,
    });
    if (classification === 'ignore') {
      return;
    }

    const tracked = {
      provider: signal.provider,
      sourceSessionKey: signal.sourceSessionKey,
      url: signal.url,
      method: signal.method,
      postData: signal.postData,
      pageUrl: signal.pageUrl,
      capturedAt: signal.capturedAt,
      resourceType: signal.resourceType,
      classification,
    } satisfies TrackedRequest;
    trackedRequests.set(getTrackedRequestKey(signal.provider, signal.requestId), tracked);

    const requestConversationSignal = resolveConversationIdSignal({
      provider: signal.provider,
      source: 'cdp-network',
      sourceSessionKey: signal.sourceSessionKey,
      pageUrl: signal.pageUrl,
      capturedAt: signal.capturedAt,
      urls: [signal.pageUrl, signal.url],
      adapter,
    });
    if (requestConversationSignal) {
      maybeAutoCacheDiscoveredConversation({
        classification,
        providerId: requestConversationSignal.provider,
        remoteConversationId: requestConversationSignal.conversationId,
        pageUrl: requestConversationSignal.pageUrl,
      });
      emitProviderSignals([requestConversationSignal]);
    }

    if (
      adapter.classifyRequest({ url: tracked.url, method: 'GET' }) !== 'ignore' &&
      ['Fetch', 'XHR'].includes(tracked.resourceType)
    ) {
      recordUniqueObservation(`request:${tracked.method}:${tracked.url}:${tracked.resourceType}`, {
        source: 'cdp-network',
        stage: classification === 'capture' ? 'request-candidate' : 'request-discovery',
        status: 'info',
        message: `${tracked.method} ${tracked.resourceType} ${tracked.url}`,
        detail: tracked.postData ? tracked.postData.slice(0, 400) : tracked.pageUrl,
        createdAt: tracked.capturedAt,
      });
    }

    if (classification === 'capture' && tracked.method === 'POST' && tracked.postData) {
      const signals = adapter.interpretRequest({
        url: tracked.url,
        method: tracked.method,
        body: tracked.postData,
        pageUrl: tracked.pageUrl,
        capturedAt: tracked.capturedAt,
        sourceSessionKey: tracked.sourceSessionKey,
      });

      if (signals.length > 0) {
        emitProviderSignals(signals);
        persistRequestCandidateEnvelope(tracked, signals);
      } else {
        recordAttempt({
          source: 'cdp-network',
          stage: 'request-parse-empty',
          status: 'info',
          message: 'Request matched capture route but yielded no normalized user message.',
          detail: tracked.url,
          createdAt: tracked.capturedAt,
        });
      }
    }

    publishRuntimeStatus();
    return;
  }

  if (signal.kind === 'responseMetaSeen') {
    const tracked = trackedRequests.get(getTrackedRequestKey(signal.provider, signal.requestId));
    if (!tracked) {
      return;
    }

    if (
      adapter.classifyRequest({ url: signal.url, method: 'GET' }) !== 'ignore' &&
      ['Fetch', 'XHR'].includes(tracked.resourceType)
    ) {
      recordUniqueObservation(
        `response:${tracked.method}:${signal.url}:${signal.status}:${signal.mimeType}`,
        {
          source: 'cdp-network',
          stage: tracked.classification === 'capture' ? 'response-candidate' : 'response-discovery',
          status: 'info',
          message: `${tracked.method} ${signal.status ?? 'unknown'} ${signal.mimeType ?? 'unknown'} ${signal.url}`,
          detail: tracked.pageUrl,
          createdAt: signal.capturedAt,
        }
      );
    }

    const responseConversationSignal = resolveConversationIdSignal({
      provider: signal.provider,
      source: 'cdp-network',
      sourceSessionKey: tracked.sourceSessionKey,
      pageUrl: signal.pageUrl,
      capturedAt: signal.capturedAt,
      urls: [signal.pageUrl, signal.url],
      adapter,
    });
    if (responseConversationSignal) {
      maybeAutoCacheDiscoveredConversation({
        classification: tracked.classification,
        providerId: responseConversationSignal.provider,
        remoteConversationId: responseConversationSignal.conversationId,
        pageUrl: responseConversationSignal.pageUrl,
      });
      emitProviderSignals([responseConversationSignal]);
    }

    if (
      adapter.shouldTriggerDomAutoCapture({
        url: tracked.url,
        method: tracked.method,
        streamStatus: null,
      })
    ) {
      void captureConversationFromDom(tracked.pageUrl);
    }

    return;
  }

  if (signal.kind === 'websocketSeen') {
    if (!adapter.matchesView(signal.url)) {
      return;
    }

    recordUniqueObservation(`websocket:${signal.url}`, {
      source: 'cdp-network',
      stage: 'websocket-created',
      status: 'info',
      message: `WebSocket observed: ${signal.url}`,
      detail: signal.pageUrl,
      createdAt: signal.capturedAt,
    });
    return;
  }

  if (signal.kind === 'responseBodyFailed') {
    const tracked = trackedRequests.get(getTrackedRequestKey(signal.provider, signal.requestId));
    trackedRequests.delete(getTrackedRequestKey(signal.provider, signal.requestId));
    recordAttempt({
      source: 'cdp-network',
      stage: 'response-body',
      status: 'error',
      message: `Failed to retrieve or parse a ${signal.provider} response body.`,
      detail: [tracked?.url ?? '', formatError(signal.error)].filter(Boolean).join('\n'),
      createdAt: signal.capturedAt,
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

  const text = signal.base64Encoded ? Buffer.from(signal.body, 'base64').toString('utf8') : signal.body;
  const response = adapter.interpretResponseBody({
    url: tracked.url,
    method: tracked.method,
    body: text,
    pageUrl: tracked.pageUrl,
    capturedAt: signal.capturedAt,
    sourceSessionKey: tracked.sourceSessionKey,
  });
  const historyEnvelope = buildHistoryEnvelopeFromTrackedResponse(tracked, text);

  if (historyEnvelope) {
    persistAutoCachedEnvelope(historyEnvelope, {
      trigger: 'network-history-response',
      triggerUrl: tracked.url,
    });
  }

  if (response.signals.length > 0) {
    if (
      shouldRecordParsedResponseDiagnostics({
        provider: tracked.provider,
        classification: tracked.classification,
      })
    ) {
      recordAttempt({
        source: 'cdp-network',
        stage: 'response-parsed',
        status: 'info',
        message: `Parsed ${response.signals.length} signal(s) from ${tracked.provider} response.`,
        detail: [
          tracked.url,
          summarizeSignalsForDiagnostics(response.signals),
          adapter.summarizeResponseBody(text, 800),
        ]
          .filter(Boolean)
          .join('\n'),
        createdAt: signal.capturedAt,
      });
    }

    emitProviderSignals(response.signals);
  } else if (tracked.classification === 'capture') {
    recordAttempt({
      source: 'cdp-network',
      stage: tracked.method === 'POST' ? 'response-sse' : 'history-json',
      status: 'info',
      message: `Matched ${tracked.provider} request but parsed no normalized messages.`,
      detail: `${tracked.url}\n${adapter.summarizeResponseBody(text)}`,
      createdAt: signal.capturedAt,
    });
  }

  if (response.streamStatus === 'COMPLETE') {
    await captureConversationFromDom(tracked.pageUrl);
  }

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

function summarizeSignalsForDiagnostics(signals: ProviderSignal[]): string {
  return JSON.stringify(
    signals.map((signal) => ({
      kind: signal.kind,
      conversationId: 'conversationId' in signal ? (signal.conversationId ?? null) : null,
      createdAt: 'createdAt' in signal ? (signal.createdAt ?? null) : null,
      remoteMessageId: 'remoteMessageId' in signal ? (signal.remoteMessageId ?? null) : null,
      stable: 'stable' in signal ? (signal.stable ?? null) : null,
      content:
        'content' in signal && typeof signal.content === 'string'
          ? signal.content.slice(0, 160)
          : null,
    })),
    null,
    2
  );
}

function persistRequestCandidateEnvelope(
  tracked: TrackedRequest,
  signals: ProviderSignal[]
): void {
  if (!captureStore) {
    return;
  }

  const conversationId =
    signals.find((signal) => signal.kind === 'conversationIdResolved')?.conversationId ??
    signals.find((signal) => signal.kind === 'candidateUserMessage')?.conversationId ??
    null;
  const userSignals = signals.filter(
    (signal): signal is Extract<ProviderSignal, { kind: 'candidateUserMessage' }> =>
      signal.kind === 'candidateUserMessage' && Boolean(signal.content.trim())
  );

  if (userSignals.length === 0) {
    return;
  }

  const latestUserSignal = userSignals[userSignals.length - 1];
  const envelope: CaptureEnvelope = {
    provider: tracked.provider,
    source: 'cdp-network',
    pageUrl: tracked.pageUrl,
    capturedAt: tracked.capturedAt,
    sourceSessionKey: tracked.sourceSessionKey,
    remoteConversationId: conversationId ?? undefined,
    title: resolveActiveRuntimeTitle(tracked.provider),
    titleSource: resolveActiveRuntimeTitle(tracked.provider) ? 'provider' : 'fallback',
    messages: [
      {
        role: 'user',
        content: latestUserSignal.content,
        createdAt: latestUserSignal.createdAt,
        remoteConversationId: conversationId ?? undefined,
        remoteMessageId: latestUserSignal.remoteMessageId,
        model: latestUserSignal.model,
      },
    ],
  };

  captureStore.persistEnvelope(envelope);
  recordAttempt({
    source: 'cdp-network',
    stage: 'request-user-persist',
    status: 'captured',
    message: `Persisted request-side user turn for ${tracked.provider}.`,
    detail: JSON.stringify({
      remoteConversationId: conversationId,
      pageUrl: tracked.pageUrl,
      preview: latestUserSignal.content.slice(0, 160),
    }),
    createdAt: tracked.capturedAt,
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

async function runDomSnapshot(): Promise<{ message: string; detail: string }> {
  if (!browserSession) {
    return {
      message: 'Chat view is not ready yet.',
      detail: '',
    };
  }

  return browserSession.runDomSnapshot();
}

async function openSession(sessionId: string): Promise<{ message: string; detail: string }> {
  if (!captureStore) {
    return {
      message: 'Capture store is not ready yet.',
      detail: '',
    };
  }

  const session = captureStore.listSessions().find((entry) => entry.id === sessionId) ?? null;
  if (!session) {
    recordAttempt({
      source: 'preload-dom',
      stage: 'history-hydration',
      status: 'error',
      message: 'Requested hydration for an unknown session.',
      detail: `session=${sessionId}`,
      createdAt: new Date().toISOString(),
    });
    throw new Error(`Unknown session: ${sessionId}.`);
  }

  recordAttempt({
    source: 'preload-dom',
    stage: 'history-hydration',
    status: 'info',
    message: 'Requested hydration for the selected session.',
    detail: [
      `session=${session.id}`,
      `provider=${session.provider}`,
      `activeProvider=${activeProviderId ?? ''}`,
      `remoteConversationId=${session.remoteConversationId ?? ''}`,
      `pageUrl=${session.pageUrl}`,
    ].join('\n'),
    createdAt: new Date().toISOString(),
  });

  if (session.provider !== activeProviderId) {
    recordAttempt({
      source: 'preload-dom',
      stage: 'history-hydration',
      status: 'error',
      message: 'Selected session does not belong to the active provider.',
      detail: [
        `session=${session.id}`,
        `provider=${session.provider}`,
        `activeProvider=${activeProviderId ?? ''}`,
      ].join('\n'),
      createdAt: new Date().toISOString(),
    });
    throw new Error(`Session ${sessionId} does not belong to the active provider.`);
  }

  const provider = captureStore.listProviders().find((entry) => entry.id === session.provider) ?? null;
  if (!provider) {
    recordAttempt({
      source: 'preload-dom',
      stage: 'history-hydration',
      status: 'error',
      message: 'Selected session provider could not be resolved.',
      detail: [`session=${session.id}`, `provider=${session.provider}`].join('\n'),
      createdAt: new Date().toISOString(),
    });
    throw new Error(`Unknown provider for session ${sessionId}.`);
  }

  const runtime = runtimeRegistry?.getActiveRuntime() ?? null;
  if (!runtime || runtime.providerId !== session.provider) {
    recordAttempt({
      source: 'preload-dom',
      stage: 'history-hydration',
      status: 'error',
      message: 'Active runtime is not ready for the selected session provider.',
      detail: [
        `session=${session.id}`,
        `provider=${session.provider}`,
        `runtimeProvider=${runtime?.providerId ?? ''}`,
      ].join('\n'),
      createdAt: new Date().toISOString(),
    });
    throw new Error(`Active runtime is not ready for provider ${session.provider}.`);
  }

  const targetUrl = resolveSessionNavigationUrl(session, provider.homeUrl);
  recordAttempt({
    source: 'preload-dom',
    stage: 'history-hydration',
    status: 'info',
    message: 'Resolved selected session navigation target.',
    detail: [
      `session=${session.id}`,
      `currentUrl=${runtime.currentUrl}`,
      `targetUrl=${targetUrl}`,
    ].join('\n'),
    createdAt: new Date().toISOString(),
  });

  try {
    if (runtime.currentUrl !== targetUrl) {
      await runtime.loadUrl(targetUrl);

      recordAttempt({
        source: 'preload-dom',
        stage: 'history-hydration',
        status: 'info',
        message: 'Navigated the active runtime to the selected session URL.',
        detail: [`session=${session.id}`, `targetUrl=${targetUrl}`].join('\n'),
        createdAt: new Date().toISOString(),
      });
    }

    return hydrateSessionHistory(session, runtime, targetUrl);
  } catch (error) {
    recordAttempt({
      source: 'preload-dom',
      stage: 'history-hydration',
      status: 'error',
      message: 'Selected session hydration failed before persistence.',
      detail: [
        `session=${session.id}`,
        `targetUrl=${targetUrl}`,
        formatError(error),
      ].join('\n'),
      createdAt: new Date().toISOString(),
    });

    throw error;
  }
}

function getRuntimeStatus(): RuntimeStatus {
  return {
    debuggerAttached: cdpObserver?.isAttached() ?? false,
    currentUrl,
    lastCaptureAt,
    pendingRequestCount: trackedRequests.size,
    recentAttempts: captureStore?.listAttemptLogs(8) ?? [],
  };
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
  recordAttempt({
    source: 'preload-dom',
    stage: input.stage,
    status: 'info',
    message:
      input.stage === 'history-hydration'
        ? 'Started DOM hydration for the selected session.'
        : 'Started DOM auto-cache for the active remote session.',
    detail: [
      input.preferredConversationId ? `remoteConversationId=${input.preferredConversationId}` : '',
      `targetUrl=${input.targetUrl}`,
    ]
      .filter(Boolean)
      .join('\n'),
    createdAt: new Date().toISOString(),
  });

  const adapter = getProviderAdapter(input.providerId);
  const initialRouteConversationId =
    adapter?.extractConversationIdFromUrl(input.runtime.currentUrl) ??
    adapter?.extractConversationIdFromUrl(input.targetUrl) ??
    null;
  let initialSignature: string | null = null;

  if (
    input.stage === 'history-auto-cache' &&
    input.preferredConversationId &&
    initialRouteConversationId !== input.preferredConversationId
  ) {
    const initialSnapshot = await input.runtime.browserSession.readStructuredDomSnapshot(
      input.runtime.currentUrl || input.targetUrl
    );
    initialSignature = createHydrationSignature(initialSnapshot.messages);
  }

  let previousSignature: string | null = null;
  let bestSnapshot:
    | {
        url: string;
        title: string;
        conversationId: string | null;
        messages: Array<{ role?: string; content?: string }>;
      }
    | null = null;

  for (let attempt = 0; attempt < DOM_CAPTURE_POLL_ATTEMPTS; attempt += 1) {
    const snapshot = await input.runtime.browserSession.readStructuredDomSnapshot(
      input.runtime.currentUrl || input.targetUrl
    );
    const resolvedConversationId =
      adapter?.extractConversationIdFromUrl(snapshot.url) ??
      adapter?.extractConversationIdFromUrl(input.runtime.currentUrl) ??
      input.preferredConversationId ??
      null;
    const normalized = normalizeHydratedDomMessages(snapshot.messages, {
      capturedAt: new Date().toISOString(),
      conversationId: resolvedConversationId,
    });

    if (normalized.length > 0) {
      const signature = createHydrationSignature(snapshot.messages);
      if (
        !shouldAcceptAutoCacheSnapshot({
          stage: input.stage,
          preferredConversationId: input.preferredConversationId,
          resolvedConversationId,
          initialSignature,
          nextSignature: signature,
        })
      ) {
        await wait(DOM_CAPTURE_POLL_INTERVAL_MS);
        continue;
      }

      bestSnapshot = {
        url: snapshot.url || input.targetUrl,
        title: snapshot.title ?? '',
        conversationId: resolvedConversationId,
        messages: snapshot.messages,
      };

      if (signature === previousSignature) {
        return persistHydratedConversationSnapshot({
          providerId: input.providerId,
          existingSessionId: input.existingSessionId ?? null,
          runtime: input.runtime,
          snapshot: bestSnapshot,
          targetUrl: input.targetUrl,
          preferredConversationId: input.preferredConversationId ?? null,
          stage: input.stage,
        });
      }

      previousSignature = signature;
    }

    await wait(DOM_CAPTURE_POLL_INTERVAL_MS);
  }

  if (bestSnapshot) {
    return persistHydratedConversationSnapshot({
      providerId: input.providerId,
      existingSessionId: input.existingSessionId ?? null,
      runtime: input.runtime,
      snapshot: bestSnapshot,
      targetUrl: input.targetUrl,
      preferredConversationId: input.preferredConversationId ?? null,
      stage: input.stage,
    });
  }

  let domSnapshotDetail = '';
  try {
    const domSnapshot = await input.runtime.browserSession.runDomSnapshot();
    domSnapshotDetail = domSnapshot.detail;
  } catch (error) {
    domSnapshotDetail = `runDomSnapshot failed: ${formatError(error)}`;
  }

  const deepSeekHistoryDiagnostics =
    input.providerId === 'deepseek'
      ? await collectDeepSeekHistoryFetchDiagnostics(
          input.runtime,
          input.preferredConversationId ?? null
        )
      : null;
  const createdAt = new Date().toISOString();

  recordAttempt({
    source: 'preload-dom',
    stage: input.stage,
    status: 'info',
    message:
      input.stage === 'history-hydration'
        ? 'Opened remote session but found no DOM messages to hydrate.'
        : 'Observed remote session route but found no DOM history to cache.',
    detail: [
      input.targetUrl,
      input.preferredConversationId ? `remoteConversationId=${input.preferredConversationId}` : '',
      deepSeekHistoryDiagnostics ? `deepseekHistory=${deepSeekHistoryDiagnostics}` : '',
      domSnapshotDetail ? `domSnapshot=${domSnapshotDetail}` : '',
    ]
      .filter(Boolean)
      .join('\n'),
    createdAt,
  });

  return {
    message: input.emptyMessage,
    detail: input.targetUrl,
  };
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
  if (!remoteConversationId) {
    return 'missing-remote-conversation-id';
  }

  try {
    const diagnostics = (await runtime.view.webContents.executeJavaScript(
      `
        (async () => {
          const chatSessionId = ${JSON.stringify(remoteConversationId)};
          const queryCount = (selector) => {
            try {
              return document.querySelectorAll(selector).length;
            } catch {
              return -1;
            }
          };
          const sampleNodes = (selector, limit = 3) => {
            try {
              return Array.from(document.querySelectorAll(selector))
                .slice(0, limit)
                .map((node) => ({
                  selector,
                  tagName: node.tagName,
                  className: typeof node.className === 'string' ? node.className : '',
                  textSample: node.textContent ?? '',
                  htmlSample: node instanceof HTMLElement ? node.outerHTML : '',
                }));
            } catch {
              return [];
            }
          };
          const main = document.querySelector('main');

          let historyFetch;
          try {
            const response = await fetch(
              '/api/v0/chat/history_messages?chat_session_id=' + encodeURIComponent(chatSessionId),
              {
                credentials: 'include',
                headers: {
                  accept: 'application/json, text/plain, */*',
                },
              }
            );
            const text = await response.text();
            historyFetch = {
              ok: response.ok,
              status: response.status,
              url: response.url,
              preview: text.slice(0, 2000),
            };
          } catch (error) {
            historyFetch = {
              ok: false,
              status: null,
              url: '',
              preview: String(error),
            };
          }

          return {
            historyFetch,
            dom: {
              locationHref: location.href,
              title: document.title,
              bodyTextSample: document.body?.innerText ?? '',
              mainHtmlSample: main?.innerHTML ?? '',
              selectorCounts: {
                '.message-item': queryCount('.message-item'),
                '.user-message': queryCount('.user-message'),
                '.assistant-message': queryCount('.assistant-message'),
                '[data-testid*="message"]': queryCount('[data-testid*="message"]'),
                '[class*="message"]': queryCount('[class*="message"]'),
                'main': queryCount('main'),
              },
              candidateNodes: [
                ...sampleNodes('[class*="message"]'),
                ...sampleNodes('[data-testid*="message"]'),
                ...sampleNodes('[role="listitem"]'),
              ].slice(0, 6),
            },
          };
        })();
      `,
      true
    )) as {
      historyFetch?: {
        ok?: boolean;
        status?: number | null;
        url?: string;
        preview?: string;
      } | null;
      dom?: {
        locationHref?: string;
        title?: string;
        bodyTextSample?: string;
        mainHtmlSample?: string;
        selectorCounts?: Record<string, number>;
      } | null;
    } | null;

    return summarizeDeepSeekHydrationDiagnostics({
      historyFetch: diagnostics?.historyFetch ?? null,
      dom: diagnostics?.dom ?? null,
    });
  } catch (error) {
    return `executeJavaScript failed: ${formatError(error)}`;
  }
}

function persistHydratedConversationSnapshot(input: {
  providerId: ProviderId;
  existingSessionId?: string | null;
  runtime: ProviderRuntimeContext;
  snapshot: {
    url: string;
    title: string;
    conversationId: string | null;
    messages: Array<{ role?: string; content?: string }>;
  };
  targetUrl: string;
  preferredConversationId?: string | null;
  stage: 'history-hydration' | 'history-auto-cache';
}): { message: string; detail: string } {
  const capturedAt = new Date().toISOString();
  const conversationId = input.snapshot.conversationId ?? input.preferredConversationId ?? null;
  const messages = normalizeHydratedDomMessages(input.snapshot.messages, {
    capturedAt,
    conversationId,
  });

  if (messages.length === 0) {
    recordAttempt({
      source: 'preload-dom',
      stage: input.stage,
      status: 'info',
      message: 'Opened remote session but normalized history was empty.',
      detail: `${input.targetUrl}\nremoteConversationId=${conversationId ?? ''}`,
      createdAt: capturedAt,
    });

    return {
      message:
        input.stage === 'history-hydration'
          ? 'The selected session did not expose any normalized history yet.'
          : 'The active remote session did not expose any normalized history yet.',
      detail: input.targetUrl,
    };
  }

  const resolvedTitle = resolveAutoCachedTitle({
    stage: input.stage,
    snapshotTitle: input.snapshot.title,
  });
  const envelope: CaptureEnvelope = {
    provider: input.providerId,
    source: 'preload-dom',
    pageUrl: input.snapshot.url || input.targetUrl,
    capturedAt,
    sourceSessionKey: input.runtime.browserSession.config.sourceSessionKey,
    remoteConversationId: conversationId ?? undefined,
    title: resolvedTitle,
    titleSource: resolvedTitle ? 'provider' : 'fallback',
    messages,
  };
  const sessionId = persistAutoCachedEnvelope(envelope, {
    existingSessionId: input.existingSessionId ?? null,
    trigger: input.stage,
    triggerUrl: input.snapshot.url || input.targetUrl,
  });

  if (!sessionId) {
    return {
      message: 'The remote conversation is already cached with the latest stable snapshot.',
      detail: input.snapshot.url || input.targetUrl,
    };
  }

  const actionLabel = input.existingSessionId ? 'Hydrated' : 'Cached';
  return {
    message: `${actionLabel} ${messages.length} message(s) from the remote session.`,
    detail: input.snapshot.url || input.targetUrl,
  };
}

function persistAutoCachedEnvelope(
  envelope: CaptureEnvelope,
  input: {
    existingSessionId?: string | null;
    trigger: 'history-hydration' | 'history-auto-cache' | 'network-history-response';
    triggerUrl: string;
  }
): string | null {
  if (!captureStore) {
    return null;
  }

  const existingSession = resolveExistingSessionForEnvelope(envelope, input.existingSessionId ?? null);
  if (
    existingSession &&
    existingSession.pageUrl === envelope.pageUrl &&
    (existingSession.title ?? null) === (envelope.title ?? null) &&
    !shouldPersistAutoCachedMessages(captureStore.listMessages(existingSession.id), envelope.messages)
  ) {
    return null;
  }

  const sessionId = existingSession
    ? captureStore.replaceSessionEnvelope(existingSession.id, envelope)
    : captureStore.persistEnvelope(envelope);

  lastCaptureAt = envelope.capturedAt;
  recordAttempt({
    source: envelope.source,
    stage: input.trigger === 'history-hydration' ? 'history-hydration' : 'history-auto-cache',
    status: 'captured',
    message: `${existingSession ? 'Updated' : 'Cached'} ${envelope.messages.length} message(s) from the remote session.`,
    detail: [
      input.triggerUrl,
      `session=${sessionId}`,
      envelope.remoteConversationId ? `remoteConversationId=${envelope.remoteConversationId}` : '',
      `trigger=${input.trigger}`,
    ]
      .filter(Boolean)
      .join('\n'),
    createdAt: envelope.capturedAt,
  });

  return sessionId;
}

function resolveExistingSessionForEnvelope(
  envelope: CaptureEnvelope,
  existingSessionId: string | null
): CaptureSessionRecord | null {
  if (!captureStore) {
    return null;
  }

  if (existingSessionId) {
    return captureStore.listSessions().find((session) => session.id === existingSessionId) ?? null;
  }

  const remoteConversationId = envelope.remoteConversationId?.trim();
  if (!remoteConversationId) {
    return null;
  }

  return captureStore.findSessionByRemoteConversation(envelope.provider, remoteConversationId);
}

function buildHistoryEnvelopeFromTrackedResponse(
  tracked: TrackedRequest,
  body: string
): CaptureEnvelope | null {
  const adapter = getProviderAdapter(tracked.provider);
  const historyCapture = adapter?.extractHistoryCapture?.({
    url: tracked.url,
    method: tracked.method,
    body,
    pageUrl: tracked.pageUrl,
    capturedAt: tracked.capturedAt,
    sourceSessionKey: tracked.sourceSessionKey,
  });

  if (!historyCapture) {
    return null;
  }

  return buildProviderHistoryEnvelope({
    tracked,
    messages: historyCapture.messages,
    conversationId: historyCapture.conversationId ?? null,
  });
}

function buildProviderHistoryEnvelope(input: {
  tracked: TrackedRequest;
  messages: NormalizedMessage[];
  conversationId: string | null;
}): CaptureEnvelope | null {
  if (input.messages.length === 0) {
    return null;
  }

  const remoteConversationId =
    input.messages.find((message) => message.remoteConversationId)?.remoteConversationId ??
    input.conversationId ??
    null;
  if (!remoteConversationId) {
    return null;
  }

  const activeTitle = resolveAutoCachedTitle({
    stage: 'network-history-response',
    snapshotTitle: resolveActiveRuntimeTitle(input.tracked.provider),
  });

  return {
    provider: input.tracked.provider,
    source: 'cdp-network',
    pageUrl: input.tracked.pageUrl,
    capturedAt: input.tracked.capturedAt,
    sourceSessionKey: input.tracked.sourceSessionKey,
    remoteConversationId,
    title: activeTitle,
    titleSource: activeTitle ? 'provider' : 'fallback',
    messages: input.messages.map((message, index) => ({
      ...message,
      createdAt:
        message.createdAt === new Date(0).toISOString()
          ? new Date(new Date(input.tracked.capturedAt).getTime() + index).toISOString()
          : message.createdAt,
      remoteConversationId: message.remoteConversationId ?? remoteConversationId,
    })),
  };
}

function publishRuntimeStatus(): void {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return;
  }

  mainWindow.webContents.send('capture:runtime-status', getRuntimeStatus());
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
  const persistedActiveProvider = captureStore?.getActiveProvider() ?? null;

  activeProviderId = persistedActiveProvider?.id ?? null;
  currentUrl = persistedActiveProvider?.homeUrl ?? '';

  runtimeRegistry?.syncProviders(providers, activeProviderId);
  publishRuntimeStatus();
}

function setActiveProvider(providerId: ProviderId): ProviderRecord | null {
  if (!captureStore) {
    return null;
  }

  const provider = captureStore.setActiveProvider(providerId);
  syncRuntimeRegistryFromStore();

  return provider;
}

function setProviderEnabled(providerId: ProviderId, enabled: boolean): ProviderRecord | null {
  if (!captureStore) {
    return null;
  }

  const provider = captureStore.setProviderEnabled(providerId, enabled);
  syncRuntimeRegistryFromStore();

  return provider;
}

function moveProvider(
  providerId: ProviderId,
  direction: ProviderMoveDirection
): ProviderRecord[] | null {
  if (!captureStore) {
    return null;
  }

  const providers = captureStore.moveProvider(providerId, direction);
  syncRuntimeRegistryFromStore();

  return providers;
}

async function deleteSession(sessionId: string): Promise<{ message: string; detail: string }> {
  if (!captureStore) {
    throw new Error('Capture store is not ready yet.');
  }

  captureStore.deleteSession(sessionId);
  publishRuntimeStatus();

  return {
    message: '已删除该会话的本地缓存。',
    detail: `session=${sessionId}`,
  };
}

async function exportSession(
  sessionId: string,
  format: CaptureExportFormat
): Promise<{ message: string; detail: string }> {
  if (!captureStore) {
    throw new Error('Capture store is not ready yet.');
  }

  const artifact = captureStore.exportSession(sessionId, format);
  const savedPath = await saveExportArtifact(artifact);
  return {
    message: '已导出当前会话。',
    detail: savedPath,
  };
}

async function exportProviderSessions(
  providerId: ProviderId,
  format: CaptureExportFormat
): Promise<{ message: string; detail: string }> {
  if (!captureStore) {
    throw new Error('Capture store is not ready yet.');
  }

  const artifact = captureStore.exportProviderSessions(providerId, format);
  const savedPath = await saveExportArtifact(artifact);
  return {
    message: '已导出当前 provider 的会话档案。',
    detail: savedPath,
  };
}

function getShellInfo(): ShellInfo {
  return {
    diagnosticsEnabled: !app.isPackaged || process.env.AMBERKEEPER_ENABLE_DIAGNOSTICS === '1',
    isPackaged: app.isPackaged,
  };
}

function setNativeStageVisible(visible: boolean): void {
  nativeStageVisible = visible;
  const runtimes = runtimeRegistry?.listResolvedRuntimes() ?? [];

  stageController?.sync(
    runtimes.map(({ providerId, view }) => ({
      providerId,
      view,
    })),
    nativeStageVisible ? activeProviderId : null
  );
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
  const runtime = runtimeRegistry?.getActiveRuntime() ?? null;

  if (!runtime) {
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
    currentUrl = getPersistedActiveProviderHomeUrl();
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
      deleteSession,
      exportSession: (sessionId, format) =>
        exportSession(sessionId, format as CaptureExportFormat),
      exportProviderSessions: (providerId, format) =>
        exportProviderSessions(providerId as ProviderId, format as CaptureExportFormat),
      listProviders: () => captureStore?.listProviders() ?? [],
      getActiveProvider: () => captureStore?.getActiveProvider() ?? null,
      setActiveProvider: (providerId) => setActiveProvider(providerId as ProviderId),
      setProviderEnabled: (providerId, enabled) =>
        setProviderEnabled(providerId as ProviderId, enabled),
      moveProvider: (providerId, direction) =>
        moveProvider(providerId as ProviderId, direction as ProviderMoveDirection),
      getShellInfo,
      setNativeStageVisible,
      getRuntimeStatus,
      triggerDomSnapshot: async () => {
        const snapshot = await runDomSnapshot();

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
      onPageContext: (payload) => {
        if (activeProviderId && payload.title?.trim()) {
          providerPageTitles.set(activeProviderId, payload.title.trim());
        }

        if (payload.url) {
          currentUrl = payload.url;
        }

        publishRuntimeStatus();
      },
    });

    providerLiveAutomation = createProviderLiveAutomation({
      activateProvider: async (providerId) => {
        setActiveProvider(providerId);
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
    createDesktopWindow();

    providerLiveProbeServer = createProviderLiveProbeServer({
      manifestPath: path.join(app.getPath('userData'), 'provider-live-probe-server.json'),
      runProbe: async (request: import('@amberkeeper/shared-types').ProviderLiveProbeRequest) => {
        if (!providerLiveAutomation) {
          throw new Error('Provider live automation is not ready yet.');
        }

        return providerLiveAutomation.runProbe(request);
      },
      evaluatePage: async (request: import('@amberkeeper/shared-types').ProviderPageEvalRequest) => {
        if (!providerLiveAutomation) {
          throw new Error('Provider live automation is not ready yet.');
        }

        return providerLiveAutomation.evaluatePage(request);
      },
    });

    if (getShellInfo().diagnosticsEnabled) {
      void providerLiveProbeServer
        .start()
        .then((manifest) => {
          recordAttempt({
            source: 'runtime',
            stage: 'live-probe-server',
            status: 'info',
            message: 'Started local provider live probe server.',
            detail: JSON.stringify(manifest),
            createdAt: new Date().toISOString(),
          });
        })
        .catch((error) => {
          recordAttempt({
            source: 'runtime',
            stage: 'live-probe-server',
            status: 'error',
            message: 'Failed to start local provider live probe server.',
            detail: formatError(error),
            createdAt: new Date().toISOString(),
          });
        });
    }
    app.on('before-quit', () => {
      void providerLiveProbeServer?.stop().catch(() => undefined);
    });
  },
  onWindowAllClosed: () => {
    void providerLiveProbeServer?.stop().catch(() => undefined);
    providerLiveProbeServer = null;
    captureStore?.close();
    if (process.platform !== 'darwin') {
      app.quit();
    }
  },
  onActivate: () => {
    createDesktopWindow();
  },
});
