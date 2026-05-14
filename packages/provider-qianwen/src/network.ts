export type QianwenRequestClassification = 'capture' | 'discover' | 'ignore';

const API_PREFIX = '/api/';
const CAPTURE_PATH_PATTERNS = [
  /^\/api\/v\d+\/chat$/,
  /^\/api\/(?:v\d+\/)?chat\/completions?$/,
  /^\/api\/(?:v\d+\/)?chat\/conversations\/[^/?#]+(?:\/messages)?$/,
  /^\/api\/(?:v\d+\/)?conversations\/[^/?#]+(?:\/messages)?$/,
  /^\/api\/(?:v\d+\/)?chat\/history\/[^/?#]+$/,
  /^\/api\/v\d+\/session\/msg\/list$/,
];

export function classifyQianwenRequest(
  input: string,
  method: string
): QianwenRequestClassification {
  const url = safeParseUrl(input);
  if (!url || !isQianwenHost(url.hostname)) {
    return 'ignore';
  }

  const pathname = url.pathname;
  if (
    CAPTURE_PATH_PATTERNS.some((pattern) => pattern.test(pathname)) &&
    (method.toUpperCase() === 'POST' || method.toUpperCase() === 'GET')
  ) {
    return 'capture';
  }

  if (pathname.startsWith(API_PREFIX)) {
    return 'discover';
  }

  return 'ignore';
}

export function matchesQianwenView(input: string): boolean {
  const url = safeParseUrl(input);
  return Boolean(url && isQianwenHost(url.hostname));
}

export function extractQianwenConversationIdFromUrl(input: string): string | null {
  const url = safeParseUrl(input);
  if (!url || !isQianwenHost(url.hostname)) {
    return null;
  }

  const pathMatch = url.pathname.match(/^\/(?:chat|c|app)\/([^/?#]+)/);
  if (pathMatch) {
    return pathMatch[1];
  }

  for (const key of ['conversation_id', 'chat_session_id', 'session_id']) {
    const value = url.searchParams.get(key);
    if (value?.trim()) {
      return value;
    }
  }

  return null;
}

export function extractQianwenConversationIdFromBody(body?: string): string | null {
  if (!body) {
    return null;
  }

  try {
    const parsed = JSON.parse(body) as {
      conversation_id?: unknown;
      chat_session_id?: unknown;
      session_id?: unknown;
    };

    for (const key of ['conversation_id', 'chat_session_id', 'session_id'] as const) {
      const value = parsed[key];
      if (typeof value === 'string' && value.trim()) {
        return value;
      }
    }
  } catch {
    return null;
  }

  return null;
}

export function shouldTriggerQianwenDomAutoCapture(input: {
  url: string;
  method: string;
  streamStatus: 'COMPLETE' | null;
}): boolean {
  if (input.streamStatus === 'COMPLETE') {
    return true;
  }

  return (
    input.method.toUpperCase() === 'POST' &&
    classifyQianwenRequest(input.url, input.method) === 'capture'
  );
}

function safeParseUrl(input: string): URL | null {
  try {
    return new URL(input);
  } catch {
    return null;
  }
}

function isQianwenHost(hostname: string): boolean {
  return hostname === 'qianwen.com' || hostname.endsWith('.qianwen.com');
}
