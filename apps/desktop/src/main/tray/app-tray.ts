import path from 'node:path';
import type { MenuItemConstructorOptions } from 'electron';
import { Menu, Tray, nativeImage } from 'electron';

export function resolveTrayIconPath(options: {
  currentDir: string;
  isPackaged: boolean;
  resourcesPath: string;
}): string {
  if (options.isPackaged) {
    return path.join(options.resourcesPath, 'build', 'icons', 'trayTemplate.png');
  }

  return path.resolve(options.currentDir, '../../build/icons/trayTemplate.png');
}

export function createAppTray(options: {
  trayIconPath: string;
  productName: string;
  platform?: NodeJS.Platform;
  onShow: () => void;
  onHide: () => void;
  onQuit: () => void;
  isWindowVisible: () => boolean;
}): Tray {
  const trayImage = nativeImage.createFromPath(options.trayIconPath);
  const platform = options.platform ?? process.platform;

  if (platform === 'darwin' && !trayImage.isEmpty()) {
    trayImage.setTemplateImage(true);
  }

  const tray = new Tray(trayImage);
  tray.setToolTip(options.productName);
  tray.setContextMenu(
    Menu.buildFromTemplate(buildTrayMenuTemplate(options.productName, options))
  );
  tray.on('click', () => {
    if (options.isWindowVisible()) {
      options.onHide();
    } else {
      options.onShow();
    }
  });

  return tray;
}

function buildTrayMenuTemplate(
  productName: string,
  options: {
    onShow: () => void;
    onHide: () => void;
    onQuit: () => void;
  }
): MenuItemConstructorOptions[] {
  return [
    {
      label: `Show ${productName}`,
      click: () => options.onShow(),
    },
    {
      label: `Hide ${productName}`,
      click: () => options.onHide(),
    },
    {
      type: 'separator',
    },
    {
      label: `Quit ${productName}`,
      click: () => options.onQuit(),
    },
  ];
}
