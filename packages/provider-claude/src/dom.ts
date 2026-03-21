import type { DomSnapshotSeenSignal } from '@anychat/capture-core';
import type { NormalizedMessage } from '@anychat/shared-types';

export interface ClaudeDomSnapshotMessageInput {
  role?: string;
  content?: string;
}

export function collectClaudeStructuredMessages(
  root: ParentNode = document
): ClaudeDomSnapshotMessageInput[] {
  const legacyMessages = Array.from(root.querySelectorAll('[data-testid="conversation-turn"]'))
    .map((node) => {
      const element = node as HTMLElement;
      const userNode = element.querySelector('.human-message');
      const assistantNode = element.querySelector('.assistant-message');
      const role = userNode ? 'user' : assistantNode ? 'assistant' : undefined;
      const content = readClaudeVisibleText(
        (userNode?.querySelector('.prose') ??
          assistantNode?.querySelector('.prose') ??
          userNode ??
          assistantNode) as HTMLElement | null
      );

      return {
        role,
        content,
      };
    })
    .filter((message) => Boolean(message.role && message.content));

  if (legacyMessages.length > 0) {
    return legacyMessages;
  }

  return Array.from(root.querySelectorAll('[data-testid="user-message"], [data-is-streaming]'))
    .map((node) => {
      const element = node as HTMLElement;
      const role = element.matches('[data-testid="user-message"]')
        ? 'user'
        : element.matches('[data-is-streaming]')
          ? 'assistant'
          : undefined;
      const content = readClaudeVisibleText(
        (role === 'user'
          ? element
          : element.querySelector('.font-claude-response, .standard-markdown')) as HTMLElement | null
      );

      return {
        role,
        content,
      };
    })
    .filter((message) => Boolean(message.role && message.content));
}

export function buildClaudeDomSnapshot(input: {
  url: string;
  title: string;
  messages: ClaudeDomSnapshotMessageInput[];
}): { message: string; detail: string } {
  return {
    message: `Collected ${input.messages.length} Claude DOM message block(s).`,
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

export function buildClaudeDomSignal(input: {
  pageUrl: string;
  title: string;
  capturedAt: string;
  messages: ClaudeDomSnapshotMessageInput[];
  sourceSessionKey: string;
}): DomSnapshotSeenSignal {
  return {
    kind: 'domSnapshotSeen',
    provider: 'claude',
    source: 'preload-dom',
    sourceSessionKey: input.sourceSessionKey,
    pageUrl: input.pageUrl,
    title: input.title,
    capturedAt: input.capturedAt,
    messages: input.messages,
  };
}

export function normalizeClaudeDomSnapshotMessages(
  messages: ClaudeDomSnapshotMessageInput[],
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

export function hasStableClaudeAssistantTurn(
  messages: NormalizedMessage[],
  previousAssistantContent: string | null
): boolean {
  const latestAssistantContent = getLatestClaudeAssistantContent(messages);
  return Boolean(latestAssistantContent) && latestAssistantContent === previousAssistantContent;
}

export function getLatestClaudeAssistantContent(messages: NormalizedMessage[]): string | null {
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

function readClaudeVisibleText(element: HTMLElement | null): string | undefined {
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
