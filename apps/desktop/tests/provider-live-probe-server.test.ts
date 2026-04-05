import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';
import type { ProviderLiveProbeResult } from '@amberkeeper/shared-types';
import { createProviderLiveProbeServer } from '../src/main/runtime/provider-live-probe-server';

const tempDirs: string[] = [];

afterEach(() => {
  while (tempDirs.length > 0) {
    const tempDir = tempDirs.pop();
    if (tempDir) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  }
});

describe('provider-live-probe-server', () => {
  test('serves health and live-probe responses over localhost', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'amberkeeper-live-probe-'));
    tempDirs.push(tempDir);
    const manifestPath = path.join(tempDir, 'manifest.json');

    const server = createProviderLiveProbeServer({
      manifestPath,
      runProbe: async (request): Promise<ProviderLiveProbeResult> => ({
        providerId: request.providerId,
        kind: request.kind,
        outcome: 'passed',
        verdict: 'passed',
        ok: true,
        message: 'passed',
        remoteConversationId: 'conv-1',
        evidence: {
          preUrl: 'https://before.example',
          postUrl: 'https://after.example',
          sessionDelta: {
            beforeSessionCount: 0,
            afterSessionCount: 1,
            newSessionIds: ['session-1'],
            updatedSessionIds: [],
            remoteConversationIdsBefore: [],
            remoteConversationIdsAfter: ['conv-1'],
            messageDeltas: [],
          },
          attemptLogs: [],
          action: { ok: true },
          notes: [],
        },
      }),
    });

    const manifest = await server.start();
    expect(fs.existsSync(manifestPath)).toBe(true);

    const healthResponse = await fetch(`${manifest.baseUrl}/health`);
    const healthPayload = await healthResponse.json();
    expect(healthPayload.ok).toBe(true);
    expect(manifest.port).toBeGreaterThan(0);

    const probeResponse = await fetch(`${manifest.baseUrl}/live-probe`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        providerId: 'doubao',
        kind: 'new-message',
      }),
    });
    const probePayload = await probeResponse.json();
    expect(probePayload.ok).toBe(true);
    expect(probePayload.result.outcome).toBe('passed');

    await server.stop();
    expect(fs.existsSync(manifestPath)).toBe(false);
  });
});
