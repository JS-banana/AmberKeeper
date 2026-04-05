import type { NormalizedMessage } from '@amberkeeper/shared-types';
import type {
  XiaomiAistudioDomSnapshotMessageInput,
  XiaomiAistudioDomSnapshotSeenSignal,
} from './types';

export function collectXiaomiAistudioStructuredMessages(
  root: ParentNode = document
): XiaomiAistudioDomSnapshotMessageInput[] {
  const currentLayoutMessages = collectCurrentChatLayoutMessages(root);
  if (currentLayoutMessages.length > 0) {
    return currentLayoutMessages;
  }

  const candidates = uniqueNodes([
    ...queryAll(root, '[data-message-author-role]'),
    ...queryAll(root, '[data-role]'),
    ...queryAll(root, '[data-author-role]'),
    ...queryAll(root, '.message-list > *'),
    ...queryAll(root, '.message-list [class*="message"]'),
    ...queryAll(root, '.message-list [class*="bubble"]'),
    ...queryAll(root, '.mimo-chat [class*="message"]'),
    ...queryAll(root, '.mimo-chat [class*="bubble"]'),
  ]);

  return candidates
    .map((node) => collectMessageFromNode(node))
    .filter((message): message is XiaomiAistudioDomSnapshotMessageInput => Boolean(message.role && message.content));
}

function collectCurrentChatLayoutMessages(
  root: ParentNode
): XiaomiAistudioDomSnapshotMessageInput[] {
  return queryAll(
    root,
    '#message-list .bg-mimo-bg-message, #message-list .markdown-prose, #message-list [class*="Markdown_markdown"]'
  )
    .map((node) => {
      const role = nodeMatches(node, '.bg-mimo-bg-message') ? 'user' : 'assistant';
      const content = readNodeText(node);

      return {
        role,
        content,
      };
    })
    .filter((message) => Boolean(message.content)) as XiaomiAistudioDomSnapshotMessageInput[];
}

export function buildXiaomiAistudioDomSnapshot(input: {
  url: string;
  title: string;
  messages: XiaomiAistudioDomSnapshotMessageInput[];
}): { message: string; detail: string } {
  return {
    message: `Collected ${input.messages.length} Xiaomi MiMo DOM message block(s).`,
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

export function buildXiaomiAistudioDomSignal(input: {
  pageUrl: string;
  title: string;
  capturedAt: string;
  messages: XiaomiAistudioDomSnapshotMessageInput[];
  sourceSessionKey: string;
}): XiaomiAistudioDomSnapshotSeenSignal {
  return {
    kind: 'domSnapshotSeen',
    provider: 'xiaomi-aistudio',
    source: 'preload-dom',
    sourceSessionKey: input.sourceSessionKey,
    pageUrl: input.pageUrl,
    title: input.title,
    capturedAt: input.capturedAt,
    messages: input.messages,
  };
}

export function normalizeXiaomiAistudioDomSnapshotMessages(
  messages: XiaomiAistudioDomSnapshotMessageInput[],
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

export function hasStableXiaomiAistudioAssistantTurn(
  messages: NormalizedMessage[],
  previousAssistantContent: string | null
): boolean {
  const latestAssistantContent = getLatestXiaomiAistudioAssistantContent(messages);
  return Boolean(latestAssistantContent) && latestAssistantContent === previousAssistantContent;
}

export function getLatestXiaomiAistudioAssistantContent(messages: NormalizedMessage[]): string | null {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index]?.role === 'assistant') {
      return messages[index].content;
    }
  }

  return null;
}

function collectMessageFromNode(node: HTMLElement): XiaomiAistudioDomSnapshotMessageInput {
  const role = inferRole(node);
  const content = readNodeText(
    (node.querySelector('.markdown, .message-content, .message-text, [data-message-content]') as HTMLElement | null) ??
      node
  );

  return {
    role,
    content,
  };
}

function inferRole(node: HTMLElement): 'user' | 'assistant' | undefined {
  const explicit = normalizeRole(
    readAttr(node, 'data-message-author-role') ??
      readAttr(node, 'data-role') ??
      readAttr(node, 'data-author-role') ??
      readAttr(node, 'aria-label') ??
      node.className
  );
  if (explicit) {
    return explicit;
  }

  if (node.querySelector('img[alt="User profile"]')) {
    return 'user';
  }

  if (hasClassName(node, 'assistant') || hasClassName(node, 'bot') || hasClassName(node, 'model')) {
    return 'assistant';
  }

  if (hasClassName(node, 'user') || hasClassName(node, 'human')) {
    return 'user';
  }

  return undefined;
}

function normalizeRole(input: unknown): 'user' | 'assistant' | undefined {
  if (typeof input !== 'string') {
    return undefined;
  }

  const lower = input.trim().toLowerCase();
  if (lower.includes('assistant') || lower.includes('bot') || lower.includes('model') || lower.includes('mimo')) {
    return 'assistant';
  }

  if (lower.includes('user') || lower.includes('human')) {
    return 'user';
  }

  return undefined;
}

function readAttr(node: HTMLElement, name: string): string | undefined {
  const value = typeof node.getAttribute === 'function' ? node.getAttribute(name) : null;
  const fallback = (node as HTMLElement & { attributes?: Record<string, string> }).attributes?.[name];
  const raw = value ?? fallback;
  const trimmed = typeof raw === 'string' ? raw.trim() : '';
  return trimmed.length > 0 ? trimmed : undefined;
}

function readNodeText(node: HTMLElement | null): string | undefined {
  if (!node) {
    return undefined;
  }

  const rawText =
    (typeof node.innerText === 'string' && node.innerText.length > 0 ? node.innerText : node.textContent) ?? '';
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

function hasClassName(node: HTMLElement, token: string): boolean {
  return typeof node.className === 'string' && node.className.split(/\s+/).includes(token);
}

function nodeMatches(node: HTMLElement, selector: string): boolean {
  return typeof node.matches === 'function' ? node.matches(selector) : hasClassName(node, selector.replace(/^\./, ''));
}

function keepsBlankLine(lines: string[], index: number): boolean {
  return index > 0 && index < lines.length - 1 && lines[index] === '' && lines[index - 1] !== '' && lines[index + 1] !== '';
}

function queryAll(root: ParentNode, selector: string): HTMLElement[] {
  return Array.from(root.querySelectorAll(selector)) as HTMLElement[];
}

function uniqueNodes(nodes: HTMLElement[]): HTMLElement[] {
  const seen = new Set<HTMLElement>();
  const unique: HTMLElement[] = [];

  for (const node of nodes) {
    if (seen.has(node)) {
      continue;
    }

    seen.add(node);
    unique.push(node);
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
