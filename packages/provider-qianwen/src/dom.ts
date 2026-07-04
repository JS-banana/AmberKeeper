import type { DomSnapshotSeenSignal } from '@amberkeeper/capture-core';
import type { NormalizedMessage } from '@amberkeeper/shared-types';

export interface QianwenDomSnapshotMessageInput {
  role?: string;
  content?: string;
}

const MESSAGE_BLOCK_SELECTOR =
  '.message-item, .chat-message, .qwen-message, .conversation-turn, [class*="questionItem"], [class*="answerItem"], [class*="question"], [class*="query"], [class*="answer"], [class*="assistant"], [class*="markdown"], [data-chat-list-key], [data-msgid], [data-role]';
const MESSAGE_CONTENT_SELECTOR = '.message-content, .content, .markdown, .qwen-markdown';
const ROLE_NODE_SELECTOR =
  '.user-message, .assistant-message, [data-role="user"], [data-role="assistant"], [data-message-role="user"], [data-message-role="assistant"]';

export function collectQianwenStructuredMessages(
  root: ParentNode = document
): QianwenDomSnapshotMessageInput[] {
  return collapseAssistantCandidates(
    dedupeMessages(Array.from(root.querySelectorAll(MESSAGE_BLOCK_SELECTOR))
      .flatMap((node) => collectQianwenMessagesFromNode(node as HTMLElement))
      .filter((message) => Boolean(message.role && message.content))
      .filter((message) => !isQianwenChromeMessage(message)))
  );
}

export function buildQianwenDomSnapshot(input: {
  url: string;
  title: string;
  messages: QianwenDomSnapshotMessageInput[];
}): { message: string; detail: string } {
  return {
    message: `Collected ${input.messages.length} Qianwen DOM message block(s).`,
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

export function buildQianwenDomSignal(input: {
  pageUrl: string;
  title: string;
  capturedAt: string;
  messages: QianwenDomSnapshotMessageInput[];
  sourceSessionKey: string;
}): DomSnapshotSeenSignal {
  return {
    kind: 'domSnapshotSeen',
    provider: 'qianwen' as never,
    source: 'preload-dom',
    sourceSessionKey: input.sourceSessionKey,
    pageUrl: input.pageUrl,
    title: input.title,
    capturedAt: input.capturedAt,
    messages: input.messages,
  };
}

export function normalizeQianwenDomSnapshotMessages(
  messages: QianwenDomSnapshotMessageInput[],
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

export function hasStableQianwenAssistantTurn(
  messages: NormalizedMessage[],
  previousAssistantContent: string | null
): boolean {
  const latestAssistantContent = getLatestQianwenAssistantContent(messages);
  return Boolean(latestAssistantContent) && latestAssistantContent === previousAssistantContent;
}

export function getLatestQianwenAssistantContent(messages: NormalizedMessage[]): string | null {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index]?.role === 'assistant') {
      return messages[index].content;
    }
  }

  return null;
}

function collectQianwenMessagesFromNode(element: HTMLElement): QianwenDomSnapshotMessageInput[] {
  if (isQianwenThinkingElement(element)) {
    return [];
  }

  const nestedMessages = collectNestedRoleMessages(element);
  if (
    nestedMessages.some((message) => message.role === 'user') &&
    nestedMessages.some((message) => message.role === 'assistant')
  ) {
    return nestedMessages;
  }

  const explicitRole = inferRoleFromElement(element);
  if (explicitRole) {
    return [
      {
        role: explicitRole,
        content: extractVisibleText(resolveContentElement(element, explicitRole)),
      },
    ];
  }

  if (nestedMessages.length > 0) {
    return nestedMessages;
  }

  const roleHint = element.getAttribute('data-message-author-role') ?? element.getAttribute('data-role');
  const content = extractVisibleText(
    element.querySelector(MESSAGE_CONTENT_SELECTOR) ?? element
  );

  return [
    {
      role: roleHint === 'user' || roleHint === 'assistant' ? roleHint : undefined,
      content,
    },
  ];
}

function collectNestedRoleMessages(element: HTMLElement): QianwenDomSnapshotMessageInput[] {
  const roleNodes = Array.from(element.querySelectorAll(ROLE_NODE_SELECTOR));
  if (roleNodes.length > 0) {
    return roleNodes.map((node) => ({
      role: inferRoleFromRoleNode(node as HTMLElement),
      content: extractVisibleText(
        resolveContentElement(node as HTMLElement, inferRoleFromRoleNode(node as HTMLElement))
      ),
    }));
  }

  const userNode = element.querySelector('.user-message, [data-role="user"], [data-message-role="user"]');
  const assistantNode = element.querySelector(
    '.assistant-message, [data-role="assistant"], [data-message-role="assistant"]'
  );

  const fallbackMessages: Array<QianwenDomSnapshotMessageInput | null> = [
    userNode
      ? {
          role: 'user',
          content: extractVisibleText(resolveContentElement(userNode as HTMLElement, 'user')),
        }
      : null,
    assistantNode
      ? {
          role: 'assistant',
          content: extractVisibleText(resolveContentElement(assistantNode as HTMLElement, 'assistant')),
        }
      : null,
  ];

  return fallbackMessages.filter((message): message is QianwenDomSnapshotMessageInput => Boolean(message));
}

function inferRoleFromElement(element: HTMLElement): 'user' | 'assistant' | undefined {
  const className = typeof element.className === 'string' ? element.className : '';
  const msgId = element.getAttribute('data-msgid') ?? '';
  const chatKey = element.getAttribute('data-chat-list-key') ?? '';
  const loweredClassName = className.toLowerCase();
  const loweredMsgId = msgId.toLowerCase();
  const loweredChatKey = chatKey.toLowerCase();

  if (
    loweredClassName.includes('questionitem') ||
    loweredClassName.includes('question') ||
    loweredClassName.includes('query') ||
    loweredClassName.includes('prompt') ||
    loweredMsgId.endsWith('-question') ||
    loweredChatKey.endsWith('-question')
  ) {
    return 'user';
  }

  if (
    loweredClassName.includes('answeritem') ||
    loweredClassName.includes('answer') ||
    loweredClassName.includes('assistant') ||
    loweredClassName.includes('markdown') ||
    loweredClassName.includes('response') ||
    loweredMsgId.endsWith('-answer') ||
    loweredChatKey.endsWith('-question-a')
  ) {
    return 'assistant';
  }

  return undefined;
}

function inferRoleFromRoleNode(element: HTMLElement): 'user' | 'assistant' | undefined {
  const dataRole =
    element.getAttribute('data-role') ??
    element.getAttribute('data-message-role') ??
    element.getAttribute('data-message-author-role');
  if (dataRole === 'user' || dataRole === 'assistant') {
    return dataRole;
  }

  const className = typeof element.className === 'string' ? element.className.toLowerCase() : '';
  if (className.includes('assistant-message')) {
    return 'assistant';
  }
  if (className.includes('user-message')) {
    return 'user';
  }

  return inferRoleFromElement(element);
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

function resolveContentElement(
  element: HTMLElement,
  role: 'user' | 'assistant' | undefined
): HTMLElement | Element | null {
  if (role !== 'assistant') {
    return element.querySelector(MESSAGE_CONTENT_SELECTOR) ?? element;
  }

  const candidates = Array.from(element.querySelectorAll(MESSAGE_CONTENT_SELECTOR));
  return candidates.find((candidate) => !isQianwenThinkingElement(candidate)) ?? element;
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

function isQianwenChromeMessage(message: QianwenDomSnapshotMessageInput): boolean {
  return message.content?.trim() === '最近对话';
}

function dedupeMessages(messages: QianwenDomSnapshotMessageInput[]): QianwenDomSnapshotMessageInput[] {
  const deduped: QianwenDomSnapshotMessageInput[] = [];

  for (const message of messages) {
    if (isQianwenThinkingContent(message.content)) {
      continue;
    }

    const previous = deduped[deduped.length - 1];
    if (previous?.role === message.role && previous.content === message.content) {
      continue;
    }

    deduped.push(message);
  }

  return deduped;
}

function collapseAssistantCandidates(messages: QianwenDomSnapshotMessageInput[]): QianwenDomSnapshotMessageInput[] {
  const collapsed: QianwenDomSnapshotMessageInput[] = [];
  let pendingAssistant: QianwenDomSnapshotMessageInput | null = null;

  for (const message of messages) {
    if (message.role === 'assistant') {
      pendingAssistant = message;
      continue;
    }

    if (pendingAssistant) {
      collapsed.push(pendingAssistant);
      pendingAssistant = null;
    }
    collapsed.push(message);
  }

  if (pendingAssistant) {
    collapsed.push(pendingAssistant);
  }

  return collapsed;
}

function isQianwenThinkingElement(element: Element): boolean {
  const className = typeof (element as HTMLElement).className === 'string'
    ? (element as HTMLElement).className.toLowerCase()
    : '';
  return (
    className.includes('think') ||
    className.includes('thinking') ||
    className.includes('reason') ||
    className.includes('reasoning')
  );
}

function isQianwenThinkingContent(content: string | undefined): boolean {
  const text = content?.trim() ?? '';
  return (
    text.startsWith('思考过程') ||
    text.startsWith('已深度思考') ||
    text.startsWith('深度思考') ||
    text.startsWith('正在思考') ||
    text.startsWith('思考中') ||
    isQianwenHiddenReasoningText(text) ||
    text.startsWith('Thinking') ||
    text.startsWith('Reasoning')
  );
}

function isQianwenHiddenReasoningText(text: string): boolean {
  return (
    text.startsWith('用户') &&
    (
      text.includes('\n我需要') ||
      text.includes('我应该') ||
      text.includes('让我先搜索') ||
      text.includes('需要搜索')
    )
  );
}
