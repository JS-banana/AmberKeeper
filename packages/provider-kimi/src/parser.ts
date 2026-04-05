import type { NormalizedMessage } from '@amberkeeper/shared-types';

interface KimiConversationRequest {
  conversation_id?: unknown;
  chat_session_id?: unknown;
  session_id?: unknown;
  model?: unknown;
  model_name?: unknown;
  prompt?: unknown;
  input?: unknown;
  messages?: Array<{
    role?: unknown;
    content?: unknown;
    created_at?: unknown;
    create_time?: unknown;
    message_id?: unknown;
    model?: unknown;
  }>;
}

interface KimiSseEvent {
  conversation_id?: unknown;
  chat_session_id?: unknown;
  session_id?: unknown;
  response_message_id?: unknown;
  message_id?: unknown;
  model?: unknown;
  created_at?: unknown;
  timestamp?: unknown;
  delta?: {
    content?: unknown;
  };
  choices?: Array<{
    delta?: {
      content?: unknown;
    };
    message?: {
      content?: unknown;
    };
  }>;
  message?: {
    role?: unknown;
    content?: unknown;
  };
  content?: unknown;
  text?: unknown;
  output?: {
    text?: unknown;
    content?: unknown;
  };
  result?: {
    content?: unknown;
    text?: unknown;
  };
  response?: {
    content?: unknown;
    text?: unknown;
  };
  v?: {
    response?: {
      message_id?: unknown;
      model?: unknown;
      role?: unknown;
      inserted_at?: unknown;
      contents?: Array<{
        content_type?: unknown;
        type?: unknown;
        text?: unknown;
      }>;
    };
  };
}

interface KimiHistoryMessageInput {
  role?: unknown;
  content?: unknown;
  created_at?: unknown;
  createdAt?: unknown;
  create_time?: unknown;
  timestamp?: unknown;
  inserted_at?: unknown;
  message_id?: unknown;
  id?: unknown;
  conversation_id?: unknown;
  chat_session_id?: unknown;
  session_id?: unknown;
  model?: unknown;
  model_name?: unknown;
}

export function parseKimiRequestBody(body: string): NormalizedMessage[] {
  const parsed = JSON.parse(body) as KimiConversationRequest;
  const conversationId = extractConversationIdFromRequest(parsed);
  const model = extractString(parsed.model) ?? extractString(parsed.model_name);

  const directPrompt = extractString(parsed.prompt) ?? extractString(parsed.input);
  if (directPrompt) {
    return [
      {
        role: 'user',
        content: directPrompt,
        createdAt: new Date(0).toISOString(),
        remoteConversationId: conversationId,
        model,
      },
    ];
  }

  const latestUser = [...(parsed.messages ?? [])]
    .reverse()
    .find((message) => extractString(message.role) === 'user' && extractString(message.content));

  const latestUserContent = extractString(latestUser?.content);
  if (!latestUserContent) {
    return [];
  }

  return [
    {
      role: 'user',
      content: latestUserContent,
      createdAt: normalizeTimestamp(latestUser?.created_at ?? latestUser?.create_time),
      remoteConversationId: conversationId,
      remoteMessageId: extractString(latestUser?.message_id),
      model: extractString(latestUser?.model) ?? model,
    },
  ];
}

export function parseKimiSseResponse(body: string): NormalizedMessage[] {
  let conversationId: string | undefined;
  let assistantMetadata:
    | {
        createdAt: string;
        remoteMessageId?: string;
        model?: string;
      }
    | null = null;
  let assistantContent = '';

  for (const line of body.split('\n')) {
    if (!line.startsWith('data: ')) {
      continue;
    }

    const raw = line.slice(6).trim();
    if (!raw || raw === '[DONE]') {
      continue;
    }

    const parsed = safeParseJson<KimiSseEvent>(raw);
    if (!parsed) {
      continue;
    }

    conversationId = extractConversationIdFromValue(parsed) ?? conversationId;
    const extracted = extractAssistantContent(parsed);
    if (extracted.content) {
      assistantContent = mergeAssistantContent(assistantContent, extracted.content);
      assistantMetadata = extracted.metadata ?? assistantMetadata;
    }
  }

  const normalizedContent = assistantContent.trim();
  if (!normalizedContent) {
    return [];
  }

  return [
    {
      role: 'assistant',
      content: normalizedContent,
      createdAt: assistantMetadata?.createdAt ?? new Date(0).toISOString(),
      remoteConversationId: conversationId,
      remoteMessageId: assistantMetadata?.remoteMessageId,
      model: assistantMetadata?.model,
    },
  ];
}

export function parseKimiHistoryResponse(body: string): NormalizedMessage[] {
  const parsed = safeParseJson<unknown>(body);
  if (!parsed) {
    return [];
  }

  const normalized = collectHistoryMessages(parsed, extractConversationIdFromValue(parsed));
  normalized.sort((left, right) => left.createdAt.localeCompare(right.createdAt));
  return normalized;
}

export function summarizeKimiResponseBody(body: string, maxLength = 400): string {
  const normalized = body.replace(/\s+/g, ' ').trim();
  if (!normalized) {
    return '';
  }

  return normalized.slice(0, maxLength);
}

function extractAssistantContent(input: unknown): {
  content: string;
  metadata: {
    createdAt: string;
    remoteMessageId?: string;
    model?: string;
  } | null;
} {
  const content =
    extractStringAtPath(input, ['choices', 0, 'delta', 'content']) ??
    extractStringAtPath(input, ['choices', 0, 'message', 'content']) ??
    extractStringAtPath(input, ['delta', 'content']) ??
    extractStringAtPath(input, ['message', 'content']) ??
    extractStringAtPath(input, ['content']) ??
    extractStringAtPath(input, ['text']) ??
    extractStringAtPath(input, ['output', 'text']) ??
    extractStringAtPath(input, ['output', 'content']) ??
    extractStringAtPath(input, ['result', 'content']) ??
    extractStringAtPath(input, ['result', 'text']) ??
    extractKimiResponseTextFromResponseNode(input) ??
    '';

  const recordConversationId = extractConversationIdFromValue(input);
  const remoteMessageId =
    extractStringAtPath(input, ['response_message_id']) ??
    extractStringAtPath(input, ['message_id']) ??
    extractStringAtPath(input, ['v', 'response', 'message_id']) ??
    undefined;
  const model =
    extractStringAtPath(input, ['model']) ??
    extractStringAtPath(input, ['v', 'response', 'model']) ??
    undefined;
  const createdAt =
    normalizeTimestamp(extractValueAtPath(input, ['created_at'])) ||
    normalizeTimestamp(extractValueAtPath(input, ['timestamp'])) ||
    normalizeTimestamp(extractValueAtPath(input, ['v', 'response', 'inserted_at'])) ||
    new Date(0).toISOString();

  return {
    content: content.trim(),
    metadata:
      content.trim().length > 0
        ? {
            createdAt,
            remoteMessageId,
            model,
          }
        : null,
  };
}

function collectHistoryMessages(input: unknown, conversationId?: string): NormalizedMessage[] {
  const normalized: NormalizedMessage[] = [];
  const seen = new Set<string>();

  const visit = (value: unknown, inheritedConversationId?: string): void => {
    const nextConversationId = extractConversationIdFromValue(value) ?? inheritedConversationId;
    const candidate = normalizeHistoryMessage(value, nextConversationId);
    if (candidate) {
      const dedupeKey = [
        candidate.role,
        candidate.content,
        candidate.createdAt,
        candidate.remoteConversationId ?? '',
        candidate.remoteMessageId ?? '',
      ].join('|');
      if (!seen.has(dedupeKey)) {
        seen.add(dedupeKey);
        normalized.push(candidate);
      }
    }

    if (Array.isArray(value)) {
      for (const item of value) {
        visit(item, nextConversationId);
      }
      return;
    }

    if (isPlainObject(value)) {
      for (const next of Object.values(value)) {
        if (typeof next === 'object' && next !== null) {
          visit(next, nextConversationId);
        }
      }
    }
  };

  visit(input, conversationId);
  return normalized;
}

function normalizeHistoryMessage(
  input: unknown,
  conversationId?: string
): NormalizedMessage | null {
  if (!isPlainObject(input)) {
    return null;
  }

  const role = extractString(input.role);
  const content = extractString(input.content);
  if (role !== 'user' && role !== 'assistant') {
    return null;
  }
  if (!content) {
    return null;
  }

  const recordConversationId = extractConversationIdFromValue(input);
  const remoteMessageId =
    extractString(input.message_id) ?? extractString(input.id) ?? extractString(input.response_message_id);
  const model = extractString(input.model) ?? extractString(input.model_name);
  const createdAt =
    normalizeTimestamp(input.created_at) ||
    normalizeTimestamp(input.createdAt) ||
    normalizeTimestamp(input.create_time) ||
    normalizeTimestamp(input.timestamp) ||
    normalizeTimestamp(input.inserted_at) ||
    new Date(0).toISOString();

  return {
    role,
    content,
    createdAt,
    remoteConversationId: conversationId ?? recordConversationId,
    remoteMessageId,
    model,
  };
}

function extractConversationIdFromRequest(input: KimiConversationRequest): string | undefined {
  return (
    extractString(input.conversation_id) ??
    extractString(input.chat_session_id) ??
    extractString(input.session_id) ??
    undefined
  );
}

function extractConversationIdFromValue(input: unknown): string | undefined {
  if (!isPlainObject(input)) {
    return undefined;
  }

  return (
    extractString(input.conversation_id) ??
    extractString(input.chat_session_id) ??
    extractString(input.session_id) ??
    extractStringAtPath(input, ['conversation', 'id']) ??
    extractStringAtPath(input, ['data', 'conversation_id']) ??
    extractStringAtPath(input, ['data', 'chat_session_id']) ??
    extractStringAtPath(input, ['data', 'session_id']) ??
    undefined
  );
}

function extractKimiResponseTextFromResponseNode(input: unknown): string | null {
  const contents = extractValueAtPath(input, ['v', 'response', 'contents']);
  if (!Array.isArray(contents)) {
    return null;
  }

  const segments = contents
    .map((item) => {
      if (!isPlainObject(item)) {
        return '';
      }

      const type = extractString(item.content_type) ?? extractString(item.type);
      if (type && type !== 'text') {
        return '';
      }

      return extractString(item.text) ?? '';
    })
    .filter(Boolean);

  return segments.length > 0 ? segments.join('\n').trim() : null;
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

  if (/\s$/.test(current) || /^\s/.test(incoming)) {
    return `${current}${incoming}`;
  }

  return `${current} ${incoming}`;
}

function extractString(value: unknown): string | undefined {
  if (typeof value === 'string' && value.trim().length > 0) {
    return value.trim();
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }

  return undefined;
}

function extractValueAtPath(input: unknown, path: Array<string | number>): unknown {
  let current: unknown = input;

  for (const key of path) {
    if (Array.isArray(current) && typeof key === 'number') {
      current = current[key];
      continue;
    }

    if (isPlainObject(current) && typeof key === 'string') {
      current = current[key];
      continue;
    }

    return undefined;
  }

  return current;
}

function extractStringAtPath(input: unknown, path: Array<string | number>): string | undefined {
  return extractString(extractValueAtPath(input, path));
}

function normalizeTimestamp(value: unknown): string {
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? value : new Date(parsed).toISOString();
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    const milliseconds = value > 1e12 ? value : value * 1000;
    return new Date(milliseconds).toISOString();
  }

  return '';
}

function safeParseJson<T>(input: string): T | null {
  try {
    return JSON.parse(input) as T;
  } catch {
    return null;
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
