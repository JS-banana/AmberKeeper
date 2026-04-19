import type { NormalizedMessage } from '@amberkeeper/shared-types';
import type { ProviderHistoryCaptureResult } from '@amberkeeper/shared-types';

export type XiaomiAistudioProviderId = 'xiaomi-aistudio';
export type XiaomiAistudioRequestClassification = 'capture' | 'discover' | 'ignore';
export type XiaomiAistudioCaptureSource = 'cdp-network' | 'preload-dom';

export interface XiaomiAistudioDomSnapshotMessageInput {
  role?: string;
  content?: string;
}

export interface XiaomiAistudioDomSnapshotSeenSignal {
  kind: 'domSnapshotSeen';
  provider: XiaomiAistudioProviderId;
  source: 'preload-dom';
  sourceSessionKey: string;
  pageUrl: string;
  title: string;
  capturedAt: string;
  messages: XiaomiAistudioDomSnapshotMessageInput[];
}

export interface XiaomiAistudioSignalContext {
  provider: XiaomiAistudioProviderId;
  source: XiaomiAistudioCaptureSource;
  sourceSessionKey: string;
  pageUrl: string;
  capturedAt: string;
}

export interface XiaomiAistudioCandidateUserMessageSignal extends XiaomiAistudioSignalContext {
  kind: 'candidateUserMessage';
  conversationId: string | null;
  content: string;
  createdAt: string;
  remoteMessageId?: string;
  model?: string;
}

export interface XiaomiAistudioConversationIdResolvedSignal extends XiaomiAistudioSignalContext {
  kind: 'conversationIdResolved';
  conversationId: string;
}

export interface XiaomiAistudioAssistantMayBeReadySignal extends XiaomiAistudioSignalContext {
  kind: 'assistantMayBeReady';
  conversationId: string | null;
  content: string;
  createdAt: string;
  stable: boolean;
  remoteMessageId?: string;
  model?: string;
}

export type XiaomiAistudioProviderSignal =
  | XiaomiAistudioCandidateUserMessageSignal
  | XiaomiAistudioConversationIdResolvedSignal
  | XiaomiAistudioAssistantMayBeReadySignal;

export interface XiaomiAistudioProviderInterpretRequestInput {
  url: string;
  method: string;
  body?: string;
  pageUrl: string;
  capturedAt: string;
  sourceSessionKey: string;
}

export interface XiaomiAistudioProviderInterpretResponseBodyInput
  extends XiaomiAistudioProviderInterpretRequestInput {
  body: string;
}

export interface XiaomiAistudioProviderInterpretDomSnapshotInput {
  pageUrl: string;
  capturedAt: string;
  sourceSessionKey: string;
  conversationId?: string;
  messages: XiaomiAistudioDomSnapshotMessageInput[];
  previousAssistantContent: string | null;
}

export interface XiaomiAistudioProviderInterpretResponseResult {
  signals: XiaomiAistudioProviderSignal[];
  streamStatus: 'COMPLETE' | null;
}

export interface XiaomiAistudioProviderInterpretDomSnapshotResult {
  signals: XiaomiAistudioProviderSignal[];
  stable: boolean;
  latestAssistantContent: string | null;
}

export interface XiaomiAistudioProviderBuildDomSignalInput {
  pageUrl: string;
  title: string;
  capturedAt: string;
  messages: XiaomiAistudioDomSnapshotMessageInput[];
  sourceSessionKey: string;
}

export interface XiaomiAistudioProviderAdapter {
  id: XiaomiAistudioProviderId;
  matchesView(url: string): boolean;
  classifyRequest(input: { url: string; method: string }): XiaomiAistudioRequestClassification;
  interpretRequest(input: XiaomiAistudioProviderInterpretRequestInput): XiaomiAistudioProviderSignal[];
  interpretResponseBody(input: XiaomiAistudioProviderInterpretResponseBodyInput): XiaomiAistudioProviderInterpretResponseResult;
  extractHistoryCapture?(input: XiaomiAistudioProviderInterpretResponseBodyInput): ProviderHistoryCaptureResult | null;
  interpretDomSnapshot(input: XiaomiAistudioProviderInterpretDomSnapshotInput): XiaomiAistudioProviderInterpretDomSnapshotResult;
  buildDomSignal?: (input: XiaomiAistudioProviderBuildDomSignalInput) => XiaomiAistudioDomSnapshotSeenSignal;
  shouldTriggerDomAutoCapture(input: {
    url: string;
    method: string;
    streamStatus: 'COMPLETE' | null;
  }): boolean;
  extractConversationIdFromUrl(input: string): string | null;
  summarizeResponseBody(input: string, maxLength?: number): string;
}

export type { NormalizedMessage };
