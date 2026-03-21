import type { NormalizedMessage } from '@amberkeeper/shared-types';

interface DeepSeekConversationRequest {
  conversation_id?: string;
  chat_session_id?: string;
  model?: string;
  model_class?: string;
  prompt?: string;
  messages?: Array<{
    role?: string;
    content?: string;
  }>;
}

interface DeepSeekSseEvent {
  conversation_id?: string;
  chat_session_id?: string;
  request_message_id?: number | string;
  response_message_id?: number | string;
  v?: {
    response?: {
      message_id?: number | string;
      model?: string;
      role?: string;
      inserted_at?: number;
      contents?: Array<{
        content_type?: string;
        type?: string;
        text?: string;
      }>;
    };
  };
  choices?: Array<{
    delta?: {
      content?: string;
    };
    message?: {
      content?: string;
    };
  }>;
  message?: {
    content?: string;
  };
  text?: string;
  content?: string;
}

export function parseDeepSeekRequestBody(body: string): NormalizedMessage[] {
  const parsed = JSON.parse(body) as DeepSeekConversationRequest;
  const prompt = typeof parsed.prompt === 'string' ? parsed.prompt.trim() : '';

  if (prompt) {
    return [
      {
        role: 'user',
        content: prompt,
        createdAt: new Date(0).toISOString(),
        remoteConversationId:
          typeof parsed.chat_session_id === 'string'
            ? parsed.chat_session_id
            : typeof parsed.conversation_id === 'string'
              ? parsed.conversation_id
              : undefined,
        model:
          typeof parsed.model === 'string'
            ? parsed.model
            : typeof parsed.model_class === 'string'
              ? parsed.model_class
              : undefined,
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
      remoteConversationId:
        typeof parsed.chat_session_id === 'string'
          ? parsed.chat_session_id
          : typeof parsed.conversation_id === 'string'
            ? parsed.conversation_id
            : undefined,
      model:
        typeof parsed.model === 'string'
          ? parsed.model
          : typeof parsed.model_class === 'string'
            ? parsed.model_class
            : undefined,
    },
  ];
}

export function parseDeepSeekSseResponse(body: string): NormalizedMessage[] {
  let conversationId: string | undefined;
  let readyResponseMessageId: string | undefined;
  let latestAssistantMetadata:
    | {
        createdAt: string;
        remoteMessageId?: string;
        model?: string;
      }
    | null = null;
  let finalAssistant: NormalizedMessage | null = null;

  for (const line of body.split('\n')) {
    if (!line.startsWith('data: ')) {
      continue;
    }

    const raw = line.slice(6).trim();
    if (!raw || raw === '[DONE]') {
      continue;
    }

    const parsed = safeParseJson<DeepSeekSseEvent>(raw);
    if (!parsed) {
      continue;
    }

    conversationId =
      typeof parsed.chat_session_id === 'string'
        ? parsed.chat_session_id
        : typeof parsed.conversation_id === 'string'
          ? parsed.conversation_id
          : conversationId;
    if (parsed.response_message_id != null) {
      readyResponseMessageId = String(parsed.response_message_id);
    }

    const responseMessage = parsed.v?.response;
    if (responseMessage?.role === 'ASSISTANT') {
      latestAssistantMetadata = {
        createdAt: toIsoTimestamp(responseMessage.inserted_at),
        remoteMessageId: String(responseMessage.message_id ?? readyResponseMessageId ?? ''),
        model:
          typeof responseMessage.model === 'string' && responseMessage.model.length > 0
            ? responseMessage.model
            : undefined,
      };
    }

    const responseText = extractDeepSeekResponseText(responseMessage?.contents);
    if (responseMessage?.role === 'ASSISTANT' && responseText) {
      finalAssistant = {
        role: 'assistant',
        content: responseText,
        createdAt: latestAssistantMetadata?.createdAt ?? new Date(0).toISOString(),
        remoteConversationId: conversationId,
        remoteMessageId: latestAssistantMetadata?.remoteMessageId,
        model: latestAssistantMetadata?.model,
      };
      continue;
    }

    const legacyContent =
      parsed.choices?.[0]?.delta?.content ??
      parsed.choices?.[0]?.message?.content ??
      parsed.message?.content ??
      parsed.text ??
      parsed.content ??
      '';
    if (legacyContent.trim()) {
      finalAssistant = {
        role: 'assistant',
        content: legacyContent.trim(),
        createdAt: latestAssistantMetadata?.createdAt ?? new Date(0).toISOString(),
        remoteConversationId: conversationId,
        remoteMessageId: latestAssistantMetadata?.remoteMessageId ?? readyResponseMessageId,
        model: latestAssistantMetadata?.model,
      };
    }
  }

  return finalAssistant ? [finalAssistant] : [];
}

export function summarizeDeepSeekResponseBody(body: string, maxLength = 400): string {
  const normalized = body.replace(/\s+/g, ' ').trim();
  if (!normalized) {
    return '';
  }

  return normalized.slice(0, maxLength);
}

function extractDeepSeekResponseText(
  contents: Array<{ content_type?: string; type?: string; text?: string }> | undefined
): string {
  return (contents ?? [])
    .filter((item) => isDeepSeekTextContentItem(item) && typeof item.text === 'string')
    .map((item) => item.text?.trim() ?? '')
    .filter(Boolean)
    .join('\n')
    .trim();
}

function isDeepSeekTextContentItem(input: {
  content_type?: string;
  type?: string;
  text?: string;
}): boolean {
  if (typeof input.text !== 'string' || input.text.trim().length === 0) {
    return false;
  }

  if (input.content_type === 'text' || input.type === 'text') {
    return true;
  }

  return input.content_type == null && input.type == null;
}

function toIsoTimestamp(input?: number): string {
  if (typeof input === 'number' && Number.isFinite(input)) {
    return new Date(input * 1000).toISOString();
  }

  return new Date(0).toISOString();
}

function safeParseJson<T>(input: string): T | null {
  try {
    return JSON.parse(input) as T;
  } catch {
    return null;
  }
}
