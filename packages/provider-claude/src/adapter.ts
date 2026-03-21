import type { ProviderSignal } from '@amberkeeper/capture-core';
import type { NormalizedMessage, ProviderAdapter } from '@amberkeeper/shared-types';
import {
  buildClaudeDomSignal,
  getLatestClaudeAssistantContent,
  hasStableClaudeAssistantTurn,
  normalizeClaudeDomSnapshotMessages,
  type ClaudeDomSnapshotMessageInput,
} from './dom';
import {
  classifyClaudeRequest,
  extractClaudeConversationIdFromUrl,
  shouldTriggerClaudeDomAutoCapture,
} from './network';
import {
  parseClaudeHistoryResponse,
  parseClaudeRequestBody,
  parseClaudeSseResponse,
  summarizeClaudeResponseBody,
} from './parser';

interface SignalContextInput {
  source: 'cdp-network' | 'preload-dom';
  sourceSessionKey: string;
  pageUrl: string;
  capturedAt: string;
}

export const claudeAdapter = {
  id: 'claude' as const,
  matchesView(url: string): boolean {
    return classifyClaudeRequest(url, 'GET') !== 'ignore' || Boolean(extractClaudeConversationIdFromUrl(url));
  },
  classifyRequest(input: { url: string; method: string }) {
    return classifyClaudeRequest(input.url, input.method);
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
        parseClaudeRequestBody(input.body),
        extractClaudeConversationIdFromUrl(input.url)
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
    const classification = classifyClaudeRequest(input.url, input.method);
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
          input.method === 'GET' ? parseClaudeHistoryResponse(input.body) : parseClaudeSseResponse(input.body),
          extractClaudeConversationIdFromUrl(input.url)
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
    messages: ClaudeDomSnapshotMessageInput[];
    previousAssistantContent: string | null;
  }) {
    const messages = normalizeClaudeDomSnapshotMessages(input.messages, {
      conversationId: input.conversationId,
      capturedAt: input.capturedAt,
    });
    const stable = hasStableClaudeAssistantTurn(messages, input.previousAssistantContent);
    const latestAssistantContent = getLatestClaudeAssistantContent(messages);

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
    messages: ClaudeDomSnapshotMessageInput[];
    sourceSessionKey: string;
  }) {
    return buildClaudeDomSignal(input);
  },
  shouldTriggerDomAutoCapture: shouldTriggerClaudeDomAutoCapture,
  extractConversationIdFromUrl: extractClaudeConversationIdFromUrl,
  summarizeResponseBody: summarizeClaudeResponseBody,
} satisfies ProviderAdapter<ProviderSignal, ClaudeDomSnapshotMessageInput>;

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
      provider: 'claude',
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
      provider: 'claude',
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
      provider: 'claude',
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
