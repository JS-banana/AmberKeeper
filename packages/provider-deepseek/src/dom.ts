import type { DomSnapshotSeenSignal } from '@amberkeeper/capture-core';
import type { NormalizedMessage } from '@amberkeeper/shared-types';

export interface DeepSeekDomSnapshotMessageInput {
  role?: string;
  content?: string;
}

export function collectDeepSeekStructuredMessages(
  root: ParentNode = document
): DeepSeekDomSnapshotMessageInput[] {
  return Array.from(root.querySelectorAll('.message-item, .ds-message'))
    .map((node) => collectDeepSeekMessageFromNode(node as HTMLElement))
    .filter((message) => Boolean(message.role && message.content));
}

export function buildDeepSeekDomSnapshot(input: {
  url: string;
  title: string;
  messages: DeepSeekDomSnapshotMessageInput[];
}): { message: string; detail: string } {
  return {
    message: `Collected ${input.messages.length} DeepSeek DOM message block(s).`,
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

export function buildDeepSeekDomSignal(input: {
  pageUrl: string;
  title: string;
  capturedAt: string;
  messages: DeepSeekDomSnapshotMessageInput[];
  sourceSessionKey: string;
}): DomSnapshotSeenSignal {
  return {
    kind: 'domSnapshotSeen',
    provider: 'deepseek',
    source: 'preload-dom',
    sourceSessionKey: input.sourceSessionKey,
    pageUrl: input.pageUrl,
    title: input.title,
    capturedAt: input.capturedAt,
    messages: input.messages,
  };
}

export function normalizeDeepSeekDomSnapshotMessages(
  messages: DeepSeekDomSnapshotMessageInput[],
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

export function hasStableDeepSeekAssistantTurn(
  messages: NormalizedMessage[],
  previousAssistantContent: string | null
): boolean {
  const latestAssistantContent = getLatestDeepSeekAssistantContent(messages);
  return Boolean(latestAssistantContent) && latestAssistantContent === previousAssistantContent;
}

export function getLatestDeepSeekAssistantContent(messages: NormalizedMessage[]): string | null {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index]?.role === 'assistant') {
      return messages[index].content;
    }
  }

  return null;
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

function collectDeepSeekMessageFromNode(element: HTMLElement): DeepSeekDomSnapshotMessageInput {
  const userNode = element.querySelector('.user-message');
  const assistantNode = element.querySelector('.assistant-message');

  if (userNode || assistantNode) {
    return {
      role: userNode ? 'user' : assistantNode ? 'assistant' : undefined,
      content: (
        userNode?.querySelector('.message-content') ??
        assistantNode?.querySelector('.message-content') ??
        userNode ??
        assistantNode
      )?.textContent?.trim(),
    };
  }

  if (!hasClassName(element, 'ds-message')) {
    return {};
  }

  const assistantContent = extractDeepSeekArchivedAssistantContent(element);
  if (assistantContent) {
    return {
      role: 'assistant',
      content: assistantContent,
    };
  }

  const userContent = (element.querySelector('.fbb737a4') ?? element)?.textContent?.trim();
  return {
    role: userContent ? 'user' : undefined,
    content: userContent,
  };
}

function extractDeepSeekArchivedAssistantContent(element: HTMLElement): string | undefined {
  const markdownNodes = Array.from(element.querySelectorAll('.ds-markdown'));
  for (let index = markdownNodes.length - 1; index >= 0; index -= 1) {
    const content = markdownNodes[index]?.textContent?.trim();
    if (content) {
      return content;
    }
  }

  return undefined;
}

function hasClassName(element: { className?: unknown }, token: string): boolean {
  return typeof element.className === 'string' && element.className.split(/\s+/).includes(token);
}
