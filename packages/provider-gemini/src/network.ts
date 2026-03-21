export type GeminiRequestClassification = 'capture' | 'discover' | 'ignore';

const GEMINI_API_PREFIX = '/_/BardChatUi/data/';
const GEMINI_STREAM_GENERATE_PATH =
  '/_/BardChatUi/data/assistant.lamda.BardFrontendService/StreamGenerate';

export function classifyGeminiRequest(
  input: string,
  _method: string
): GeminiRequestClassification {
  const url = safeParseUrl(input);
  if (!url || !isGeminiHost(url.hostname)) {
    return 'ignore';
  }

  if (url.pathname === GEMINI_STREAM_GENERATE_PATH) {
    return 'capture';
  }

  if (url.pathname.startsWith(GEMINI_API_PREFIX) || url.pathname.startsWith('/_/')) {
    return 'discover';
  }

  return 'ignore';
}

export function matchesGeminiView(input: string): boolean {
  const url = safeParseUrl(input);
  return Boolean(url && isGeminiHost(url.hostname));
}

export function extractGeminiConversationIdFromUrl(input: string): string | null {
  const url = safeParseUrl(input);
  if (!url || !isGeminiHost(url.hostname)) {
    return null;
  }

  const pathnameConversationId = extractConversationIdFromPath(url.pathname);
  if (pathnameConversationId) {
    return pathnameConversationId;
  }

  const sourcePathConversationId = extractConversationIdFromPath(url.searchParams.get('source-path'));
  if (sourcePathConversationId) {
    return sourcePathConversationId;
  }

  const queryValue = url.searchParams.get('conversation_id');
  return queryValue?.trim() ? queryValue : null;
}

export function shouldTriggerGeminiDomAutoCapture(input: {
  url: string;
  method: string;
  streamStatus: 'COMPLETE' | null;
}): boolean {
  if (input.streamStatus === 'COMPLETE') {
    return true;
  }

  return (
    input.method.toUpperCase() === 'POST' &&
    classifyGeminiRequest(input.url, input.method) === 'capture'
  );
}

function safeParseUrl(input: string): URL | null {
  try {
    return new URL(input);
  } catch {
    return null;
  }
}

function extractConversationIdFromPath(input: string | null): string | null {
  if (!input?.trim()) {
    return null;
  }

  const appMatch = input.match(/^\/app\/([^/?#]+)/);
  return appMatch?.[1] ?? null;
}

function isGeminiHost(hostname: string): boolean {
  return hostname === 'gemini.google.com' || hostname.endsWith('.gemini.google.com');
}
