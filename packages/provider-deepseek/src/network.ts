export type DeepSeekRequestClassification = 'capture' | 'discover' | 'ignore';

const API_PREFIX = '/api/';
const COMPLETION_ROUTE = /^\/api\/v0\/chat\/completion(?:s)?$/;

export function classifyDeepSeekRequest(
  input: string,
  _method: string
): DeepSeekRequestClassification {
  const url = safeParseUrl(input);
  if (!url || !isDeepSeekHost(url.hostname)) {
    return 'ignore';
  }

  if (COMPLETION_ROUTE.test(url.pathname)) {
    return 'capture';
  }

  if (url.pathname.startsWith(API_PREFIX)) {
    return 'discover';
  }

  return 'ignore';
}

export function matchesDeepSeekView(input: string): boolean {
  const url = safeParseUrl(input);
  return Boolean(url && isDeepSeekHost(url.hostname));
}

export function extractDeepSeekConversationIdFromUrl(input: string): string | null {
  const url = safeParseUrl(input);
  if (!url || !isDeepSeekHost(url.hostname)) {
    return null;
  }

  const pageMatch = url.pathname.match(/^\/a\/chat\/s\/([^/?#]+)/);
  if (pageMatch) {
    return pageMatch[1];
  }

  return null;
}

export function extractDeepSeekConversationIdFromBody(body?: string): string | null {
  if (!body) {
    return null;
  }

  try {
    const parsed = JSON.parse(body) as { conversation_id?: unknown; chat_session_id?: unknown };
    if (typeof parsed.conversation_id === 'string' && parsed.conversation_id.length > 0) {
      return parsed.conversation_id;
    }

    return typeof parsed.chat_session_id === 'string' && parsed.chat_session_id.length > 0
      ? parsed.chat_session_id
      : null;
  } catch {
    return null;
  }
}

export function shouldTriggerDeepSeekDomAutoCapture(input: {
  url: string;
  method: string;
  streamStatus: 'COMPLETE' | null;
}): boolean {
  if (input.streamStatus === 'COMPLETE') {
    return true;
  }

  return (
    input.method.toUpperCase() === 'POST' &&
    classifyDeepSeekRequest(input.url, input.method) === 'capture'
  );
}

function safeParseUrl(input: string): URL | null {
  try {
    return new URL(input);
  } catch {
    return null;
  }
}

function isDeepSeekHost(hostname: string): boolean {
  return hostname === 'chat.deepseek.com' || hostname.endsWith('.deepseek.com');
}
