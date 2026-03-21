export interface GeminiDryRunConversationRecord {
  id: string;
  provider: string;
  remoteConversationId: string | null;
  sourceSessionKey: string;
  pageUrl: string;
  messageCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface GeminiDryRunMessageRecord {
  id: string;
  conversationId: string;
  provider: string;
  remoteConversationId: string | null;
  role: string;
  content: string;
  contentHash: string;
  remoteMessageId: string | null;
  model: string | null;
  source: string;
  createdAt: string;
  capturedAt: string;
}

export interface GeminiDirtyDataCandidate {
  conversationId: string;
  remoteConversationId: string | null;
  messageCount: number;
  updatedAt: string;
  reasonCodes: string[];
  suspiciousMessageIds: string[];
  proposedAction: 'review_delete_conversation';
  preview: {
    latestUser: string | null;
    latestAssistant: string | null;
  };
}

export interface GeminiDirtyDataReport {
  provider: 'gemini';
  scannedConversationCount: number;
  scannedMessageCount: number;
  candidateCount: number;
  summaryByReason: Record<string, number>;
  candidates: GeminiDirtyDataCandidate[];
}

export declare const DEFAULT_GEMINI_CAPTURE_DB_PATH: string;

export declare function resolveGeminiCaptureDbPath(input?: {
  argv?: string[];
  env?: Record<string, string | undefined>;
}): string;

export declare function analyzeGeminiDirtyData(input: {
  conversations: GeminiDryRunConversationRecord[];
  messages: GeminiDryRunMessageRecord[];
}): GeminiDirtyDataReport;

export declare function runGeminiDirtyDataDryRun(options?: {
  dbPath?: string;
}): GeminiDirtyDataReport & {
  dbPath: string;
  generatedAt: string;
};
