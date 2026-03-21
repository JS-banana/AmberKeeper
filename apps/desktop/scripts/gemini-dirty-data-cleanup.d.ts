import type { GeminiDirtyDataCandidate, GeminiDirtyDataReport } from './gemini-dirty-data-dry-run';

export interface GeminiDirtyDataCleanupReport extends GeminiDirtyDataReport {
  mode: 'dry-run' | 'apply';
  dbPath: string;
  generatedAt: string;
  backupPath: string | null;
  deletedConversationCount: number;
  deletedMessageCount: number;
  deletedCaptureEventCount: number;
  remainingCandidateCount: number;
  remainingCandidates: GeminiDirtyDataCandidate[];
}

export declare function runGeminiDirtyDataCleanup(options?: {
  dbPath?: string;
  apply?: boolean;
  backupDir?: string;
  now?: () => string;
}): GeminiDirtyDataCleanupReport;
