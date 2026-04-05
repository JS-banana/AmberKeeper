import type { ProviderSignal } from '@amberkeeper/capture-core';
import type { NormalizedMessage, ProviderAdapter } from '@amberkeeper/shared-types';
import {
  buildQianwenDomSignal,
  getLatestQianwenAssistantContent,
  hasStableQianwenAssistantTurn,
  normalizeQianwenDomSnapshotMessages,
  type QianwenDomSnapshotMessageInput,
} from './dom';
import {
  classifyQianwenRequest,
  extractQianwenConversationIdFromBody,
  extractQianwenConversationIdFromUrl,
  matchesQianwenView,
  shouldTriggerQianwenDomAutoCapture,
} from './network';
import {
  parseQianwenHistoryResponse,
  parseQianwenRequestBody,
  parseQianwenSseResponse,
  summarizeQianwenResponseBody,
} from './parser';

interface SignalContextInput {
  source: 'cdp-network' | 'preload-dom';
  sourceSessionKey: string;
  pageUrl: string;
  capturedAt: string;
}

const QIANWEN_PROVIDER_ID = 'qianwen' as never;

export const qianwenAdapter = {
  id: QIANWEN_PROVIDER_ID,
  matchesView(url: string): boolean {
    return matchesQianwenView(url);
  },
  classifyRequest(input: { url: string; method: string }) {
    return classifyQianwenRequest(input.url, input.method);
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
        withRequestTimestampFallback(parseQianwenRequestBody(input.body), input.capturedAt),
        extractQianwenConversationIdFromBody(input.body) ?? extractQianwenConversationIdFromUrl(input.pageUrl)
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
    const classification = classifyQianwenRequest(input.url, input.method);
    if (classification !== 'capture') {
      return {
        signals: [],
        streamStatus: null,
      };
    }

    const messages =
      input.method.toUpperCase() === 'GET'
        ? parseQianwenHistoryResponse(input.body)
        : parseQianwenSseResponse(input.body);

    return {
      signals: messagesToSignals(
        {
          source: 'cdp-network',
          sourceSessionKey: input.sourceSessionKey,
          pageUrl: input.pageUrl,
          capturedAt: input.capturedAt,
        },
        withConversationIdFallback(messages, extractQianwenConversationIdFromUrl(input.pageUrl)),
        true
      ),
      streamStatus: input.body.includes('[DONE]') ? ('COMPLETE' as const) : null,
    };
  },
  extractHistoryCapture(input: {
    url: string;
    method: string;
    body: string;
    pageUrl: string;
    capturedAt: string;
    sourceSessionKey: string;
  }) {
    const messages = withConversationIdFallback(
      parseQianwenHistoryResponse(input.body),
      extractQianwenConversationIdFromUrl(input.pageUrl) ??
        extractQianwenConversationIdFromUrl(input.url)
    );
    if (messages.length === 0) {
      return null;
    }

    return {
      conversationId:
        messages.find((message) => typeof message.remoteConversationId === 'string')
          ?.remoteConversationId ??
        extractQianwenConversationIdFromUrl(input.pageUrl) ??
        extractQianwenConversationIdFromUrl(input.url),
      messages,
    };
  },
  interpretDomSnapshot(input: {
    pageUrl: string;
    capturedAt: string;
    sourceSessionKey: string;
    conversationId?: string;
    messages: QianwenDomSnapshotMessageInput[];
    previousAssistantContent: string | null;
  }) {
    const messages = normalizeQianwenDomSnapshotMessages(input.messages, {
      conversationId: input.conversationId,
      capturedAt: input.capturedAt,
    });
    const stable = hasStableQianwenAssistantTurn(messages, input.previousAssistantContent);
    const latestAssistantContent = getLatestQianwenAssistantContent(messages);

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
    messages: QianwenDomSnapshotMessageInput[];
    sourceSessionKey: string;
  }) {
    return buildQianwenDomSignal(input);
  },
  shouldTriggerDomAutoCapture: shouldTriggerQianwenDomAutoCapture,
  extractConversationIdFromUrl: extractQianwenConversationIdFromUrl,
  summarizeResponseBody: summarizeQianwenResponseBody,
} as unknown as ProviderAdapter<ProviderSignal, QianwenDomSnapshotMessageInput>;

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
      provider: 'qianwen' as never,
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
      provider: 'qianwen' as never,
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
      provider: 'qianwen' as never,
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
