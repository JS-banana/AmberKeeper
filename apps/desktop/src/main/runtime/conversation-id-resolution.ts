import type { ConversationIdResolvedSignal, ProviderSignal } from '@amberkeeper/capture-core';
import type { CaptureSource, ProviderAdapter, ProviderId } from '@amberkeeper/shared-types';

export function resolveConversationIdSignal(input: {
  provider: ProviderId;
  source: CaptureSource;
  sourceSessionKey: string;
  pageUrl: string;
  capturedAt: string;
  urls: string[];
  adapter: ProviderAdapter<ProviderSignal>;
}): ConversationIdResolvedSignal | null {
  const conversationId = input.urls
    .map((url) => input.adapter.extractConversationIdFromUrl(url))
    .find((value): value is string => Boolean(value));

  if (!conversationId) {
    return null;
  }

  return {
    provider: input.provider,
    kind: 'conversationIdResolved',
    source: input.source,
    sourceSessionKey: input.sourceSessionKey,
    pageUrl: input.pageUrl,
    capturedAt: input.capturedAt,
    conversationId,
  };
}
