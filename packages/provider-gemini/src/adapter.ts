import type { ProviderSignal } from '@anychat/capture-core';
import type { NormalizedMessage, ProviderAdapter } from '@anychat/shared-types';
import {
  buildGeminiDomSignal,
  getLatestGeminiAssistantContent,
  hasStableGeminiAssistantTurn,
  normalizeGeminiDomSnapshotMessages,
  type GeminiDomSnapshotMessageInput,
} from './dom';
import {
  classifyGeminiRequest,
  extractGeminiConversationIdFromUrl,
  shouldTriggerGeminiDomAutoCapture,
} from './network';
import {
  parseGeminiRequestBody,
  parseGeminiResponseBody,
  summarizeGeminiResponseBody,
} from './parser';

interface SignalContextInput {
  source: 'cdp-network' | 'preload-dom';
  sourceSessionKey: string;
  pageUrl: string;
  capturedAt: string;
}

export const geminiAdapter = {
  id: 'gemini' as const,
  matchesView(url: string): boolean {
    return classifyGeminiRequest(url, 'GET') !== 'ignore' || Boolean(extractGeminiConversationIdFromUrl(url));
  },
  classifyRequest(input: { url: string; method: string }) {
    return classifyGeminiRequest(input.url, input.method);
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
      withGeminiFallbacks(
        parseGeminiRequestBody(input.body),
        extractGeminiConversationIdFromUrl(input.pageUrl),
        input.capturedAt
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
    const classification = classifyGeminiRequest(input.url, input.method);
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
        withGeminiFallbacks(
          parseGeminiResponseBody(input.body),
          extractGeminiConversationIdFromUrl(input.pageUrl),
          input.capturedAt
        ),
        true
      ),
      streamStatus: 'COMPLETE' as const,
    };
  },
  interpretDomSnapshot(input: {
    pageUrl: string;
    capturedAt: string;
    sourceSessionKey: string;
    conversationId?: string;
    messages: GeminiDomSnapshotMessageInput[];
    previousAssistantContent: string | null;
  }) {
    const messages = normalizeGeminiDomSnapshotMessages(input.messages, {
      conversationId: input.conversationId,
      capturedAt: input.capturedAt,
    });
    const stable = hasStableGeminiAssistantTurn(messages, input.previousAssistantContent);
    const latestAssistantContent = getLatestGeminiAssistantContent(messages);

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
    messages: GeminiDomSnapshotMessageInput[];
    sourceSessionKey: string;
  }) {
    return buildGeminiDomSignal(input);
  },
  shouldTriggerDomAutoCapture: shouldTriggerGeminiDomAutoCapture,
  extractConversationIdFromUrl: extractGeminiConversationIdFromUrl,
  summarizeResponseBody: summarizeGeminiResponseBody,
} satisfies ProviderAdapter<ProviderSignal, GeminiDomSnapshotMessageInput>;

function withGeminiFallbacks(
  messages: NormalizedMessage[],
  conversationId: string | null,
  capturedAt: string
): NormalizedMessage[] {
  return messages.map((message) => ({
    ...message,
    createdAt: isPlaceholderTimestamp(message.createdAt) ? capturedAt : message.createdAt,
    remoteConversationId: message.remoteConversationId ?? conversationId ?? undefined,
  }));
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
      provider: 'gemini',
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
      provider: 'gemini',
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
      provider: 'gemini',
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

function isPlaceholderTimestamp(input: string): boolean {
  return input === new Date(0).toISOString();
}
