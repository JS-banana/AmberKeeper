import type { XiaomiAistudioRequestClassification } from './types';

const AI_STUDIO_HOSTS = new Set([
  'aistudio.xiaomimimo.com',
  'platform.xiaomimimo.com',
  'api.xiaomimimo.com',
]);

const CAPTURE_PATHS = new Set([
  '/open-apis/bot/chat',
  '/open-apis/chat/conversation',
  '/v1/chat/completions',
  '/anthropic/v1/messages',
]);

const DISCOVER_PREFIXES = ['/open-apis/', '/v1/', '/anthropic/v1/'];

export function classifyXiaomiAistudioRequest(
  input: string,
  _method: string
): XiaomiAistudioRequestClassification {
  const url = safeParseUrl(input);
  if (!url || !isXiaomiAistudioHost(url.hostname)) {
    return 'ignore';
  }

  const pathname = normalizePath(url);
  if (CAPTURE_PATHS.has(pathname)) {
    return 'capture';
  }

  if (DISCOVER_PREFIXES.some((prefix) => pathname.startsWith(prefix))) {
    return 'discover';
  }

  return 'ignore';
}

export function matchesXiaomiAistudioView(input: string): boolean {
  const url = safeParseUrl(input);
  return Boolean(url && url.hostname === 'aistudio.xiaomimimo.com');
}

export function extractXiaomiAistudioConversationIdFromUrl(input: string): string | null {
  const url = safeParseUrl(input);
  if (!url || !isXiaomiAistudioHost(url.hostname)) {
    return null;
  }

  for (const candidate of [normalizeHashPath(url.hash), url.pathname]) {
    const match = candidate.match(/^\/(?:chat|conversation|c|share)\/([^/?#]+)/);
    if (match?.[1]) {
      return match[1];
    }
  }

  for (const key of ['conversationId', 'conversation_id', 'chatId', 'chat_session_id', 'session_id']) {
    const value = url.searchParams.get(key)?.trim();
    if (value) {
      return value;
    }
  }

  return null;
}

export function extractXiaomiAistudioConversationIdFromBody(body?: string): string | null {
  if (!body) {
    return null;
  }

  try {
    const parsed = JSON.parse(body) as Record<string, unknown>;
    return extractConversationIdFromRecord(parsed);
  } catch {
    return null;
  }
}

export function shouldTriggerXiaomiAistudioDomAutoCapture(input: {
  url: string;
  method: string;
  streamStatus: 'COMPLETE' | null;
}): boolean {
  if (input.streamStatus === 'COMPLETE') {
    return true;
  }

  return (
    input.method.toUpperCase() === 'POST' &&
    classifyXiaomiAistudioRequest(input.url, input.method) === 'capture'
  );
}

function safeParseUrl(input: string): URL | null {
  try {
    return new URL(input);
  } catch {
    return null;
  }
}

function normalizePath(url: URL): string {
  const hashPath = normalizeHashPath(url.hash);
  if (hashPath && hashPath !== '/') {
    return hashPath;
  }

  return url.pathname || '/';
}

function normalizeHashPath(hash: string): string {
  if (!hash || hash === '#') {
    return '';
  }

  return hash.startsWith('#') ? hash.slice(1) : hash;
}

function isXiaomiAistudioHost(hostname: string): boolean {
  return AI_STUDIO_HOSTS.has(hostname) || hostname.endsWith('.xiaomimimo.com');
}

function extractConversationIdFromRecord(record: Record<string, unknown>): string | null {
  for (const key of ['conversationId', 'conversation_id', 'chat_session_id', 'chatId', 'session_id']) {
    const value = record[key];
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }

  return null;
}
