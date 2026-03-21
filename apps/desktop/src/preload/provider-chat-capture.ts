import type { DomSnapshotSeenSignal } from '@anychat/capture-core';
import {
  buildClaudeDomSignal,
  buildClaudeDomSnapshot,
  collectClaudeStructuredMessages,
} from '@anychat/provider-claude';
import {
  buildDeepSeekDomSignal,
  buildDeepSeekDomSnapshot,
  collectDeepSeekStructuredMessages,
} from '@anychat/provider-deepseek';
import {
  buildGeminiDomSignal,
  buildGeminiDomSnapshot,
  collectGeminiStructuredMessages,
} from '@anychat/provider-gemini';
import {
  buildChatGptDomSignal,
  buildChatGptDomSnapshot,
  collectChatGptStructuredMessages,
} from '@anychat/provider-chatgpt';
import type { ProviderId } from '@anychat/shared-types';

export interface StructuredSnapshotResult {
  url: string;
  title: string;
  messages: Array<{ role?: string; content?: string }>;
}

export interface ChatCaptureApi {
  snapshotDom: () => { message: string; detail: string };
  snapshotMessages: () => StructuredSnapshotResult;
  snapshotSignal: () => DomSnapshotSeenSignal | StructuredSnapshotResult;
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

      if (input.id === 'claude' && messages.length === 0) {
        return {
          message: snapshot.message,
          detail: appendClaudeDomDiagnostics(snapshot.detail, context.root),
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
  };
}

function appendClaudeDomDiagnostics(detail: string, root: ParentNode): string {
  const baseDetail = safeParseJsonObject(detail);
  const selectorCounts = {
    conversationTurn: root.querySelectorAll('[data-testid="conversation-turn"]').length,
    conversationLikeTestId: root.querySelectorAll('[data-testid*="conversation"]').length,
    humanMessage: root.querySelectorAll('.human-message').length,
    assistantMessage: root.querySelectorAll('.assistant-message').length,
    prose: root.querySelectorAll('.prose').length,
    classContainsMessage: root.querySelectorAll('[class*="message"]').length,
    classContainsAssistant: root.querySelectorAll('[class*="assistant"]').length,
    classContainsHuman: root.querySelectorAll('[class*="human"]').length,
  };
  const textSamples = Array.from(root.querySelectorAll('[data-testid], [class]'))
    .map((node) => ((node as HTMLElement).innerText || node.textContent || '').replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .slice(0, 8);

  return JSON.stringify(
    {
      ...baseDetail,
      debug: {
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
    id: 'gemini',
    sourceSessionKey: 'gemini-primary-view',
    matches: (url) => matchesHost(url, 'gemini.google.com'),
    collectMessages: collectGeminiStructuredMessages,
    buildSnapshot: buildGeminiDomSnapshot,
    buildSignal: buildGeminiDomSignal,
  }),
];
