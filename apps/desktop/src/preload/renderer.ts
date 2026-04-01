import { contextBridge, ipcRenderer } from 'electron';
import type {
  CaptureMessageRecord,
  CaptureSessionRecord,
  ProviderId,
  ProviderMoveDirection,
  ProviderRecord,
  RuntimeStatus,
  ShellInfo,
} from '@amberkeeper/shared-types';

type RuntimeCallback = (status: RuntimeStatus) => void;

contextBridge.exposeInMainWorld('captureApi', {
  listSessions: () => ipcRenderer.invoke('capture:listSessions') as Promise<CaptureSessionRecord[]>,
  listMessages: (sessionId: string) =>
    ipcRenderer.invoke('capture:listMessages', sessionId) as Promise<CaptureMessageRecord[]>,
  openSession: (sessionId: string) =>
    ipcRenderer.invoke('capture:openSession', sessionId) as Promise<{ message: string; detail: string }>,
  listProviders: () => ipcRenderer.invoke('providers:list') as Promise<ProviderRecord[]>,
  getActiveProvider: () => ipcRenderer.invoke('providers:getActive') as Promise<ProviderRecord | null>,
  setActiveProvider: (providerId: ProviderId) =>
    ipcRenderer.invoke('providers:setActive', providerId) as Promise<ProviderRecord | null>,
  setProviderEnabled: (providerId: ProviderId, enabled: boolean) =>
    ipcRenderer.invoke('providers:setEnabled', providerId, enabled) as Promise<ProviderRecord | null>,
  moveProvider: (providerId: ProviderId, direction: ProviderMoveDirection) =>
    ipcRenderer.invoke('providers:move', providerId, direction) as Promise<ProviderRecord[]>,
  getShellInfo: () => ipcRenderer.invoke('shell:getInfo') as Promise<ShellInfo>,
  setNativeStageVisible: (visible: boolean) =>
    ipcRenderer.invoke('shell:setNativeStageVisible', visible) as Promise<void>,
  getRuntimeStatus: () => ipcRenderer.invoke('capture:getRuntimeStatus') as Promise<RuntimeStatus>,
  triggerDomSnapshot: () =>
    ipcRenderer.invoke('capture:triggerDomSnapshot') as Promise<{ message: string; detail: string }>,
  onRuntimeStatus: (callback: RuntimeCallback) => {
    const listener = (_event: Electron.IpcRendererEvent, payload: RuntimeStatus) => callback(payload);
    ipcRenderer.on('capture:runtime-status', listener);
    return () => {
      ipcRenderer.removeListener('capture:runtime-status', listener);
    };
  },
});
