import { ipcMain } from 'electron';

export function registerCaptureIpc(options: {
  listSessions: () => unknown[];
  listMessages: (sessionId: string) => unknown[];
  openSession: (sessionId: string) => Promise<{ message: string; detail: string }>;
  deleteSession: (sessionId: string) => Promise<{ message: string; detail: string }>;
  exportSession: (sessionId: string, format: 'json' | 'markdown') => Promise<{ message: string; detail: string }>;
  exportProviderSessions: (providerId: string, format: 'json' | 'markdown') => Promise<{ message: string; detail: string }>;
  listProviders: () => unknown[];
  getActiveProvider: () => unknown;
  setActiveProvider: (providerId: string) => unknown;
  setProviderEnabled: (providerId: string, enabled: boolean) => unknown;
  moveProvider: (providerId: string, direction: 'up' | 'down') => unknown;
  getShellInfo: () => unknown;
  setNativeStageVisible: (visible: boolean) => void;
  getRuntimeStatus: () => unknown;
  triggerDomSnapshot: () => Promise<{ message: string; detail: string }>;
  onPageContext: (payload: { url?: string; title?: string }) => void;
}): void {
  ipcMain.handle('capture:listSessions', () => options.listSessions());
  ipcMain.handle('capture:listMessages', (_event, sessionId: string) => options.listMessages(sessionId));
  ipcMain.handle('capture:openSession', (_event, sessionId: string) => options.openSession(sessionId));
  ipcMain.handle('capture:deleteSession', (_event, sessionId: string) => options.deleteSession(sessionId));
  ipcMain.handle('capture:exportSession', (_event, sessionId: string, format: 'json' | 'markdown') =>
    options.exportSession(sessionId, format)
  );
  ipcMain.handle(
    'capture:exportProviderSessions',
    (_event, providerId: string, format: 'json' | 'markdown') =>
      options.exportProviderSessions(providerId, format)
  );
  ipcMain.handle('providers:list', () => options.listProviders());
  ipcMain.handle('providers:getActive', () => options.getActiveProvider());
  ipcMain.handle('providers:setActive', (_event, providerId: string) => options.setActiveProvider(providerId));
  ipcMain.handle('providers:setEnabled', (_event, providerId: string, enabled: boolean) =>
    options.setProviderEnabled(providerId, enabled)
  );
  ipcMain.handle('providers:move', (_event, providerId: string, direction: 'up' | 'down') =>
    options.moveProvider(providerId, direction)
  );
  ipcMain.handle('shell:getInfo', () => options.getShellInfo());
  ipcMain.handle('shell:setNativeStageVisible', (_event, visible: boolean) => {
    options.setNativeStageVisible(visible);
  });
  ipcMain.handle('capture:getRuntimeStatus', () => options.getRuntimeStatus());
  ipcMain.handle('capture:triggerDomSnapshot', () => options.triggerDomSnapshot());
  ipcMain.on('chat:page-context', (_event, payload: { url?: string; title?: string }) => {
    options.onPageContext(payload);
  });
}
