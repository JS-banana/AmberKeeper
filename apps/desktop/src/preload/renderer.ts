import { contextBridge, ipcRenderer } from 'electron';
import type {
  ChatDataLocationActionResult,
  ChatDataLocationState,
  CaptureExportFormat,
  CaptureExportMessageScope,
  CaptureMessageRecord,
  CaptureSaveScope,
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

type RuntimeCallback = (status: RuntimeStatus) => void;

contextBridge.exposeInMainWorld('captureApi', {
  listSessions: () => ipcRenderer.invoke('capture:listSessions') as Promise<CaptureSessionRecord[]>,
  listMessages: (sessionId: string) =>
    ipcRenderer.invoke('capture:listMessages', sessionId) as Promise<CaptureMessageRecord[]>,
  openSession: (sessionId: string) =>
    ipcRenderer.invoke('capture:openSession', sessionId) as Promise<{ message: string; detail: string }>,
  deleteSession: (sessionId: string) =>
    ipcRenderer.invoke('capture:deleteSession', sessionId) as Promise<{ message: string; detail: string }>,
  exportSession: (sessionId: string, format: CaptureExportFormat, messageScope: CaptureExportMessageScope = 'complete') =>
    ipcRenderer.invoke('capture:exportSession', sessionId, format, messageScope) as Promise<{ message: string; detail: string }>,
  exportProviderSessions: (providerId: ProviderId, format: CaptureExportFormat, messageScope: CaptureExportMessageScope = 'complete') =>
    ipcRenderer.invoke('capture:exportProviderSessions', providerId, format, messageScope) as Promise<{ message: string; detail: string }>,
  exportAllSessions: (format: CaptureExportFormat, messageScope: CaptureExportMessageScope = 'complete') =>
    ipcRenderer.invoke('capture:exportAllSessions', format, messageScope) as Promise<{ message: string; detail: string }>,
  listServices: () => ipcRenderer.invoke('services:list') as Promise<ServiceRecord[]>,
  getActiveService: () => ipcRenderer.invoke('services:getActive') as Promise<ServiceRecord | null>,
  setActiveService: (serviceId: string) =>
    ipcRenderer.invoke('services:setActive', serviceId) as Promise<ServiceRecord | null>,
  addCustomService: (input: CreateCustomServiceInput) =>
    ipcRenderer.invoke('services:addCustom', input) as Promise<ServiceRecord | null>,
  removeCustomService: (serviceId: string) =>
    ipcRenderer.invoke('services:removeCustom', serviceId) as Promise<void>,
  setServiceEnabled: (serviceId: string, enabled: boolean) =>
    ipcRenderer.invoke('services:setEnabled', serviceId, enabled) as Promise<ServiceRecord | null>,
  moveService: (serviceId: string, direction: ServiceMoveDirection) =>
    ipcRenderer.invoke('services:move', serviceId, direction) as Promise<ServiceRecord[]>,
  updateCustomServiceIcon: (serviceId: string, iconUrl: string | null) =>
    ipcRenderer.invoke('services:updateCustomIcon', serviceId, iconUrl) as Promise<ServiceRecord | null>,
  discoverSiteIcon: (url: string) =>
    ipcRenderer.invoke('services:discoverIcon', url) as Promise<string | null>,
  listProviders: () => ipcRenderer.invoke('providers:list') as Promise<ProviderRecord[]>,
  getActiveProvider: () => ipcRenderer.invoke('providers:getActive') as Promise<ProviderRecord | null>,
  setActiveProvider: (providerId: ProviderId) =>
    ipcRenderer.invoke('providers:setActive', providerId) as Promise<ProviderRecord | null>,
  setProviderEnabled: (providerId: ProviderId, enabled: boolean) =>
    ipcRenderer.invoke('providers:setEnabled', providerId, enabled) as Promise<ProviderRecord | null>,
  setProviderCacheEnabled: (providerId: ProviderId, cacheEnabled: boolean) =>
    ipcRenderer.invoke('providers:setCacheEnabled', providerId, cacheEnabled) as Promise<ProviderRecord | null>,
  moveProvider: (providerId: ProviderId, direction: ProviderMoveDirection) =>
    ipcRenderer.invoke('providers:move', providerId, direction) as Promise<ProviderRecord[]>,
  getShellInfo: () => ipcRenderer.invoke('shell:getInfo') as Promise<ShellInfo>,
  setInterfaceLanguage: (language: InterfaceLanguage) =>
    ipcRenderer.invoke('settings:setInterfaceLanguage', language) as Promise<InterfaceLanguage>,
  setCaptureSaveScope: (saveScope: CaptureSaveScope) =>
    ipcRenderer.invoke('settings:setCaptureSaveScope', saveScope) as Promise<CaptureSaveScope>,
  getChatDataLocation: () =>
    ipcRenderer.invoke('settings:getChatDataLocation') as Promise<ChatDataLocationState>,
  chooseChatDataLocation: () =>
    ipcRenderer.invoke('settings:chooseChatDataLocation') as Promise<ChatDataLocationActionResult>,
  restoreDefaultChatDataLocation: () =>
    ipcRenderer.invoke('settings:restoreDefaultChatDataLocation') as Promise<ChatDataLocationActionResult>,
  setNativeStageVisible: (visible: boolean) =>
    ipcRenderer.invoke('shell:setNativeStageVisible', visible) as Promise<void>,
  getRuntimeStatus: () => ipcRenderer.invoke('capture:getRuntimeStatus') as Promise<RuntimeStatus>,
  triggerDomSnapshot: () =>
    ipcRenderer.invoke('capture:triggerDomSnapshot') as Promise<{ message: string; detail: string }>,
  runGeminiThemeDiagnostic: () =>
    ipcRenderer.invoke('capture:runGeminiThemeDiagnostic') as Promise<GeminiThemeDiagnosticReport>,
  onRuntimeStatus: (callback: RuntimeCallback) => {
    const listener = (_event: Electron.IpcRendererEvent, payload: RuntimeStatus) => callback(payload);
    ipcRenderer.on('capture:runtime-status', listener);
    return () => {
      ipcRenderer.removeListener('capture:runtime-status', listener);
    };
  },
  openExternal: (url: string) => ipcRenderer.invoke('shell:openExternal', url) as Promise<void>,
});
