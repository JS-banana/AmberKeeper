import type { DomSnapshotSeenSignal } from '@amberkeeper/capture-core';
import type { NormalizedMessage } from '@amberkeeper/shared-types';

export interface QianwenDomSnapshotMessageInput {
  role?: string;
  content?: string;
}

export function collectQianwenStructuredMessages(
  root: ParentNode = document
): QianwenDomSnapshotMessageInput[] {
  return Array.from(
    root.querySelectorAll(
      '.message-item, .chat-message, .qwen-message, .conversation-turn, [class*="questionItem"], [class*="answerItem"], [data-chat-list-key], [data-msgid]'
    )
  )
    .map((node) => collectQianwenMessageFromNode(node as HTMLElement))
    .filter((message) => Boolean(message.role && message.content));
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

function collectQianwenMessageFromNode(element: HTMLElement): QianwenDomSnapshotMessageInput {
  const explicitRole = inferRoleFromElement(element);
  if (explicitRole) {
    return {
      role: explicitRole,
      content: extractVisibleText(
        element.querySelector('.message-content, .content, .markdown, .qwen-markdown') ?? element
      ),
    };
  }

  const userNode = element.querySelector('.user-message, [data-role="user"], [data-message-role="user"]');
  const assistantNode = element.querySelector(
    '.assistant-message, [data-role="assistant"], [data-message-role="assistant"]'
  );

  if (userNode || assistantNode) {
    return {
      role: userNode ? 'user' : 'assistant',
      content: (
        userNode?.querySelector('.message-content, .content, .markdown, .qwen-markdown') ??
        assistantNode?.querySelector('.message-content, .content, .markdown, .qwen-markdown') ??
        userNode ??
        assistantNode
      )?.textContent?.trim(),
    };
  }

  const roleHint = element.getAttribute('data-message-author-role') ?? element.getAttribute('data-role');
  const content = extractVisibleText(
    element.querySelector('.message-content, .content, .markdown, .qwen-markdown') ?? element
  );

  return {
    role: roleHint === 'user' || roleHint === 'assistant' ? roleHint : undefined,
    content,
  };
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
    loweredMsgId.endsWith('-question') ||
    loweredChatKey.endsWith('-question')
  ) {
    return 'user';
  }

  if (
    loweredClassName.includes('answeritem') ||
    loweredMsgId.endsWith('-answer') ||
    loweredChatKey.endsWith('-question-a')
  ) {
    return 'assistant';
  }

  return undefined;
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
