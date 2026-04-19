import type { NormalizedMessage } from '@amberkeeper/shared-types';
import {
  buildGrokDomSignal,
  getLatestGrokAssistantContent,
  hasStableGrokAssistantTurn,
  normalizeGrokDomSnapshotMessages,
  type GrokDomSnapshotMessageInput,
} from './dom';
import {
  classifyGrokRequest,
  extractGrokConversationIdFromBody,
  extractGrokConversationIdFromUrl,
  shouldTriggerGrokDomAutoCapture,
} from './network';
import { parseGrokRequestBody, parseGrokResponseBody, summarizeGrokResponseBody } from './parser';

export interface GrokSignalContext {
  source: 'cdp-network' | 'preload-dom';
  sourceSessionKey: string;
  pageUrl: string;
  capturedAt: string;
}

export type GrokSignal =
  | (GrokSignalContext & {
      kind: 'candidateUserMessage';
      provider: 'grok';
      conversationId: string | null;
      content: string;
      createdAt: string;
      remoteMessageId?: string;
      model?: string;
    })
  | (GrokSignalContext & {
      kind: 'conversationIdResolved';
      provider: 'grok';
      conversationId: string;
    })
  | (GrokSignalContext & {
      kind: 'assistantMayBeReady';
      provider: 'grok';
      conversationId: string | null;
      content: string;
      createdAt: string;
      stable: boolean;
      remoteMessageId?: string;
      model?: string;
    });

interface InterpretRequestInput {
  url: string;
  method: string;
  body?: string;
  pageUrl: string;
  capturedAt: string;
  sourceSessionKey: string;
}

interface InterpretResponseBodyInput extends InterpretRequestInput {
  body: string;
}

interface InterpretDomSnapshotInput {
  pageUrl: string;
  capturedAt: string;
  sourceSessionKey: string;
  conversationId?: string;
  messages: GrokDomSnapshotMessageInput[];
  previousAssistantContent: string | null;
}

export const grokAdapter = {
  id: 'grok' as const,
  matchesView(url: string): boolean {
    return (
      classifyGrokRequest(url, 'GET') !== 'ignore' || Boolean(extractGrokConversationIdFromUrl(url))
    );
  },
  classifyRequest(input: { url: string; method: string }) {
    return classifyGrokRequest(input.url, input.method);
  },
  interpretRequest(input: InterpretRequestInput): GrokSignal[] {
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
        parseGrokRequestBody(input.body),
        extractGrokConversationIdFromBody(input.body) ??
          extractGrokConversationIdFromUrl(input.url) ??
          extractGrokConversationIdFromUrl(input.pageUrl)
      ),
      false
    );
  },
  interpretResponseBody(input: InterpretResponseBodyInput): {
    signals: GrokSignal[];
    streamStatus: 'COMPLETE' | null;
  } {
    const classification = classifyGrokRequest(input.url, input.method);
    if (classification !== 'capture') {
      return {
        signals: [],
        streamStatus: null,
      };
    }

    const signals = messagesToSignals(
      {
        source: 'cdp-network',
        sourceSessionKey: input.sourceSessionKey,
        pageUrl: input.pageUrl,
        capturedAt: input.capturedAt,
      },
      withConversationIdFallback(
        parseGrokResponseBody(input.body),
        extractGrokConversationIdFromUrl(input.pageUrl) ??
          extractGrokConversationIdFromUrl(input.url)
      ),
      true
    );

    return {
      signals,
      streamStatus: signals.length > 0 ? 'COMPLETE' : null,
    };
  },
  interpretDomSnapshot(input: InterpretDomSnapshotInput): {
    signals: GrokSignal[];
    stable: boolean;
    latestAssistantContent: string | null;
  } {
    const messages = normalizeGrokDomSnapshotMessages(input.messages, {
      conversationId: input.conversationId,
      capturedAt: input.capturedAt,
    });
    const stable = hasStableGrokAssistantTurn(messages, input.previousAssistantContent);
    const latestAssistantContent = getLatestGrokAssistantContent(messages);

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
    messages: GrokDomSnapshotMessageInput[];
    sourceSessionKey: string;
  }) {
    return buildGrokDomSignal(input);
  },
  shouldTriggerDomAutoCapture: shouldTriggerGrokDomAutoCapture,
  extractConversationIdFromUrl: extractGrokConversationIdFromUrl,
  summarizeResponseBody: summarizeGrokResponseBody,
};

function withConversationIdFallback(
  messages: NormalizedMessage[],
  conversationId: string | null | undefined
): NormalizedMessage[] {
  if (!conversationId) {
    return messages;
  }

  return messages.map((message) => ({
    ...message,
    remoteConversationId: message.remoteConversationId ?? conversationId,
  }));
}

function messagesToSignals(
  context: GrokSignalContext,
  messages: NormalizedMessage[],
  stableAssistant: boolean
): GrokSignal[] {
  const latestTurn = extractLatestTurnMessages(messages);
  if (latestTurn.length === 0) {
    return [];
  }

  const signals: GrokSignal[] = [];
  const latestUser = latestTurn.find((message) => message.role === 'user') ?? null;
  const latestAssistant = findLatestAssistant(latestTurn);
  const conversationId =
    latestAssistant?.remoteConversationId ?? latestUser?.remoteConversationId ?? null;

  if (latestUser) {
    signals.push({
      provider: 'grok',
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
      provider: 'grok',
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
      provider: 'grok',
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
