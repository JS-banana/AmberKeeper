export type DoubaoRequestClassification = 'capture' | 'discover' | 'ignore';

const DOUBAO_API_PREFIXES = ['/chat/', '/samantha/'];
const CAPTURE_PATHS = ['/chat/completion', '/samantha/chat/completion'];

export function classifyDoubaoRequest(input: string, method: string): DoubaoRequestClassification {
  const url = safeParseUrl(input);
  if (!url || !isDoubaoHost(url.hostname)) {
    return 'ignore';
  }

  const pathname = url.pathname;
  const normalizedMethod = method.toUpperCase();

  if (
    normalizedMethod === 'POST' &&
    CAPTURE_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`))
  ) {
    return 'capture';
  }

  if (
    DOUBAO_API_PREFIXES.some((prefix) => pathname.startsWith(prefix)) ||
    pathname.startsWith('/api/')
  ) {
    return 'discover';
  }

  return 'ignore';
}

export function matchesDoubaoView(input: string): boolean {
  const url = safeParseUrl(input);
  return Boolean(url && isDoubaoHost(url.hostname) && url.pathname.startsWith('/chat'));
}

export function extractDoubaoConversationIdFromUrl(input: string): string | null {
  const url = safeParseUrl(input);
  if (!url || !isDoubaoHost(url.hostname)) {
    return null;
  }

  const pathMatch = url.pathname.match(/^\/chat\/([^/?#]+)/);
  if (pathMatch) {
    const candidate = pathMatch[1];
    if (candidate && !RESERVED_PATH_SEGMENTS.has(candidate)) {
      return decodeURIComponent(candidate);
    }
  }

  return firstNonEmptyString([
    url.searchParams.get('conversation_id'),
    url.searchParams.get('conversationId'),
    url.searchParams.get('chat_session_id'),
    url.searchParams.get('session_id'),
    url.searchParams.get('thread_id'),
    url.searchParams.get('id'),
  ]);
}

export function extractDoubaoConversationIdFromBody(body?: string): string | null {
  if (!body) {
    return null;
  }

  const parsed = safeParseJson<Record<string, unknown>>(body);
  if (!parsed) {
    return null;
  }

  return firstNonEmptyString([
    getString(parsed, 'conversation_id'),
    getString(parsed, 'conversationId'),
    getString(parsed, 'chat_session_id'),
    getString(parsed, 'session_id'),
    getString(parsed, 'thread_id'),
    getString(parsed, 'id'),
  ]);
}

export function isDoubaoTemporaryConversationId(input: string): boolean {
  return input.trim().startsWith('local_');
}

export function shouldTriggerDoubaoDomAutoCapture(input: {
  url: string;
  method: string;
  streamStatus: 'COMPLETE' | null;
}): boolean {
  if (input.streamStatus === 'COMPLETE') {
    return true;
  }

  return (
    input.method.toUpperCase() === 'POST' &&
    classifyDoubaoRequest(input.url, input.method) === 'capture'
  );
}

function safeParseUrl(input: string): URL | null {
  try {
    return new URL(input);
  } catch {
    return null;
  }
}

function isDoubaoHost(hostname: string): boolean {
  return hostname === 'doubao.com' || hostname.endsWith('.doubao.com');
}

function getString(input: Record<string, unknown>, key: string): string | null {
  const value = input[key];
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

const RESERVED_PATH_SEGMENTS = new Set([
  'completion',
  'completions',
  'history',
  'historys',
  'search',
  'create-image',
  'create-video',
  'chat-with-doc',
  'coding',
  'fission',
  'skill',
  'notice',
  'user',
  'settings',
]);

function safeParseJson<T>(input: string): T | null {
  try {
    return JSON.parse(input) as T;
  } catch {
    return null;
  }
}
