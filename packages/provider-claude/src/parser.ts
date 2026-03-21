import type { NormalizedMessage } from '@anychat/shared-types';

interface ClaudeConversationRequest {
  conversation_uuid?: string;
  prompt?: string;
  model?: string;
  messages?: Array<{
    role?: string;
    content?: string;
  }>;
}

interface ClaudeSseEvent {
  completion?: string;
  delta?: {
    text?: string;
  };
  content_block?: {
    text?: string;
  };
  conversation_uuid?: string;
}

interface ClaudeHistoryContentItem {
  type?: string;
  text?: string;
}

interface ClaudeHistoryMessage {
  uuid?: string;
  sender?: string;
  content?: ClaudeHistoryContentItem[];
  created_at?: string;
  updated_at?: string;
}

interface ClaudeHistoryResponse {
  uuid?: string;
  chat_messages?: ClaudeHistoryMessage[];
}

export function parseClaudeRequestBody(body: string): NormalizedMessage[] {
  const parsed = JSON.parse(body) as ClaudeConversationRequest;
  const conversationId =
    typeof parsed.conversation_uuid === 'string' ? parsed.conversation_uuid : undefined;
  const model = typeof parsed.model === 'string' ? parsed.model : undefined;
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
    .find((message) => message.role === 'user' && typeof message.content === 'string');

  if (!latestUser?.content?.trim()) {
    return [];
  }

  return [
    {
      role: 'user',
      content: latestUser.content.trim(),
      createdAt: new Date(0).toISOString(),
      remoteConversationId: conversationId,
      model,
    },
  ];
}

export function parseClaudeSseResponse(body: string): NormalizedMessage[] {
  let content = '';
  let conversationId: string | undefined;

  for (const line of body.split('\n')) {
    if (!line.startsWith('data: ')) {
      continue;
    }

    const raw = line.slice(6).trim();
    if (!raw || raw === '[DONE]') {
      continue;
    }

    const parsed = JSON.parse(raw) as ClaudeSseEvent;
    conversationId =
      typeof parsed.conversation_uuid === 'string' ? parsed.conversation_uuid : conversationId;
    content +=
      parsed.completion ??
      parsed.delta?.text ??
      parsed.content_block?.text ??
      '';
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
      remoteConversationId: conversationId,
    },
  ];
}

export function parseClaudeHistoryResponse(body: string): NormalizedMessage[] {
  const parsed = safeParseClaudeHistoryResponse(body);
  if (!parsed) {
    return [];
  }

  const conversationId = typeof parsed.uuid === 'string' ? parsed.uuid : undefined;
  const normalized: NormalizedMessage[] = [];

  for (const message of parsed.chat_messages ?? []) {
    const next = normalizeClaudeHistoryMessage(message, conversationId);
    if (next) {
      normalized.push(next);
    }
  }

  normalized.sort((left, right) => left.createdAt.localeCompare(right.createdAt));
  return normalized;
}

export function summarizeClaudeResponseBody(body: string, maxLength = 400): string {
  const normalized = body.replace(/\s+/g, ' ').trim();
  if (!normalized) {
    return '';
  }

  return normalized.slice(0, maxLength);
}

function normalizeClaudeHistoryMessage(
  message: ClaudeHistoryMessage | undefined,
  conversationId: string | undefined
): NormalizedMessage | null {
  const role = toNormalizedRole(message?.sender);
  const content = extractClaudeHistoryContent(message?.content);

  if (!message || !role || !content) {
    return null;
  }

  return {
    role,
    content,
    createdAt: toIsoTimestamp(message.created_at),
    remoteConversationId: conversationId,
    remoteMessageId: message.uuid,
  };
}

function toNormalizedRole(sender?: string): NormalizedMessage['role'] | null {
  if (sender === 'human') {
    return 'user';
  }

  if (sender === 'assistant') {
    return 'assistant';
  }

  return null;
}

function extractClaudeHistoryContent(content: ClaudeHistoryContentItem[] | undefined): string {
  return (content ?? [])
    .filter((item) => item.type === 'text' && typeof item.text === 'string')
    .map((item) => item.text?.trim() ?? '')
    .filter(Boolean)
    .join('\n')
    .trim();
}

function toIsoTimestamp(input?: string): string {
  if (typeof input !== 'string' || input.length === 0) {
    return new Date(0).toISOString();
  }

  const parsed = new Date(input);
  return Number.isNaN(parsed.valueOf()) ? new Date(0).toISOString() : parsed.toISOString();
}

function safeParseClaudeHistoryResponse(body: string): ClaudeHistoryResponse | null {
  try {
    const parsed = JSON.parse(body) as ClaudeHistoryResponse | null;
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}
