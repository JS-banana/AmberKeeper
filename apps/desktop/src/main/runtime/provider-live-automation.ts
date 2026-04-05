import type {
  CaptureAttemptLogRecord,
  CaptureSessionRecord,
  ProviderId,
  ProviderLiveAutomationSpec,
  ProviderLiveProbeActionResult,
  ProviderLiveProbeOutcome,
  ProviderLiveProbeRequest,
  ProviderLiveProbeResult,
  ProviderLiveProbeSessionDelta,
  ProviderPageEvalRequest,
  ProviderPageEvalResult,
} from '@amberkeeper/shared-types';

export interface ProviderLiveAutomationRuntime {
  providerId: ProviderId;
  currentUrl: string;
  loadUrl: (url: string) => Promise<void>;
  browserSession: {
    config: {
      homeUrl: string;
    };
    runDomSnapshot: () => Promise<{ message: string; detail: string }>;
    readStructuredDomSnapshot: (fallbackUrl: string) => Promise<{
      url: string;
      title: string;
      messages: Array<{ role?: string; content?: string }>;
    }>;
  };
  view: {
    webContents: {
      executeJavaScript: (code: string, userGesture?: boolean) => Promise<unknown>;
    };
  };
}

export interface ProviderLiveAutomationDependencies {
  activateProvider: (providerId: ProviderId) => Promise<void> | void;
  resolveRuntime: (providerId: ProviderId) => ProviderLiveAutomationRuntime | null;
  getAutomationSpec: (providerId: ProviderId) => ProviderLiveAutomationSpec | null;
  listProviderSessions: (providerId: ProviderId) => CaptureSessionRecord[];
  listAttemptLogs: (limit?: number) => CaptureAttemptLogRecord[];
}

type ProbeSnapshot = {
  url: string;
  sessions: CaptureSessionRecord[];
  messageCounts: Record<string, number>;
  recentAttempts: CaptureAttemptLogRecord[];
  domMessageCount: number;
};

const DEFAULT_PROBE_TIMEOUT_MS = 30_000;
const SNAPSHOT_ATTEMPT_LIMIT = 40;
const POLL_INTERVAL_MS = 600;
const ACTIVITY_SETTLE_GRACE_MS = 3_000;

export function createProviderLiveAutomation(dependencies: ProviderLiveAutomationDependencies) {
  return {
    runProbe: (request: ProviderLiveProbeRequest) => runProviderLiveProbe(request, dependencies),
    evaluatePage: (request: ProviderPageEvalRequest) => evaluateProviderPage(request, dependencies),
  };
}

export type ProviderLiveAutomationService = ReturnType<typeof createProviderLiveAutomation>;

export async function evaluateProviderPage(
  request: ProviderPageEvalRequest,
  dependencies: ProviderLiveAutomationDependencies
): Promise<ProviderPageEvalResult> {
  const runtime = await ensureRuntime(request.providerId, dependencies, request.activate !== false);
  const result = await runtime.view.webContents.executeJavaScript(request.script, true);

  return {
    providerId: request.providerId,
    pageUrl: runtime.currentUrl,
    result,
  };
}

export async function runProviderLiveProbe(
  request: ProviderLiveProbeRequest,
  dependencies: ProviderLiveAutomationDependencies
): Promise<ProviderLiveProbeResult> {
  const spec = dependencies.getAutomationSpec(request.providerId);
  if (!spec) {
    return buildProbeResult({
      request,
      preUrl: '',
      postUrl: '',
      sessionDelta: emptySessionDelta(),
      attempts: dependencies.listAttemptLogs(SNAPSHOT_ATTEMPT_LIMIT),
      action: {
        ok: false,
        reason: 'automation-spec-missing',
      },
      domSnapshotMessage: 'Live probe could not start.',
      domSnapshotDetail: 'Missing automation spec for provider.',
      selectedHistoryItem: null,
      availableHistoryItems: [],
      promptText: request.promptText,
      outcome: 'blocked-selector-drift',
      remoteConversationId: null,
      notes: ['Automation spec missing for provider.'],
    });
  }

  const timeoutMs = clampTimeout(request.timeoutMs);
  const runtime = await ensureRuntime(request.providerId, dependencies, true);

  if (request.kind === 'new-message' && request.resetToHome !== false) {
    await runtime.loadUrl(runtime.browserSession.config.homeUrl);
  }

  const readySelectors =
    request.kind === 'new-message'
      ? spec.newMessage.readySelectors ?? spec.newMessage.composerSelectors
      : spec.historyClick.readySelectors ?? spec.historyClick.itemSelectors;
  await waitForSelectors(runtime, readySelectors, timeoutMs);

  const preSnapshot = await takeProbeSnapshot(request.providerId, runtime, dependencies);
  const promptText =
    request.kind === 'new-message'
      ? request.promptText ?? buildProbePrompt(request.providerId)
      : undefined;

  const action =
    request.kind === 'new-message'
      ? await performNewMessageAction(runtime, spec, promptText ?? '')
      : await performHistoryClickAction(runtime, spec, resolveRequestedHistoryItemIndex(request));

  if (!action.ok) {
    const domSnapshot = await safeRunDomSnapshot(runtime);
    const attempts = diffAttempts(
      preSnapshot.recentAttempts,
      dependencies.listAttemptLogs(SNAPSHOT_ATTEMPT_LIMIT)
    );
    const outcome = await resolveActionFailureOutcome(runtime, request.kind, action);

    return buildProbeResult({
      request,
      preUrl: preSnapshot.url,
      postUrl: runtime.currentUrl,
      sessionDelta: emptySessionDelta(preSnapshot.sessions),
      attempts,
      action,
      domSnapshotMessage: domSnapshot.message,
      domSnapshotDetail: domSnapshot.detail,
      selectedHistoryItem: action.historyItem ?? null,
      availableHistoryItems: action.availableHistoryItems ?? [],
      promptText,
      outcome,
      remoteConversationId: action.historyItem?.conversationId ?? null,
      notes: action.pageTextSample ? ['Captured page text sample for debugging.'] : [],
    });
  }

  const postSnapshot = await waitForProbeOutcome({
    providerId: request.providerId,
    runtime,
    dependencies,
    preSnapshot,
    timeoutMs,
  });
  const postDomSnapshot = await safeRunDomSnapshot(runtime);
  const sessionDelta = computeSessionDelta(preSnapshot, postSnapshot);
  const affectedSession = selectAffectedSession(postSnapshot, sessionDelta);
  const attempts = diffAttempts(preSnapshot.recentAttempts, postSnapshot.recentAttempts);
  const resolvedConversationId =
    affectedSession?.remoteConversationId ??
    action.historyItem?.conversationId ??
    resolveConversationIdFromKnownRoutes(postSnapshot.url);
  const outcome = resolveProbeOutcome({
    request,
    preSnapshot,
    postSnapshot,
    sessionDelta,
    attempts,
    remoteConversationId: resolvedConversationId,
  });

  return buildProbeResult({
    request,
    preUrl: preSnapshot.url,
    postUrl: postSnapshot.url,
    sessionDelta,
    attempts,
    action,
    domSnapshotMessage: postDomSnapshot.message,
    domSnapshotDetail: postDomSnapshot.detail,
    selectedHistoryItem: action.historyItem ?? null,
    availableHistoryItems: action.availableHistoryItems ?? [],
    promptText,
    outcome,
    remoteConversationId: resolvedConversationId,
    notes: buildEvidenceNotes({
      preSnapshot,
      postSnapshot,
      sessionDelta,
      action,
      affectedSession,
      attempts,
    }),
  });
}

export function computeSessionDelta(
  preSnapshot: ProbeSnapshot,
  postSnapshot: ProbeSnapshot
): ProviderLiveProbeSessionDelta {
  const beforeIds = new Set(preSnapshot.sessions.map((session) => session.id));
  const beforeRemoteConversationIds = preSnapshot.sessions
    .map((session) => session.remoteConversationId)
    .filter((value): value is string => Boolean(value));
  const afterRemoteConversationIds = postSnapshot.sessions
    .map((session) => session.remoteConversationId)
    .filter((value): value is string => Boolean(value));

  const newSessionIds = postSnapshot.sessions
    .filter((session) => !beforeIds.has(session.id))
    .map((session) => session.id);
  const updatedSessionIds = postSnapshot.sessions
    .filter((session) => beforeIds.has(session.id))
    .filter((session) => {
      const beforeMessageCount = preSnapshot.messageCounts[session.id] ?? 0;
      const afterMessageCount = postSnapshot.messageCounts[session.id] ?? 0;
      const beforeSession =
        preSnapshot.sessions.find((entry) => entry.id === session.id) ?? null;
      return (
        beforeMessageCount !== afterMessageCount ||
        beforeSession?.updatedAt !== session.updatedAt ||
        beforeSession?.remoteConversationId !== session.remoteConversationId
      );
    })
    .map((session) => session.id);

  const messageDeltas = postSnapshot.sessions
    .filter((session) => newSessionIds.includes(session.id) || updatedSessionIds.includes(session.id))
    .map((session) => ({
      sessionId: session.id,
      beforeMessageCount: preSnapshot.messageCounts[session.id] ?? 0,
      afterMessageCount: postSnapshot.messageCounts[session.id] ?? 0,
      remoteConversationId: session.remoteConversationId,
    }));

  return {
    beforeSessionCount: preSnapshot.sessions.length,
    afterSessionCount: postSnapshot.sessions.length,
    newSessionIds,
    updatedSessionIds,
    remoteConversationIdsBefore: beforeRemoteConversationIds,
    remoteConversationIdsAfter: afterRemoteConversationIds,
    messageDeltas,
  };
}

function emptySessionDelta(beforeSessions: CaptureSessionRecord[] = []): ProviderLiveProbeSessionDelta {
  const remoteConversationIds = beforeSessions
    .map((session) => session.remoteConversationId)
    .filter((value): value is string => Boolean(value));

  return {
    beforeSessionCount: beforeSessions.length,
    afterSessionCount: beforeSessions.length,
    newSessionIds: [],
    updatedSessionIds: [],
    remoteConversationIdsBefore: remoteConversationIds,
    remoteConversationIdsAfter: remoteConversationIds,
    messageDeltas: [],
  };
}

function buildProbeResult(input: {
  request: ProviderLiveProbeRequest;
  preUrl: string;
  postUrl: string;
  sessionDelta: ProviderLiveProbeSessionDelta;
  attempts: CaptureAttemptLogRecord[];
  action: ProviderLiveProbeActionResult;
  domSnapshotMessage: string;
  domSnapshotDetail: string;
  selectedHistoryItem: ProviderLiveProbeActionResult['historyItem'] | null;
  availableHistoryItems: ProviderLiveProbeActionResult['availableHistoryItems'];
  promptText?: string;
  outcome: ProviderLiveProbeOutcome;
  remoteConversationId: string | null;
  notes: string[];
}): ProviderLiveProbeResult {
  return {
    providerId: input.request.providerId,
    kind: input.request.kind,
    outcome: input.outcome,
    verdict: input.outcome,
    ok: input.outcome === 'passed',
    message: buildOutcomeMessage(input.outcome, input.request.providerId, input.request.kind),
    remoteConversationId: input.remoteConversationId,
    evidence: {
      ...buildUrlEvidence(input.preUrl, input.postUrl),
      promptText: input.promptText,
      selectedHistoryItem: input.selectedHistoryItem ?? undefined,
      availableHistoryItems: input.availableHistoryItems,
      domSnapshotMessage: input.domSnapshotMessage,
      domSnapshotDetail: input.domSnapshotDetail,
      sessionDelta: input.sessionDelta,
      attemptLogs: input.attempts,
      action: input.action,
      notes: input.notes,
    },
  };
}

function resolveRequestedHistoryItemIndex(request: ProviderLiveProbeRequest): number {
  return request.historyItemIndex ?? 0;
}

function buildUrlEvidence(preUrl: string, postUrl: string) {
  return {
    beforeUrl: preUrl,
    afterUrl: postUrl,
    preUrl,
    postUrl,
  };
}

function resolveConversationIdFromKnownRoutes(url: string): string | null {
  const match = url.match(/(?:\/c\/|\/chat\/|#\/chat\/)([^/?#]+)/);
  return match?.[1] ?? null;
}

function buildOutcomeMessage(
  outcome: ProviderLiveProbeOutcome,
  providerId: ProviderId,
  kind: ProviderLiveProbeRequest['kind']
): string {
  switch (outcome) {
    case 'passed':
      return `${providerId} ${kind} probe passed.`;
    case 'failed-no-history-target':
      return `${providerId} ${kind} probe could not find a valid history target.`;
    case 'blocked-login-or-antibot':
      return `${providerId} ${kind} probe appears blocked by login or anti-bot UI.`;
    case 'blocked-selector-drift':
      return `${providerId} ${kind} probe could not find the required page controls.`;
    case 'blocked-timeout':
      return `${providerId} ${kind} probe timed out without enough observable activity.`;
    case 'failed-no-local-insert':
      return `${providerId} ${kind} probe executed, but local history was not inserted or refreshed.`;
    case 'probe-action-failed':
      return `${providerId} ${kind} probe action failed before verification completed.`;
    default:
      return `${providerId} ${kind} probe finished with outcome ${outcome}.`;
  }
}

function buildEvidenceNotes(input: {
  preSnapshot: ProbeSnapshot;
  postSnapshot: ProbeSnapshot;
  sessionDelta: ProviderLiveProbeSessionDelta;
  action: ProviderLiveProbeActionResult;
  affectedSession: CaptureSessionRecord | null;
  attempts: CaptureAttemptLogRecord[];
}): string[] {
  const notes: string[] = [];

  if (input.preSnapshot.url !== input.postSnapshot.url) {
    notes.push('Observed page URL change during probe.');
  }
  if (input.preSnapshot.domMessageCount !== input.postSnapshot.domMessageCount) {
    notes.push('Observed DOM message-count change during probe.');
  }
  if (input.sessionDelta.newSessionIds.length > 0) {
    notes.push(`New sessions: ${input.sessionDelta.newSessionIds.join(', ')}`);
  }
  if (input.sessionDelta.updatedSessionIds.length > 0) {
    notes.push(`Updated sessions: ${input.sessionDelta.updatedSessionIds.join(', ')}`);
  }
  if (input.affectedSession?.remoteConversationId) {
    notes.push(`Affected remoteConversationId: ${input.affectedSession.remoteConversationId}`);
  }
  if (input.attempts.length > 0) {
    notes.push(`Captured ${input.attempts.length} new attempt log(s) during probe.`);
  }
  if (input.action.pageTextSample) {
    notes.push('Captured page text sample for selector-debugging context.');
  }

  return notes;
}

function resolveProbeOutcome(input: {
  request: ProviderLiveProbeRequest;
  preSnapshot: ProbeSnapshot;
  postSnapshot: ProbeSnapshot;
  sessionDelta: ProviderLiveProbeSessionDelta;
  attempts: CaptureAttemptLogRecord[];
  remoteConversationId: string | null;
}): ProviderLiveProbeOutcome {
  if (input.sessionDelta.newSessionIds.length > 0 || input.sessionDelta.updatedSessionIds.length > 0) {
    return 'passed';
  }

  if (
    input.request.kind === 'history-click' &&
    input.remoteConversationId &&
    input.preSnapshot.sessions.some((session) => session.remoteConversationId === input.remoteConversationId) &&
    input.postSnapshot.sessions.some((session) => session.remoteConversationId === input.remoteConversationId) &&
    input.postSnapshot.domMessageCount > 0
  ) {
    return 'passed';
  }

  if (hasLoginOrAntiBotSignal(input.attempts)) {
    return 'blocked-login-or-antibot';
  }

  const urlChanged = input.preSnapshot.url !== input.postSnapshot.url;
  const domChanged = input.preSnapshot.domMessageCount !== input.postSnapshot.domMessageCount;
  const attemptsChanged = input.attempts.length > 0;

  if (!urlChanged && !domChanged && !attemptsChanged) {
    return 'blocked-timeout';
  }

  return 'failed-no-local-insert';
}

async function resolveActionFailureOutcome(
  runtime: ProviderLiveAutomationRuntime,
  kind: ProviderLiveProbeRequest['kind'],
  action: ProviderLiveProbeActionResult
): Promise<ProviderLiveProbeOutcome> {
  if (kind === 'history-click' && action.reason === 'history-item-not-found') {
    return 'failed-no-history-target';
  }

  if (
    action.reason?.includes('selector') ||
    action.reason?.includes('composer') ||
    action.reason?.includes('button') ||
    action.reason?.includes('history-item')
  ) {
    const blocked = await detectLoginOrAntibot(runtime);
    return blocked ? 'blocked-login-or-antibot' : 'blocked-selector-drift';
  }

  return 'probe-action-failed';
}

function selectAffectedSession(
  snapshot: ProbeSnapshot,
  sessionDelta: ProviderLiveProbeSessionDelta
): CaptureSessionRecord | null {
  const preferredIds = [...sessionDelta.newSessionIds, ...sessionDelta.updatedSessionIds];
  for (const sessionId of preferredIds) {
    const session = snapshot.sessions.find((entry) => entry.id === sessionId) ?? null;
    if (session) {
      return session;
    }
  }

  return null;
}

async function ensureRuntime(
  providerId: ProviderId,
  dependencies: ProviderLiveAutomationDependencies,
  activate: boolean
): Promise<ProviderLiveAutomationRuntime> {
  if (activate) {
    await dependencies.activateProvider(providerId);
  }

  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    const runtime = dependencies.resolveRuntime(providerId);
    if (runtime) {
      return runtime;
    }

    await wait(POLL_INTERVAL_MS);
  }

  throw new Error(`Provider runtime was not ready for ${providerId}.`);
}

async function takeProbeSnapshot(
  providerId: ProviderId,
  runtime: ProviderLiveAutomationRuntime,
  dependencies: ProviderLiveAutomationDependencies
): Promise<ProbeSnapshot> {
  const sessions = dependencies.listProviderSessions(providerId);
  const messageCounts: Record<string, number> = {};

  for (const session of sessions) {
    messageCounts[session.id] = session.messageCount;
  }

  const structuredSnapshot = await runtime.browserSession.readStructuredDomSnapshot(runtime.currentUrl);

  return {
    url: structuredSnapshot.url || runtime.currentUrl,
    sessions,
    messageCounts,
    recentAttempts: dependencies.listAttemptLogs(SNAPSHOT_ATTEMPT_LIMIT),
    domMessageCount: structuredSnapshot.messages.length,
  };
}

async function waitForProbeOutcome(input: {
  providerId: ProviderId;
  runtime: ProviderLiveAutomationRuntime;
  dependencies: ProviderLiveAutomationDependencies;
  preSnapshot: ProbeSnapshot;
  timeoutMs: number;
}): Promise<ProbeSnapshot> {
  const deadline = Date.now() + input.timeoutMs;
  let latestSnapshot = input.preSnapshot;
  let activityObservedAt: number | null = null;

  while (Date.now() < deadline) {
    latestSnapshot = await takeProbeSnapshot(input.providerId, input.runtime, input.dependencies);
    const sessionDelta = computeSessionDelta(input.preSnapshot, latestSnapshot);
    const attempts = diffAttempts(input.preSnapshot.recentAttempts, latestSnapshot.recentAttempts);
    const urlChanged = latestSnapshot.url !== input.preSnapshot.url;
    const domChanged = latestSnapshot.domMessageCount !== input.preSnapshot.domMessageCount;

    if (sessionDelta.newSessionIds.length > 0 || sessionDelta.updatedSessionIds.length > 0) {
      return latestSnapshot;
    }

    if ((attempts.length > 0 || urlChanged || domChanged) && activityObservedAt === null) {
      activityObservedAt = Date.now();
    }

    if (
      activityObservedAt !== null &&
      Date.now() - activityObservedAt >= ACTIVITY_SETTLE_GRACE_MS
    ) {
      return latestSnapshot;
    }

    await wait(POLL_INTERVAL_MS);
  }

  return latestSnapshot;
}

async function waitForSelectors(
  runtime: ProviderLiveAutomationRuntime,
  selectors: string[],
  timeoutMs: number
): Promise<void> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const ready = await runtime.view.webContents.executeJavaScript(
      buildSelectorWaitScript(selectors),
      true
    );

    if (ready === true) {
      return;
    }

    await wait(POLL_INTERVAL_MS);
  }
}

async function performNewMessageAction(
  runtime: ProviderLiveAutomationRuntime,
  spec: ProviderLiveAutomationSpec,
  promptText: string
): Promise<ProviderLiveProbeActionResult> {
  return (await runtime.view.webContents.executeJavaScript(
    buildNewMessageActionScript(spec, promptText),
    true
  )) as ProviderLiveProbeActionResult;
}

async function performHistoryClickAction(
  runtime: ProviderLiveAutomationRuntime,
  spec: ProviderLiveAutomationSpec,
  historyItemIndex: number
): Promise<ProviderLiveProbeActionResult> {
  return (await runtime.view.webContents.executeJavaScript(
    buildHistoryClickActionScript(spec, historyItemIndex),
    true
  )) as ProviderLiveProbeActionResult;
}

async function safeRunDomSnapshot(runtime: ProviderLiveAutomationRuntime): Promise<{
  message: string;
  detail: string;
}> {
  try {
    return await runtime.browserSession.runDomSnapshot();
  } catch (error) {
    return {
      message: 'DOM snapshot failed during live probe.',
      detail: error instanceof Error ? error.message : String(error),
    };
  }
}

async function detectLoginOrAntibot(runtime: ProviderLiveAutomationRuntime): Promise<boolean> {
  const result = await runtime.view.webContents.executeJavaScript(
    `(() => {
      const text = (document.body?.innerText ?? '').toLowerCase();
      const tokens = ['登录', 'sign in', 'log in', 'captcha', 'verify', 'verification', 'human', '手机号'];
      return tokens.some((token) => text.includes(token.toLowerCase()));
    })()`,
    true
  );

  return result === true;
}

function diffAttempts(
  before: CaptureAttemptLogRecord[],
  after: CaptureAttemptLogRecord[]
): CaptureAttemptLogRecord[] {
  const beforeIds = new Set(before.map((attempt) => attempt.id));
  return after.filter((attempt) => !beforeIds.has(attempt.id));
}

function hasLoginOrAntiBotSignal(attempts: CaptureAttemptLogRecord[]): boolean {
  return attempts.some((attempt) => {
    const text = `${attempt.message}\n${attempt.detail ?? ''}`.toLowerCase();
    return (
      text.includes('captcha') ||
      text.includes('login') ||
      text.includes('sign in') ||
      text.includes('verify') ||
      text.includes('verification') ||
      text.includes('手机号')
    );
  });
}

function clampTimeout(input: number | undefined): number {
  if (!input) {
    return DEFAULT_PROBE_TIMEOUT_MS;
  }

  return Math.max(5_000, Math.min(input, 90_000));
}

function buildProbePrompt(providerId: ProviderId): string {
  return `[amberkeeper-live-probe ${providerId} ${new Date().toISOString()}] reply with OK only`;
}

function buildSelectorWaitScript(selectors: string[]): string {
  return `(() => {
    const selectors = ${JSON.stringify(selectors)};
    const visible = (element) =>
      Boolean(element) &&
      !!((element.offsetWidth ?? 0) || (element.offsetHeight ?? 0) || element.getClientRects().length);
    return selectors.some((selector) =>
      Array.from(document.querySelectorAll(selector)).some((element) => visible(element))
    );
  })()`;
}

function buildNewMessageActionScript(spec: ProviderLiveAutomationSpec, promptText: string): string {
  return `(async () => {
    const composerSelectors = ${JSON.stringify(spec.newMessage.composerSelectors)};
    const launcherButtonSelectors = ${JSON.stringify(spec.newMessage.launcherButtonSelectors ?? [])};
    const launcherButtonTextCandidates = ${JSON.stringify(spec.newMessage.launcherButtonTextCandidates ?? [])};
    const sendButtonSelectors = ${JSON.stringify(spec.newMessage.sendButtonSelectors ?? [])};
    const submitButtonTextCandidates = ${JSON.stringify(spec.newMessage.submitButtonTextCandidates ?? [])};
    const submitStrategy = ${JSON.stringify(spec.newMessage.submitStrategy ?? 'button-or-enter')};
    const promptText = ${JSON.stringify(promptText)};
    const visible = (element) =>
      Boolean(element) &&
      !!((element.offsetWidth ?? 0) || (element.offsetHeight ?? 0) || element.getClientRects().length);
    const queryFirstVisible = (selectors) => {
      for (const selector of selectors) {
        const candidate = Array.from(document.querySelectorAll(selector)).find((element) => visible(element));
        if (candidate) {
          return { element: candidate, selector };
        }
      }
      return null;
    };
    const clickLauncherButton = () => {
      const fromSelectors = queryFirstVisible(launcherButtonSelectors);
      if (fromSelectors?.element instanceof HTMLElement) {
        fromSelectors.element.click();
        return fromSelectors.selector;
      }

      if (launcherButtonTextCandidates.length === 0) {
        return null;
      }

      for (const element of Array.from(document.querySelectorAll('button, [role="button"], a'))) {
        if (!visible(element)) continue;
        const label = [
          element.textContent ?? '',
          element.getAttribute?.('aria-label') ?? '',
          element.getAttribute?.('title') ?? '',
        ]
          .join(' ')
          .toLowerCase();
        if (launcherButtonTextCandidates.some((token) => label.includes(String(token).toLowerCase()))) {
          element.click();
          return 'button, [role="button"], a';
        }
      }

      return null;
    };
    const bodyTextSample = () => (document.body?.innerText ?? '').slice(0, 500);
    const setNativeValue = (element, value) => {
      const proto = element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      const descriptor = Object.getOwnPropertyDescriptor(proto, 'value');
      descriptor?.set?.call(element, value);
      if (!descriptor?.set) {
        element.value = value;
      }
    };
    const fillComposer = (element) => {
      if (element instanceof HTMLTextAreaElement || element instanceof HTMLInputElement) {
        element.focus();
        element.dispatchEvent(
          new InputEvent('beforeinput', {
            bubbles: true,
            cancelable: true,
            data: promptText,
            inputType: 'insertText',
          })
        );
        setNativeValue(element, promptText);
        element.dispatchEvent(
          new InputEvent('input', {
            bubbles: true,
            data: promptText,
            inputType: 'insertText',
          })
        );
        element.dispatchEvent(new Event('change', { bubbles: true }));
        element.dispatchEvent(new KeyboardEvent('keyup', { key: ' ', code: 'Space', bubbles: true }));
        if (typeof element.setSelectionRange === 'function') {
          const end = element.value.length;
          element.setSelectionRange(end, end);
        }
        return true;
      }
      if (element instanceof HTMLElement && element.isContentEditable) {
        element.focus();
        const selection = window.getSelection();
        const range = document.createRange();
        range.selectNodeContents(element);
        range.collapse(false);
        selection?.removeAllRanges();
        selection?.addRange(range);
        element.dispatchEvent(
          new InputEvent('beforeinput', {
            bubbles: true,
            cancelable: true,
            data: promptText,
            inputType: 'insertText',
          })
        );
        try {
          const inserted = document.execCommand('insertText', false, promptText);
          if (!inserted) {
            element.textContent = promptText;
          }
        } catch {
          element.textContent = promptText;
        }
        element.dispatchEvent(new InputEvent('input', { bubbles: true, data: promptText, inputType: 'insertText' }));
        element.dispatchEvent(new KeyboardEvent('keyup', { key: ' ', code: 'Space', bubbles: true }));
        return true;
      }
      return false;
    };
    const clickSendButton = () => {
      for (const selector of sendButtonSelectors) {
        for (const element of Array.from(document.querySelectorAll(selector))) {
          if (!visible(element)) continue;
          const tokens = [
            element.textContent ?? '',
            element.getAttribute?.('aria-label') ?? '',
            element.getAttribute?.('title') ?? '',
          ];
          const label = tokens.join(' ').toLowerCase();
          if (
            submitButtonTextCandidates.length === 0 ||
            submitButtonTextCandidates.some((token) => label.includes(String(token).toLowerCase()))
          ) {
            element.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
            element.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
            element.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
            element.click();
            return selector;
          }
        }
      }
      return null;
    };
    const dispatchEnter = (element, extra = {}) => {
      for (const type of ['keydown', 'keypress', 'keyup']) {
        element.dispatchEvent(
          new KeyboardEvent(type, {
            key: 'Enter',
            code: 'Enter',
            keyCode: 13,
            which: 13,
            bubbles: true,
            cancelable: true,
            ...extra,
          })
        );
      }
    };

    let composerMatch = queryFirstVisible(composerSelectors);
    if (!composerMatch) {
      const launcherSelector = clickLauncherButton();
      if (launcherSelector) {
        await new Promise((resolve) => setTimeout(resolve, 800));
        composerMatch = queryFirstVisible(composerSelectors);
      }
    }

    if (!composerMatch) {
      return {
        ok: false,
        reason: 'composer-not-found',
        selector: null,
        submitSelector: null,
        historyItem: null,
        pageTextSample: bodyTextSample(),
      };
    }

    if (!fillComposer(composerMatch.element)) {
      return {
        ok: false,
        reason: 'composer-fill-failed',
        selector: composerMatch.selector,
        submitSelector: null,
        historyItem: null,
        pageTextSample: bodyTextSample(),
      };
    }

    await new Promise((resolve) => setTimeout(resolve, 150));

    let submitSelector = null;
    if (submitStrategy === 'button-or-enter' || submitStrategy === 'button-only') {
      submitSelector = clickSendButton();
      if (!submitSelector && submitStrategy === 'button-only') {
        return {
          ok: false,
          reason: 'send-button-not-found',
          selector: composerMatch.selector,
          submitSelector: null,
          historyItem: null,
          pageTextSample: bodyTextSample(),
        };
      }
    }

    if (!submitSelector) {
      if (submitStrategy === 'meta-enter') {
        dispatchEnter(composerMatch.element, { metaKey: true });
      } else if (submitStrategy === 'ctrl-enter') {
        dispatchEnter(composerMatch.element, { ctrlKey: true });
      } else {
        dispatchEnter(composerMatch.element);
      }
    }

    return {
      ok: true,
      selector: composerMatch.selector,
      submitSelector,
      historyItem: null,
      pageTextSample: bodyTextSample(),
    };
  })()`;
}

function buildHistoryClickActionScript(spec: ProviderLiveAutomationSpec, historyItemIndex: number): string {
  return `(() => {
    const itemSelectors = ${JSON.stringify(spec.historyClick.itemSelectors)};
    const ignoreTextPatterns = ${JSON.stringify(spec.historyClick.ignoreTextPatterns ?? [])};
    const routeFragments = ${JSON.stringify(spec.historyClick.routeFragments ?? [])};
    const maxItems = ${JSON.stringify(spec.historyClick.maxItems ?? 12)};
    const targetIndex = ${JSON.stringify(historyItemIndex)};
    const visible = (element) =>
      Boolean(element) &&
      !!((element.offsetWidth ?? 0) || (element.offsetHeight ?? 0) || element.getClientRects().length);
    const currentUrl = location.href;
    const bodyTextSample = () => (document.body?.innerText ?? '').slice(0, 500);
    const readHref = (element) => {
      if (element instanceof HTMLAnchorElement) {
        return element.href;
      }
      const anchor = element.querySelector?.('a[href]');
      return anchor instanceof HTMLAnchorElement ? anchor.href : null;
    };
    const readConversationId = (href) => {
      if (!href) return null;
      for (const fragment of routeFragments) {
        const index = href.indexOf(fragment);
        if (index >= 0) {
          const candidate = href.slice(index + fragment.length).split(/[?#/]/)[0] ?? '';
          if (candidate.trim()) {
            return candidate.trim();
          }
        }
      }
      return null;
    };
    const pushCandidate = (map, selector, element) => {
      if (!visible(element)) return;
      const text = (element.textContent ?? '').trim().replace(/\\s+/g, ' ');
      const href = readHref(element);
      const lowerText = text.toLowerCase();
      if (!text) return;
      if (ignoreTextPatterns.some((token) => lowerText.includes(String(token).toLowerCase()))) return;
      if (href && href === currentUrl) return;
      const key = text + '\\u0000' + (href ?? '');
      if (map.has(key)) return;
      map.set(key, { selector, text, href, conversationId: readConversationId(href) });
    };
    const candidateMap = new Map();
    for (const selector of itemSelectors) {
      for (const element of Array.from(document.querySelectorAll(selector)).slice(0, maxItems * 2)) {
        pushCandidate(candidateMap, selector, element);
      }
    }
    const availableHistoryItems = Array.from(candidateMap.values())
      .slice(0, maxItems)
      .map((item, index) => ({
        index,
        label: item.text,
        href: item.href,
        conversationId: item.conversationId,
      }));
    const selected =
      availableHistoryItems[Math.max(0, Math.min(targetIndex, availableHistoryItems.length - 1))] ??
      null;
    if (!selected) {
      return {
        ok: false,
        reason: 'history-item-not-found',
        selector: null,
        submitSelector: null,
        historyItem: null,
        availableHistoryItems,
        pageTextSample: bodyTextSample(),
      };
    }
    const target =
      Array.from(candidateMap.values()).find((item) => item.text === selected.label && item.href === selected.href) ??
      null;
    if (!target) {
      return {
        ok: false,
        reason: 'history-item-not-found',
        selector: null,
        submitSelector: null,
        historyItem: null,
        availableHistoryItems,
        pageTextSample: bodyTextSample(),
      };
    }
    const clickTarget = Array.from(document.querySelectorAll(target.selector)).find((element) => {
      const text = (element.textContent ?? '').trim().replace(/\\s+/g, ' ');
      const href = readHref(element);
      return text === target.text && href === target.href;
    });
    if (!(clickTarget instanceof Element)) {
      return {
        ok: false,
        reason: 'history-item-not-found',
        selector: target.selector,
        submitSelector: null,
        historyItem: null,
        availableHistoryItems,
        pageTextSample: bodyTextSample(),
      };
    }
    clickTarget.scrollIntoView({ block: 'center', inline: 'nearest' });
    clickTarget.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    clickTarget.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    clickTarget.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    clickTarget.click();
    return {
      ok: true,
      selector: target.selector,
      submitSelector: null,
      historyItem: selected,
      availableHistoryItems,
      pageTextSample: bodyTextSample(),
    };
  })()`;
}

function wait(delayMs: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, delayMs);
  });
}
