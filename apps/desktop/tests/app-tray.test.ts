import { beforeEach, expect, test, vi } from 'vitest';

const {
  buildFromTemplate,
  createFromPath,
  setTemplateImage,
  trayMock,
  trayHandlers,
  traySetContextMenu,
  traySetToolTip,
} = vi.hoisted(() => {
  const trayHandlers = new Map<string, () => void>();
  const setTemplateImage = vi.fn();
  const traySetToolTip = vi.fn();
  const traySetContextMenu = vi.fn();
  const buildFromTemplate = vi.fn((template) => template);
  const createFromPath = vi.fn(() => ({
    isEmpty: () => false,
    setTemplateImage,
  }));
  const trayMock = vi.fn(function TrayMock(this: {
    setToolTip?: typeof traySetToolTip;
    setContextMenu?: typeof traySetContextMenu;
    on?: (event: string, handler: () => void) => void;
  }) {
    this.setToolTip = traySetToolTip;
    this.setContextMenu = traySetContextMenu;
    this.on = (event, handler) => {
      trayHandlers.set(event, handler);
    };
  });

  return {
    buildFromTemplate,
    createFromPath,
    setTemplateImage,
    trayMock,
    trayHandlers,
    traySetContextMenu,
    traySetToolTip,
  };
});

vi.mock('electron', () => ({
  Menu: {
    buildFromTemplate,
  },
  Tray: trayMock,
  nativeImage: {
    createFromPath,
  },
}));

import { createAppTray, resolveTrayIconPath } from '../src/main/tray/app-tray';

beforeEach(() => {
  trayHandlers.clear();
  buildFromTemplate.mockClear();
  createFromPath.mockClear();
  setTemplateImage.mockClear();
  trayMock.mockClear();
  traySetContextMenu.mockClear();
  traySetToolTip.mockClear();
});

test('resolves tray icon paths for development and packaged apps', () => {
  expect(
    resolveTrayIconPath({
      currentDir: '/repo/apps/desktop/out/main',
      isPackaged: false,
      resourcesPath: '/ignored',
    })
  ).toBe('/repo/apps/desktop/build/icons/trayTemplate.png');

  expect(
    resolveTrayIconPath({
      currentDir: '/repo/apps/desktop/out/main',
      isPackaged: true,
      resourcesPath: '/AmberKeeper.app/Contents/Resources',
    })
  ).toBe('/AmberKeeper.app/Contents/Resources/build/icons/trayTemplate.png');
});

test('creates a template tray icon on macOS and toggles window visibility on click', () => {
  const onShow = vi.fn();
  const onHide = vi.fn();
  let visible = false;

  createAppTray({
    trayIconPath: '/tmp/trayTemplate.png',
    productName: 'AmberKeeper',
    platform: 'darwin',
    onShow,
    onHide,
    onQuit: vi.fn(),
    isWindowVisible: () => visible,
  });

  expect(createFromPath).toHaveBeenCalledWith('/tmp/trayTemplate.png');
  expect(setTemplateImage).toHaveBeenCalledWith(true);
  expect(traySetToolTip).toHaveBeenCalledWith('AmberKeeper');
  expect(buildFromTemplate).toHaveBeenCalledWith(
    expect.arrayContaining([
      expect.objectContaining({ label: 'Show AmberKeeper' }),
      expect.objectContaining({ label: 'Hide AmberKeeper' }),
      expect.objectContaining({ label: 'Quit AmberKeeper' }),
    ])
  );

  trayHandlers.get('click')?.();
  expect(onShow).toHaveBeenCalledTimes(1);
  expect(onHide).not.toHaveBeenCalled();

  visible = true;
  trayHandlers.get('click')?.();
  expect(onHide).toHaveBeenCalledTimes(1);
});
