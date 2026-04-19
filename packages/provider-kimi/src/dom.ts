import type { DomSnapshotSeenSignal } from '@amberkeeper/capture-core';
import type { NormalizedMessage } from '@amberkeeper/shared-types';

export interface KimiDomSnapshotMessageInput {
  role?: string;
  content?: string;
}

export function collectKimiStructuredMessages(
  root: ParentNode = document
): KimiDomSnapshotMessageInput[] {
  const selectors = [
    '[data-message-author-role]',
    '[data-role]',
    '[data-message-role]',
    '[data-testid*="message"]',
    '.chat-content-item',
    '.chat-content-item-user',
    '.chat-content-item-assistant',
    '.segment-user',
    '.segment-assistant',
    '.message-item',
    '.chat-message',
    '.conversation-turn',
    '.conversation-message',
    '.user-message',
    '.assistant-message',
    '[class*="message"]',
    '[class*="chat"]',
    '[role="article"]',
  ];

  const nodes = selectors.flatMap((selector) => Array.from(root.querySelectorAll(selector)));
  const messages = nodes
    .map((node) => collectKimiMessageFromNode(node as HTMLElement))
    .filter((message) => Boolean(message.role && message.content));

  if (messages.length > 0) {
    return dedupeMessages(messages);
  }

  return dedupeMessages(
    Array.from(root.querySelectorAll('main article, [role="article"]'))
    .map((node) => collectKimiMessageFromNode(node as HTMLElement))
    .filter((message) => Boolean(message.role && message.content))
  );
}

export function buildKimiDomSnapshot(input: {
  url: string;
  title: string;
  messages: KimiDomSnapshotMessageInput[];
}): { message: string; detail: string } {
  return {
    message: `Collected ${input.messages.length} Kimi DOM message block(s).`,
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

export function buildKimiDomSignal(input: {
  pageUrl: string;
  title: string;
  capturedAt: string;
  messages: KimiDomSnapshotMessageInput[];
  sourceSessionKey: string;
}): DomSnapshotSeenSignal {
  return {
    kind: 'domSnapshotSeen',
    provider: 'kimi' as never,
    source: 'preload-dom',
    sourceSessionKey: input.sourceSessionKey,
    pageUrl: input.pageUrl,
    title: input.title,
    capturedAt: input.capturedAt,
    messages: input.messages,
  };
}

export function normalizeKimiDomSnapshotMessages(
  messages: KimiDomSnapshotMessageInput[],
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

export function hasStableKimiAssistantTurn(
  messages: NormalizedMessage[],
  previousAssistantContent: string | null
): boolean {
  const latestAssistantContent = getLatestKimiAssistantContent(messages);
  return Boolean(latestAssistantContent) && latestAssistantContent === previousAssistantContent;
}

export function getLatestKimiAssistantContent(messages: NormalizedMessage[]): string | null {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index]?.role === 'assistant') {
      return messages[index].content;
    }
  }

  return null;
}

function collectKimiMessageFromNode(element: HTMLElement): KimiDomSnapshotMessageInput {
  const userNode = element.querySelector('.user-message, [data-role="user"], [data-message-role="user"]');
  const assistantNode = element.querySelector(
    '.assistant-message, [data-role="assistant"], [data-message-role="assistant"]'
  );

  if (userNode || assistantNode) {
    return {
      role: userNode ? 'user' : 'assistant',
      content: (
        userNode?.querySelector('.message-content, .content, .markdown, .qwen-markdown') ??
        assistantNode?.querySelector('.message-content, .content, .markdown, .markdown-container, .paragraph, .user-content, .qwen-markdown') ??
        userNode ??
        assistantNode
      )?.textContent?.trim(),
    };
  }

  const roleHint =
    element.getAttribute('data-message-author-role') ??
    element.getAttribute('data-role') ??
    element.getAttribute('data-message-role');
  const inferredRole =
    roleHint === 'user' || roleHint === 'assistant'
      ? roleHint
      : hasClassToken(element.className, 'assistant')
        || hasClassToken(element.className, 'bot')
        || hasClassToken(element.className, 'segment-assistant')
        || hasClassToken(element.className, 'chat-content-item-assistant')
        ? 'assistant'
        : hasClassToken(element.className, 'user')
          || hasClassToken(element.className, 'human')
          || hasClassToken(element.className, 'segment-user')
          || hasClassToken(element.className, 'chat-content-item-user')
          ? 'user'
          : undefined;
  const content = extractVisibleText(
    element.querySelector('.message-content, .content, .markdown, .markdown-container, .paragraph, .user-content, .qwen-markdown') ?? element
  );

  return {
    role: inferredRole,
    content,
  };
}

function extractVisibleText(element: HTMLElement | Element | null): string | undefined {
  if (!element) {
    return undefined;
  }

  const rawText =
    (typeof (element as HTMLElement).innerText === 'string' && (element as HTMLElement).innerText.length > 0
      ? (element as HTMLElement).innerText
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

function keepsBlankLine(lines: string[], index: number): boolean {
  return (
    lines[index] === '' &&
    index > 0 &&
    index < lines.length - 1 &&
    lines[index - 1] !== '' &&
    lines[index + 1] !== ''
  );
}

function hasClassToken(className: string | SVGAnimatedString, token: string): boolean {
  return typeof className === 'string' && className.split(/\s+/).includes(token);
}

function dedupeMessages(messages: KimiDomSnapshotMessageInput[]): KimiDomSnapshotMessageInput[] {
  const seen = new Set<string>();
  const unique: KimiDomSnapshotMessageInput[] = [];

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
