export type GrokRequestClassification = 'capture' | 'discover' | 'ignore';

const API_HOST = 'api.x.ai';
const CHAT_COMPLETION_PATH = '/v1/chat/completions';
const DEFERRED_COMPLETION_PREFIX = '/v1/chat/deferred-completion/';

export function classifyGrokRequest(input: string, method: string): GrokRequestClassification {
  const url = safeParseUrl(input);
  if (!url) {
    return 'ignore';
  }

  if (isGrokApiHost(url.hostname)) {
    if (method.toUpperCase() === 'POST' && url.pathname === CHAT_COMPLETION_PATH) {
      return 'capture';
    }

    if (method.toUpperCase() === 'GET' && url.pathname.startsWith(DEFERRED_COMPLETION_PREFIX)) {
      return 'capture';
    }

    if (url.pathname.startsWith('/v1/')) {
      return 'discover';
    }
  }

  return 'ignore';
}

export function matchesGrokView(input: string): boolean {
  const url = safeParseUrl(input);
  if (!url) {
    return false;
  }

  return isGrokViewHost(url.hostname) || isGrokXView(url);
}

export function extractGrokConversationIdFromUrl(input: string): string | null {
  const url = safeParseUrl(input);
  if (!url) {
    return null;
  }

  const candidate = firstNonEmptyString([
    extractPathConversationId(url.pathname),
    extractQueryConversationId(url.searchParams),
  ]);

  return candidate;
}

export function extractGrokConversationIdFromBody(body?: string): string | null {
  if (!body) {
    return null;
  }

  try {
    const parsed = JSON.parse(body) as Record<string, unknown>;
    return firstNonEmptyString([
      getString(parsed, 'conversation_id'),
      getString(parsed, 'conversationId'),
      getString(parsed, 'chat_id'),
      getString(parsed, 'chatId'),
      getString(parsed, 'thread_id'),
      getString(parsed, 'threadId'),
      getString(parsed, 'response_id'),
      getString(parsed, 'request_id'),
      getString(parsed, 'share_id'),
      getString(parsed, 'shareId'),
      getString(parsed, 'id'),
    ]);
  } catch {
    return null;
  }
}

export function shouldTriggerGrokDomAutoCapture(input: {
  url: string;
  method: string;
  streamStatus: 'COMPLETE' | null;
}): boolean {
  if (input.streamStatus === 'COMPLETE') {
    return true;
  }

  return (
    input.method.toUpperCase() === 'POST' &&
    classifyGrokRequest(input.url, input.method) === 'capture'
  );
}

function safeParseUrl(input: string): URL | null {
  try {
    return new URL(input);
  } catch {
    return null;
  }
}

function isGrokApiHost(hostname: string): boolean {
  return hostname === API_HOST || hostname.endsWith(`.${API_HOST}`);
}

function isGrokViewHost(hostname: string): boolean {
  return hostname === 'grok.com' || hostname.endsWith('.grok.com');
}

function isGrokXView(url: URL): boolean {
  return url.hostname === 'x.com' && url.pathname.startsWith('/i/grok');
}

function extractPathConversationId(pathname: string): string | null {
  const patterns = [/^\/chat\/([^/?#]+)/, /^\/c\/([^/?#]+)/, /^\/share\/([^/?#]+)/];

  for (const pattern of patterns) {
    const match = pathname.match(pattern);
    if (match?.[1]) {
      return decodeURIComponent(match[1]);
    }
  }

  return null;
}

function extractQueryConversationId(searchParams: URLSearchParams): string | null {
  return firstNonEmptyString([
    searchParams.get('conversation_id'),
    searchParams.get('conversationId'),
    searchParams.get('chat_id'),
    searchParams.get('chatId'),
    searchParams.get('thread_id'),
    searchParams.get('threadId'),
    searchParams.get('share_id'),
    searchParams.get('shareId'),
    searchParams.get('id'),
  ]);
}

function getString(input: Record<string, unknown>, key: string): string | null {
  const value = input[key];
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function firstNonEmptyString(values: Array<string | null | undefined>): string | null {
  for (const value of values) {
    if (typeof value === 'string' && value.trim().length > 0) {
      return value.trim();
    }
  }

  return null;
}
