import type { DomSnapshotSeenSignal } from '@amberkeeper/capture-core';
// Keep sandboxed preload bundles on DOM-only/provider-automation code paths.
// Importing provider package roots can pull parser/network modules with Node-only
// dependencies that do not load inside sandboxed remote-content preloads.
import {
  buildClaudeDomSignal,
  buildClaudeDomSnapshot,
  collectClaudeStructuredMessages,
} from '../../../../packages/provider-claude/src/dom';
import {
  buildDeepSeekDomSignal,
  buildDeepSeekDomSnapshot,
  collectDeepSeekStructuredMessages,
} from '../../../../packages/provider-deepseek/src/dom';
import {
  buildDoubaoDomSignal,
  buildDoubaoDomSnapshot,
  collectDoubaoStructuredMessages,
} from '../../../../packages/provider-doubao/src/dom';
import { doubaoLiveAutomationSpec } from '../../../../packages/provider-doubao/src/automation';
import {
  buildGeminiDomSignal,
  buildGeminiDomSnapshot,
  collectGeminiStructuredMessages,
} from '../../../../packages/provider-gemini/src/dom';
import {
  buildGrokDomSignal,
  buildGrokDomSnapshot,
  collectGrokStructuredMessages,
} from '../../../../packages/provider-grok/src/dom';
import { grokLiveAutomationSpec } from '../../../../packages/provider-grok/src/automation';
import {
  buildKimiDomSignal,
  buildKimiDomSnapshot,
  collectKimiStructuredMessages,
} from '../../../../packages/provider-kimi/src/dom';
import { kimiLiveAutomationSpec } from '../../../../packages/provider-kimi/src/automation';
import {
  buildQianwenDomSignal,
  buildQianwenDomSnapshot,
  collectQianwenStructuredMessages,
} from '../../../../packages/provider-qianwen/src/dom';
import { qianwenLiveAutomationSpec } from '../../../../packages/provider-qianwen/src/automation';
import {
  buildChatGptDomSignal,
  buildChatGptDomSnapshot,
  collectChatGptStructuredMessages,
} from '../../../../packages/provider-chatgpt/src/dom';
import { chatgptLiveAutomationSpec } from '../../../../packages/provider-chatgpt/src/automation';
import {
  buildXiaomiAistudioDomSignal,
  buildXiaomiAistudioDomSnapshot,
  collectXiaomiAistudioStructuredMessages,
} from '../../../../packages/provider-xiaomi-aistudio/src/dom';
import { xiaomiAistudioLiveAutomationSpec } from '../../../../packages/provider-xiaomi-aistudio/src/automation';
import type { ProviderId, ProviderLiveProbeRequest } from '@amberkeeper/shared-types';
import {
  runProviderLiveDomProbe,
  type ProviderLiveDomProbeResult,
} from './provider-live-automation';

export interface StructuredSnapshotResult {
  url: string;
  title: string;
  messages: Array<{ role?: string; content?: string }>;
}

export interface ChatCaptureApi {
  snapshotDom: () => { message: string; detail: string };
  snapshotMessages: () => StructuredSnapshotResult;
  snapshotSignal: () => DomSnapshotSeenSignal | StructuredSnapshotResult;
  runLiveProbe: (request: ProviderLiveProbeRequest) => ProviderLiveDomProbeResult;
}

interface ProviderDomCaptureContext {
  url: string;
  title: string;
  capturedAt: string;
  root: ParentNode;
}

interface ProviderDomCaptureDriver {
  id: ProviderId;
  sourceSessionKey: string;
  matches: (url: string) => boolean;
  snapshotDom: (context: ProviderDomCaptureContext) => { message: string; detail: string };
  snapshotMessages: (context: ProviderDomCaptureContext) => StructuredSnapshotResult;
  snapshotSignal: (context: ProviderDomCaptureContext) => DomSnapshotSeenSignal;
  runLiveProbe: (
    context: ProviderDomCaptureContext,
    request: ProviderLiveProbeRequest
  ) => ProviderLiveDomProbeResult;
}

export function createChatCaptureApi(input: {
  getUrl: () => string;
  getTitle: () => string;
  getCapturedAt: () => string;
  root?: ParentNode;
}): ChatCaptureApi {
  return {
    snapshotDom: () => {
      const context = getContext(input);
      const driver = resolveProviderDomCaptureDriver(context.url);
      return driver?.snapshotDom(context) ?? buildEmptySnapshot(context);
    },
    snapshotMessages: () => {
      const context = getContext(input);
      const driver = resolveProviderDomCaptureDriver(context.url);
      return driver?.snapshotMessages(context) ?? buildEmptyStructuredSnapshot(context);
    },
    snapshotSignal: () => {
      const context = getContext(input);
      const driver = resolveProviderDomCaptureDriver(context.url);
      return driver?.snapshotSignal(context) ?? buildEmptyStructuredSnapshot(context);
    },
    runLiveProbe: (request) => {
      const context = getContext(input);
      const driver = resolveProviderDomCaptureDriver(context.url);
      return (
        driver?.runLiveProbe(context, request) ?? {
          action: {
            ok: false,
            reason: 'No provider-specific live probe is registered for the current page.',
          },
          availableHistoryItems: [],
          notes: [],
        }
      );
    },
  };
}

function getContext(input: {
  getUrl: () => string;
  getTitle: () => string;
  getCapturedAt: () => string;
  root?: ParentNode;
}): ProviderDomCaptureContext {
  return {
    url: input.getUrl(),
    title: input.getTitle(),
    capturedAt: input.getCapturedAt(),
    root: input.root ?? document,
  };
}

function resolveProviderDomCaptureDriver(url: string): ProviderDomCaptureDriver | null {
  return PROVIDER_DOM_CAPTURE_DRIVERS.find((driver) => driver.matches(url)) ?? null;
}

function createProviderDomCaptureDriver<TMessage extends { role?: string; content?: string }>(input: {
  id: ProviderId;
  sourceSessionKey: string;
  matches: (url: string) => boolean;
  collectMessages: (root: ParentNode) => TMessage[];
  buildSnapshot: (payload: { url: string; title: string; messages: TMessage[] }) => {
    message: string;
    detail: string;
  };
  buildSignal: (payload: {
    pageUrl: string;
    title: string;
    capturedAt: string;
    messages: TMessage[];
    sourceSessionKey: string;
  }) => DomSnapshotSeenSignal;
  liveAutomationSpec?: import('@amberkeeper/shared-types').ProviderLiveAutomationSpec;
}): ProviderDomCaptureDriver {
  return {
    id: input.id,
    sourceSessionKey: input.sourceSessionKey,
    matches: input.matches,
    snapshotDom: (context) => {
      const messages = input.collectMessages(context.root);
      const snapshot = input.buildSnapshot({
        url: context.url,
        title: context.title,
        messages,
      });

      if (messages.length === 0) {
        return {
          message: snapshot.message,
          detail: appendProviderDomDiagnostics(snapshot.detail, context.root, input.id),
        };
      }

      return snapshot;
    },
    snapshotMessages: (context) => ({
      url: context.url,
      title: context.title,
      messages: input.collectMessages(context.root),
    }),
    snapshotSignal: (context) =>
      input.buildSignal({
        pageUrl: context.url,
        title: context.title,
        capturedAt: context.capturedAt,
        messages: input.collectMessages(context.root),
        sourceSessionKey: input.sourceSessionKey,
      }),
    runLiveProbe: (context, request) => {
      if (!input.liveAutomationSpec) {
        return {
          action: {
            ok: false,
            reason: 'No provider-specific live automation spec is registered for this page.',
          },
          availableHistoryItems: [],
          notes: [],
        };
      }

      return runProviderLiveDomProbe({
        request,
        spec: input.liveAutomationSpec,
        root: context.root,
      });
    },
  };
}

function appendProviderDomDiagnostics(
  detail: string,
  root: ParentNode,
  providerId: ProviderId
): string {
  const baseDetail = safeParseJsonObject(detail);
  const selectorCounts = {
    conversationTurn: root.querySelectorAll('[data-testid="conversation-turn"]').length,
    conversationLikeTestId: root.querySelectorAll('[data-testid*="conversation"]').length,
    messageAuthorRole: root.querySelectorAll('[data-message-author-role]').length,
    dataRole: root.querySelectorAll('[data-role]').length,
    humanMessage: root.querySelectorAll('.human-message').length,
    assistantMessage: root.querySelectorAll('.assistant-message').length,
    userMessage: root.querySelectorAll('.user-message').length,
    prose: root.querySelectorAll('.prose').length,
    classContainsMessage: root.querySelectorAll('[class*="message"]').length,
    classContainsAssistant: root.querySelectorAll('[class*="assistant"]').length,
    classContainsHuman: root.querySelectorAll('[class*="human"]').length,
    classContainsUser: root.querySelectorAll('[class*="user"]').length,
    classContainsChat: root.querySelectorAll('[class*="chat"]').length,
    roleArticle: root.querySelectorAll('[role="article"]').length,
    mainArticle: root.querySelectorAll('main article').length,
  };
  const textSamples = Array.from(root.querySelectorAll('[data-testid], [class]'))
    .map((node) => ((node as HTMLElement).innerText || node.textContent || '').replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .slice(0, 8);

  return JSON.stringify(
    {
      ...baseDetail,
      debug: {
        providerId,
        selectorCounts,
        textSamples,
      },
    },
    null,
    2
  );
}

function buildEmptySnapshot(context: ProviderDomCaptureContext): { message: string; detail: string } {
  return {
    message: 'No provider-specific DOM capture is registered for the current page.',
    detail: JSON.stringify(
      {
        url: context.url,
        title: context.title,
        messages: [],
      },
      null,
      2
    ),
  };
}

function buildEmptyStructuredSnapshot(context: ProviderDomCaptureContext): StructuredSnapshotResult {
  return {
    url: context.url,
    title: context.title,
    messages: [],
  };
}

function matchesHost(url: string, host: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.hostname === host || parsed.hostname.endsWith(`.${host}`);
  } catch {
    return false;
  }
}

function safeParseJsonObject(input: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(input) as unknown;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

const PROVIDER_DOM_CAPTURE_DRIVERS: ProviderDomCaptureDriver[] = [
  createProviderDomCaptureDriver({
    id: 'chatgpt',
    sourceSessionKey: 'chatgpt-primary-view',
    matches: (url) => matchesHost(url, 'chatgpt.com'),
    collectMessages: collectChatGptStructuredMessages,
    buildSnapshot: buildChatGptDomSnapshot,
    buildSignal: buildChatGptDomSignal,
    liveAutomationSpec: chatgptLiveAutomationSpec,
  }),
  createProviderDomCaptureDriver({
    id: 'claude',
    sourceSessionKey: 'claude-primary-view',
    matches: (url) => matchesHost(url, 'claude.ai'),
    collectMessages: collectClaudeStructuredMessages,
    buildSnapshot: buildClaudeDomSnapshot,
    buildSignal: buildClaudeDomSignal,
  }),
  createProviderDomCaptureDriver({
    id: 'deepseek',
    sourceSessionKey: 'deepseek-primary-view',
    matches: (url) => matchesHost(url, 'chat.deepseek.com'),
    collectMessages: collectDeepSeekStructuredMessages,
    buildSnapshot: buildDeepSeekDomSnapshot,
    buildSignal: buildDeepSeekDomSignal,
  }),
  createProviderDomCaptureDriver({
    id: 'doubao',
    sourceSessionKey: 'doubao-primary-view',
    matches: (url) => matchesHost(url, 'www.doubao.com') || matchesHost(url, 'doubao.com'),
    collectMessages: collectDoubaoStructuredMessages,
    buildSnapshot: buildDoubaoDomSnapshot,
    buildSignal: buildDoubaoDomSignal,
    liveAutomationSpec: doubaoLiveAutomationSpec,
  }),
  createProviderDomCaptureDriver({
    id: 'gemini',
    sourceSessionKey: 'gemini-primary-view',
    matches: (url) => matchesHost(url, 'gemini.google.com'),
    collectMessages: collectGeminiStructuredMessages,
    buildSnapshot: buildGeminiDomSnapshot,
    buildSignal: buildGeminiDomSignal,
  }),
  createProviderDomCaptureDriver({
    id: 'grok',
    sourceSessionKey: 'grok-primary-view',
    matches: (url) => {
      if (matchesHost(url, 'grok.com')) {
        return true;
      }

      try {
        const parsed = new URL(url);
        return parsed.hostname === 'x.com' && parsed.pathname.startsWith('/i/grok');
      } catch {
        return false;
      }
    },
    collectMessages: collectGrokStructuredMessages,
    buildSnapshot: buildGrokDomSnapshot,
    buildSignal: buildGrokDomSignal,
    liveAutomationSpec: grokLiveAutomationSpec,
  }),
  createProviderDomCaptureDriver({
    id: 'kimi',
    sourceSessionKey: 'kimi-primary-view',
    matches: (url) => matchesHost(url, 'www.kimi.com') || matchesHost(url, 'kimi.moonshot.cn'),
    collectMessages: collectKimiStructuredMessages,
    buildSnapshot: buildKimiDomSnapshot,
    buildSignal: buildKimiDomSignal,
    liveAutomationSpec: kimiLiveAutomationSpec,
  }),
  createProviderDomCaptureDriver({
    id: 'qianwen',
    sourceSessionKey: 'qianwen-primary-view',
    matches: (url) => matchesHost(url, 'www.qianwen.com') || matchesHost(url, 'qianwen.com'),
    collectMessages: collectQianwenStructuredMessages,
    buildSnapshot: buildQianwenDomSnapshot,
    buildSignal: buildQianwenDomSignal,
    liveAutomationSpec: qianwenLiveAutomationSpec,
  }),
  createProviderDomCaptureDriver({
    id: 'xiaomi-aistudio',
    sourceSessionKey: 'xiaomi-aistudio-primary-view',
    matches: (url) =>
      matchesHost(url, 'aistudio.xiaomimimo.com') || matchesHost(url, 'platform.xiaomimimo.com'),
    collectMessages: collectXiaomiAistudioStructuredMessages,
    buildSnapshot: buildXiaomiAistudioDomSnapshot,
    buildSignal: buildXiaomiAistudioDomSignal,
    liveAutomationSpec: xiaomiAistudioLiveAutomationSpec,
  }),
];
