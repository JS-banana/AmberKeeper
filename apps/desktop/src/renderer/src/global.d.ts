import type {
  CaptureExportFormat,
  CaptureMessageRecord,
  CaptureSessionRecord,
  CreateCustomServiceInput,
  InterfaceLanguage,
  ProviderId,
  ProviderMoveDirection,
  ProviderRecord,
  RuntimeStatus,
  GeminiThemeDiagnosticReport,
  ServiceMoveDirection,
  ServiceRecord,
  ShellInfo,
} from '@amberkeeper/shared-types';
import type { DomSnapshotSeenSignal } from '@amberkeeper/capture-core';

declare global {
  interface Window {
    captureApi: {
      listSessions: () => Promise<CaptureSessionRecord[]>;
      listMessages: (sessionId: string) => Promise<CaptureMessageRecord[]>;
      openSession: (sessionId: string) => Promise<{ message: string; detail: string }>;
      deleteSession: (sessionId: string) => Promise<{ message: string; detail: string }>;
      exportSession: (
        sessionId: string,
        format: CaptureExportFormat
      ) => Promise<{ message: string; detail: string }>;
      exportProviderSessions: (
        providerId: ProviderId,
        format: CaptureExportFormat
      ) => Promise<{ message: string; detail: string }>;
      listServices: () => Promise<ServiceRecord[]>;
      getActiveService: () => Promise<ServiceRecord | null>;
      setActiveService: (serviceId: string) => Promise<ServiceRecord | null>;
      addCustomService: (input: CreateCustomServiceInput) => Promise<ServiceRecord | null>;
      removeCustomService: (serviceId: string) => Promise<void>;
      setServiceEnabled: (serviceId: string, enabled: boolean) => Promise<ServiceRecord | null>;
      moveService: (serviceId: string, direction: ServiceMoveDirection) => Promise<ServiceRecord[]>;
      updateCustomServiceIcon: (serviceId: string, iconUrl: string | null) => Promise<ServiceRecord | null>;
      discoverSiteIcon: (url: string) => Promise<string | null>;
      listProviders: () => Promise<ProviderRecord[]>;
      getActiveProvider: () => Promise<ProviderRecord | null>;
      setActiveProvider: (providerId: ProviderId) => Promise<ProviderRecord | null>;
      setProviderEnabled: (providerId: ProviderId, enabled: boolean) => Promise<ProviderRecord | null>;
      setProviderCacheEnabled: (providerId: ProviderId, cacheEnabled: boolean) => Promise<ProviderRecord | null>;
      moveProvider: (providerId: ProviderId, direction: ProviderMoveDirection) => Promise<ProviderRecord[]>;
      getShellInfo: () => Promise<ShellInfo>;
      setInterfaceLanguage: (language: InterfaceLanguage) => Promise<InterfaceLanguage>;
      setNativeStageVisible: (visible: boolean) => Promise<void>;
      getRuntimeStatus: () => Promise<RuntimeStatus>;
      triggerDomSnapshot: () => Promise<{ message: string; detail: string }>;
      runGeminiThemeDiagnostic: () => Promise<GeminiThemeDiagnosticReport>;
      onRuntimeStatus: (callback: (status: RuntimeStatus) => void) => () => void;
      openExternal: (url: string) => Promise<void>;
    };
    amberkeeperChatCapture?: {
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
