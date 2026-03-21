import { describe, expect, test } from 'vitest';
import { createSerializedNavigationExecutor } from '../src/main/runtime/navigation-queue';

describe('navigation-queue', () => {
  test('serializes overlapping navigation requests on the same runtime', async () => {
    const starts: string[] = [];
    const finishes: string[] = [];
    let releaseHome!: () => void;
    const homeDone = new Promise<void>((resolve) => {
      releaseHome = resolve;
    });

    const runNavigation = createSerializedNavigationExecutor(async (url) => {
      starts.push(url);

      if (url === 'https://claude.ai') {
        await homeDone;
      }

      finishes.push(url);
    });

    const homeNavigation = runNavigation('https://claude.ai');
    const chatNavigation = runNavigation('https://claude.ai/chat/conv-1');

    await Promise.resolve();
    expect(starts).toEqual(['https://claude.ai']);
    expect(finishes).toEqual([]);

    releaseHome();
    await homeNavigation;
    await chatNavigation;

    expect(starts).toEqual(['https://claude.ai', 'https://claude.ai/chat/conv-1']);
    expect(finishes).toEqual(['https://claude.ai', 'https://claude.ai/chat/conv-1']);
  });

  test('continues processing queued navigation after a failed request', async () => {
    const starts: string[] = [];
    const runNavigation = createSerializedNavigationExecutor(async (url) => {
      starts.push(url);

      if (url === 'https://claude.ai') {
        throw new Error('ERR_CONNECTION_CLOSED');
      }
    });

    await expect(runNavigation('https://claude.ai')).rejects.toThrow('ERR_CONNECTION_CLOSED');
    await expect(runNavigation('https://claude.ai/chat/conv-1')).resolves.toBeUndefined();

    expect(starts).toEqual(['https://claude.ai', 'https://claude.ai/chat/conv-1']);
  });
});
