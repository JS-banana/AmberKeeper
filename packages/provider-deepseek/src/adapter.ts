import type { ProviderSignal } from '@anychat/capture-core';
import type { NormalizedMessage, ProviderAdapter } from '@anychat/shared-types';
import {
  buildDeepSeekDomSignal,
  getLatestDeepSeekAssistantContent,
  hasStableDeepSeekAssistantTurn,
  normalizeDeepSeekDomSnapshotMessages,
  type DeepSeekDomSnapshotMessageInput,
} from './dom';
import {
  classifyDeepSeekRequest,
  extractDeepSeekConversationIdFromBody,
  extractDeepSeekConversationIdFromUrl,
  shouldTriggerDeepSeekDomAutoCapture,
} from './network';
import {
  parseDeepSeekRequestBody,
  parseDeepSeekSseResponse,
  summarizeDeepSeekResponseBody,
} from './parser';

interface SignalContextInput {
  source: 'cdp-network' | 'preload-dom';
  sourceSessionKey: string;
  pageUrl: string;
  capturedAt: string;
}

export const deepseekAdapter = {
  id: 'deepseek' as const,
  matchesView(url: string): boolean {
    return (
      classifyDeepSeekRequest(url, 'GET') !== 'ignore' ||
      Boolean(extractDeepSeekConversationIdFromUrl(url))
    );
  },
  classifyRequest(input: { url: string; method: string }) {
    return classifyDeepSeekRequest(input.url, input.method);
  },
  interpretRequest(input: {
    url: string;
    method: string;
    body?: string;
    pageUrl: string;
    capturedAt: string;
    sourceSessionKey: string;
  }): ProviderSignal[] {
    if (!input.body) {
      return [];
    }

    return messagesToSignals(
      {
        source: 'cdp-network',
        sourceSessionKey: input.sourceSessionKey,
        pageUrl: input.pageUrl,
        capturedAt: input.capturedAt,
      },
      withConversationIdFallback(
        withRequestTimestampFallback(parseDeepSeekRequestBody(input.body), input.capturedAt),
        extractDeepSeekConversationIdFromBody(input.body) ?? extractDeepSeekConversationIdFromUrl(input.pageUrl)
      ),
      false
    );
  },
  interpretResponseBody(input: {
    url: string;
    method: string;
    body: string;
    pageUrl: string;
    capturedAt: string;
    sourceSessionKey: string;
  }) {
    const classification = classifyDeepSeekRequest(input.url, input.method);
    if (classification !== 'capture') {
      return {
        signals: [],
        streamStatus: null,
      };
    }

    return {
      signals: messagesToSignals(
        {
          source: 'cdp-network',
          sourceSessionKey: input.sourceSessionKey,
          pageUrl: input.pageUrl,
          capturedAt: input.capturedAt,
        },
        withConversationIdFallback(
          parseDeepSeekSseResponse(input.body),
          extractDeepSeekConversationIdFromUrl(input.pageUrl)
        ),
        true
      ),
      streamStatus: input.body.includes('[DONE]') ? ('COMPLETE' as const) : null,
    };
  },
  interpretDomSnapshot(input: {
    pageUrl: string;
    capturedAt: string;
    sourceSessionKey: string;
    conversationId?: string;
    messages: DeepSeekDomSnapshotMessageInput[];
    previousAssistantContent: string | null;
  }) {
    const messages = normalizeDeepSeekDomSnapshotMessages(input.messages, {
      conversationId: input.conversationId,
      capturedAt: input.capturedAt,
    });
    const stable = hasStableDeepSeekAssistantTurn(messages, input.previousAssistantContent);
    const latestAssistantContent = getLatestDeepSeekAssistantContent(messages);

    return {
      signals: messagesToSignals(
        {
          source: 'preload-dom',
          sourceSessionKey: input.sourceSessionKey,
          pageUrl: input.pageUrl,
          capturedAt: input.capturedAt,
        },
        messages,
        stable
      ),
      stable,
      latestAssistantContent,
    };
  },
  buildDomSignal(input: {
    pageUrl: string;
    title: string;
    capturedAt: string;
    messages: DeepSeekDomSnapshotMessageInput[];
    sourceSessionKey: string;
  }) {
    return buildDeepSeekDomSignal(input);
  },
  shouldTriggerDomAutoCapture: shouldTriggerDeepSeekDomAutoCapture,
  extractConversationIdFromUrl: extractDeepSeekConversationIdFromUrl,
  summarizeResponseBody: summarizeDeepSeekResponseBody,
} satisfies ProviderAdapter<ProviderSignal, DeepSeekDomSnapshotMessageInput>;

function withConversationIdFallback(
  messages: NormalizedMessage[],
  conversationId: string | null
): NormalizedMessage[] {
  if (!conversationId) {
    return messages;
  }

  return messages.map((message) => ({
    ...message,
    remoteConversationId: message.remoteConversationId ?? conversationId,
  }));
}

function withRequestTimestampFallback(
  messages: NormalizedMessage[],
  capturedAt: string
): NormalizedMessage[] {
  return messages.map((message) => ({
    ...message,
    createdAt: isPlaceholderTimestamp(message.createdAt) ? capturedAt : message.createdAt,
  }));
}

function isPlaceholderTimestamp(input: string): boolean {
  return input === new Date(0).toISOString();
}

function messagesToSignals(
  context: SignalContextInput,
  messages: NormalizedMessage[],
  stableAssistant: boolean
): ProviderSignal[] {
  const latestTurn = extractLatestTurnMessages(messages);
  if (latestTurn.length === 0) {
    return [];
  }

  const signals: ProviderSignal[] = [];
  const latestUser = latestTurn.find((message) => message.role === 'user') ?? null;
  const latestAssistant = findLatestAssistant(latestTurn);
  const conversationId =
    latestAssistant?.remoteConversationId ?? latestUser?.remoteConversationId ?? null;

  if (latestUser) {
    signals.push({
      provider: 'deepseek',
      kind: 'candidateUserMessage',
      source: context.source,
      sourceSessionKey: context.sourceSessionKey,
      pageUrl: context.pageUrl,
      capturedAt: context.capturedAt,
      createdAt: latestUser.createdAt,
      conversationId,
      content: latestUser.content,
      remoteMessageId: latestUser.remoteMessageId,
      model: latestUser.model,
    });
  }

  if (conversationId) {
    signals.push({
      provider: 'deepseek',
      kind: 'conversationIdResolved',
      source: context.source,
      sourceSessionKey: context.sourceSessionKey,
      pageUrl: context.pageUrl,
      capturedAt: context.capturedAt,
      conversationId,
    });
  }

  if (latestAssistant) {
    signals.push({
      provider: 'deepseek',
      kind: 'assistantMayBeReady',
      source: context.source,
      sourceSessionKey: context.sourceSessionKey,
      pageUrl: context.pageUrl,
      capturedAt: context.capturedAt,
      createdAt: latestAssistant.createdAt,
      conversationId,
      content: latestAssistant.content,
      stable: stableAssistant,
      remoteMessageId: latestAssistant.remoteMessageId,
      model: latestAssistant.model,
    });
  }

  return signals;
}

function extractLatestTurnMessages(messages: NormalizedMessage[]): NormalizedMessage[] {
  const latestUserIndex = findLatestUserIndex(messages);
  if (latestUserIndex === -1) {
    const latestAssistant = findLatestAssistant(messages);
    return latestAssistant ? [latestAssistant] : [];
  }

  return messages.slice(latestUserIndex);
}

function findLatestUserIndex(messages: NormalizedMessage[]): number {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index]?.role === 'user') {
      return index;
    }
  }

  return -1;
}

function findLatestAssistant(messages: NormalizedMessage[]): NormalizedMessage | null {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index]?.role === 'assistant') {
      return messages[index];
    }
  }

  return null;
}
