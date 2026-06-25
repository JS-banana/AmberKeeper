import type { MenuItemConstructorOptions } from 'electron';
import { app, Menu, shell } from 'electron';

const PROJECT_URL = 'https://github.com/JS-banana/amberkeeper';

export function installApplicationMenu(options: {
  productName: string;
  isPackaged?: boolean;
  platform?: NodeJS.Platform;
}): void {
  app.setName(options.productName);
  Menu.setApplicationMenu(
    Menu.buildFromTemplate(
      buildApplicationMenuTemplate({
        productName: options.productName,
        isPackaged: options.isPackaged ?? app.isPackaged,
        platform: options.platform ?? process.platform,
      })
    )
  );
}

function buildApplicationMenuTemplate(options: {
  productName: string;
  isPackaged: boolean;
  platform: NodeJS.Platform;
}): MenuItemConstructorOptions[] {
  return [
    buildAppMenu(options.productName, options.platform),
    buildEditMenu(),
    buildViewMenu(options.isPackaged),
    buildWindowMenu(options.platform),
    buildHelpMenu(),
  ];
}

function buildAppMenu(productName: string, platform: NodeJS.Platform): MenuItemConstructorOptions {
  return {
    label: productName,
    submenu:
      platform === 'darwin'
        ? [
            { label: `About ${productName}`, role: 'about' },
            { type: 'separator' },
            { label: `Hide ${productName}`, role: 'hide' },
            { label: 'Hide Others', role: 'hideOthers' },
            { label: 'Show All', role: 'unhide' },
            { type: 'separator' },
            { label: `Quit ${productName}`, role: 'quit' },
          ]
        : [
            { label: `About ${productName}`, role: 'about' },
            { type: 'separator' },
            { label: `Quit ${productName}`, role: 'quit' },
          ],
  };
}

function buildEditMenu(): MenuItemConstructorOptions {
  return {
    label: 'Edit',
    submenu: [
      { label: 'Undo', role: 'undo' },
      { label: 'Redo', role: 'redo' },
      { type: 'separator' },
      { label: 'Cut', role: 'cut' },
      { label: 'Copy', role: 'copy' },
      { label: 'Paste', role: 'paste' },
      { label: 'Select All', role: 'selectAll' },
    ],
  };
}

function buildViewMenu(isPackaged: boolean): MenuItemConstructorOptions {
  return {
    label: 'View',
    submenu: [
      ...(isPackaged
        ? []
        : [
            { label: 'Reload', role: 'reload' as const },
            { label: 'Force Reload', role: 'forceReload' as const },
            { label: 'Toggle Developer Tools', role: 'toggleDevTools' as const },
            { type: 'separator' as const },
          ]),
      { label: 'Actual Size', role: 'resetZoom' },
      { label: 'Zoom In', role: 'zoomIn' },
      { label: 'Zoom Out', role: 'zoomOut' },
      { type: 'separator' },
      { label: 'Toggle Full Screen', role: 'togglefullscreen' },
    ],
  };
}

function buildWindowMenu(platform: NodeJS.Platform): MenuItemConstructorOptions {
  return {
    label: 'Window',
    submenu: [
      { label: 'Minimize', role: 'minimize' },
      { label: 'Zoom', role: 'zoom' },
      ...(platform === 'darwin'
        ? [
            { type: 'separator' as const },
            { label: 'Bring All to Front', role: 'front' as const },
          ]
        : []),
    ],
  };
}

function buildHelpMenu(): MenuItemConstructorOptions {
  return {
    label: 'Help',
    submenu: [
      {
        label: 'GitHub Repository',
        click: () => {
          void shell.openExternal(PROJECT_URL);
        },
      },
    ],
  };
}
