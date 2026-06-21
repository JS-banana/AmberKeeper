export const BUILTIN_PROVIDER_IDS = [
  'chatgpt',
  'claude',
  'deepseek',
  'gemini',
  'grok',
  'kimi',
  'qianwen',
  'doubao',
  'xiaomi-aistudio',
] as const;

export type ProviderId = (typeof BUILTIN_PROVIDER_IDS)[number];

export type InterfaceLanguage = 'system' | 'zh-CN' | 'en';

export type CaptureSource = 'cdp-network' | 'preload-dom';
export type SessionTitleSource = 'provider' | 'fallback';
export type CaptureSaveScope = 'complete' | 'user';
export type CaptureExportFormat = 'json' | 'markdown';
export type CaptureExportMessageScope = 'complete' | 'user' | 'assistant';

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
  title?: string | null;
  titleSource?: SessionTitleSource;
  messages: NormalizedMessage[];
}

export interface CaptureSessionRecord {
  id: string;
  provider: ProviderId;
  title?: string | null;
  remoteConversationId: string | null;
  sourceSessionKey: string;
  pageUrl: string;
  titleSource?: SessionTitleSource | null;
  previewText?: string | null;
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
  cacheEnabled: boolean;
  builtin: boolean;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export type ProviderMoveDirection = 'up' | 'down';

export type ServiceKind = 'builtin' | 'custom';
export type ServiceMoveDirection = 'up' | 'down';

export interface ServiceRecord {
  id: string;
  providerId: ProviderId | null;
  kind: ServiceKind;
  name: string;
  displayUrl: string;
  launchUrl: string;
  iconUrl: string | null;
  cacheEnabled?: boolean;
  enabled: boolean;
  builtin: boolean;
  active: boolean;
  supportsDataManagement: boolean;
  supportsCapture: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateCustomServiceInput {
  name: string;
  url: string;
  iconUrl?: string | null;
}

export type ChatDataLocationStatus = 'current' | 'pending-restart' | 'unavailable';

export interface ChatDataLocationState {
  currentDirectory: string;
  defaultDirectory: string;
  pendingDirectory: string | null;
  status: ChatDataLocationStatus;
  error: string | null;
}

export interface ChatDataLocationActionResult {
  state: ChatDataLocationState;
  requiresRestart: boolean;
  message: string;
}

export interface ShellInfo {
  diagnosticsEnabled: boolean;
  isPackaged: boolean;
  appVersion: string;
  interfaceLanguage: InterfaceLanguage;
  captureSaveScope: CaptureSaveScope;
  chatDataLocation: ChatDataLocationState;
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

export type GeminiThemeDiagnosticMode = 'legacy' | 'fresh';

export interface GeminiThemeDiagnosticEntry {
  mode: GeminiThemeDiagnosticMode;
  partition: string;
  currentUrl: string;
  prefersDark: boolean;
  htmlColorScheme: string | null;
  metaColorScheme: string | null;
  documentBackground: string | null;
  bodyBackground: string | null;
  themeStorage: Record<string, string | null>;
  issueDetected: boolean;
}

export interface GeminiThemeDiagnosticReport {
  comparedAt: string;
  summary: 'legacy-only' | 'fresh-only' | 'both' | 'none';
  entries: GeminiThemeDiagnosticEntry[];
}

export type ProviderLiveProbeKind = 'new-message' | 'history-click';

export type ProviderLiveProbeOutcome =
  | 'passed'
  | 'failed-no-local-insert'
  | 'failed-no-history-target'
  | 'failed-no-composer'
  | 'blocked-login-or-antibot'
  | 'blocked-selector-drift'
  | 'blocked-timeout'
  | 'probe-action-failed';

export type ProviderLiveProbeVerdict = ProviderLiveProbeOutcome;

export interface ProviderLiveProbeRequest {
  providerId: ProviderId;
  kind: ProviderLiveProbeKind;
  promptText?: string;
  historyItemIndex?: number;
  resetToHome?: boolean;
  timeoutMs?: number;
}

export interface ProviderLiveProbeHistoryItem {
  index: number;
  label: string;
  href?: string | null;
  conversationId?: string | null;
}

export interface ProviderLiveProbeMessageDelta {
  sessionId: string;
  beforeMessageCount: number;
  afterMessageCount: number;
  remoteConversationId: string | null;
}

export interface ProviderLiveProbeSessionDelta {
  beforeSessionCount: number;
  afterSessionCount: number;
  newSessionIds: string[];
  updatedSessionIds: string[];
  remoteConversationIdsBefore: string[];
  remoteConversationIdsAfter: string[];
  messageDeltas: ProviderLiveProbeMessageDelta[];
}

export interface ProviderLiveProbeActionResult {
  ok: boolean;
  reason?: string;
  selector?: string | null;
  submitSelector?: string | null;
  historyItem?: ProviderLiveProbeHistoryItem | null;
  availableHistoryItems?: ProviderLiveProbeHistoryItem[];
  pageTextSample?: string | null;
  diagnostics?: Record<string, boolean | number | string | null>;
}

export interface ProviderLiveProbeEvidence {
  beforeUrl?: string;
  afterUrl?: string;
  preUrl?: string;
  postUrl?: string;
  promptText?: string;
  startedAt?: string;
  selectedHistoryItem?: ProviderLiveProbeHistoryItem | null;
  availableHistoryItems?: ProviderLiveProbeHistoryItem[];
  domSnapshotMessage?: string;
  domSnapshotDetail?: string;
  sessionDelta: ProviderLiveProbeSessionDelta;
  attemptLogs: CaptureAttemptLogRecord[];
  action: ProviderLiveProbeActionResult;
  notes: string[];
}

export interface ProviderLiveProbeResult {
  providerId: ProviderId;
  kind: ProviderLiveProbeKind;
  outcome?: ProviderLiveProbeOutcome;
  verdict?: ProviderLiveProbeVerdict;
  ok: boolean;
  message: string;
  remoteConversationId: string | null;
  selectedSessionId?: string | null;
  completedAt?: string;
  elapsedMs?: number;
  evidence: ProviderLiveProbeEvidence;
}

export interface ProviderPageEvalRequest {
  providerId: ProviderId;
  script: string;
  activate?: boolean;
}

export interface ProviderPageEvalResult {
  providerId: ProviderId;
  pageUrl: string;
  result: unknown;
}

export interface CaptureExportArtifact {
  scope: 'session' | 'provider' | 'all';
  format: CaptureExportFormat;
  messageScope: CaptureExportMessageScope;
  fileName: string;
  mimeType: string;
  content: string;
  sessionId?: string;
  providerId?: ProviderId;
}
