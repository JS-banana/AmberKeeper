import { beforeEach, expect, test, vi } from 'vitest';

const { loadURL, loadFile, browserWindowMock } = vi.hoisted(() => ({
  loadURL: vi.fn(),
  loadFile: vi.fn(),
  browserWindowMock: vi.fn(function BrowserWindowMock(this: {
    loadURL?: typeof loadURL;
    loadFile?: typeof loadFile;
  }) {
    this.loadURL = loadURL;
    this.loadFile = loadFile;
  }),
}));

vi.mock('electron', () => ({
  app: {
    isPackaged: true,
  },
  BrowserWindow: browserWindowMock,
  WebContentsView: class {},
}));

import {
  buildMainRendererWebPreferences,
  createMainWindow,
  createProviderStageController,
} from '../src/main/windows/main-window';

beforeEach(() => {
  loadURL.mockReset();
  loadFile.mockReset();
  browserWindowMock.mockClear();
});

test('creates the main window without showing a centered product title', () => {
  createMainWindow({
    rendererPreloadPath: '/tmp/renderer.mjs',
    rendererHtmlPath: '/tmp/index.html',
  });

  expect(browserWindowMock).toHaveBeenCalledWith(
    expect.objectContaining({
      titleBarStyle: 'hiddenInset',
    })
  );
});

test('hardens the main renderer with sandboxed isolated preload access', () => {
  expect(buildMainRendererWebPreferences('/tmp/renderer.mjs')).toEqual({
    preload: '/tmp/renderer.mjs',
    contextIsolation: true,
    sandbox: false,
    nodeIntegration: false,
    webSecurity: true,
    webviewTag: false,
  });
});

test('detaches removed stage views from the content view', () => {
  const addChildView = vi.fn();
  const removeChildView = vi.fn();
  const mainWindow = {
    contentView: {
      addChildView,
      removeChildView,
    },
    getContentBounds: () => ({
      width: 1440,
      height: 900,
    }),
    on: vi.fn(),
  } as never;
  const controller = createProviderStageController(mainWindow, 420);
  const view = {
    setBounds: vi.fn(),
  } as never;

  controller.sync([{ providerId: 'chatgpt', view }], 'chatgpt');
  controller.detach(view);

  expect(addChildView).toHaveBeenCalledWith(view);
  expect(removeChildView).toHaveBeenCalledWith(view);
});
