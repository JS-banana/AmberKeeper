import { app, BrowserWindow } from 'electron';
import { configureLegacyCompatibleUserDataPath } from './storage-compat';

export function registerAppLifecycle(options: {
  onReady: () => void | Promise<void>;
  onWindowAllClosed: () => void;
  onActivate: () => void;
}): void {
  // Keep the legacy storage root for the first AmberKeeper standalone release.
  configureLegacyCompatibleUserDataPath(app);
  app.whenReady().then(options.onReady);
  app.on('window-all-closed', options.onWindowAllClosed);
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      options.onActivate();
    }
  });
}
