import type { NormalizedMessage } from '@amberkeeper/shared-types';

type GrokMessageContent =
  | string
  | Array<
      | string
      | {
          type?: string;
          text?: string;
        }
    >
  | null
  | undefined;

interface GrokConversationRequest {
  conversation_id?: string;
  conversationId?: string;
  chat_id?: string;
  chatId?: string;
  thread_id?: string;
  threadId?: string;
  model?: string;
  prompt?: string;
  messages?: Array<{
    role?: string;
    content?: GrokMessageContent;
    created_at?: number;
    id?: string;
  }>;
}

interface GrokChoiceDelta {
  content?: string;
  reasoning_content?: string;
}

interface GrokChoiceMessage {
  role?: string;
  content?: GrokMessageContent;
  reasoning_content?: string;
}

interface GrokChoice {
  delta?: GrokChoiceDelta;
  message?: GrokChoiceMessage;
  finish_reason?: string | null;
}

interface GrokCompletionResponse {
  id?: string;
  request_id?: string;
  conversation_id?: string;
  model?: string;
  choices?: GrokChoice[];
  message?: GrokChoiceMessage;
  content?: string;
  text?: string;
}

export function parseGrokRequestBody(body: string): NormalizedMessage[] {
  const parsed = safeParseJson<GrokConversationRequest>(body);
  if (!parsed) {
    return [];
  }

  const conversationId = firstNonEmptyString([
    parsed.conversation_id,
    parsed.conversationId,
    parsed.chat_id,
    parsed.chatId,
    parsed.thread_id,
    parsed.threadId,
  ]);
  const model =
    typeof parsed.model === 'string' && parsed.model.trim() ? parsed.model.trim() : undefined;
  const prompt = typeof parsed.prompt === 'string' ? parsed.prompt.trim() : '';

  if (prompt) {
    return [
      {
        role: 'user',
        content: prompt,
        createdAt: new Date(0).toISOString(),
        remoteConversationId: conversationId,
        model,
      },
    ];
  }

  const latestUser = [...(parsed.messages ?? [])]
    .reverse()
    .find(
      (message) => message.role === 'user' && Boolean(readMessageContent(message.content)?.trim())
    );

  const content = readMessageContent(latestUser?.content)?.trim();
  if (!content) {
    return [];
  }

  return [
    {
      role: 'user',
      content,
      createdAt: new Date(0).toISOString(),
      remoteConversationId: conversationId,
      model,
    },
  ];
}

export function parseGrokResponseBody(body: string): NormalizedMessage[] {
  const streamMessages = parseGrokStreamLines(body);
  if (streamMessages.length > 0) {
    return streamMessages;
  }

  const parsed = safeParseJson<GrokCompletionResponse>(body);
  if (!parsed) {
    return [];
  }

  const candidate = extractAssistantMessage(parsed);
  return candidate ? [candidate] : [];
}

export function summarizeGrokResponseBody(body: string, maxLength = 400): string {
  const normalized = body.replace(/\s+/g, ' ').trim();
  if (!normalized) {
    return '';
  }

  return normalized.slice(0, maxLength);
}

function parseGrokStreamLines(body: string): NormalizedMessage[] {
  let conversationId: string | undefined;
  let content = '';
  let createdAt = new Date(0).toISOString();
  let remoteMessageId: string | undefined;
  let model: string | undefined;

  for (const line of body.split('\n')) {
    const raw = extractStreamPayload(line);
    if (!raw) {
      continue;
    }

    const parsed = safeParseJson<GrokCompletionResponse>(raw);
    if (!parsed) {
      continue;
    }

    conversationId =
      firstNonEmptyString([parsed.conversation_id, conversationId]) ?? conversationId;
    model = firstNonEmptyString([parsed.model, model]) ?? model;

    const choice = parsed.choices?.[0];
    if (!choice) {
      continue;
    }

    const assistantMessage = choice.message;
    if (assistantMessage?.role === 'assistant') {
      const extracted = extractMessageContent(assistantMessage.content);
      if (extracted) {
        content = mergeAssistantContent(content, extracted);
      }
    }

    const deltaContent = choice.delta?.content;
    if (typeof deltaContent === 'string' && deltaContent.trim().length > 0) {
      content = mergeAssistantContent(content, deltaContent);
    }

    const reasoning = choice.delta?.reasoning_content;
    if (typeof reasoning === 'string' && reasoning.trim().length > 0 && !content) {
      content = mergeAssistantContent(content, reasoning);
    }

    if (parsed.id) {
      remoteMessageId = parsed.id;
    }
  }

  const normalizedContent = content.trim();
  if (!normalizedContent) {
    return [];
  }

  return [
    {
      role: 'assistant',
      content: normalizedContent,
      createdAt,
      remoteConversationId: conversationId,
      remoteMessageId,
      model,
    },
  ];
}

function extractAssistantMessage(parsed: GrokCompletionResponse): NormalizedMessage | null {
  const conversationId = firstNonEmptyString([parsed.conversation_id]);
  const choice = parsed.choices?.[0];
  const candidateMessage = choice?.message ?? parsed.message;
  const content = (
    extractMessageContent(candidateMessage?.content) ||
    (typeof parsed.content === 'string' ? parsed.content.trim() : '') ||
    (typeof parsed.text === 'string' ? parsed.text.trim() : '')
  ).trim();
  const model = firstNonEmptyString([parsed.model]);

  if ((candidateMessage?.role && candidateMessage.role !== 'assistant') || !content) {
    return null;
  }

  return {
    role: 'assistant',
    content,
    createdAt: new Date(0).toISOString(),
    remoteConversationId: conversationId,
    remoteMessageId: parsed.id ?? parsed.request_id,
    model,
  };
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

function extractStreamPayload(line: string): string | null {
  if (!line.startsWith('data: ')) {
    return null;
  }

  const raw = line.slice(6).trim();
  if (!raw || raw === '[DONE]') {
    return null;
  }

  return raw;
}

function extractMessageContent(content: GrokMessageContent): string {
  if (typeof content === 'string') {
    return content.trim();
  }

  if (!Array.isArray(content)) {
    return '';
  }

  return content
    .map((item) => {
      if (typeof item === 'string') {
        return item.trim();
      }

      return typeof item.text === 'string' ? item.text.trim() : '';
    })
    .filter(Boolean)
    .join('\n')
    .trim();
}

function readMessageContent(content: GrokMessageContent): string {
  return extractMessageContent(content);
}

function firstNonEmptyString(values: Array<string | null | undefined>): string | undefined {
  for (const value of values) {
    if (typeof value === 'string' && value.trim().length > 0) {
      return value.trim();
    }
  }

  return undefined;
}

function safeParseJson<T>(input: string): T | null {
  try {
    return JSON.parse(input) as T;
  } catch {
    return null;
  }
}
