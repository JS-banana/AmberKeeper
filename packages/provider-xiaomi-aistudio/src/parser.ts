import type { NormalizedMessage } from '@amberkeeper/shared-types';

interface ParseOptions {
  fallbackConversationId?: string | null;
  fallbackModel?: string | null;
  capturedAt?: string;
}

export function parseXiaomiAistudioRequestBody(body: string): NormalizedMessage[] {
  const parsed = safeParseJson(body);
  if (parsed == null) {
    return [];
  }

  return collectMessagesFromValue(parsed, {
    fallbackConversationId: extractConversationIdFromValue(parsed),
  });
}

export function parseXiaomiAistudioResponseBody(body: string): NormalizedMessage[] {
  const sseMessages = parseXiaomiAistudioSseResponseBody(body);
  if (sseMessages.length > 0) {
    return sseMessages;
  }

  const parsed = safeParseJson(body);
  if (parsed == null) {
    return [];
  }

  return collectMessagesFromValue(parsed, {
    fallbackConversationId: extractConversationIdFromValue(parsed),
  });
}

export function summarizeXiaomiAistudioResponseBody(body: string, maxLength = 400): string {
  const normalized = body.replace(/\s+/g, ' ').trim();
  if (!normalized) {
    return '';
  }

  return normalized.slice(0, maxLength);
}

function parseXiaomiAistudioSseResponseBody(body: string): NormalizedMessage[] {
  let assistantContent = '';
  let rawAssistantContent = '';
  let conversationId: string | null = null;
  let model: string | null = null;
  let remoteMessageId: string | null = null;
  let createdAt: string | null = null;
  let insideThinkBlock = false;

  for (const entry of extractSseEntries(body)) {
    if (!entry || !entry.payload || entry.payload === '[DONE]') {
      continue;
    }

    const parsed = safeParseJson(entry.payload);
    if (parsed == null) {
      continue;
    }

    conversationId = extractConversationIdFromValue(parsed) ?? conversationId;
    model = extractModelFromValue(parsed) ?? model;
    remoteMessageId =
      extractMessageIdFromValue(parsed) ??
      (entry.eventName === 'dialogId' ? extractTextLike((parsed as Record<string, unknown>).content) ?? null : null) ??
      remoteMessageId;
    createdAt = extractTimestampFromValue(parsed) ?? createdAt;

    const chunk =
      entry.eventName && entry.eventName !== 'message'
        ? undefined
        : extractAssistantChunkFromValue(parsed);
    if (chunk) {
      rawAssistantContent = mergeAssistantContent(rawAssistantContent, chunk);
    }
    const cleaned = sanitizeAssistantChunk(chunk, insideThinkBlock);
    insideThinkBlock = cleaned.insideThinkBlock;
    if (cleaned.content) {
      assistantContent = mergeAssistantContent(assistantContent, cleaned.content);
    }
  }

  const normalizedContent = resolveAssistantContent(assistantContent, rawAssistantContent).trim();
  if (!normalizedContent) {
    return [];
  }

  return [
    {
      role: 'assistant',
      content: normalizedContent,
      createdAt: createdAt ?? new Date(0).toISOString(),
      remoteConversationId: conversationId ?? undefined,
      remoteMessageId: remoteMessageId ?? undefined,
      model: model ?? undefined,
    },
  ];
}

function resolveAssistantContent(sanitizedContent: string, rawContent: string): string {
  const sanitized = sanitizedContent.trim();
  if (sanitized) {
    return sanitized;
  }

  return rawContent
    .replace(/\u0000/g, '')
    .replace(/<\/?think>/gi, '')
    .trim();
}

function extractSseEntries(input: string): Array<{ eventName: string | null; payload: string | null }> {
  const entries: Array<{ eventName: string | null; payload: string | null }> = [];
  const pattern = /(?:^|\s)(?:id:\s*[^\s]+\s+)?event:\s*([^\s]+)\s+data:\s*(.+?)(?=\s+(?:id:|event:|data:)|$)/g;

  for (const match of input.matchAll(pattern)) {
    entries.push({
      eventName: match[1]?.trim() || null,
      payload: match[2]?.trim() || null,
    });
  }

  if (entries.length > 0) {
    return entries;
  }

  for (const rawLine of input.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line.startsWith('data:')) {
      continue;
    }

    entries.push({
      eventName: null,
      payload: line.slice(5).trim() || null,
    });
  }

  return entries;
}

function sanitizeAssistantChunk(
  input: string | undefined,
  insideThinkBlock: boolean
): { content: string; insideThinkBlock: boolean } {
  if (!input) {
    return {
      content: '',
      insideThinkBlock,
    };
  }

  let content = input;
  let nextInsideThinkBlock = insideThinkBlock;

  if (!nextInsideThinkBlock && content.includes('<think>')) {
    nextInsideThinkBlock = true;
    content = content.slice(content.indexOf('<think>') + '<think>'.length);
  }

  if (nextInsideThinkBlock) {
    const closingIndex = content.indexOf('</think>');
    if (closingIndex === -1) {
      return {
        content: '',
        insideThinkBlock: true,
      };
    }

    content = content.slice(closingIndex + '</think>'.length);
    nextInsideThinkBlock = false;
  }

  return {
    content: content.replace(/^\u0000+/, '').trim(),
    insideThinkBlock: nextInsideThinkBlock,
  };
}

function collectMessagesFromValue(value: unknown, options: ParseOptions): NormalizedMessage[] {
  if (value == null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return [];
  }

  if (Array.isArray(value)) {
    return dedupeMessages(value.flatMap((item) => collectMessagesFromValue(item, options)));
  }

  const record = value as Record<string, unknown>;
  const historyMessages = normalizeConversationHistoryRecord(record, options);
  if (historyMessages.length > 0) {
    return historyMessages;
  }

  const singleMessage = normalizeSingleMessageRecord(record, options);
  if (singleMessage) {
    return [singleMessage];
  }

  const nestedMessages: NormalizedMessage[] = [];
  for (const key of ['dataList', 'messageList', 'messages', 'chat_messages']) {
    const nested = record[key];
    if (nested) {
      nestedMessages.push(...collectMessagesFromValue(nested, options));
    }
  }

  for (const key of ['data', 'list', 'dialogLogDetailList']) {
    const nested = record[key];
    if (nested) {
      nestedMessages.push(...collectMessagesFromValue(nested, options));
    }
  }

  if (Array.isArray(record.choices)) {
    for (const choice of record.choices) {
      const choiceRecord = choice as Record<string, unknown>;
      if (choiceRecord.message) {
        nestedMessages.push(...collectMessagesFromValue(choiceRecord.message, options));
      } else if (choiceRecord.delta) {
        nestedMessages.push(...collectMessagesFromValue(choiceRecord.delta, options));
      } else {
        nestedMessages.push(...collectMessagesFromValue(choiceRecord, options));
      }
    }
  }

  if (record.message && typeof record.message === 'object') {
    nestedMessages.push(...collectMessagesFromValue(record.message, options));
  }

  if (record.delta && typeof record.delta === 'object') {
    nestedMessages.push(...collectMessagesFromValue(record.delta, options));
  }

  const streamMessage = normalizeStreamMessageRecord(record, options);
  if (streamMessage) {
    nestedMessages.push(streamMessage);
  }

  return dedupeMessages(nestedMessages);
}

function normalizeConversationHistoryRecord(
  record: Record<string, unknown>,
  options: ParseOptions
): NormalizedMessage[] {
  if (
    !Array.isArray(record.dialogLogDetailList) &&
    !record.inputInfo &&
    !record.query &&
    !record.prompt &&
    !record.question
  ) {
    return [];
  }

  const conversationId = extractConversationIdFromRecord(record) ?? options.fallbackConversationId ?? undefined;
  const model = extractModelFromRecord(record) ?? options.fallbackModel ?? undefined;
  const createdAt = normalizeTimestampValue(
    record.createTime ?? record.createdAt ?? record.updatedAt ?? record.updated_at ?? options.capturedAt
  );
  const baseCreatedAt = createdAt ?? new Date(0).toISOString();
  const userContent =
    extractTextLike(record.inputInfo && typeof record.inputInfo === 'object' ? (record.inputInfo as Record<string, unknown>).query : undefined) ??
    extractTextLike(record.query) ??
    extractTextLike(record.prompt) ??
    extractTextLike(record.question);
  const assistantDetail = selectDialogDetail(record.dialogLogDetailList, record.dialogIdx);
  const assistantContent = assistantDetail
    ? extractTextLike(assistantDetail.result ?? assistantDetail.content ?? assistantDetail.message ?? assistantDetail.text)
    : undefined;
  const assistantCreatedAt = assistantDetail
    ? normalizeTimestampValue(assistantDetail.createTime ?? assistantDetail.createdAt ?? assistantDetail.updatedAt ?? baseCreatedAt)
    : baseCreatedAt;

  const messages: NormalizedMessage[] = [];
  if (userContent) {
      messages.push({
        role: 'user',
        content: userContent,
        createdAt: baseCreatedAt,
        remoteConversationId: conversationId,
        remoteMessageId: extractMessageIdFromRecord(record) ?? undefined,
        model,
      });
  }

  if (assistantContent) {
      messages.push({
        role: 'assistant',
        content: assistantContent,
        createdAt: assistantCreatedAt ?? baseCreatedAt,
        remoteConversationId: conversationId,
        remoteMessageId: extractMessageIdFromRecord(assistantDetail ?? record) ?? undefined,
        model: extractModelFromRecord(assistantDetail ?? record) ?? model,
      });
  }

  return messages;
}

function normalizeSingleMessageRecord(
  record: Record<string, unknown>,
  options: ParseOptions
): NormalizedMessage | null {
  const role = extractRoleFromRecord(record);
  if (!role) {
    return null;
  }

  const content =
    extractTextLike(record.content) ??
    extractTextLike(record.result) ??
    extractTextLike(record.text) ??
    extractTextLike(record.completion) ??
    extractTextLike(record.prompt) ??
    extractTextLike(record.query) ??
    extractTextLike(record.message) ??
    extractTextLike(record.output);
  if (!content) {
    return null;
  }

  return {
    role,
    content,
    createdAt:
      normalizeTimestampValue(
        record.createdAt ?? record.created_at ?? record.createTime ?? record.inserted_at ?? record.updatedAt ?? options.capturedAt
      ) ?? new Date(0).toISOString(),
    remoteConversationId: extractConversationIdFromRecord(record) ?? options.fallbackConversationId ?? undefined,
    remoteMessageId: extractMessageIdFromRecord(record) ?? undefined,
    model: extractModelFromRecord(record) ?? options.fallbackModel ?? undefined,
  };
}

function normalizeStreamMessageRecord(
  record: Record<string, unknown>,
  options: ParseOptions
): NormalizedMessage | null {
  const chunk = extractAssistantChunkFromValue(record);
  if (!chunk) {
    return null;
  }

  return {
    role: 'assistant',
    content: chunk,
    createdAt:
      normalizeTimestampValue(
        record.createdAt ?? record.created_at ?? record.createTime ?? record.inserted_at ?? options.capturedAt
      ) ?? new Date(0).toISOString(),
    remoteConversationId: extractConversationIdFromRecord(record) ?? options.fallbackConversationId ?? undefined,
    remoteMessageId: extractMessageIdFromRecord(record) ?? undefined,
    model: extractModelFromRecord(record) ?? options.fallbackModel ?? undefined,
  };
}

function selectDialogDetail(
  dialogDetails: unknown,
  dialogIndex: unknown
): Record<string, unknown> | null {
  if (!Array.isArray(dialogDetails) || dialogDetails.length === 0) {
    return null;
  }

  const candidates = dialogDetails.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object'));
  if (candidates.length === 0) {
    return null;
  }

  const selectedIndex =
    typeof dialogIndex === 'number' && Number.isInteger(dialogIndex) && dialogIndex >= 0 && dialogIndex < candidates.length
      ? dialogIndex
      : candidates.length - 1;

  return candidates[selectedIndex] ?? candidates[candidates.length - 1] ?? null;
}

function extractAssistantChunkFromValue(value: unknown): string | undefined {
  if (value == null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return undefined;
  }

  if (Array.isArray(value)) {
    return value.map((item) => extractAssistantChunkFromValue(item)).filter(Boolean).join('') || undefined;
  }

  const record = value as Record<string, unknown>;
  const choice = Array.isArray(record.choices) ? (record.choices[0] as Record<string, unknown> | undefined) : undefined;
  if (choice) {
    const choiceMessage = choice.message as Record<string, unknown> | undefined;
    const choiceDelta = choice.delta as Record<string, unknown> | undefined;
    const chosenChunk =
      extractTextLike(choiceMessage?.content) ??
      extractTextLike(choiceDelta?.content) ??
      extractTextLike(choiceDelta?.text) ??
      extractTextLike(choice.message) ??
      extractTextLike(choice.delta);
    if (chosenChunk) {
      return chosenChunk;
    }
  }

  const explicitRole = extractRoleFromRecord(record);
  const directChunk =
    extractTextLike(record.content) ??
    extractTextLike(record.result) ??
    extractTextLike(record.text) ??
    extractTextLike(record.completion) ??
    extractTextLike(record.message);
  if (directChunk && (!explicitRole || explicitRole === 'assistant')) {
    if (!explicitRole && /^\d+$/.test(directChunk)) {
      return undefined;
    }
    return directChunk;
  }

  const deltaChunk = extractTextLike(record.delta) ?? extractTextLike(record.response) ?? extractTextLike(record.output);
  if (deltaChunk) {
    return deltaChunk;
  }

  return undefined;
}

function normalizeRole(input: unknown): NormalizedMessage['role'] | null {
  if (typeof input !== 'string') {
    return null;
  }

  const lower = input.trim().toLowerCase();
  if (['user', 'human', 'end_user'].includes(lower)) {
    return 'user';
  }

  if (['assistant', 'bot', 'model', 'ai'].includes(lower)) {
    return 'assistant';
  }

  return null;
}

function extractRoleFromRecord(record: Record<string, unknown>): NormalizedMessage['role'] | null {
  const author = record.author;
  const message = record.message;
  const sender = record.sender;
  return (
    normalizeRole(record.role) ??
    normalizeRole(sender) ??
    normalizeRole(typeof author === 'object' && author ? (author as Record<string, unknown>).role : undefined) ??
    normalizeRole(typeof message === 'object' && message ? (message as Record<string, unknown>).role : undefined) ??
    normalizeRole(record.type)
  );
}

function extractTextLike(input: unknown): string | undefined {
  if (typeof input === 'string') {
    const trimmed = input.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }

  if (Array.isArray(input)) {
    const parts = input
      .map((item) => {
        if (typeof item === 'string') {
          return item.trim();
        }

        if (!item || typeof item !== 'object') {
          return '';
        }

        const record = item as Record<string, unknown>;
        return (
          extractTextLike(record.text) ??
          extractTextLike(record.content) ??
          extractTextLike(record.result) ??
          extractTextLike(record.message) ??
          extractTextLike(record.completion) ??
          extractTextLike(record.delta)
        ) ?? '';
      })
      .filter((part) => part.length > 0);
    return parts.length > 0 ? parts.join('\n').trim() : undefined;
  }

  if (!input || typeof input !== 'object') {
    return undefined;
  }

  const record = input as Record<string, unknown>;
  for (const key of ['text', 'content', 'result', 'message', 'completion', 'prompt', 'query']) {
    const value = extractTextLike(record[key]);
    if (value) {
      return value;
    }
  }

  if (record.delta) {
    const delta = extractTextLike(record.delta);
    if (delta) {
      return delta;
    }
  }

  if (record.parts) {
    const parts = extractTextLike(record.parts);
    if (parts) {
      return parts;
    }
  }

  return undefined;
}

function extractConversationIdFromValue(value: unknown): string | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  return extractConversationIdFromRecord(value as Record<string, unknown>);
}

function extractConversationIdFromRecord(record: Record<string, unknown>): string | null {
  for (const key of ['conversationId', 'conversation_id', 'chat_session_id', 'chatId', 'session_id', 'conversation_uuid']) {
    const value = record[key];
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }

  const inputInfo = record.inputInfo;
  if (inputInfo && typeof inputInfo === 'object') {
    const nested = extractConversationIdFromRecord(inputInfo as Record<string, unknown>);
    if (nested) {
      return nested;
    }
  }

  return null;
}

function extractMessageIdFromValue(value: unknown): string | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  return extractMessageIdFromRecord(value as Record<string, unknown>);
}

function extractMessageIdFromRecord(record: Record<string, unknown>): string | null {
  for (const key of ['remoteMessageId', 'messageId', 'message_id', 'msgId', 'id']) {
    const value = record[key];
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }

    if (typeof value === 'number' && Number.isFinite(value)) {
      return String(value);
    }
  }

  return null;
}

function extractModelFromValue(value: unknown): string | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  return extractModelFromRecord(value as Record<string, unknown>);
}

function extractModelFromRecord(record: Record<string, unknown>): string | null {
  for (const key of ['model', 'model_name', 'modelName', 'model_class', 'modelClass']) {
    const value = record[key];
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }

  const message = record.message;
  if (message && typeof message === 'object') {
    return extractModelFromRecord(message as Record<string, unknown>);
  }

  return null;
}

function extractTimestampFromValue(value: unknown): string | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  return extractTimestampFromRecord(value as Record<string, unknown>);
}

function extractTimestampFromRecord(record: Record<string, unknown>): string | null {
  for (const key of ['createdAt', 'created_at', 'createTime', 'updatedAt', 'updated_at', 'inserted_at', 'timestamp']) {
    const value = record[key];
    const normalized = normalizeTimestampValue(value);
    if (normalized) {
      return normalized;
    }
  }

  return null;
}

function normalizeTimestampValue(input: unknown): string | null {
  if (typeof input === 'number' && Number.isFinite(input)) {
    const millis = input < 1e12 ? input * 1000 : input;
    return new Date(millis).toISOString();
  }

  if (typeof input === 'string') {
    const trimmed = input.trim();
    if (!trimmed) {
      return null;
    }

    const numeric = Number(trimmed);
    if (Number.isFinite(numeric)) {
      const millis = numeric < 1e12 ? numeric * 1000 : numeric;
      return new Date(millis).toISOString();
    }

    const parsed = new Date(trimmed);
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
  }

  return null;
}

function mergeAssistantContent(current: string, incoming: string): string {
  if (!current) {
    return incoming;
  }

  if (incoming.startsWith(current)) {
    return incoming;
  }

  if (current.startsWith(incoming)) {
    return current;
  }

  const separator =
    /\s$/.test(current) || /^\s/.test(incoming) ? '' : ' ';
  return `${current}${separator}${incoming}`;
}

function dedupeMessages(messages: NormalizedMessage[]): NormalizedMessage[] {
  const seen = new Set<string>();
  const result: NormalizedMessage[] = [];

  for (const message of messages) {
    const key = [
      message.role,
      message.createdAt,
      message.remoteConversationId ?? '',
      message.remoteMessageId ?? '',
      message.model ?? '',
      message.content,
    ].join('|');
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    result.push(message);
  }

  return result;
}

function safeParseJson(input: string): unknown | null {
  try {
    return JSON.parse(input) as unknown;
  } catch {
    return null;
  }
}
