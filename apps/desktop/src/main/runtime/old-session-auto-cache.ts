import type { CaptureMessageRecord, NormalizedMessage, ProviderId } from '@amberkeeper/shared-types';
import type { ProviderRequestClassification } from '@amberkeeper/shared-types';

type MessageSignatureInput =
  | Pick<NormalizedMessage, 'role' | 'content' | 'createdAt' | 'remoteMessageId' | 'model'>
  | Pick<CaptureMessageRecord, 'role' | 'content' | 'createdAt' | 'remoteMessageId' | 'model'>;

export function createOldSessionAutoCacheKey(
  providerId: ProviderId,
  remoteConversationId: string
): string {
  return `${providerId}:${remoteConversationId}`;
}

export function createNormalizedMessageSignature(messages: MessageSignatureInput[]): string {
  if (messages.length === 0) {
    return 'empty';
  }

  return JSON.stringify(
    messages.map((message) => ({
      role: message.role,
      content: message.content,
      createdAt: message.createdAt,
      remoteMessageId: message.remoteMessageId ?? null,
      model: message.model ?? null,
    }))
  );
}

export function shouldPersistAutoCachedMessages(
  existingMessages: MessageSignatureInput[],
  nextMessages: MessageSignatureInput[]
): boolean {
  return createNormalizedMessageSignature(existingMessages) !== createNormalizedMessageSignature(nextMessages);
}

export function isUserOnlyDomSnapshotDowngrade(input: {
  trigger: 'history-hydration' | 'history-auto-cache' | 'network-history-response';
  source: 'cdp-network' | 'preload-dom' | 'runtime';
  existingMessages: MessageSignatureInput[];
  nextMessages: MessageSignatureInput[];
}): boolean {
  return (
    input.source === 'preload-dom' &&
    input.existingMessages.length > 0 &&
    input.nextMessages.some((message) => message.role === 'user') &&
    !input.nextMessages.some((message) => message.role === 'assistant')
  );
}

export function isAssistantOnlyDomSnapshotAfterCompletedTurn(input: {
  source: 'cdp-network' | 'preload-dom' | 'runtime';
  existingMessages: MessageSignatureInput[];
  nextMessages: MessageSignatureInput[];
}): boolean {
  return (
    input.source === 'preload-dom' &&
    input.nextMessages.some((message) => message.role === 'assistant') &&
    !input.nextMessages.some((message) => message.role === 'user') &&
    latestExistingTurnHasAssistant(input.existingMessages)
  );
}

export function alignDomSnapshotToLatestExistingUser<TMessage extends MessageSignatureInput>(input: {
  source: 'cdp-network' | 'preload-dom' | 'runtime';
  existingMessages: MessageSignatureInput[];
  nextMessages: TMessage[];
}): TMessage[] {
  if (input.source !== 'preload-dom') {
    return input.nextMessages;
  }

  const latestUser = findLatestUser(input.existingMessages);
  if (!latestUser) {
    return input.nextMessages;
  }

  const matchingIndex = input.nextMessages.findIndex(
    (message) => message.role === 'user' && hasSameRoleContent(message, latestUser)
  );
  return matchingIndex >= 0 ? input.nextMessages.slice(matchingIndex) : input.nextMessages;
}

export function shouldMergeIncompleteDomSnapshot(input: {
  source: 'cdp-network' | 'preload-dom' | 'runtime';
  existingMessages: MessageSignatureInput[];
  nextMessages: MessageSignatureInput[];
}): boolean {
  if (input.source !== 'preload-dom' || input.existingMessages.length === 0) {
    return false;
  }

  const nextKeys = new Set(input.nextMessages.map(toRoleContentKey));
  return input.existingMessages.some(
    (message) => message.role === 'user' && !nextKeys.has(toRoleContentKey(message))
  );
}

export function resolveDiscoveryAutoCacheCandidate(input: {
  classification: ProviderRequestClassification;
  activeProviderId: ProviderId | null;
  runtimeProviderId: ProviderId | null;
  signalProviderId: ProviderId;
  remoteConversationId: string | null;
  pageUrl: string;
}): {
  providerId: ProviderId;
  remoteConversationId: string;
  targetUrl: string;
} | null {
  const remoteConversationId = input.remoteConversationId?.trim() ?? '';
  if (
    input.classification !== 'discover' ||
    input.activeProviderId !== input.signalProviderId ||
    input.runtimeProviderId !== input.signalProviderId ||
    remoteConversationId.length === 0
  ) {
    return null;
  }

  return {
    providerId: input.signalProviderId,
    remoteConversationId,
    targetUrl: input.pageUrl,
  };
}

function toRoleContentKey(message: MessageSignatureInput): string {
  return `${message.role}\u0000${normalizeComparableContent(message.content)}`;
}

export function hasSameRoleContent(
  left: Pick<MessageSignatureInput, 'role' | 'content'>,
  right: Pick<MessageSignatureInput, 'role' | 'content'>
): boolean {
  return left.role === right.role && normalizeComparableContent(left.content) === normalizeComparableContent(right.content);
}

function findLatestUser(messages: MessageSignatureInput[]): MessageSignatureInput | null {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index]?.role === 'user') {
      return messages[index];
    }
  }

  return null;
}

function latestExistingTurnHasAssistant(messages: MessageSignatureInput[]): boolean {
  const latestUserIndex = findLatestUserIndex(messages);
  if (latestUserIndex === -1) {
    return false;
  }

  return messages.slice(latestUserIndex + 1).some((message) => message.role === 'assistant');
}

function findLatestUserIndex(messages: MessageSignatureInput[]): number {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index]?.role === 'user') {
      return index;
    }
  }

  return -1;
}

function normalizeComparableContent(input: string | undefined): string {
  return (input ?? '').replace(/\u00A0/g, ' ').replace(/\u200B/g, '').replace(/\s+/g, ' ').trim();
}

export function shouldAcceptAutoCacheSnapshot(input: {
  stage: 'history-hydration' | 'history-auto-cache';
  preferredConversationId?: string | null;
  resolvedConversationId?: string | null;
  initialSignature?: string | null;
  nextSignature: string;
}): boolean {
  if (input.stage !== 'history-auto-cache') {
    return true;
  }

  const preferredConversationId = input.preferredConversationId?.trim() ?? '';
  if (!preferredConversationId) {
    return true;
  }

  if ((input.resolvedConversationId?.trim() ?? '') === preferredConversationId) {
    return true;
  }

  const initialSignature = input.initialSignature ?? null;
  if (!initialSignature) {
    return true;
  }

  return input.nextSignature !== initialSignature;
}

export function resolveAutoCachedTitle(input: {
  stage: 'history-hydration' | 'history-auto-cache' | 'network-history-response';
  snapshotTitle?: string | null;
}): string | null {
  const snapshotTitle = input.snapshotTitle?.trim() ?? '';
  if (!snapshotTitle) {
    return null;
  }

  return input.stage === 'history-hydration' ? snapshotTitle : null;
}
