export const BUILTIN_PROVIDER_IDS = ['chatgpt', 'claude', 'deepseek', 'gemini'] as const;

export type ProviderId = (typeof BUILTIN_PROVIDER_IDS)[number];

export type CaptureSource = 'cdp-network' | 'preload-dom';

export interface NormalizedMessage {
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
  remoteConversationId?: string;
  remoteMessageId?: string;
  model?: string;
}

export interface CaptureEnvelope {
  provider: ProviderId;
  source: CaptureSource;
  pageUrl: string;
  capturedAt: string;
  sourceSessionKey: string;
  remoteConversationId?: string;
  messages: NormalizedMessage[];
}

export interface CaptureSessionRecord {
  id: string;
  provider: ProviderId;
  remoteConversationId: string | null;
  sourceSessionKey: string;
  pageUrl: string;
  messageCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface CaptureMessageRecord {
  id: string;
  sessionId: string;
  provider: ProviderId;
  remoteConversationId: string | null;
  role: 'user' | 'assistant';
  content: string;
  contentHash: string;
  remoteMessageId: string | null;
  model: string | null;
  source: CaptureSource;
  createdAt: string;
  capturedAt: string;
}

export interface ProviderRecord {
  id: ProviderId;
  name: string;
  homeUrl: string;
  enabled: boolean;
  builtin: boolean;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export type ProviderMoveDirection = 'up' | 'down';

export interface ShellInfo {
  diagnosticsEnabled: boolean;
  isPackaged: boolean;
}

export interface CaptureAttemptLogRecord {
  id: string;
  source: CaptureSource | 'runtime';
  stage: string;
  status: 'info' | 'captured' | 'error';
  message: string;
  detail: string | null;
  createdAt: string;
}

export interface RuntimeStatus {
  debuggerAttached: boolean;
  currentUrl: string;
  lastCaptureAt: string | null;
  pendingRequestCount: number;
  recentAttempts: CaptureAttemptLogRecord[];
}
