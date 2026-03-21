export type ClaudeRequestClassification = 'capture' | 'discover' | 'ignore';

const API_PREFIX = '/api/organizations/';
const CAPTURE_ROUTE =
  /^\/api\/organizations\/[^/]+\/chat_conversations\/[^/]+\/(?:completion|retry_completion)$/;
const HISTORY_ROUTE =
  /^\/api\/organizations\/[^/]+\/chat_conversations\/[^/?#]+$/;

export function classifyClaudeRequest(
  input: string,
  _method: string
): ClaudeRequestClassification {
  const url = safeParseUrl(input);
  if (!url || !isClaudeHost(url.hostname)) {
    return 'ignore';
  }

  if (CAPTURE_ROUTE.test(url.pathname)) {
    return 'capture';
  }

  if (_method.toUpperCase() === 'GET' && HISTORY_ROUTE.test(url.pathname)) {
    return 'capture';
  }

  if (url.pathname.startsWith(API_PREFIX)) {
    return 'discover';
  }

  return 'ignore';
}

export function matchesClaudeView(input: string): boolean {
  const url = safeParseUrl(input);
  return Boolean(url && isClaudeHost(url.hostname));
}

export function extractClaudeConversationIdFromUrl(input: string): string | null {
  const url = safeParseUrl(input);
  if (!url || !isClaudeHost(url.hostname)) {
    return null;
  }

  const chatMatch = url.pathname.match(/^\/chat\/([^/?#]+)/);
  if (chatMatch) {
    return chatMatch[1];
  }

  const apiMatch = url.pathname.match(
    /^\/api\/organizations\/[^/]+\/chat_conversations\/([^/?#]+)(?:\/(?:completion|retry_completion))?$/
  );
  if (apiMatch) {
    return apiMatch[1];
  }

  return null;
}

export function extractClaudeConversationIdFromBody(body?: string): string | null {
  if (!body) {
    return null;
  }

  try {
    const parsed = JSON.parse(body) as { conversation_uuid?: unknown };
    return typeof parsed.conversation_uuid === 'string' && parsed.conversation_uuid.length > 0
      ? parsed.conversation_uuid
      : null;
  } catch {
    return null;
  }
}

export function shouldTriggerClaudeDomAutoCapture(input: {
  url: string;
  method: string;
  streamStatus: 'COMPLETE' | null;
}): boolean {
  if (input.streamStatus === 'COMPLETE') {
    return true;
  }

  return (
    input.method.toUpperCase() === 'POST' &&
    classifyClaudeRequest(input.url, input.method) === 'capture'
  );
}

function safeParseUrl(input: string): URL | null {
  try {
    return new URL(input);
  } catch {
    return null;
  }
}

function isClaudeHost(hostname: string): boolean {
  return hostname === 'claude.ai' || hostname.endsWith('.claude.ai');
}
