import type {
  CaptureEnvelope,
  CaptureSource,
  NormalizedMessage,
  SessionTitleSource,
} from '@amberkeeper/shared-types';

export type ProviderId = CaptureEnvelope['provider'];

export interface SignalContext {
  provider: ProviderId;
  source: CaptureSource;
  sourceSessionKey: string;
  pageUrl: string;
  capturedAt: string;
}

export interface RequestSeenSignal extends SignalContext {
  kind: 'requestSeen';
  requestId: string;
  url: string;
  method: string;
  postData?: string;
  resourceType: string;
}

export interface ResponseMetaSeenSignal extends SignalContext {
  kind: 'responseMetaSeen';
  requestId: string;
  url: string;
  status: number | null;
  mimeType: string | null;
}

export interface ResponseBodySeenSignal extends SignalContext {
  kind: 'responseBodySeen';
  requestId: string;
  body: string;
  base64Encoded: boolean;
}

export interface ResponseBodyFailedSignal extends SignalContext {
  kind: 'responseBodyFailed';
  requestId: string;
  error: unknown;
}

export interface WebSocketSeenSignal extends SignalContext {
  kind: 'websocketSeen';
  url: string;
}

export interface DomSnapshotSeenSignal extends SignalContext {
  kind: 'domSnapshotSeen';
  title: string;
  messages: Array<{ role?: string; content?: string }>;
}

export interface PageContextChangedSignal {
  kind: 'pageContextChanged';
  url: string;
  title?: string;
}

export type RuntimeSignal =
  | RequestSeenSignal
  | ResponseMetaSeenSignal
  | ResponseBodySeenSignal
  | ResponseBodyFailedSignal
  | WebSocketSeenSignal
  | DomSnapshotSeenSignal
  | PageContextChangedSignal;

export interface CandidateUserMessageSignal extends SignalContext {
  kind: 'candidateUserMessage';
  conversationId: string | null;
  content: string;
  createdAt: string;
  remoteMessageId?: string;
  model?: string;
  conversationAliases?: string[];
}

export interface ConversationIdResolvedSignal extends SignalContext {
  kind: 'conversationIdResolved';
  conversationId: string;
  conversationAliases?: string[];
}

export interface AssistantMayBeReadySignal extends SignalContext {
  kind: 'assistantMayBeReady';
  conversationId: string | null;
  content: string;
  createdAt: string;
  stable: boolean;
  remoteMessageId?: string;
  model?: string;
  conversationAliases?: string[];
}

export type ProviderSignal =
  | CandidateUserMessageSignal
  | ConversationIdResolvedSignal
  | AssistantMayBeReadySignal;

export interface CompletedTurn extends SignalContext {
  conversationId: string;
  title?: string;
  titleSource?: SessionTitleSource;
  remoteConversationAliases?: string[];
  messages: NormalizedMessage[];
}
