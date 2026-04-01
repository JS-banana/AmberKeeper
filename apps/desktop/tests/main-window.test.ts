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

import { createMainWindow } from '../src/main/windows/main-window';

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
