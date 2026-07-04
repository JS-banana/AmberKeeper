import type { NormalizedMessage, ProviderAdapter } from '@amberkeeper/shared-types';
import {
  buildDoubaoDomSignal,
  getLatestDoubaoAssistantContent,
  hasStableDoubaoAssistantTurn,
  normalizeDoubaoDomSnapshotMessages,
  type DoubaoDomSnapshotMessageInput,
} from './dom';
import {
  classifyDoubaoRequest,
  extractDoubaoConversationIdFromBody,
  extractDoubaoConversationIdFromUrl,
  isDoubaoTemporaryConversationId,
  shouldTriggerDoubaoDomAutoCapture,
} from './network';
import {
  parseDoubaoRequestBody,
  parseDoubaoResponseBody,
  summarizeDoubaoResponseBody,
} from './parser';

export interface DoubaoSignalContext {
  source: 'cdp-network' | 'preload-dom';
  sourceSessionKey: string;
  pageUrl: string;
  capturedAt: string;
  conversationAliases?: string[];
}

export interface DoubaoCandidateUserMessageSignal extends DoubaoSignalContext {
  kind: 'candidateUserMessage';
  provider: 'doubao';
  conversationId: string | null;
  content: string;
  createdAt: string;
  remoteMessageId?: string;
  model?: string;
}

export interface DoubaoConversationIdResolvedSignal extends DoubaoSignalContext {
  kind: 'conversationIdResolved';
  provider: 'doubao';
  conversationId: string;
}

export interface DoubaoAssistantMayBeReadySignal extends DoubaoSignalContext {
  kind: 'assistantMayBeReady';
  provider: 'doubao';
  conversationId: string | null;
  content: string;
  createdAt: string;
  stable: boolean;
  remoteMessageId?: string;
  model?: string;
}

export interface DoubaoDomSnapshotSignal extends DoubaoSignalContext {
  kind: 'domSnapshotSeen';
  provider: 'doubao';
  title: string;
  messages: DoubaoDomSnapshotMessageInput[];
}

export type DoubaoSignal =
  | DoubaoCandidateUserMessageSignal
  | DoubaoConversationIdResolvedSignal
  | DoubaoAssistantMayBeReadySignal;

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
  requestBody?: string;
  requestCapturedAt?: string;
}

interface InterpretDomSnapshotInput {
  pageUrl: string;
  capturedAt: string;
  sourceSessionKey: string;
  conversationId?: string;
  messages: DoubaoDomSnapshotMessageInput[];
  previousAssistantContent: string | null;
}

type DoubaoProviderAdapter<TSignal, TDomSnapshotMessage> = Omit<
  ProviderAdapter<TSignal, TDomSnapshotMessage>,
  'id'
> & {
  id: 'doubao';
};

export const doubaoAdapter = {
  id: 'doubao' as const,
  matchesView(url: string): boolean {
    return (
      classifyDoubaoRequest(url, 'GET') !== 'ignore' ||
      Boolean(extractDoubaoConversationIdFromUrl(url))
    );
  },
  classifyRequest(input: { url: string; method: string }) {
    return classifyDoubaoRequest(input.url, input.method);
  },
  interpretRequest(input: InterpretRequestInput): DoubaoSignal[] {
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
        parseDoubaoRequestBody(input.body),
        extractDoubaoConversationIdFromBody(input.body) ??
          extractDoubaoConversationIdFromUrl(input.url) ??
          extractDoubaoConversationIdFromUrl(input.pageUrl)
      ),
      false
    );
  },
  interpretResponseBody(input: InterpretResponseBodyInput): {
    signals: DoubaoSignal[];
    streamStatus: 'COMPLETE' | null;
  } {
    const classification = classifyDoubaoRequest(input.url, input.method);
    if (classification !== 'capture') {
      return {
        signals: [],
        streamStatus: null,
      };
    }

    const parsedMessages = parseDoubaoResponseBody(input.body);
    const conversationResolution = resolveConversationIds(input, parsedMessages);
    const messages = withConversationIdFallback(
      addRequestUserToCompletionMessages({
        messages: conversationResolution.messages,
        requestBody: input.requestBody,
        requestCapturedAt: input.requestCapturedAt,
        capturedAt: input.capturedAt,
        conversationId: conversationResolution.conversationId,
      }),
      conversationResolution.conversationId
    );
    const signals = messagesToSignals(
      {
        source: 'cdp-network',
        sourceSessionKey: input.sourceSessionKey,
        pageUrl: input.pageUrl,
        capturedAt: input.capturedAt,
        conversationAliases: conversationResolution.aliases,
      },
      messages,
      true
    );

    return {
      signals,
      streamStatus: signals.length > 0 ? 'COMPLETE' : null,
    };
  },
  extractHistoryCapture(input: InterpretResponseBodyInput) {
    if (classifyDoubaoRequest(input.url, input.method) === 'capture') {
      return null;
    }

    const messages = withConversationIdFallback(
      parseDoubaoResponseBody(input.body),
      extractDoubaoConversationIdFromUrl(input.pageUrl) ??
        extractDoubaoConversationIdFromUrl(input.url) ??
        extractDoubaoConversationIdFromBody(input.body)
    );
    if (messages.length === 0) {
      return null;
    }

    const conversationId =
      messages.find((message) => typeof message.remoteConversationId === 'string')
        ?.remoteConversationId ??
      extractDoubaoConversationIdFromUrl(input.pageUrl) ??
      extractDoubaoConversationIdFromUrl(input.url) ??
      extractDoubaoConversationIdFromBody(input.body);

    return {
      conversationId,
      remoteConversationAliases: extractConversationAliases(input, messages),
      messages,
    };
  },
  interpretDomSnapshot(input: InterpretDomSnapshotInput): {
    signals: DoubaoSignal[];
    stable: boolean;
    latestAssistantContent: string | null;
  } {
    const messages = normalizeDoubaoDomSnapshotMessages(input.messages, {
      conversationId: input.conversationId,
      capturedAt: input.capturedAt,
    });
    const stable = hasStableDoubaoAssistantTurn(messages, input.previousAssistantContent);
    const latestAssistantContent = getLatestDoubaoAssistantContent(messages);

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
    messages: DoubaoDomSnapshotMessageInput[];
    sourceSessionKey: string;
  }) {
    return buildDoubaoDomSignal(input);
  },
  shouldTriggerDomAutoCapture: shouldTriggerDoubaoDomAutoCapture,
  extractConversationIdFromUrl: extractDoubaoConversationIdFromUrl,
  summarizeResponseBody: summarizeDoubaoResponseBody,
} satisfies DoubaoProviderAdapter<DoubaoSignal, DoubaoDomSnapshotMessageInput>;


function extractConversationAliases(
  input: InterpretResponseBodyInput,
  messages: NormalizedMessage[]
): string[] {
  const requestConversationId = extractDoubaoConversationIdFromBody(input.requestBody);
  const responseConversationId =
    messages.find((message) => message.remoteConversationId)?.remoteConversationId ??
    extractDoubaoConversationIdFromUrl(input.pageUrl) ??
    extractDoubaoConversationIdFromUrl(input.url);

  if (
    requestConversationId &&
    responseConversationId &&
    requestConversationId !== responseConversationId &&
    isDoubaoTemporaryConversationId(requestConversationId)
  ) {
    return [requestConversationId];
  }

  return [];
}

function resolveConversationIds(
  input: InterpretResponseBodyInput,
  messages: NormalizedMessage[]
): { conversationId: string | null; aliases: string[]; messages: NormalizedMessage[] } {
  const pageConversationId =
    extractDoubaoConversationIdFromUrl(input.pageUrl) ??
    extractDoubaoConversationIdFromUrl(input.url);
  const requestConversationId = extractDoubaoConversationIdFromBody(input.requestBody);
  const messageConversationId = messages.find((message) => message.remoteConversationId)
    ?.remoteConversationId;
  const conversationId =
    pageConversationId && !isDoubaoTemporaryConversationId(pageConversationId)
      ? pageConversationId
      : (messageConversationId ?? pageConversationId ?? null);
  const aliases = [requestConversationId, messageConversationId].filter(
    (value): value is string =>
      typeof value === 'string' &&
      value !== conversationId &&
      isDoubaoTemporaryConversationId(value)
  );

  return {
    conversationId,
    aliases: Array.from(new Set(aliases)),
    messages:
      conversationId && !isDoubaoTemporaryConversationId(conversationId)
        ? messages.map((message) => ({
            ...message,
            remoteConversationId:
              message.remoteConversationId &&
              !isDoubaoTemporaryConversationId(message.remoteConversationId)
                ? message.remoteConversationId
                : conversationId,
          }))
        : messages,
  };
}

function addRequestUserToCompletionMessages(input: {
  messages: NormalizedMessage[];
  requestBody?: string;
  requestCapturedAt?: string;
  capturedAt: string;
  conversationId: string | null;
}): NormalizedMessage[] {
  const requestUser = parseDoubaoRequestBody(input.requestBody ?? '')[0];
  const messages = requestUser
    ? input.messages.map((message) =>
        message.role === 'assistant'
          ? {
              ...message,
              content: stripDoubaoPromptThinkingPrefix(message.content, requestUser.content),
            }
          : message
      )
    : input.messages;

  if (messages.some((message) => message.role === 'user')) {
    return messages;
  }

  if (!requestUser) {
    return messages;
  }

  const userCreatedAt = normalizeCompletionTimestamp(
    requestUser.createdAt,
    input.requestCapturedAt ?? input.capturedAt
  );
  const baseTime = new Date(userCreatedAt).getTime();

  return [
    {
      ...requestUser,
      createdAt: userCreatedAt,
      remoteConversationId: input.conversationId ?? requestUser.remoteConversationId,
    },
    ...messages.map((message, index) => ({
      ...message,
      createdAt:
        message.createdAt === new Date(0).toISOString()
          ? new Date(baseTime + index + 1).toISOString()
          : message.createdAt,
      remoteConversationId: input.conversationId ?? message.remoteConversationId,
    })),
  ];
}

function stripDoubaoPromptThinkingPrefix(content: string, prompt: string): string {
  const trimmed = content.trim();
  const promptText = prompt.trim();
  if (!promptText || !trimmed.startsWith(promptText)) {
    return trimmed;
  }

  const tail = trimmed.slice(promptText.length).trim();
  if (!tail) {
    return trimmed;
  }

  const headingIndex = tail.indexOf('#');
  if (headingIndex >= 0) {
    return tail.slice(headingIndex).trim();
  }

  const boldIndex = tail.indexOf('**');
  if (boldIndex >= 0) {
    const prefix = tail.slice(0, boldIndex);
    const cutIndex = Math.max(
      prefix.lastIndexOf('。'),
      prefix.lastIndexOf('，'),
      prefix.lastIndexOf('\n')
    );
    return tail.slice(cutIndex >= 0 ? cutIndex + 1 : boldIndex).trim();
  }

  const sentenceIndex = tail.search(/[。！？]\s*/);
  return sentenceIndex >= 0 ? tail.slice(sentenceIndex + 1).trim() || tail : tail;
}

function withConversationIdFallback<T extends { remoteConversationId?: string | null }>(
  messages: T[],
  conversationId: string | null | undefined
): T[] {
  if (!conversationId) {
    return messages;
  }

  return messages.map((message) => ({
    ...message,
    remoteConversationId: message.remoteConversationId ?? conversationId,
  })) as T[];
}

function normalizeCompletionTimestamp(input: string, fallback: string): string {
  const date = new Date(input);
  if (!input || input === new Date(0).toISOString() || Number.isNaN(date.getTime())) {
    return fallback;
  }

  return input;
}

function messagesToSignals(
  context: DoubaoSignalContext,
  messages: NormalizedMessage[],
  stableAssistant: boolean
): DoubaoSignal[] {
  const latestTurn = extractLatestTurnMessages(messages);
  if (latestTurn.length === 0) {
    return [];
  }

  const signals: DoubaoSignal[] = [];
  const latestUser = latestTurn.find((message) => message.role === 'user') ?? null;
  const latestAssistant = findLatestAssistant(latestTurn);
  const conversationId =
    latestAssistant?.remoteConversationId ?? latestUser?.remoteConversationId ?? null;

  if (latestUser) {
    signals.push({
      provider: 'doubao',
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
      conversationAliases: context.conversationAliases,
    });
  }

  if (conversationId) {
    signals.push({
      provider: 'doubao',
      kind: 'conversationIdResolved',
      source: context.source,
      sourceSessionKey: context.sourceSessionKey,
      pageUrl: context.pageUrl,
      capturedAt: context.capturedAt,
      conversationId,
      conversationAliases: context.conversationAliases,
    });
  }

  if (latestAssistant) {
    signals.push({
      provider: 'doubao',
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
      conversationAliases: context.conversationAliases,
    });
  }

  return signals;
}

function extractLatestTurnMessages(
  messages: {
    role: 'user' | 'assistant';
    content: string;
    createdAt: string;
    remoteConversationId?: string;
    remoteMessageId?: string;
    model?: string;
  }[]
): NormalizedMessage[] {
  const latestUserIndex = findLatestUserIndex(messages);
  if (latestUserIndex === -1) {
    const latestAssistant = findLatestAssistant(messages);
    return latestAssistant ? [latestAssistant] : [];
  }

  return messages.slice(latestUserIndex);
}

function findLatestUserIndex(
  messages: {
    role: 'user' | 'assistant';
  }[]
): number {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index]?.role === 'user') {
      return index;
    }
  }

  return -1;
}

function findLatestAssistant(
  messages: {
    role: 'user' | 'assistant';
    content: string;
    createdAt: string;
    remoteConversationId?: string;
    remoteMessageId?: string;
    model?: string;
  }[]
): NormalizedMessage | null {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index]?.role === 'assistant') {
      return messages[index];
    }
  }

  return null;
}
