import { app, BrowserWindow } from 'electron';

export function registerAppLifecycle(options: {
  onReady: () => void | Promise<void>;
  onWindowAllClosed: () => void;
  onActivate: () => void;
}): void {
  app.whenReady().then(options.onReady);
  app.on('window-all-closed', options.onWindowAllClosed);
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      options.onActivate();
    }
  });
}
