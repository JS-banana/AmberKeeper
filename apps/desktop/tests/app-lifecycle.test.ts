import { beforeEach, expect, test, vi } from 'vitest';

const {
  activateHandlers,
  whenReady,
  on,
  getAllWindows,
  setPath,
  getPath,
} = vi.hoisted(() => {
  const activateHandlers: Array<() => void> = [];
  const whenReady = vi.fn(() => Promise.resolve());
  const setPath = vi.fn();
  const getPath = vi.fn(() => '/tmp/appData');
  const on = vi.fn((event: string, handler: () => void) => {
    if (event === 'activate') {
      activateHandlers.push(handler);
    }
  });
  const getAllWindows = vi.fn(() => []);

  return {
    activateHandlers,
    whenReady,
    on,
    getAllWindows,
    setPath,
    getPath,
  };
});

vi.mock('electron', () => ({
  app: {
    whenReady,
    on,
    setPath,
    getPath,
  },
  BrowserWindow: {
    getAllWindows,
  },
}));

import { registerAppLifecycle } from '../src/main/bootstrap/app';

beforeEach(() => {
  activateHandlers.length = 0;
  whenReady.mockClear();
  on.mockClear();
  setPath.mockClear();
  getPath.mockClear();
  getAllWindows.mockClear();
});

test('always forwards macOS activate events so hidden windows can be restored from Dock', async () => {
  const onReady = vi.fn();
  const onWindowAllClosed = vi.fn();
  const onActivate = vi.fn();

  registerAppLifecycle({
    onReady,
    onWindowAllClosed,
    onActivate,
  });

  expect(whenReady).toHaveBeenCalledTimes(1);
  expect(on).toHaveBeenCalledWith('window-all-closed', onWindowAllClosed);
  expect(on).toHaveBeenCalledWith('activate', onActivate);

  activateHandlers.forEach((handler) => handler());
  expect(onActivate).toHaveBeenCalledTimes(1);
});
