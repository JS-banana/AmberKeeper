import type { DomSnapshotSeenSignal } from '@amberkeeper/capture-core';
import type { NormalizedMessage } from '@amberkeeper/shared-types';

export interface DomSnapshotMessageInput {
  role?: string;
  content?: string;
}

export function collectChatGptStructuredMessages(root: ParentNode = document): DomSnapshotMessageInput[] {
  return Array.from(root.querySelectorAll('[data-message-author-role]'))
    .map((node) => {
      const role = node.getAttribute('data-message-author-role') ?? '';
      const content = ((node as HTMLElement).innerText || node.textContent || '').trim();

      return {
        role,
        content,
      };
    })
    .filter((message) => Boolean(message.content));
}

export function buildChatGptDomSnapshot(input: {
  url: string;
  title: string;
  messages: DomSnapshotMessageInput[];
}): { message: string; detail: string } {
  const texts = input.messages.map((message) => `${message.role}: ${message.content}`).slice(-6);

  return {
    message: `Collected ${texts.length} DOM text block(s) from the current page.`,
    detail: JSON.stringify(
      {
        url: input.url,
        title: input.title,
        texts,
      },
      null,
      2
    ),
  };
}

export function buildChatGptDomSignal(input: {
  pageUrl: string;
  title: string;
  capturedAt: string;
  messages: DomSnapshotMessageInput[];
  sourceSessionKey: string;
}): DomSnapshotSeenSignal {
  return {
    kind: 'domSnapshotSeen',
    provider: 'chatgpt',
    source: 'preload-dom',
    sourceSessionKey: input.sourceSessionKey,
    pageUrl: input.pageUrl,
    title: input.title,
    capturedAt: input.capturedAt,
    messages: input.messages,
  };
}

export function normalizeDomSnapshotMessages(
  messages: DomSnapshotMessageInput[],
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

export function hasStableDomAssistantTurn(
  messages: NormalizedMessage[],
  previousAssistantContent: string | null
): boolean {
  const latestAssistantContent = getLatestAssistantContent(messages);
  return Boolean(latestAssistantContent) && latestAssistantContent === previousAssistantContent;
}

export function getLatestAssistantContent(messages: NormalizedMessage[]): string | null {
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
