import { deepseekAdapter } from '@amberkeeper/provider-deepseek';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { createHistoryDomHydrationService } from '../src/main/capture/history-dom-hydration-service';
import { createNetworkResponseIngestionService } from '../src/main/capture/network-response-ingestion-service';
import { createRequestIngestionService } from '../src/main/capture/request-ingestion-service';
import { summarizeDomSnapshotMetadata } from '../src/main/diagnostics/dom-snapshot-metadata';
import { CaptureStore } from '../src/main/storage/capture-store';

const conversationId = 'privacy-conv';
const pageUrl = `https://chat.deepseek.com/a/chat/s/${conversationId}`;
const responseUrl = 'https://chat.deepseek.com/api/v0/chat/completion';
const historyUrl = `https://chat.deepseek.com/api/v0/chat/history_messages?chat_session_id=${conversationId}`;
const capturedAt = '2026-07-04T04:11:34.036Z';
const signalContext = {
  provider: 'deepseek',
  source: 'cdp-network',
  sourceSessionKey: 'deepseek-primary-view',
  requestId: 'request-1',
  pageUrl,
  capturedAt,
} as const;
const tracked = {
  ...signalContext,
  url: responseUrl,
  method: 'POST',
  classification: 'capture',
} as const;

function readAttempt(store: CaptureStore, stage: string, message?: string) {
  const attempt = store.listAttemptLogs().find(
    (row) => row.stage === stage && (message === undefined || row.message.includes(message))
  );
  if (!attempt) throw new Error(`No matching attempt: ${stage}`);
  const row = store.getDb()
    .prepare('SELECT message, detail FROM capture_attempt_logs WHERE id = ?')
    .get(attempt.id);
  expect(row).toEqual({ message: attempt.message, detail: attempt.detail });
  return attempt;
}

describe('capture attempt privacy', () => {
  let store: CaptureStore;
  const recordAttempt: CaptureStore['logAttempt'] = (attempt) => store.logAttempt(attempt);

  beforeEach(() => {
    store = new CaptureStore(':memory:');
  });

  afterEach(() => {
    store.close();
  });

  test.each(['user', 'complete'] as const)('keeps DeepSeek response diagnostics scoped to %s', async (scope) => {
    store.setCaptureSaveScope(scope);
    const emitProviderSignals = vi.fn();
    const captureConversationFromDom = vi.fn();
    const service = createNetworkResponseIngestionService({
      buildHistoryEnvelopeFromTrackedResponse: () => null,
      persistAutoCachedEnvelope: vi.fn(),
      emitProviderSignals,
      captureConversationFromDom,
      recordAttempt,
      formatError: String,
    });
    const assistant = 'ASSISTANT_IN_NORMALIZED_SIGNAL';
    const rawOnly = 'ASSISTANT_IN_UNCLASSIFIED_RESPONSE_FIELD';
    const body = `data: ${JSON.stringify({
      chat_session_id: conversationId,
      response_message_id: 42,
      content: assistant,
      extra: rawOnly,
    })}\ndata: [DONE]`;
    await service.handleResponseBodySeen({
      adapter: deepseekAdapter,
      tracked,
      signal: { ...signalContext, kind: 'responseBodySeen', body, base64Encoded: false },
    });

    const parsedAttempt = readAttempt(store, 'response-parsed');
    const [url, ...summary] = (parsedAttempt.detail ?? '').split('\n');
    expect(url).toBe(responseUrl);
    expect(parsedAttempt.message).toContain('Parsed 2 signal(s)');
    expect(parsedAttempt.detail).toContain('"kind": "assistantMayBeReady"');
    expect(parsedAttempt.detail).toContain(`"conversationId": "${conversationId}"`);
    expect(parsedAttempt.detail).toContain('"remoteMessageId": "42"');
    expect(parsedAttempt.detail).toContain('"stable": true');
    if (scope === 'user') {
      expect(parsedAttempt.detail).not.toContain(assistant);
      expect(parsedAttempt.detail).not.toContain(rawOnly);
      expect(parsedAttempt.detail).not.toContain('"content"');
      expect(JSON.parse(summary.join('\n'))).toHaveLength(2);
    } else {
      expect(parsedAttempt.detail).toContain(`"content": "${assistant}"`);
      expect(parsedAttempt.detail).toContain(rawOnly);
    }
    expect(emitProviderSignals).toHaveBeenCalledWith(expect.arrayContaining([
      expect.objectContaining({ kind: 'assistantMayBeReady', content: assistant }),
    ]));
    expect(captureConversationFromDom).toHaveBeenCalledWith(pageUrl);

    const unparsedBody = 'ASSISTANT_IN_UNPARSED_RESPONSE';
    await service.handleResponseBodySeen({
      adapter: deepseekAdapter,
      tracked,
      signal: { ...signalContext, kind: 'responseBodySeen', body: unparsedBody, base64Encoded: false },
    });
    const unparsed = readAttempt(store, 'response-sse');
    expect(unparsed.message).toContain('parsed no normalized messages');
    expect(unparsed.detail).toContain(responseUrl);
    expect(unparsed.detail?.includes(unparsedBody)).toBe(scope === 'complete');
    if (scope === 'user') {
      expect(unparsed.detail).toContain(`responseBytes=${Buffer.byteLength(unparsedBody)}`);
    }

    const parserError = 'ASSISTANT_IN_PARSER_EXCEPTION';
    service.handleResponseBodyFailed({
      tracked,
      signal: { ...signalContext, kind: 'responseBodyFailed', error: new SyntaxError(parserError) },
    });
    const failed = readAttempt(store, 'response-body');
    expect(failed.status).toBe('error');
    expect(failed.detail).toContain(responseUrl);
    expect(failed.detail?.includes(parserError)).toBe(scope === 'complete');
  });

  test.each(['user', 'complete'] as const)('keeps failed DOM hydration diagnostics scoped to %s', async (scope) => {
    store.setCaptureSaveScope(scope);
    const samples = [
      'ASSISTANT_IN_GENERIC_DOM',
      'ASSISTANT_IN_FETCH',
      'ASSISTANT_IN_DOM_TEXT',
      'ASSISTANT_IN_DOM_HTML',
      'ASSISTANT_IN_CANDIDATE_NODE',
    ];
    const persistHydratedConversationSnapshot = vi.fn();
    const runDomSnapshot = vi.fn(async () => ({
      message: 'Collected 0 DeepSeek DOM message block(s).',
      detail: JSON.stringify({
        url: pageUrl,
        messages: [],
        debug: {
          providerId: 'deepseek',
          selectorCounts: { classContainsAssistant: 4 },
          textSamples: [samples[0]],
        },
      }),
    }));
    const executeJavaScript = vi.fn(async () => ({
      historyFetch: { ok: true, status: 200, url: historyUrl, preview: samples[1] },
      dom: {
        locationHref: pageUrl,
        bodyTextSample: samples[2],
        mainHtmlSample: `<main>${samples[3]}</main>`,
        selectorCounts: { '.assistant-message': 3 },
        candidateNodes: [{ selector: '[class*="message"]', textSample: samples[4] }],
      },
    }));
    const service = createHistoryDomHydrationService({
      getProviderAdapter: () => deepseekAdapter,
      wait: vi.fn(),
      formatError: String,
      recordAttempt,
      persistHydratedConversationSnapshot,
      domCapturePollAttempts: 1,
      domCapturePollIntervalMs: 0,
    });
    await expect(service.runConversationHistoryCaptureFromDom({
      providerId: 'deepseek',
      runtime: {
        currentUrl: pageUrl,
        browserSession: {
          readStructuredDomSnapshot: async () => ({ url: pageUrl, title: '', messages: [] }),
          runDomSnapshot,
        },
        view: { webContents: { executeJavaScript } },
      },
      targetUrl: pageUrl,
      preferredConversationId: conversationId,
      stage: 'history-hydration',
      emptyMessage: 'No DOM history.',
    })).resolves.toEqual({ message: 'No DOM history.', detail: pageUrl });
    expect(persistHydratedConversationSnapshot).not.toHaveBeenCalled();
    expect(runDomSnapshot).toHaveBeenCalledOnce();
    expect(executeJavaScript).toHaveBeenCalledOnce();

    const failure = readAttempt(store, 'history-hydration', 'found no DOM messages');
    expect(failure.detail).toContain(`remoteConversationId=${conversationId}`);
    expect(failure.detail).toContain(historyUrl);
    expect(failure.detail).toContain('"status":200');
    expect(failure.detail).toContain('".assistant-message":3');
    expect(failure.detail).toContain('"classContainsAssistant":4');
    for (const sample of samples) {
      expect(failure.detail?.includes(sample)).toBe(scope === 'complete');
    }
  });

  test.each(['user', 'complete'] as const)('scopes mixed request diagnostics without changing the saved user message (%s)', (scope) => {
    store.setCaptureSaveScope(scope);
    const service = createRequestIngestionService({
      maybeAutoCacheDiscoveredConversation: vi.fn(),
      emitProviderSignals: vi.fn(),
      recordUniqueObservation: (_key, input) => recordAttempt(input),
      recordAttempt,
      persistEnvelope: (envelope) => store.persistEnvelope(envelope),
      markCapturePersisted: vi.fn(),
      resolveActiveRuntimeTitle: () => null,
      captureConversationFromDom: vi.fn(),
    });
    const prompt = 'USER_PROMPT';
    const mixed = 'ASSISTANT_IN_REQUEST_CONTEXT';
    service.handleRequestSeen({
      adapter: deepseekAdapter,
      signal: {
        ...signalContext,
        kind: 'requestSeen',
        url: responseUrl,
        method: 'POST',
        resourceType: 'Fetch',
        postData: JSON.stringify({ prompt, context: mixed }),
      },
    });
    const request = readAttempt(store, 'request-candidate');
    expect(request.message).toContain(responseUrl);
    expect(request.detail?.includes(mixed)).toBe(scope === 'complete');
    if (scope === 'user') expect(request.detail).toBe(pageUrl);
    const persisted = readAttempt(store, 'request-user-persist');
    expect(persisted.detail).toContain(conversationId);
    expect(persisted.detail?.includes(prompt)).toBe(scope === 'complete');
    expect(store.listMessages(store.listSessions()[0].id).map(({ content }) => content)).toEqual([prompt]);
  });

  test('projects a manual DOM snapshot to counts and rejects unstructured details', () => {
    const snapshot = JSON.stringify({
      url: pageUrl,
      title: 'ASSISTANT_IN_TITLE',
      texts: ['user: example', 'assistant: ASSISTANT_IN_TEXT'],
    });
    expect(summarizeDomSnapshotMetadata(snapshot)).toBe(JSON.stringify({ url: pageUrl, sampledMessageCount: 2 }));
    expect(summarizeDomSnapshotMetadata('ASSISTANT_IN_OPAQUE_SNAPSHOT')).toBeNull();
    expect(summarizeDomSnapshotMetadata('{"preview":"ASSISTANT_IN_UNKNOWN_FIELD"}')).toBeNull();
  });

  test('drops unclassified details for new writes without changing older rows', () => {
    const input = {
      source: 'runtime',
      status: 'error',
      message: 'Diagnostic failure.',
      detail: 'UNCLASSIFIED_DIAGNOSTIC_TEXT',
      createdAt: capturedAt,
    } as const;
    store.logAttempt({ ...input, stage: 'before-scope-change' });
    store.setCaptureSaveScope('user');
    store.logAttempt({ ...input, stage: 'after-scope-change' });

    expect(readAttempt(store, 'after-scope-change').detail).toBeNull();
    expect(readAttempt(store, 'before-scope-change').detail).toBe(input.detail);
  });
});
