import type { ProviderSignal } from '@amberkeeper/capture-core';
import type { ProviderAdapter } from '@amberkeeper/shared-types';
import {
  buildChatGptDomSignal,
  getLatestAssistantContent,
  hasStableDomAssistantTurn,
  normalizeDomSnapshotMessages,
  type DomSnapshotMessageInput,
} from './dom';
import {
  classifyChatGptRequest,
  extractConversationIdFromUrl,
  matchesChatGptView,
  shouldTriggerDomAutoCapture,
} from './network';
import {
  parseChatGptHistoryResponse,
  parseChatGptRequestBody,
  parseChatGptSseResponse,
  parseChatGptStreamStatus,
  summarizeResponseBody,
} from './parser';
import type { NormalizedMessage } from '@amberkeeper/shared-types';

interface SignalContextInput {
  source: 'cdp-network' | 'preload-dom';
  sourceSessionKey: string;
  pageUrl: string;
  capturedAt: string;
}

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
  messages: DomSnapshotMessageInput[];
  previousAssistantContent: string | null;
}

export const chatgptAdapter = {
  id: 'chatgpt' as const,
  matchesView(url: string): boolean {
    return matchesChatGptView(url);
  },
  classifyRequest(input: { url: string; method: string }) {
    return classifyChatGptRequest(input.url, input.method);
  },
  interpretRequest(input: InterpretRequestInput): ProviderSignal[] {
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
      parseChatGptRequestBody(input.body),
      false
    );
  },
  interpretResponseBody(input: InterpretResponseBodyInput): {
    signals: ProviderSignal[];
    streamStatus: 'COMPLETE' | null;
  } {
    const streamStatus =
      input.method === 'GET' && input.url.includes('/stream_status')
        ? parseChatGptStreamStatus(input.body)
        : null;
    const messages =
      input.method === 'POST'
        ? parseChatGptSseResponse(input.body)
        : parseChatGptHistoryResponse(input.body);

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
      streamStatus,
    };
  },
  extractHistoryCapture(input: InterpretResponseBodyInput) {
    if (input.method !== 'GET') {
      return null;
    }

    const messages = parseChatGptHistoryResponse(input.body);
    if (messages.length === 0) {
      return null;
    }

    return {
      conversationId:
        messages.find((message) => typeof message.remoteConversationId === 'string')
          ?.remoteConversationId ??
        extractConversationIdFromUrl(input.url) ??
        extractConversationIdFromUrl(input.pageUrl),
      messages,
    };
  },
  interpretDomSnapshot(input: InterpretDomSnapshotInput): {
    signals: ProviderSignal[];
    stable: boolean;
    latestAssistantContent: string | null;
  } {
    const messages = normalizeDomSnapshotMessages(input.messages, {
      conversationId: input.conversationId,
      capturedAt: input.capturedAt,
    });
    const stable = hasStableDomAssistantTurn(messages, input.previousAssistantContent);
    const latestAssistantContent = getLatestAssistantContent(messages);

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
    messages: DomSnapshotMessageInput[];
    sourceSessionKey: string;
  }) {
    return buildChatGptDomSignal(input);
  },
  shouldTriggerDomAutoCapture,
  extractConversationIdFromUrl,
  summarizeResponseBody,
} satisfies ProviderAdapter<ProviderSignal, DomSnapshotMessageInput>;

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
      provider: 'chatgpt',
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
      provider: 'chatgpt',
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
      provider: 'chatgpt',
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
