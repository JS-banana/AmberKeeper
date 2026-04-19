import { app } from 'electron';
import type {
  CaptureAttemptLogRecord,
  CaptureSessionRecord,
  ProviderId,
  ProviderLiveAutomationSpec,
} from '@amberkeeper/shared-types';
import {
  createProviderLiveAutomation,
  type ProviderLiveAutomationRuntime,
} from '../runtime/provider-live-automation';
import { createProviderLiveProbeServer } from '../runtime/provider-live-probe-server';

export function createLiveProbeService(options: {
  manifestPath: string;
  diagnosticsEnabled: () => boolean;
  recordAttempt: (input: {
    source: 'runtime';
    stage: string;
    status: 'info' | 'error';
    message: string;
    detail?: string | null;
    createdAt: string;
  }) => void;
  formatError: (error: unknown) => string;
  activateProvider: (providerId: ProviderId) => Promise<void> | void;
  resolveRuntime: (providerId: ProviderId) => ProviderLiveAutomationRuntime | null;
  getAutomationSpec: (providerId: ProviderId) => ProviderLiveAutomationSpec | null;
  listProviderSessions: (providerId: ProviderId) => CaptureSessionRecord[];
  listAttemptLogs: (limit?: number) => CaptureAttemptLogRecord[];
}) {
  const automation = createProviderLiveAutomation({
    activateProvider: options.activateProvider,
    resolveRuntime: options.resolveRuntime,
    getAutomationSpec: options.getAutomationSpec,
    listProviderSessions: options.listProviderSessions,
    listAttemptLogs: options.listAttemptLogs,
  });

  const probeServer = createProviderLiveProbeServer({
    manifestPath: options.manifestPath,
    runProbe: (request) => automation.runProbe(request),
    evaluatePage: (request) => automation.evaluatePage(request),
  });

  return {
    startIfEnabled(): void {
      if (!options.diagnosticsEnabled()) {
        return;
      }

      void probeServer
        .start()
        .then((manifest) => {
          options.recordAttempt({
            source: 'runtime',
            stage: 'live-probe-server',
            status: 'info',
            message: 'Started local provider live probe server.',
            detail: JSON.stringify(manifest),
            createdAt: new Date().toISOString(),
          });
        })
        .catch((error) => {
          options.recordAttempt({
            source: 'runtime',
            stage: 'live-probe-server',
            status: 'error',
            message: 'Failed to start local provider live probe server.',
            detail: options.formatError(error),
            createdAt: new Date().toISOString(),
          });
        });
    },

    attachAppLifecycle(): void {
      app.on('before-quit', () => {
        void probeServer.stop().catch(() => undefined);
      });
    },

    stop(): void {
      void probeServer.stop().catch(() => undefined);
    },
  };
}

export type LiveProbeService = ReturnType<typeof createLiveProbeService>;
