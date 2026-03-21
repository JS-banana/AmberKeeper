export type ChatGptRequestClassification = 'capture' | 'discover' | 'ignore';

const BACKEND_API_PREFIX = '/backend-api/';
const CAPTURE_PATH_PATTERNS = ['/backend-api/conversation', '/backend-api/f/conversation'];

export function classifyChatGptRequest(
  input: string,
  _method: string
): ChatGptRequestClassification {
  const url = safeParseUrl(input);
  if (!url || !isChatGptHost(url.hostname)) {
    return 'ignore';
  }

  const pathname = url.pathname;
  if (CAPTURE_PATH_PATTERNS.some((pattern) => pathname === pattern || pathname.startsWith(`${pattern}/`))) {
    return 'capture';
  }

  if (pathname.startsWith(BACKEND_API_PREFIX)) {
    return 'discover';
  }

  return 'ignore';
}

export function matchesChatGptView(input: string): boolean {
  const url = safeParseUrl(input);
  return Boolean(url && isChatGptHost(url.hostname));
}

export function shouldLogNetworkObservation(input: string, resourceType: string): boolean {
  const url = safeParseUrl(input);
  if (!url) {
    return false;
  }

  if (resourceType === 'WebSocket') {
    return isChatGptHost(url.hostname);
  }

  return classifyChatGptRequest(input, 'GET') !== 'ignore' && ['Fetch', 'XHR'].includes(resourceType);
}

export function isChatGptConversationTurnRoute(input: string, method: string): boolean {
  const url = safeParseUrl(input);
  if (!url || !isChatGptHost(url.hostname)) {
    return false;
  }

  return (
    method.toUpperCase() === 'POST' &&
    (url.pathname === '/backend-api/f/conversation' || url.pathname === '/backend-api/conversation')
  );
}

export function extractConversationIdFromUrl(input: string): string | null {
  const url = safeParseUrl(input);
  if (!url || !isChatGptHost(url.hostname)) {
    return null;
  }

  const pageMatch = url.pathname.match(/^\/c\/([^/?#]+)/);
  if (pageMatch) {
    return pageMatch[1];
  }

  const backendMatch = url.pathname.match(/^\/backend-api\/conversation\/([^/?#]+)/);
  if (backendMatch) {
    return backendMatch[1];
  }

  return null;
}

export function extractConversationIdFromBody(body?: string): string | null {
  if (!body) {
    return null;
  }

  try {
    const parsed = JSON.parse(body) as { conversation_id?: unknown };
    return typeof parsed.conversation_id === 'string' && parsed.conversation_id.length > 0
      ? parsed.conversation_id
      : null;
  } catch {
    return null;
  }
}

export function shouldTriggerDomAutoCapture(input: {
  url: string;
  method: string;
  streamStatus: 'COMPLETE' | null;
}): boolean {
  if (input.streamStatus === 'COMPLETE') {
    return true;
  }

  return isChatGptConversationTurnRoute(input.url, input.method);
}

function safeParseUrl(input: string): URL | null {
  try {
    return new URL(input);
  } catch {
    return null;
  }
}

function isChatGptHost(hostname: string): boolean {
  return hostname === 'chatgpt.com' || hostname.endsWith('.chatgpt.com') || hostname.endsWith('.openai.com');
}
