import type { NormalizedMessage } from '@amberkeeper/shared-types';
import {
  buildXiaomiAistudioDomSignal,
  getLatestXiaomiAistudioAssistantContent,
  hasStableXiaomiAistudioAssistantTurn,
  normalizeXiaomiAistudioDomSnapshotMessages,
} from './dom';
import {
  classifyXiaomiAistudioRequest,
  extractXiaomiAistudioConversationIdFromBody,
  extractXiaomiAistudioConversationIdFromUrl,
  shouldTriggerXiaomiAistudioDomAutoCapture,
} from './network';
import {
  parseXiaomiAistudioRequestBody,
  parseXiaomiAistudioResponseBody,
  summarizeXiaomiAistudioResponseBody,
} from './parser';
import type {
  XiaomiAistudioAssistantMayBeReadySignal,
  XiaomiAistudioCandidateUserMessageSignal,
  XiaomiAistudioConversationIdResolvedSignal,
  XiaomiAistudioDomSnapshotMessageInput,
  XiaomiAistudioProviderAdapter,
  XiaomiAistudioProviderSignal,
} from './types';

interface SignalContextInput {
  source: 'cdp-network' | 'preload-dom';
  sourceSessionKey: string;
  pageUrl: string;
  capturedAt: string;
}

export const xiaomiAistudioAdapter = {
  id: 'xiaomi-aistudio' as const,
  matchesView(url: string): boolean {
    return classifyXiaomiAistudioRequest(url, 'GET') !== 'ignore' || Boolean(extractXiaomiAistudioConversationIdFromUrl(url));
  },
  classifyRequest(input: { url: string; method: string }) {
    return classifyXiaomiAistudioRequest(input.url, input.method);
  },
  interpretRequest(input: {
    url: string;
    method: string;
    body?: string;
    pageUrl: string;
    capturedAt: string;
    sourceSessionKey: string;
  }): XiaomiAistudioProviderSignal[] {
    if (!input.body) {
      return [];
    }

    const conversationId =
      extractXiaomiAistudioConversationIdFromBody(input.body) ?? extractXiaomiAistudioConversationIdFromUrl(input.pageUrl);

    return messagesToSignals(
      {
        source: 'cdp-network',
        sourceSessionKey: input.sourceSessionKey,
        pageUrl: input.pageUrl,
        capturedAt: input.capturedAt,
      },
      withConversationIdFallback(
        withCapturedAtFallback(parseXiaomiAistudioRequestBody(input.body), input.capturedAt),
        conversationId
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
    const classification = classifyXiaomiAistudioRequest(input.url, input.method);
    if (classification !== 'capture') {
      return {
        signals: [],
        streamStatus: null,
      };
    }

    const conversationId =
      extractXiaomiAistudioConversationIdFromBody(input.body) ?? extractXiaomiAistudioConversationIdFromUrl(input.pageUrl);
    const messages = withConversationIdFallback(
      withCapturedAtFallback(parseXiaomiAistudioResponseBody(input.body), input.capturedAt),
      conversationId
    );

    return {
      signals: messagesToSignals(
        {
          source: 'cdp-network',
          sourceSessionKey: input.sourceSessionKey,
          pageUrl: input.pageUrl,
          capturedAt: input.capturedAt,
        },
        messages,
        true
      ),
      streamStatus: 'COMPLETE' as const,
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
      withCapturedAtFallback(parseXiaomiAistudioResponseBody(input.body), input.capturedAt),
      extractXiaomiAistudioConversationIdFromBody(input.body) ??
        extractXiaomiAistudioConversationIdFromUrl(input.pageUrl) ??
        extractXiaomiAistudioConversationIdFromUrl(input.url)
    );
    if (messages.length === 0) {
      return null;
    }

    return {
      conversationId:
        messages.find((message) => typeof message.remoteConversationId === 'string')
          ?.remoteConversationId ??
        extractXiaomiAistudioConversationIdFromBody(input.body) ??
        extractXiaomiAistudioConversationIdFromUrl(input.pageUrl) ??
        extractXiaomiAistudioConversationIdFromUrl(input.url),
      messages,
    };
  },
  interpretDomSnapshot(input: {
    pageUrl: string;
    capturedAt: string;
    sourceSessionKey: string;
    conversationId?: string;
    messages: XiaomiAistudioDomSnapshotMessageInput[];
    previousAssistantContent: string | null;
  }) {
    const messages = normalizeXiaomiAistudioDomSnapshotMessages(input.messages, {
      conversationId: input.conversationId,
      capturedAt: input.capturedAt,
    });
    const stable = hasStableXiaomiAistudioAssistantTurn(messages, input.previousAssistantContent);
    const latestAssistantContent = getLatestXiaomiAistudioAssistantContent(messages);

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
    messages: XiaomiAistudioDomSnapshotMessageInput[];
    sourceSessionKey: string;
  }) {
    return buildXiaomiAistudioDomSignal(input);
  },
  shouldTriggerDomAutoCapture: shouldTriggerXiaomiAistudioDomAutoCapture,
  extractConversationIdFromUrl: extractXiaomiAistudioConversationIdFromUrl,
  summarizeResponseBody: summarizeXiaomiAistudioResponseBody,
} satisfies XiaomiAistudioProviderAdapter;

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

function withCapturedAtFallback(messages: NormalizedMessage[], capturedAt: string): NormalizedMessage[] {
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
): XiaomiAistudioProviderSignal[] {
  const latestTurn = extractLatestTurnMessages(messages);
  if (latestTurn.length === 0) {
    return [];
  }

  const signals: XiaomiAistudioProviderSignal[] = [];
  const latestUser = latestTurn.find((message) => message.role === 'user') ?? null;
  const latestAssistant = findLatestAssistant(latestTurn);
  const conversationId = latestAssistant?.remoteConversationId ?? latestUser?.remoteConversationId ?? null;

  if (latestUser) {
    signals.push({
      provider: 'xiaomi-aistudio',
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
    } satisfies XiaomiAistudioCandidateUserMessageSignal);
  }

  if (conversationId) {
    signals.push({
      provider: 'xiaomi-aistudio',
      kind: 'conversationIdResolved',
      source: context.source,
      sourceSessionKey: context.sourceSessionKey,
      pageUrl: context.pageUrl,
      capturedAt: context.capturedAt,
      conversationId,
    } satisfies XiaomiAistudioConversationIdResolvedSignal);
  }

  if (latestAssistant) {
    signals.push({
      provider: 'xiaomi-aistudio',
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
    } satisfies XiaomiAistudioAssistantMayBeReadySignal);
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
