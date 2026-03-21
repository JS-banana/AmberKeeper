import type { NormalizedMessage } from '@amberkeeper/shared-types';

export function parseGeminiRequestBody(body: string): NormalizedMessage[] {
  const payload = extractGeminiPayload(body);
  if (!payload) {
    return [];
  }

  const candidates = [payload, ...extractNestedJsonCandidates(payload)];

  const conversationId =
    findStringAtPaths(candidates, [
      [2, 0],
      [2],
    ]) ??
    undefined;
  const model =
    findStringAtPaths(candidates, [
      [1, 0],
      [1],
    ]) ??
    undefined;
  const prompt =
    findStringAtPaths(candidates, [
      [0, 0, 0],
      [0, 0],
      [0],
    ]) ??
    candidates
      .flatMap((candidate) => collectStrings(candidate))
      .find((value) => value !== conversationId && value !== model);

  if (!prompt?.trim()) {
    return [];
  }

  return [
    {
      role: 'user',
      content: prompt.trim(),
      createdAt: new Date(0).toISOString(),
      remoteConversationId: conversationId,
      model,
    },
  ];
}

export function parseGeminiResponseBody(body: string): NormalizedMessage[] {
  const parsedLines = extractGeminiResponseLines(body);
  let conversationId: string | undefined;
  let assistantContent = '';

  for (const line of parsedLines) {
    const entries = Array.isArray(line) ? line : [line];
    for (const entry of entries) {
      const payload =
        Array.isArray(entry) && typeof entry[2] === 'string'
          ? safeParseJson(entry[2])
          : entry;
      const extracted = extractGeminiResponseFields(payload);
      if (extracted.conversationId) {
        conversationId = extracted.conversationId;
      }
      if (extracted.content) {
        assistantContent = mergeGeminiAssistantContent(assistantContent, extracted.content);
      }
    }
  }

  const normalizedContent = assistantContent.trim();
  if (!normalizedContent) {
    return [];
  }

  return [
    {
      role: 'assistant',
      content: normalizedContent,
      createdAt: new Date(0).toISOString(),
      remoteConversationId: conversationId,
    },
  ];
}

function mergeGeminiAssistantContent(current: string, incoming: string): string {
  if (!current) {
    return incoming;
  }

  if (incoming.startsWith(current)) {
    return incoming;
  }

  if (current.startsWith(incoming)) {
    return current;
  }

  return `${current}${incoming}`;
}

export function summarizeGeminiResponseBody(body: string, maxLength = 400): string {
  const normalized = body.replace(/\s+/g, ' ').trim();
  if (!normalized) {
    return '';
  }

  return normalized.slice(0, maxLength);
}

function extractGeminiPayload(body: string): unknown {
  const params = new URLSearchParams(body);
  const requestValue = params.get('f.req');
  if (requestValue) {
    return safeParseJson(requestValue);
  }

  return safeParseJson(body);
}

function extractGeminiResponseLines(body: string): unknown[] {
  const cleaned = body.replace(/^\)\]\}'\n?/, '').trim();
  if (!cleaned) {
    return [];
  }

  return cleaned
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => safeParseJson(line))
    .filter((value): value is unknown => value !== null);
}

function extractGeminiResponseFields(input: unknown): {
  conversationId?: string;
  content?: string;
} {
  return extractStructuredGeminiResponse(input);
}

function extractStructuredGeminiResponse(input: unknown): {
  conversationId?: string;
  content?: string;
} {
  if (!Array.isArray(input)) {
    return {};
  }

  const chunkedResponse = extractChunkedGeminiResponse(input);
  if (chunkedResponse.content) {
    return chunkedResponse;
  }

  const legacyResponse = extractLegacyGeminiResponse(input);
  if (legacyResponse.content) {
    return legacyResponse;
  }

  for (const item of input) {
    const nested = extractStructuredGeminiResponse(item);
    if (nested.content) {
      return {
        conversationId:
          chunkedResponse.conversationId ?? legacyResponse.conversationId ?? nested.conversationId,
        content: nested.content,
      };
    }
  }

  return {
    conversationId: chunkedResponse.conversationId ?? legacyResponse.conversationId,
  };
}

function extractChunkedGeminiResponse(input: unknown[]): {
  conversationId?: string;
  content?: string;
} {
  const conversationId = normalizeGeminiConversationId(
    getStringAtPath(input, [1, 0]) ?? getStringAtPath(input, [1])
  );
  const candidate = input[4];
  if (!Array.isArray(candidate)) {
    return { conversationId };
  }

  const content = normalizeGeminiResponseText(
    candidate.map((item) => extractGeminiResponseChunkText(item)).filter((value): value is string => Boolean(value))
  );

  return {
    conversationId,
    content,
  };
}

function extractLegacyGeminiResponse(input: unknown[]): {
  conversationId?: string;
  content?: string;
} {
  const candidate = input[4];
  if (!Array.isArray(candidate) || candidate.length < 2) {
    return {};
  }

  const conversationId = normalizeGeminiConversationId(extractFirstString(candidate[0]));
  const content = extractFirstString(candidate[1]);
  if (!content) {
    return { conversationId };
  }

  return {
    conversationId,
    content,
  };
}

function extractGeminiResponseChunkText(input: unknown): string | undefined {
  if (!Array.isArray(input)) {
    return undefined;
  }

  const chunkId = input[0];
  if (typeof chunkId !== 'string' || !chunkId.startsWith('rc_')) {
    return undefined;
  }

  return normalizeGeminiResponseText(collectVisibleGeminiStrings(input[1]));
}

function normalizeGeminiConversationId(input: string | undefined): string | undefined {
  if (!input?.trim()) {
    return undefined;
  }

  return input.startsWith('c_') ? input.slice(2) : input;
}

function normalizeGeminiResponseText(segments: string[]): string | undefined {
  const normalized = segments.join('').replace(/\s+/g, ' ').trim();
  return normalized || undefined;
}

function collectVisibleGeminiStrings(input: unknown): string[] {
  if (typeof input === 'string') {
    const trimmed = input.trim();
    if (!trimmed || trimmed.startsWith('http://') || trimmed.startsWith('https://') || trimmed.startsWith('//')) {
      return [];
    }

    return [input];
  }

  if (!Array.isArray(input)) {
    return [];
  }

  return input.flatMap((item) => collectVisibleGeminiStrings(item));
}

function getStringAtPath(input: unknown, path: number[]): string | undefined {
  let current = input;
  for (const segment of path) {
    if (!Array.isArray(current) || current.length <= segment) {
      return undefined;
    }
    current = current[segment];
  }

  return typeof current === 'string' && current.trim() ? current : undefined;
}

function findStringAtPaths(inputs: unknown[], paths: number[][]): string | undefined {
  for (const input of inputs) {
    for (const path of paths) {
      const value = getStringAtPath(input, path);
      if (value) {
        return value;
      }
    }
  }

  return undefined;
}

function extractFirstString(input: unknown): string | undefined {
  if (typeof input === 'string' && input.trim()) {
    return input;
  }

  if (!Array.isArray(input)) {
    return undefined;
  }

  for (const item of input) {
    const value = extractFirstString(item);
    if (value) {
      return value;
    }
  }

  return undefined;
}

function collectStrings(input: unknown): string[] {
  if (typeof input === 'string') {
    return input.trim() ? [input] : [];
  }

  if (!Array.isArray(input)) {
    return [];
  }

  return input.flatMap((item) => collectStrings(item));
}

function extractNestedJsonCandidates(input: unknown): unknown[] {
  if (typeof input === 'string') {
    const trimmed = input.trim();
    if (!trimmed.startsWith('[') && !trimmed.startsWith('{')) {
      return [];
    }

    const parsed = safeParseJson(trimmed);
    return parsed === null ? [] : [parsed, ...extractNestedJsonCandidates(parsed)];
  }

  if (!Array.isArray(input)) {
    return [];
  }

  return input.flatMap((item) => extractNestedJsonCandidates(item));
}

function safeParseJson(input: string): unknown | null {
  try {
    return JSON.parse(input);
  } catch {
    return null;
  }
}
