import { ipcMain, shell } from 'electron';
import type {
  CaptureExportMessageScope,
  CaptureSaveScope,
  CreateCustomServiceInput,
} from '@amberkeeper/shared-types';

export function registerCaptureIpc(options: {
  listSessions: () => unknown[];
  listMessages: (sessionId: string) => unknown[];
  openSession: (sessionId: string) => Promise<{ message: string; detail: string }>;
  deleteSession: (sessionId: string) => Promise<{ message: string; detail: string }>;
  exportSession: (sessionId: string, format: 'json' | 'markdown', messageScope?: CaptureExportMessageScope) => Promise<{ message: string; detail: string }>;
  exportProviderSessions: (providerId: string, format: 'json' | 'markdown', messageScope?: CaptureExportMessageScope) => Promise<{ message: string; detail: string }>;
  exportAllSessions: (format: 'json' | 'markdown', messageScope?: CaptureExportMessageScope) => Promise<{ message: string; detail: string }>;
  listServices: () => unknown[];
  getActiveService: () => unknown;
  setActiveService: (serviceId: string) => unknown;
  addCustomService: (input: CreateCustomServiceInput) => unknown;
  removeCustomService: (serviceId: string) => void;
  setServiceEnabled: (serviceId: string, enabled: boolean) => unknown;
  moveService: (serviceId: string, direction: 'up' | 'down') => unknown;
  updateCustomServiceIcon: (serviceId: string, iconUrl: string | null) => unknown;
  discoverSiteIcon: (url: string) => Promise<string | null>;
  listProviders: () => unknown[];
  getActiveProvider: () => unknown;
  setActiveProvider: (providerId: string) => unknown;
  setProviderEnabled: (providerId: string, enabled: boolean) => unknown;
  setProviderCacheEnabled: (providerId: string, cacheEnabled: boolean) => unknown;
  moveProvider: (providerId: string, direction: 'up' | 'down') => unknown;
  getShellInfo: () => unknown;
  setInterfaceLanguage: (language: string) => unknown;
  getInterfaceLocaleConfig: () => { locale: string; languages: string[] };
  setNativeStageVisible: (visible: boolean) => void;
  getRuntimeStatus: () => unknown;
  triggerDomSnapshot: () => Promise<{ message: string; detail: string }>;
  runGeminiThemeDiagnostic: () => Promise<unknown>;
  onPageContext: (payload: { url?: string; title?: string }) => void;
}): void {
  ipcMain.handle('capture:listSessions', () => options.listSessions());
  ipcMain.handle('capture:listMessages', (_event, sessionId: string) => options.listMessages(sessionId));
  ipcMain.handle('capture:openSession', (_event, sessionId: string) => options.openSession(sessionId));
  ipcMain.handle('capture:deleteSession', (_event, sessionId: string) => options.deleteSession(sessionId));
  ipcMain.handle('capture:exportSession', (_event, sessionId: string, format: 'json' | 'markdown', messageScope?: CaptureExportMessageScope) =>
    options.exportSession(sessionId, format, messageScope)
  );
  ipcMain.handle(
    'capture:exportProviderSessions',
    (_event, providerId: string, format: 'json' | 'markdown', messageScope?: CaptureExportMessageScope) =>
      options.exportProviderSessions(providerId, format, messageScope)
  );
  ipcMain.handle('capture:exportAllSessions', (_event, format: 'json' | 'markdown', messageScope?: CaptureExportMessageScope) =>
    options.exportAllSessions(format, messageScope)
  );
  ipcMain.handle('services:list', () => options.listServices());
  ipcMain.handle('services:getActive', () => options.getActiveService());
  ipcMain.handle('services:setActive', (_event, serviceId: string) => options.setActiveService(serviceId));
  ipcMain.handle('services:addCustom', (_event, input: CreateCustomServiceInput) =>
    options.addCustomService(input)
  );
  ipcMain.handle('services:removeCustom', (_event, serviceId: string) => {
    options.removeCustomService(serviceId);
  });
  ipcMain.handle('services:setEnabled', (_event, serviceId: string, enabled: boolean) =>
    options.setServiceEnabled(serviceId, enabled)
  );
  ipcMain.handle('services:move', (_event, serviceId: string, direction: 'up' | 'down') =>
    options.moveService(serviceId, direction)
  );
  ipcMain.handle('services:updateCustomIcon', (_event, serviceId: string, iconUrl: string | null) =>
    options.updateCustomServiceIcon(serviceId, iconUrl)
  );
  ipcMain.handle('services:discoverIcon', (_event, url: string) => options.discoverSiteIcon(url));
  ipcMain.handle('providers:list', () => options.listProviders());
  ipcMain.handle('providers:getActive', () => options.getActiveProvider());
  ipcMain.handle('providers:setActive', (_event, providerId: string) => options.setActiveProvider(providerId));
  ipcMain.handle('providers:setEnabled', (_event, providerId: string, enabled: boolean) =>
    options.setProviderEnabled(providerId, enabled)
  );
  ipcMain.handle('providers:setCacheEnabled', (_event, providerId: string, cacheEnabled: boolean) =>
    options.setProviderCacheEnabled(providerId, cacheEnabled)
  );
  ipcMain.handle('providers:move', (_event, providerId: string, direction: 'up' | 'down') =>
    options.moveProvider(providerId, direction)
  );
  ipcMain.handle('shell:getInfo', () => options.getShellInfo());
  ipcMain.handle('settings:setInterfaceLanguage', (_event, language: string) =>
    options.setInterfaceLanguage(language)
  );
  ipcMain.on('settings:getInterfaceLocaleConfig', (event) => {
    event.returnValue = options.getInterfaceLocaleConfig();
  });
  ipcMain.handle('shell:setNativeStageVisible', (_event, visible: boolean) => {
    options.setNativeStageVisible(visible);
  });
  ipcMain.handle('capture:getRuntimeStatus', () => options.getRuntimeStatus());
  ipcMain.handle('capture:triggerDomSnapshot', () => options.triggerDomSnapshot());
  ipcMain.handle('capture:runGeminiThemeDiagnostic', () => options.runGeminiThemeDiagnostic());
  ipcMain.on('chat:page-context', (_event, payload: { url?: string; title?: string }) => {
    options.onPageContext(payload);
  });
  ipcMain.handle('shell:openExternal', (_event, url: string) => shell.openExternal(url));
}
