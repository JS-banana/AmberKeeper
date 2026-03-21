import crypto from 'node:crypto';
import type { NormalizedMessage } from '@anychat/shared-types';

interface ChatGptAuthor {
  role?: string;
}

interface ChatGptContent {
  parts?: string[];
}

interface ChatGptMessageNode {
  id?: string;
  author?: ChatGptAuthor;
  content?: ChatGptContent;
  create_time?: number;
  metadata?: {
    model_slug?: string;
  };
  status?: string;
}

interface ChatGptConversationRequest {
  conversation_id?: string;
  model?: string;
  messages?: ChatGptMessageNode[];
}

interface ChatGptConversationResponse {
  conversation_id?: string;
  mapping?: Record<string, { message?: ChatGptMessageNode }>;
}

interface ChatGptSseEvent {
  conversation_id?: string;
  message?: ChatGptMessageNode;
}

interface ChatGptStreamStatusResponse {
  status?: string;
}

export function computeContentHash(content: string): string {
  return crypto.createHash('sha256').update(content).digest('hex');
}

export function parseChatGptRequestBody(body: string): NormalizedMessage[] {
  const parsed = JSON.parse(body) as ChatGptConversationRequest;
  const normalized: NormalizedMessage[] = [];

  for (const message of parsed.messages ?? []) {
    if (message.author?.role !== 'user') {
      continue;
    }

    const next = normalizeMessage(message, parsed.conversation_id, parsed.model);
    if (next) {
      normalized.push(next);
    }
  }

  return normalized;
}

export function parseChatGptSseResponse(body: string): NormalizedMessage[] {
  let finalAssistant: NormalizedMessage | null = null;

  for (const line of body.split('\n')) {
    if (!line.startsWith('data: ')) {
      continue;
    }

    const raw = line.slice(6).trim();
    if (!raw || raw === '[DONE]') {
      continue;
    }

    const parsed = JSON.parse(raw) as ChatGptSseEvent;
    const message = parsed.message;
    if (message?.author?.role !== 'assistant') {
      continue;
    }

    const normalized = normalizeMessage(
      message,
      parsed.conversation_id,
      message.metadata?.model_slug
    );

    if (normalized) {
      finalAssistant = normalized;
    }
  }

  return finalAssistant ? [finalAssistant] : [];
}

export function parseChatGptHistoryResponse(body: string): NormalizedMessage[] {
  const parsed = JSON.parse(body) as ChatGptConversationResponse;
  const normalized: NormalizedMessage[] = [];

  for (const node of Object.values(parsed.mapping ?? {})) {
    const next = normalizeMessage(node.message, parsed.conversation_id, node.message?.metadata?.model_slug);
    if (next) {
      normalized.push(next);
    }
  }

  normalized.sort((left, right) => left.createdAt.localeCompare(right.createdAt));
  return normalized;
}

export function parseChatGptStreamStatus(body: string): 'COMPLETE' | null {
  const parsed = JSON.parse(body) as ChatGptStreamStatusResponse;
  return parsed.status === 'COMPLETE' ? 'COMPLETE' : null;
}

export function summarizeResponseBody(body: string, maxLength = 400): string {
  const normalized = body.replace(/\s+/g, ' ').trim();
  if (!normalized) {
    return '';
  }

  return normalized.slice(0, maxLength);
}

function normalizeMessage(
  message: ChatGptMessageNode | undefined,
  conversationId: string | undefined,
  fallbackModel: string | undefined
): NormalizedMessage | null {
  const role = message?.author?.role;
  const content = message?.content?.parts?.join('\n').trim();

  if (!message || (role !== 'user' && role !== 'assistant') || !content) {
    return null;
  }

  return {
    role,
    content,
    createdAt: toIsoTimestamp(message.create_time),
    remoteConversationId: conversationId,
    remoteMessageId: message.id,
    model: message.metadata?.model_slug ?? fallbackModel,
  };
}

function toIsoTimestamp(input?: number): string {
  if (typeof input === 'number' && Number.isFinite(input)) {
    return new Date(input * 1000).toISOString();
  }

  return new Date(0).toISOString();
}
