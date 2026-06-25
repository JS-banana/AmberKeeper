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
  resolveClosePromptAction,
  resolveMainWindowCloseBehavior,
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

test('resolves close behavior by platform and quit state', () => {
  expect(resolveMainWindowCloseBehavior({ platform: 'darwin', isAppQuitting: false })).toBe(
    'hide'
  );
  expect(resolveMainWindowCloseBehavior({ platform: 'win32', isAppQuitting: false })).toBe(
    'prompt'
  );
  expect(resolveMainWindowCloseBehavior({ platform: 'linux', isAppQuitting: false })).toBe(
    'prompt'
  );
  expect(resolveMainWindowCloseBehavior({ platform: 'win32', isAppQuitting: true })).toBe(
    'close'
  );
});

test('maps close prompt button responses to window actions', () => {
  expect(resolveClosePromptAction(0)).toBe('hide');
  expect(resolveClosePromptAction(1)).toBe('quit');
  expect(resolveClosePromptAction(2)).toBe('cancel');
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
    isDestroyed: () => false,
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

test('skips detaching views after the browser window has already been destroyed', () => {
  const addChildView = vi.fn();
  const removeChildView = vi.fn();
  let destroyed = false;
  const listeners = new Map<string, () => void>();
  const mainWindow = {
    contentView: {
      addChildView,
      removeChildView,
    },
    getContentBounds: () => ({
      width: 1440,
      height: 900,
    }),
    isDestroyed: () => destroyed,
    on: vi.fn((event: string, handler: () => void) => {
      listeners.set(event, handler);
    }),
  } as never;
  const controller = createProviderStageController(mainWindow, 420);
  const view = {
    setBounds: vi.fn(),
  } as never;

  controller.sync([{ providerId: 'chatgpt', view }], 'chatgpt');
  destroyed = true;
  listeners.get('closed')?.();

  expect(() => controller.detach(view)).not.toThrow();
  expect(removeChildView).not.toHaveBeenCalled();
});
