import type { ProviderSignal } from '@amberkeeper/capture-core';
import type { NormalizedMessage, ProviderAdapter } from '@amberkeeper/shared-types';
import {
  buildKimiDomSignal,
  getLatestKimiAssistantContent,
  hasStableKimiAssistantTurn,
  normalizeKimiDomSnapshotMessages,
  type KimiDomSnapshotMessageInput,
} from './dom';
import {
  classifyKimiRequest,
  extractKimiConversationIdFromBody,
  extractKimiConversationIdFromUrl,
  matchesKimiView,
  shouldTriggerKimiDomAutoCapture,
} from './network';
import {
  parseKimiHistoryResponse,
  parseKimiRequestBody,
  parseKimiSseResponse,
  summarizeKimiResponseBody,
} from './parser';

interface SignalContextInput {
  source: 'cdp-network' | 'preload-dom';
  sourceSessionKey: string;
  pageUrl: string;
  capturedAt: string;
}

const KIMI_PROVIDER_ID = 'kimi' as never;

export const kimiAdapter = {
  id: KIMI_PROVIDER_ID,
  matchesView(url: string): boolean {
    return matchesKimiView(url);
  },
  classifyRequest(input: { url: string; method: string }) {
    return classifyKimiRequest(input.url, input.method);
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
        withRequestTimestampFallback(parseKimiRequestBody(input.body), input.capturedAt),
        extractKimiConversationIdFromBody(input.body) ?? extractKimiConversationIdFromUrl(input.pageUrl)
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
    const classification = classifyKimiRequest(input.url, input.method);
    if (classification !== 'capture') {
      return {
        signals: [],
        streamStatus: null,
      };
    }

    const messages =
      input.method.toUpperCase() === 'GET'
        ? parseKimiHistoryResponse(input.body)
        : parseKimiSseResponse(input.body);

    return {
      signals: messagesToSignals(
        {
          source: 'cdp-network',
          sourceSessionKey: input.sourceSessionKey,
          pageUrl: input.pageUrl,
          capturedAt: input.capturedAt,
        },
        withConversationIdFallback(messages, extractKimiConversationIdFromUrl(input.pageUrl)),
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
      parseKimiHistoryResponse(input.body),
      extractKimiConversationIdFromUrl(input.pageUrl) ??
        extractKimiConversationIdFromUrl(input.url)
    );
    if (messages.length === 0) {
      return null;
    }

    return {
      conversationId:
        messages.find((message) => typeof message.remoteConversationId === 'string')
          ?.remoteConversationId ??
        extractKimiConversationIdFromUrl(input.pageUrl) ??
        extractKimiConversationIdFromUrl(input.url),
      messages,
    };
  },
  interpretDomSnapshot(input: {
    pageUrl: string;
    capturedAt: string;
    sourceSessionKey: string;
    conversationId?: string;
    messages: KimiDomSnapshotMessageInput[];
    previousAssistantContent: string | null;
  }) {
    const messages = normalizeKimiDomSnapshotMessages(input.messages, {
      conversationId: input.conversationId,
      capturedAt: input.capturedAt,
    });
    const stable = hasStableKimiAssistantTurn(messages, input.previousAssistantContent);
    const latestAssistantContent = getLatestKimiAssistantContent(messages);

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
    messages: KimiDomSnapshotMessageInput[];
    sourceSessionKey: string;
  }) {
    return buildKimiDomSignal(input);
  },
  shouldTriggerDomAutoCapture: shouldTriggerKimiDomAutoCapture,
  extractConversationIdFromUrl: extractKimiConversationIdFromUrl,
  summarizeResponseBody: summarizeKimiResponseBody,
} as unknown as ProviderAdapter<ProviderSignal, KimiDomSnapshotMessageInput>;

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
      provider: 'kimi' as never,
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
      provider: 'kimi' as never,
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
      provider: 'kimi' as never,
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
