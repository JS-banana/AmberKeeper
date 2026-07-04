import { expect, test } from 'vitest';
import { resolveShellRuntimeByWebContentsId } from '../src/main/runtime/shell-runtime-coordination';

test('resolves shell runtime by sender webContents id instead of active provider', () => {
  const chatgptRuntime = buildRuntime('chatgpt', 1);
  const qianwenRuntime = buildRuntime('qianwen', 2);

  expect(
    resolveShellRuntimeByWebContentsId({
      runtimeRegistry: {
        listResolvedRuntimes: () => [chatgptRuntime, qianwenRuntime],
        getActiveRuntime: () => chatgptRuntime,
      },
      customRuntimeRegistry: null,
      webContentsId: 2,
    })
  ).toBe(qianwenRuntime);
});

function buildRuntime(providerId: string, webContentsId: number) {
  return {
    serviceId: providerId,
    providerId,
    view: {
      webContents: {
        id: webContentsId,
      },
    },
    browserSession: {},
    cdpObserver: null,
    currentUrl: '',
  };
}
