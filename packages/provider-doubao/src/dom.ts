import type { DomSnapshotSeenSignal } from '@amberkeeper/capture-core';
import type { NormalizedMessage } from '@amberkeeper/shared-types';

export interface DoubaoDomSnapshotMessageInput {
  role?: string;
  content?: string;
}

export function collectDoubaoStructuredMessages(
  root: ParentNode = document
): DoubaoDomSnapshotMessageInput[] {
  const primarySelectors = [
    '[data-message-author-role]',
    '[data-role]',
    '[data-testid="union_message"]',
    '[data-testid="message-block-container"]',
    '[data-testid="send_message"]',
    '[data-testid="receive_message"]',
    '[data-testid="message_content"]',
    '[data-testid="message_text_content"]',
    '.bg-g-send-msg-bubble-bg',
    '.container-P2rR72',
    '.flow-markdown-body',
    '.paragraph-pP9ZLC',
  ];

  const messages = collectFromSelectors(root, primarySelectors);
  if (messages.some((message) => message.role === 'assistant')) {
    return dedupeMessages(messages);
  }

  const fallbackSelectors = [
    '[data-testid*="message"]',
    '[role="article"]',
    '.message-item',
    '.chat-message',
    '.conversation-turn',
    '.conversation-message',
    '.doubao-message',
    '.semi-message',
    '[class*="message"]',
    '[class*="chat"]',
  ];

  const fallbackMessages = collectFromSelectors(
    root,
    fallbackSelectors
  );
  const combinedMessages = dedupeMessages([...messages, ...fallbackMessages]);
  if (combinedMessages.length > 0) {
    return combinedMessages;
  }

  return dedupeMessages(
    (Array.from(root.querySelectorAll('main article, [role="article"]')) as unknown as NodeLike[])
      .map((node) => collectDoubaoMessageFromNode(node))
      .filter(isCompleteMessage)
  );
}

export function buildDoubaoDomSnapshot(input: {
  url: string;
  title: string;
  messages: DoubaoDomSnapshotMessageInput[];
}): { message: string; detail: string } {
  return {
    message: `Collected ${input.messages.length} Doubao DOM message block(s).`,
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

export function buildDoubaoDomSignal(input: {
  pageUrl: string;
  title: string;
  capturedAt: string;
  messages: DoubaoDomSnapshotMessageInput[];
  sourceSessionKey: string;
}): DomSnapshotSeenSignal {
  return {
    kind: 'domSnapshotSeen',
    provider: 'doubao',
    source: 'preload-dom',
    sourceSessionKey: input.sourceSessionKey,
    pageUrl: input.pageUrl,
    title: input.title,
    capturedAt: input.capturedAt,
    messages: input.messages,
  };
}

export function normalizeDoubaoDomSnapshotMessages(
  messages: DoubaoDomSnapshotMessageInput[],
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

export function hasStableDoubaoAssistantTurn(
  messages: NormalizedMessage[],
  previousAssistantContent: string | null
): boolean {
  const latestAssistantContent = getLatestDoubaoAssistantContent(messages);
  return Boolean(latestAssistantContent) && latestAssistantContent === previousAssistantContent;
}

export function getLatestDoubaoAssistantContent(messages: NormalizedMessage[]): string | null {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index]?.role === 'assistant') {
      return messages[index].content;
    }
  }

  return null;
}

function collectDoubaoMessageFromNode(element: NodeLike): DoubaoDomSnapshotMessageInput {
  const explicitRole = readRoleFromElement(element);
  const role = explicitRole ?? inferRoleFromElement(element);
  const content = readVisibleText(findContentNode(element, role) ?? element);

  return {
    role,
    content,
  };
}

function readRoleFromElement(element: NodeLike): DoubaoDomSnapshotMessageInput['role'] {
  const attributeRole =
    getAttribute(element, 'data-message-author-role') ??
    getAttribute(element, 'data-role') ??
    getAttribute(element, 'data-testid');
  if (attributeRole === 'user' || attributeRole === 'assistant') {
    return attributeRole;
  }

  if (attributeRole === 'send_message') {
    return 'user';
  }

  if (
    attributeRole === 'receive_message' ||
    attributeRole === 'message_content' ||
    attributeRole === 'message_text_content'
  ) {
    return 'assistant';
  }

  return undefined;
}

function inferRoleFromElement(element: NodeLike): DoubaoDomSnapshotMessageInput['role'] {
  if (
    matchesSelector(
      element,
      '[data-message-author-role="user"], .user-message, [aria-label*="user" i], [data-testid="send_message"]'
    )
  ) {
    return 'user';
  }

  if (
    matchesSelector(
      element,
      '[data-message-author-role="assistant"], .assistant-message, [data-is-streaming], [aria-label*="assistant" i], [data-testid="receive_message"], [data-testid="message_content"]'
    )
  ) {
    return 'assistant';
  }

  if (hasClassToken(element, 'user-message')) {
    return 'user';
  }

  if (hasClassToken(element, 'bg-g-send-msg-bubble-bg')) {
    return 'user';
  }

  if (hasClassToken(element, 'assistant-message')) {
    return 'assistant';
  }

  if (
    hasClassToken(element, 'container-P2rR72') ||
    hasClassToken(element, 'flow-markdown-body') ||
    hasClassToken(element, 'paragraph-pP9ZLC')
  ) {
    return 'assistant';
  }

  return undefined;
}

function findContentNode(
  element: NodeLike,
  role: DoubaoDomSnapshotMessageInput['role']
): NodeLike | null {
  const selectors =
    role === 'user'
      ? [
          '.message-content',
          '[data-testid="message_text_content"]',
          '.semi-markdown',
          '.markdown',
          '.content',
          '[data-testid="message-content"]',
        ]
      : [
          '.message-content',
          '[data-testid="message_text_content"]',
          '.semi-markdown',
          '.markdown',
          '.content',
          '[data-testid="message-content"]',
          '.response',
        ];

  for (const selector of selectors) {
    const candidate = querySelector(element, selector);
    if (candidate) {
      return candidate;
    }
  }

  return null;
}

function readVisibleText(element: NodeLike | null): string | undefined {
  if (!element) {
    return undefined;
  }

  const rawText =
    (typeof element.innerText === 'string' && element.innerText.length > 0
      ? element.innerText
      : element.textContent) ?? '';
  const normalized = rawText
    .replace(/\u200B/g, '')
    .replace(/\r/g, '')
    .split('\n')
    .map((line) => line.trim())
    .filter((line, index, lines) => line.length > 0 || keepsBlankLine(lines, index))
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

function hasClassToken(element: NodeLike, token: string): boolean {
  return typeof element.className === 'string' && element.className.split(/\s+/).includes(token);
}

function collectFromSelectors(
  root: ParentNode,
  selectors: string[]
): Required<DoubaoDomSnapshotMessageInput>[] {
  const nodes = uniqueNodes(
    selectors.flatMap((selector) =>
      Array.from(root.querySelectorAll(selector))
    ) as unknown as NodeLike[]
  );

  return nodes
    .map((node) => collectDoubaoMessageFromNode(node))
    .filter(isCompleteMessage);
}

function dedupeMessages(
  messages: Required<DoubaoDomSnapshotMessageInput>[]
): Required<DoubaoDomSnapshotMessageInput>[] {
  const seen = new Set<string>();
  return messages.filter((message) => {
    const key = `${message.role}\u0000${message.content}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
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
  message: DoubaoDomSnapshotMessageInput
): message is Required<DoubaoDomSnapshotMessageInput> {
  return (
    (message.role === 'user' || message.role === 'assistant') &&
    typeof message.content === 'string' &&
    message.content.length > 0
  );
}

type NodeLike = {
  className?: unknown;
  textContent?: string | null;
  innerText?: string;
  querySelector?: (selector: string) => NodeLike | null;
  querySelectorAll?: (selector: string) => NodeLike[];
  getAttribute?: (name: string) => string | null;
};

function matchesSelector(element: NodeLike, selector: string): boolean {
  if (!element.querySelectorAll) {
    return false;
  }

  return element.querySelectorAll(selector).length > 0;
}

function querySelector(element: NodeLike, selector: string): NodeLike | null {
  return element.querySelector ? element.querySelector(selector) : null;
}

function getAttribute(element: NodeLike, name: string): string | null {
  return element.getAttribute ? element.getAttribute(name) : null;
}

function uniqueNodes(nodes: NodeLike[]): NodeLike[] {
  return Array.from(new Set(nodes));
}
