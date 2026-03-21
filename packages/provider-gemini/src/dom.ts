import type { DomSnapshotSeenSignal } from '@anychat/capture-core';
import type { NormalizedMessage } from '@anychat/shared-types';

export interface GeminiDomSnapshotMessageInput {
  role?: string;
  content?: string;
}

type CompleteGeminiDomSnapshotMessage = GeminiDomSnapshotMessageInput & {
  role: 'user' | 'assistant';
  content: string;
};

export function collectGeminiStructuredMessages(
  root: ParentNode = document
): GeminiDomSnapshotMessageInput[] {
  const containers = Array.from(root.querySelectorAll('.conversation-container'));
  if (containers.length > 0) {
    return containers
      .map((node) => extractGeminiMessage(node as HTMLElement))
      .filter(isCompleteGeminiDomSnapshotMessage);
  }

  return Array.from(root.querySelectorAll('.query-content, .response-container'))
    .map((node) => {
      const element = node as HTMLElement;
      return {
        role: element.matches('.query-content') ? 'user' : 'assistant',
        content: (
          element.querySelector('.markdown') ??
          element.querySelector('.message-text') ??
          element
        )?.textContent?.trim(),
      };
    })
    .filter(isCompleteGeminiDomSnapshotMessage);
}

export function buildGeminiDomSnapshot(input: {
  url: string;
  title: string;
  messages: GeminiDomSnapshotMessageInput[];
}): { message: string; detail: string } {
  return {
    message: `Collected ${input.messages.length} Gemini DOM message block(s).`,
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

export function buildGeminiDomSignal(input: {
  pageUrl: string;
  title: string;
  capturedAt: string;
  messages: GeminiDomSnapshotMessageInput[];
  sourceSessionKey: string;
}): DomSnapshotSeenSignal {
  return {
    kind: 'domSnapshotSeen',
    provider: 'gemini',
    source: 'preload-dom',
    sourceSessionKey: input.sourceSessionKey,
    pageUrl: input.pageUrl,
    title: input.title,
    capturedAt: input.capturedAt,
    messages: input.messages,
  };
}

export function normalizeGeminiDomSnapshotMessages(
  messages: GeminiDomSnapshotMessageInput[],
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

export function hasStableGeminiAssistantTurn(
  messages: NormalizedMessage[],
  previousAssistantContent: string | null
): boolean {
  const latestAssistantContent = getLatestGeminiAssistantContent(messages);
  return Boolean(latestAssistantContent) && latestAssistantContent === previousAssistantContent;
}

export function getLatestGeminiAssistantContent(messages: NormalizedMessage[]): string | null {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index]?.role === 'assistant') {
      return messages[index].content;
    }
  }

  return null;
}

function extractGeminiMessage(node: HTMLElement): GeminiDomSnapshotMessageInput {
  const userNode = node.querySelector('.query-content');
  const assistantNode = node.querySelector('.response-container, .model-response');
  const role = userNode ? 'user' : assistantNode ? 'assistant' : undefined;
  const content = (
    userNode ??
    assistantNode?.querySelector('.markdown') ??
    assistantNode?.querySelector('.message-text') ??
    assistantNode
  )?.textContent?.trim();

  return {
    role,
    content,
  };
}

function isCompleteGeminiDomSnapshotMessage(
  message: GeminiDomSnapshotMessageInput
): message is CompleteGeminiDomSnapshotMessage {
  return (
    (message.role === 'user' || message.role === 'assistant') &&
    typeof message.content === 'string' &&
    message.content.length > 0
  );
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
