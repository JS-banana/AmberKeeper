import type { DomSnapshotSeenSignal } from '@amberkeeper/capture-core';
import type { NormalizedMessage } from '@amberkeeper/shared-types';

export interface GrokDomSnapshotMessageInput {
  role?: string;
  content?: string;
}

export function collectGrokStructuredMessages(
  root: ParentNode = document
): GrokDomSnapshotMessageInput[] {
  const selectors = [
    '[data-message-author-role]',
    '[data-testid="conversation-turn"]',
    '.chat-content-item',
    '.chat-content-item-user',
    '.chat-content-item-assistant',
    '.message-bubble',
    '.response-content-markdown',
    '.conversation-container',
    '.conversation-turn',
    '.conversation-message',
    '.message-item',
    '.chat-message',
    '.user-message',
    '.assistant-message',
    '.grok-message',
  ];

  const nodes = selectors.flatMap((selector) => Array.from(root.querySelectorAll(selector)));
  const messages = nodes
    .map((node) => collectGrokMessageFromNode(node as HTMLElement))
    .filter(isCompleteMessage);

  if (messages.length > 0) {
    return dedupeMessages(messages);
  }

  return dedupeMessages(
    Array.from(root.querySelectorAll('[role="article"], main article'))
      .map((node) => collectGrokMessageFromNode(node as HTMLElement))
      .filter(isCompleteMessage)
  );
}

export function buildGrokDomSnapshot(input: {
  url: string;
  title: string;
  messages: GrokDomSnapshotMessageInput[];
}): { message: string; detail: string } {
  return {
    message: `Collected ${input.messages.length} Grok DOM message block(s).`,
    detail: JSON.stringify(
      {
        url: input.url,
        title: input.title,
        messages: input.messages.slice(-6),
      },
      null,
      2
    ),
  };
}

export function buildGrokDomSignal(input: {
  pageUrl: string;
  title: string;
  capturedAt: string;
  messages: GrokDomSnapshotMessageInput[];
  sourceSessionKey: string;
}): DomSnapshotSeenSignal {
  return {
    kind: 'domSnapshotSeen',
    provider: 'grok',
    source: 'preload-dom',
    sourceSessionKey: input.sourceSessionKey,
    pageUrl: input.pageUrl,
    title: input.title,
    capturedAt: input.capturedAt,
    messages: input.messages,
  };
}

export function normalizeGrokDomSnapshotMessages(
  messages: GrokDomSnapshotMessageInput[],
  input: {
    conversationId?: string;
    capturedAt: string;
  }
): NormalizedMessage[] {
  const normalized: NormalizedMessage[] = [];

  messages.forEach((message, index) => {
    const role = message.role;
    const content = message.content?.trim();

    if ((role !== 'user' && role !== 'assistant') || !content) {
      return;
    }

    normalized.push({
      role,
      content,
      createdAt: offsetIsoTimestamp(input.capturedAt, index),
      remoteConversationId: input.conversationId,
    });
  });

  const latestUserIndex = findLatestUserIndex(normalized);
  if (latestUserIndex === -1) {
    return normalized;
  }

  const latestTurn = normalized.slice(latestUserIndex);
  return latestTurn.some((message) => message.role === 'assistant') ? latestTurn : [];
}

export function hasStableGrokAssistantTurn(
  messages: NormalizedMessage[],
  previousAssistantContent: string | null
): boolean {
  const latestAssistantContent = getLatestGrokAssistantContent(messages);
  return Boolean(latestAssistantContent) && latestAssistantContent === previousAssistantContent;
}

export function getLatestGrokAssistantContent(messages: NormalizedMessage[]): string | null {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index]?.role === 'assistant') {
      return messages[index].content;
    }
  }

  return null;
}

function collectGrokMessageFromNode(element: HTMLElement): GrokDomSnapshotMessageInput {
  const explicitRole = readRoleFromElement(element);
  const role = explicitRole ?? inferRoleFromElement(element);
  const content = readVisibleText(findContentNode(element, role) ?? element);

  return {
    role,
    content,
  };
}

function readRoleFromElement(element: HTMLElement): GrokDomSnapshotMessageInput['role'] {
  const attributeRole =
    element.getAttribute('data-message-author-role') ??
    element.getAttribute('data-role') ??
    element.getAttribute('data-testid');
  if (attributeRole === 'user' || attributeRole === 'assistant') {
    return attributeRole;
  }

  return undefined;
}

function inferRoleFromElement(element: HTMLElement): GrokDomSnapshotMessageInput['role'] {
  if (
    element.querySelector(
      '[data-message-author-role="user"], .user-message, [aria-label*="user" i], .chat-content-item-user'
    )
  ) {
    return 'user';
  }

  if (
    element.querySelector(
      '[data-message-author-role="assistant"], .assistant-message, [data-is-streaming], [aria-label*="assistant" i], .chat-content-item-assistant, .response-content-markdown'
    )
  ) {
    return 'assistant';
  }

  if (hasClassToken(element, 'chat-content-item-user')) {
    return 'user';
  }

  if (
    hasClassToken(element, 'chat-content-item-assistant') ||
    hasClassToken(element, 'response-content-markdown')
  ) {
    return 'assistant';
  }

  if (hasClassToken(element, 'user-message')) {
    return 'user';
  }

  if (hasClassToken(element, 'assistant-message')) {
    return 'assistant';
  }

  return undefined;
}

function findContentNode(
  element: HTMLElement,
  role: GrokDomSnapshotMessageInput['role']
): Element | null {
  const selectors =
    role === 'user'
      ? ['.message-content', '.prose', '.markdown', '.content', '[data-testid="message-content"]']
      : [
          '.message-content',
          '.response-content-markdown',
          '.prose',
          '.markdown',
          '.content',
          '[data-testid="message-content"]',
          '.response',
        ];

  for (const selector of selectors) {
    const candidate = element.querySelector(selector);
    if (candidate && typeof candidate === 'object') {
      return candidate;
    }
  }

  return null;
}

function readVisibleText(element: Element | null): string | undefined {
  if (!element) {
    return undefined;
  }

  const htmlElement = element as HTMLElement;
  const rawText =
    (typeof htmlElement.innerText === 'string' && htmlElement.innerText.length > 0
      ? htmlElement.innerText
      : element.textContent) ?? '';
  const normalized = rawText
    .replace(/\u200B/g, '')
    .replace(/\r/g, '')
    .split('\n')
    .map((line: string) => line.trim())
    .filter((line: string, index: number, lines: string[]) => line.length > 0 || keepsBlankLine(lines, index))
    .join('\n')
    .trim();

  return normalized || undefined;
}

function keepsBlankLine(lines: string[], index: number): boolean {
  return (
    lines[index] === '' &&
    index > 0 &&
    index < lines.length - 1 &&
    lines[index - 1] !== '' &&
    lines[index + 1] !== ''
  );
}

function hasClassToken(element: { className?: unknown }, token: string): boolean {
  return typeof element.className === 'string' && element.className.split(/\s+/).includes(token);
}

function dedupeMessages(messages: GrokDomSnapshotMessageInput[]): GrokDomSnapshotMessageInput[] {
  const seen = new Set<string>();
  const unique: GrokDomSnapshotMessageInput[] = [];

  for (const message of messages) {
    const key = `${message.role ?? ''}\u0000${message.content ?? ''}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    unique.push(message);
  }

  return unique;
}

function offsetIsoTimestamp(baseIso: string, offset: number): string {
  const base = new Date(baseIso);
  if (Number.isNaN(base.getTime())) {
    return new Date(offset).toISOString();
  }

  return new Date(base.getTime() + offset).toISOString();
}

function findLatestUserIndex(messages: NormalizedMessage[]): number {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index]?.role === 'user') {
      return index;
    }
  }

  return -1;
}

function isCompleteMessage(
  message: GrokDomSnapshotMessageInput
): message is Required<GrokDomSnapshotMessageInput> {
  return (
    (message.role === 'user' || message.role === 'assistant') &&
    typeof message.content === 'string' &&
    message.content.length > 0
  );
}
