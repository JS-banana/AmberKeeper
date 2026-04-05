import type { NormalizedMessage } from '@amberkeeper/shared-types';

interface DoubaoConversationRequest {
  conversation_id?: string;
  conversationId?: string;
  chat_session_id?: string;
  session_id?: string;
  model?: string;
  prompt?: string;
  messages?: DoubaoMessageNode[];
}

interface DoubaoMessageNode {
  role?: string;
  sender?: string;
  content?: unknown;
  content_block?: unknown;
  created_at?: number | string;
  create_time?: number | string;
  id?: string;
  message_id?: string;
}

interface DoubaoCompletionResponse {
  id?: string;
  request_id?: string;
  conversation_id?: string;
  conversationId?: string;
  model?: string;
  choices?: Array<{
    delta?: {
      content?: unknown;
    };
    message?: {
      role?: string;
      content?: unknown;
    };
    finish_reason?: string | null;
  }>;
  message?: {
    role?: string;
    content?: unknown;
  };
  text?: string;
  content?: unknown;
  messages?: DoubaoMessageNode[];
  data?: {
    messages?: DoubaoMessageNode[];
  };
  event_type?: number | string;
  event_data?: unknown;
}

export function parseDoubaoRequestBody(body: string): NormalizedMessage[] {
  const parsed = safeParseJson<DoubaoConversationRequest>(body);
  if (!parsed) {
    return [];
  }

  const conversationId = firstNonEmptyString([
    parsed.conversation_id,
    parsed.conversationId,
    parsed.chat_session_id,
    parsed.session_id,
  ]);
  const model =
    typeof parsed.model === 'string' && parsed.model.trim().length > 0
      ? parsed.model.trim()
      : undefined;
  const prompt = typeof parsed.prompt === 'string' ? parsed.prompt.trim() : '';

  if (prompt) {
    return [
      {
        role: 'user',
        content: prompt,
        createdAt: new Date(0).toISOString(),
        remoteConversationId: conversationId ?? undefined,
        model,
      },
    ];
  }

  const latestUser = [...(parsed.messages ?? [])].reverse().find((message) => {
    return message.role === 'user' && Boolean(extractMessageContent(message).trim());
  });

  const content = extractMessageContent(latestUser).trim();
  if (!content) {
    return [];
  }

  return [
    {
      role: 'user',
      content,
      createdAt: new Date(0).toISOString(),
      remoteConversationId: conversationId ?? undefined,
      model,
    },
  ];
}

export function parseDoubaoResponseBody(body: string): NormalizedMessage[] {
  const sseMessages = parseDoubaoSseResponse(body);
  if (sseMessages.length > 0) {
    return sseMessages;
  }

  return parseDoubaoHistoryResponse(body);
}

export function parseDoubaoSseResponse(body: string): NormalizedMessage[] {
  let conversationId: string | undefined;
  let content = '';
  let remoteMessageId: string | undefined;
  let model: string | undefined;

  for (const line of body.split('\n')) {
    const raw = extractSsePayload(line);
    if (!raw) {
      continue;
    }

    const parsed = safeParseJson<DoubaoCompletionResponse>(raw);
    if (!parsed) {
      continue;
    }

    const eventData = unwrapEventData(parsed.event_data);
    const nestedMessage = eventData ? getNestedValue(eventData, ['message']) : null;
    conversationId =
      firstNonEmptyString([
        conversationId,
        parsed.conversation_id,
        parsed.conversationId,
        eventData ? getString(eventData, 'conversation_id') : null,
        eventData ? getString(eventData, 'conversationId') : null,
        eventData ? getString(eventData, 'id') : null,
        getString(parsed, 'id'),
      ]) ?? conversationId;
    model =
      firstNonEmptyString([
        model,
        parsed.model,
        eventData ? getString(eventData, 'model') : null,
      ]) ?? model;

    const nextText = extractResponseText(parsed, eventData);
    if (nextText) {
      content = mergeAssistantContent(content, nextText);
    }

    remoteMessageId =
      firstNonEmptyString([
        remoteMessageId,
        nestedMessage ? getString(nestedMessage, 'id') : null,
        nestedMessage ? getString(nestedMessage, 'message_id') : null,
        eventData ? getString(eventData, 'message_id') : null,
        eventData ? getString(eventData, 'id') : null,
        getString(parsed, 'request_id'),
        getString(parsed, 'id'),
      ]) ?? remoteMessageId;
  }

  const normalizedContent = content.trim();
  if (!normalizedContent) {
    return [];
  }

  return [
    {
      role: 'assistant',
      content: normalizedContent,
      createdAt: new Date(0).toISOString(),
      remoteConversationId: conversationId ?? undefined,
      remoteMessageId,
      model,
    },
  ];
}

export function parseDoubaoHistoryResponse(body: string): NormalizedMessage[] {
  const parsed = safeParseJson<DoubaoCompletionResponse>(body);
  if (!parsed) {
    return [];
  }

  const conversationId = firstNonEmptyString([
    parsed.conversation_id,
    parsed.conversationId,
    parsed.id,
    parsed.request_id,
  ]);

  const messages = parsed.messages ?? parsed.data?.messages;
  if (messages && messages.length > 0) {
    const normalized = messages
      .map((message, index) => normalizeHistoryMessage(message, conversationId, index))
      .filter((message): message is NormalizedMessage => message !== null);

    if (normalized.length > 0) {
      normalized.sort((left, right) => left.createdAt.localeCompare(right.createdAt));
      return normalized;
    }
  }

  const assistantContent =
    extractResponseText(parsed, null) ||
    extractMessageContent(parsed.message) ||
    extractMessageContentFromChoices(parsed);

  if (!assistantContent) {
    return [];
  }

  return [
    {
      role: 'assistant',
      content: assistantContent,
      createdAt: new Date(0).toISOString(),
      remoteConversationId: conversationId ?? undefined,
      remoteMessageId: firstNonEmptyString([parsed.id, parsed.request_id]) ?? undefined,
      model: parsed.model,
    },
  ];
}

export function summarizeDoubaoResponseBody(body: string, maxLength = 400): string {
  const normalized = body.replace(/\s+/g, ' ').trim();
  if (!normalized) {
    return '';
  }

  return normalized.slice(0, maxLength);
}

function extractResponseText(
  parsed: DoubaoCompletionResponse,
  eventData: Record<string, unknown> | null
): string {
  if (parsed.event_type === 2001 || parsed.event_type === '2001' || eventData) {
    const message = eventData ? getNestedValue(eventData, ['message']) : null;
    const content = extractMessageContent(message, true);
    if (content) {
      return content;
    }

    const structuredText = getStructuredText(eventData);
    if (structuredText) {
      return structuredText;
    }
  }

  const choiceText = extractMessageContentFromChoices(parsed);
  if (choiceText) {
    return choiceText;
  }

  return (
    extractMessageContent(parsed.message) ||
    firstNonEmptyString([parsed.text, extractTextLike(parsed.content)]) ||
    ''
  );
}

function extractMessageContentFromChoices(parsed: DoubaoCompletionResponse): string {
  const choice = parsed.choices?.[0];
  if (!choice) {
    return '';
  }

  const deltaText = extractTextLike(choice.delta?.content, true);
  if (deltaText) {
    return deltaText;
  }

  return extractTextLike(choice.message?.content, true);
}

function normalizeHistoryMessage(
  message: DoubaoMessageNode | undefined,
  conversationId: string | null,
  index: number
): NormalizedMessage | null {
  const role = normalizeRole(message?.role ?? message?.sender);
  const content = extractMessageContent(message).trim();

  if (!role || !content) {
    return null;
  }

  return {
    role,
    content,
    createdAt: toIsoTimestamp(message?.created_at ?? message?.create_time, index),
    remoteConversationId:
      firstNonEmptyString([conversationId, getString(message ?? {}, 'conversation_id')]) ??
      undefined,
    remoteMessageId: firstNonEmptyString([message?.id, message?.message_id]) ?? undefined,
  };
}

function normalizeRole(input: string | undefined): NormalizedMessage['role'] | null {
  if (!input) {
    return null;
  }

  const lower = input.toLowerCase();
  if (lower === 'user' || lower === 'human') {
    return 'user';
  }

  if (lower === 'assistant' || lower === 'bot' || lower === 'ai') {
    return 'assistant';
  }

  return null;
}

function extractMessageContent(message: unknown, preserveWhitespace = false): string {
  if (!message) {
    return '';
  }

  if (typeof message === 'object') {
    const record = message as Record<string, unknown>;
    return extractTextLike(
      record.content ?? record.content_block ?? record.message ?? record.text ?? record.msg,
      preserveWhitespace
    );
  }

  return '';
}

function extractTextLike(input: unknown, preserveWhitespace = false): string {
  if (typeof input === 'string') {
    const candidate = preserveWhitespace ? input : input.trim();
    if (!candidate) {
      return '';
    }

    const parsed = safeParseJson<unknown>(input);
    if (parsed !== null) {
      const nested = extractTextLike(parsed, preserveWhitespace);
      if (nested) {
        return nested;
      }
    }

    return candidate;
  }

  if (Array.isArray(input)) {
    return input
      .map((item) => extractTextLike(item, preserveWhitespace))
      .filter(Boolean)
      .join('\n')
      .trim();
  }

  if (!input || typeof input !== 'object') {
    return '';
  }

  const record = input as Record<string, unknown>;
  const directKeys = ['text', 'content', 'msg', 'delta', 'value'];
  for (const key of directKeys) {
    const value = record[key];
    if (typeof value === 'string') {
      const text = extractTextLike(value, preserveWhitespace);
      if (text) {
        return text;
      }
    }
  }

  const nestedKeys = ['text_block', 'content_block', 'message', 'content', 'parts', 'delta'];
  for (const key of nestedKeys) {
    const value = record[key];
    const text = extractTextLike(value, preserveWhitespace);
    if (text) {
      return text;
    }
  }

  return '';
}

function getStructuredText(eventData: Record<string, unknown> | null): string {
  if (!eventData) {
    return '';
  }

  const message = getNestedValue(eventData, ['message']);
  const content = extractMessageContent(message, true);
  if (content) {
    return content;
  }

  return (
    extractTextLike(getNestedValue(eventData, ['text']), true) ||
    extractTextLike(getNestedValue(eventData, ['msg']), true)
  );
}

function getNestedValue(input: Record<string, unknown>, path: string[]): unknown {
  let current: unknown = input;
  for (const key of path) {
    if (!current || typeof current !== 'object') {
      return undefined;
    }

    current = (current as Record<string, unknown>)[key];
  }

  return current;
}

function extractSsePayload(line: string): string | null {
  if (!line.startsWith('data:')) {
    return null;
  }

  const raw = line.slice(5).trim();
  if (!raw || raw === '[DONE]') {
    return null;
  }

  return raw;
}

function unwrapEventData(input: unknown): Record<string, unknown> | null {
  if (typeof input === 'string') {
    const parsed = safeParseJson<unknown>(input);
    if (parsed && typeof parsed === 'object') {
      return parsed as Record<string, unknown>;
    }

    return null;
  }

  if (input && typeof input === 'object') {
    return input as Record<string, unknown>;
  }

  return null;
}

function mergeAssistantContent(current: string, incoming: string): string {
  if (!current) {
    return incoming;
  }

  if (incoming.startsWith(current)) {
    return incoming;
  }

  if (current.startsWith(incoming)) {
    return current;
  }

  return `${current}${incoming}`;
}

function getString(input: object, key: string): string | null {
  const value = (input as Record<string, unknown>)[key];
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function firstNonEmptyString(values: Array<string | null | undefined>): string | null {
  for (const value of values) {
    if (typeof value === 'string' && value.trim().length > 0) {
      return value.trim();
    }
  }

  return null;
}

function toIsoTimestamp(input: number | string | undefined, offset: number): string {
  if (typeof input === 'number' && Number.isFinite(input)) {
    const asMillis = input > 1e12 ? input : input * 1000;
    return new Date(asMillis).toISOString();
  }

  if (typeof input === 'string' && input.trim().length > 0) {
    const numeric = Number(input);
    if (Number.isFinite(numeric)) {
      return new Date(numeric > 1e12 ? numeric : numeric * 1000).toISOString();
    }

    const parsed = new Date(input);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toISOString();
    }
  }

  return new Date(offset).toISOString();
}

function safeParseJson<T>(input: string): T | null {
  try {
    return JSON.parse(input) as T;
  } catch {
    return null;
  }
}
