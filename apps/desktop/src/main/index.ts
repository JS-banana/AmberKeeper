import {
  createCaptureOrchestrator,
  createTurnPersistenceService,
  type CompletedTurn,
  type ProviderSignal,
  type RuntimeSignal,
} from '@amberkeeper/capture-core';
import type {
  CaptureSessionRecord,
  ProviderId,
  ProviderMoveDirection,
  ProviderRecord,
  RuntimeStatus,
  ShellInfo,
} from '@amberkeeper/shared-types';
import { app, BrowserWindow } from 'electron';
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
import { getProviderAdapter } from './runtime/provider-adapters';
import { createCdpObserver } from './runtime/cdp-observer';
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
const PANEL_WIDTH = 88;
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
  view: BrowserSessionRuntime['view'];
  loadInitialUrl: () => Promise<void>;
  loadUrl: (url: string) => Promise<void>;
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
let activeProviderId: ProviderId | null = null;
let currentUrl = '';
let lastCaptureAt: string | null = null;
let domCaptureInFlight = false;
let nativeStageVisible = true;

const trackedRequests = new Map<string, TrackedRequest>();
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
  runtime.view = browserSessionRuntime.view;
  runtime.loadInitialUrl = browserSessionRuntime.loadInitialUrl;
  runtime.loadUrl = browserSessionRuntime.loadUrl;
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
    trackedRequests.delete(getTrackedRequestKey(signal.provider, signal.requestId));
    recordAttempt({
      source: 'cdp-network',
      stage: 'response-body',
      status: 'error',
      message: 'Failed to retrieve or parse a ChatGPT response body.',
      detail: formatError(signal.error),
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

async function hydrateSessionHistory(
  session: CaptureSessionRecord,
  runtime: ProviderRuntimeContext,
  targetUrl: string
): Promise<{ message: string; detail: string }> {
  recordAttempt({
    source: 'preload-dom',
    stage: 'history-hydration',
    status: 'info',
    message: 'Started DOM hydration for the selected session.',
    detail: [`session=${session.id}`, `targetUrl=${targetUrl}`].join('\n'),
    createdAt: new Date().toISOString(),
  });

  const adapter = getProviderAdapter(session.provider);
  let previousSignature: string | null = null;
  let bestSnapshot:
    | {
        url: string;
        conversationId: string | null;
        messages: Array<{ role?: string; content?: string }>;
      }
    | null = null;

  for (let attempt = 0; attempt < DOM_CAPTURE_POLL_ATTEMPTS; attempt += 1) {
    const snapshot = await runtime.browserSession.readStructuredDomSnapshot(runtime.currentUrl || targetUrl);
    const conversationId =
      adapter?.extractConversationIdFromUrl(snapshot.url) ?? session.remoteConversationId ?? null;
    const normalized = normalizeHydratedDomMessages(snapshot.messages, {
      capturedAt: new Date().toISOString(),
      conversationId,
    });

    if (normalized.length > 0) {
      bestSnapshot = {
        url: snapshot.url || targetUrl,
        conversationId,
        messages: snapshot.messages,
      };

      const signature = createHydrationSignature(snapshot.messages);
      if (signature === previousSignature) {
        return persistHydratedSessionSnapshot(session, runtime, bestSnapshot, targetUrl);
      }

      previousSignature = signature;
    }

    await wait(DOM_CAPTURE_POLL_INTERVAL_MS);
  }

  if (bestSnapshot) {
    return persistHydratedSessionSnapshot(session, runtime, bestSnapshot, targetUrl);
  }

  const deepSeekHistoryDiagnostics =
    session.provider === 'deepseek'
      ? await collectDeepSeekHistoryFetchDiagnostics(runtime, session.remoteConversationId)
      : null;

  const createdAt = new Date().toISOString();
  recordAttempt({
    source: 'preload-dom',
    stage: 'history-hydration',
    status: 'info',
    message: 'Opened remote session but found no DOM messages to hydrate.',
    detail: [
      targetUrl,
      `session=${session.id}`,
      deepSeekHistoryDiagnostics ? `deepseekHistory=${deepSeekHistoryDiagnostics}` : '',
    ]
      .filter(Boolean)
      .join('\n'),
    createdAt,
  });

  return {
    message: 'No DOM history was available for the selected session.',
    detail: targetUrl,
  };
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
            relayBridgeType: typeof window.amberkeeperPageNetworkRelay,
            relaySendType: typeof window.amberkeeperPageNetworkRelay?.send,
            relayInstalled: window.__amberkeeperPageNetworkCaptureInstalled ?? null,
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
      relayBridgeType?: string;
      relaySendType?: string;
      relayInstalled?: boolean | null;
    } | null;

    return summarizeDeepSeekHydrationDiagnostics({
      historyFetch: diagnostics?.historyFetch ?? null,
      dom: diagnostics?.dom ?? null,
      relayBridgeType: diagnostics?.relayBridgeType ?? '',
      relaySendType: diagnostics?.relaySendType ?? '',
      relayInstalled: diagnostics?.relayInstalled ?? null,
    });
  } catch (error) {
    return `executeJavaScript failed: ${formatError(error)}`;
  }
}

function persistHydratedSessionSnapshot(
  session: CaptureSessionRecord,
  runtime: ProviderRuntimeContext,
  snapshot: {
    url: string;
    conversationId: string | null;
    messages: Array<{ role?: string; content?: string }>;
  },
  targetUrl: string
): { message: string; detail: string } {
  const capturedAt = new Date().toISOString();
  const messages = normalizeHydratedDomMessages(snapshot.messages, {
    capturedAt,
    conversationId: snapshot.conversationId,
  });

  if (messages.length === 0) {
    recordAttempt({
      source: 'preload-dom',
      stage: 'history-hydration',
      status: 'info',
      message: 'Opened remote session but normalized history was empty.',
      detail: `${targetUrl}\nsession=${session.id}`,
      createdAt: capturedAt,
    });

    return {
      message: 'The selected session did not expose any normalized history yet.',
      detail: targetUrl,
    };
  }

  captureStore?.replaceSessionEnvelope(session.id, {
    provider: session.provider,
    source: 'preload-dom',
    pageUrl: snapshot.url || targetUrl,
    capturedAt,
    sourceSessionKey: runtime.browserSession.config.sourceSessionKey,
    remoteConversationId: snapshot.conversationId ?? session.remoteConversationId ?? undefined,
    title: snapshot.title?.trim() || session.title,
    titleSource: snapshot.title?.trim() ? 'provider' : session.titleSource ?? 'fallback',
    messages,
  });
  lastCaptureAt = capturedAt;

  recordAttempt({
    source: 'preload-dom',
    stage: 'history-hydration',
    status: 'captured',
    message: `Hydrated ${messages.length} message(s) from the selected session.`,
    detail: `${snapshot.url || targetUrl}\nsession=${session.id}`,
    createdAt: capturedAt,
  });

  return {
    message: `Hydrated ${messages.length} message(s) from the selected session.`,
    detail: snapshot.url || targetUrl,
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

function handleRelayedNetworkPayload(payload: {
  url?: string;
  method?: string;
  status?: number | null;
  body?: string;
  pageUrl?: string;
  capturedAt?: string;
}): void {
  if (!payload.url || !payload.method || typeof payload.body !== 'string') {
    return;
  }

  recordAttempt({
    source: 'runtime',
    stage: 'page-network-relay',
    status: 'info',
    message: 'Relayed page-owned network response body.',
    detail: [
      payload.url,
      `status=${payload.status ?? ''}`,
      payload.pageUrl ? `pageUrl=${payload.pageUrl}` : '',
      payload.body.slice(0, 2000),
    ]
      .filter(Boolean)
      .join('\n'),
    createdAt: payload.capturedAt ?? new Date().toISOString(),
  });
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
      deleteSession: (sessionId) => captureStore?.deleteSession(sessionId),
      exportSession: (sessionId, format) => captureStore?.exportSession(sessionId, format),
      exportProviderSessions: (providerId, format) =>
        captureStore?.exportProviderSessions(providerId as ProviderId, format),
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
      onPageContext: () => {
        publishRuntimeStatus();
      },
      onRelayedNetworkPayload: handleRelayedNetworkPayload,
    });

    createDesktopWindow();
  },
  onWindowAllClosed: () => {
    captureStore?.close();
    if (process.platform !== 'darwin') {
      app.quit();
    }
  },
  onActivate: () => {
    createDesktopWindow();
  },
});
