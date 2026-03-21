import type {
  CaptureMessageRecord,
  CaptureSessionRecord,
  ProviderId,
  ProviderRecord,
  RuntimeStatus,
} from '@anychat/shared-types';
import type { DomSnapshotSeenSignal } from '@anychat/capture-core';

declare global {
  interface Window {
    captureApi: {
      listSessions: () => Promise<CaptureSessionRecord[]>;
      listMessages: (sessionId: string) => Promise<CaptureMessageRecord[]>;
      openSession: (sessionId: string) => Promise<{ message: string; detail: string }>;
      listProviders: () => Promise<ProviderRecord[]>;
      getActiveProvider: () => Promise<ProviderRecord | null>;
      setActiveProvider: (providerId: ProviderId) => Promise<ProviderRecord | null>;
      setProviderEnabled: (providerId: ProviderId, enabled: boolean) => Promise<ProviderRecord | null>;
      getRuntimeStatus: () => Promise<RuntimeStatus>;
      triggerDomSnapshot: () => Promise<{ message: string; detail: string }>;
      onRuntimeStatus: (callback: (status: RuntimeStatus) => void) => () => void;
    };
    anychatChatCapture?: {
      snapshotDom: () => { message: string; detail: string };
      snapshotMessages: () => {
        url: string;
        title: string;
        messages: Array<{ role?: string; content?: string }>;
      };
      snapshotSignal: () =>
        | DomSnapshotSeenSignal
        | {
            url: string;
            title: string;
            messages: Array<{ role?: string; content?: string }>;
          };
    };
  }
}

export {};
