export type KimiRequestClassification = 'capture' | 'discover' | 'ignore';

const API_PREFIXES = ['/api/', '/chat/'];
const CAPTURE_PATH_PATTERNS = [
  /^\/api\/(?:v\d+\/)?chat\/completions?$/,
  /^\/api\/(?:v\d+\/)?chat\/conversations\/[^/?#]+(?:\/messages)?$/,
  /^\/api\/(?:v\d+\/)?conversations\/[^/?#]+(?:\/messages)?$/,
  /^\/api\/(?:v\d+\/)?chat\/history\/[^/?#]+$/,
  /^\/chat\/[^/?#]+(?:\/messages|\/completion(?:s)?|\/stream)?$/,
  /^\/chat\/history(?:\/[^/?#]+)?$/,
];

export function classifyKimiRequest(
  input: string,
  method: string
): KimiRequestClassification {
  const url = safeParseUrl(input);
  if (!url || !isKimiHost(url.hostname)) {
    return 'ignore';
  }

  const pathname = url.pathname;
  if (
    CAPTURE_PATH_PATTERNS.some((pattern) => pattern.test(pathname)) &&
    (method.toUpperCase() === 'POST' || method.toUpperCase() === 'GET')
  ) {
    return 'capture';
  }

  if (API_PREFIXES.some((prefix) => pathname.startsWith(prefix))) {
    return 'discover';
  }

  return 'ignore';
}

export function matchesKimiView(input: string): boolean {
  const url = safeParseUrl(input);
  return Boolean(url && isKimiHost(url.hostname));
}

export function extractKimiConversationIdFromUrl(input: string): string | null {
  const url = safeParseUrl(input);
  if (!url || !isKimiHost(url.hostname)) {
    return null;
  }

  const pathMatch = url.pathname.match(/^\/(?:chat|c|app)\/([^/?#]+)/);
  if (pathMatch) {
    return pathMatch[1];
  }

  for (const key of ['conversation_id', 'chat_session_id', 'session_id', 'chat_id']) {
    const value = url.searchParams.get(key);
    if (value?.trim()) {
      return value;
    }
  }

  return null;
}

export function extractKimiConversationIdFromBody(body?: string): string | null {
  if (!body) {
    return null;
  }

  try {
    const parsed = JSON.parse(body) as {
      conversation_id?: unknown;
      chat_session_id?: unknown;
      session_id?: unknown;
      chat_id?: unknown;
    };

    for (const key of ['conversation_id', 'chat_session_id', 'session_id', 'chat_id'] as const) {
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

export function shouldTriggerKimiDomAutoCapture(input: {
  url: string;
  method: string;
  streamStatus: 'COMPLETE' | null;
}): boolean {
  if (input.streamStatus === 'COMPLETE') {
    return true;
  }

  return (
    input.method.toUpperCase() === 'POST' &&
    classifyKimiRequest(input.url, input.method) === 'capture'
  );
}

function safeParseUrl(input: string): URL | null {
  try {
    return new URL(input);
  } catch {
    return null;
  }
}

function isKimiHost(hostname: string): boolean {
  return (
    hostname === 'kimi.com' ||
    hostname.endsWith('.kimi.com') ||
    hostname === 'kimi.moonshot.cn'
  );
}
