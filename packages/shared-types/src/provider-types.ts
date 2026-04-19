import type { CaptureSource, NormalizedMessage, ProviderId } from './capture-types';

export type ProviderRequestClassification = 'capture' | 'discover' | 'ignore';

export interface ProviderRequestContextInput {
  url: string;
  method: string;
}

export interface ProviderInterpretRequestInput extends ProviderRequestContextInput {
  body?: string;
  pageUrl: string;
  capturedAt: string;
  sourceSessionKey: string;
}

export interface ProviderInterpretResponseBodyInput extends ProviderInterpretRequestInput {
  body: string;
}

export interface ProviderInterpretDomSnapshotInput<TMessage = { role?: string; content?: string }> {
  pageUrl: string;
  capturedAt: string;
  sourceSessionKey: string;
  conversationId?: string;
  messages: TMessage[];
  previousAssistantContent: string | null;
}

export interface ProviderInterpretResponseResult<TSignal = unknown> {
  signals: TSignal[];
  streamStatus: 'COMPLETE' | null;
}

export interface ProviderHistoryCaptureResult {
  conversationId?: string | null;
  messages: NormalizedMessage[];
}

export type ProviderLiveSubmitStrategy =
  | 'button-or-enter'
  | 'button-only'
  | 'enter-only'
  | 'meta-enter'
  | 'ctrl-enter';

export interface ProviderLiveNewMessageSpec {
  readySelectors?: string[];
  launcherButtonSelectors?: string[];
  launcherButtonTextCandidates?: string[];
  composerSelectors: string[];
  sendButtonSelectors?: string[];
  submitButtonTextCandidates?: string[];
  submitStrategy?: ProviderLiveSubmitStrategy;
}

export interface ProviderLiveHistoryClickSpec {
  readySelectors?: string[];
  itemSelectors: string[];
  ignoreTextPatterns?: string[];
  routeFragments?: string[];
  maxItems?: number;
}

export interface ProviderLiveAutomationSpec {
  id?: ProviderId;
  providerId?: ProviderId;
  newMessage: ProviderLiveNewMessageSpec;
  historyClick: ProviderLiveHistoryClickSpec;
}

export interface ProviderInterpretDomSnapshotResult<TSignal = unknown> {
  signals: TSignal[];
  stable: boolean;
  latestAssistantContent: string | null;
}

export interface ProviderBuildDomSignalInput<TMessage = { role?: string; content?: string }> {
  pageUrl: string;
  title: string;
  capturedAt: string;
  messages: TMessage[];
  sourceSessionKey: string;
}

export interface ProviderAdapter<
  TSignal = unknown,
  TDomSnapshotMessage = { role?: string; content?: string },
> {
  id: ProviderId;
  matchesView(url: string): boolean;
  classifyRequest(input: ProviderRequestContextInput): ProviderRequestClassification;
  interpretRequest(input: ProviderInterpretRequestInput): TSignal[];
  interpretResponseBody(input: ProviderInterpretResponseBodyInput): ProviderInterpretResponseResult<TSignal>;
  extractHistoryCapture?(input: ProviderInterpretResponseBodyInput): ProviderHistoryCaptureResult | null;
  interpretDomSnapshot(
    input: ProviderInterpretDomSnapshotInput<TDomSnapshotMessage>
  ): ProviderInterpretDomSnapshotResult<TSignal>;
  buildDomSignal?: (
    input: ProviderBuildDomSignalInput<TDomSnapshotMessage>
  ) => unknown;
  shouldTriggerDomAutoCapture(input: {
    url: string;
    method: string;
    streamStatus: 'COMPLETE' | null;
  }): boolean;
  extractConversationIdFromUrl(input: string): string | null;
  summarizeResponseBody(input: string, maxLength?: number): string;
}

export interface GenericProviderRequestBody {
  conversationId?: string | null;
  model?: string;
  messages: NormalizedMessage[];
}
