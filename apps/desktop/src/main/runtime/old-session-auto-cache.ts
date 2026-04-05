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
