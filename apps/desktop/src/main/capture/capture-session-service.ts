import type {
  CaptureExportFormat,
  CaptureExportMessageScope,
  ProviderId,
} from '@amberkeeper/shared-types';
import type { CaptureStore } from '../storage/capture-store';

export function createCaptureSessionService(options: {
  getCaptureStore: () => CaptureStore | null;
  publishRuntimeStatus: () => void;
  saveExportArtifact: (artifact: ReturnType<CaptureStore['exportSession']>) => Promise<string>;
}) {
  return {
    async deleteSession(sessionId: string): Promise<{ message: string; detail: string }> {
      const captureStore = options.getCaptureStore();
      if (!captureStore) {
        throw new Error('Capture store is not ready yet.');
      }

      captureStore.deleteSession(sessionId);
      options.publishRuntimeStatus();

      return {
        message: '已删除该会话的本地缓存。',
        detail: `session=${sessionId}`,
      };
    },

    async exportSession(
      sessionId: string,
      format: CaptureExportFormat,
      messageScope: CaptureExportMessageScope = 'complete'
    ): Promise<{ message: string; detail: string }> {
      const captureStore = options.getCaptureStore();
      if (!captureStore) {
        throw new Error('Capture store is not ready yet.');
      }

      const artifact = captureStore.exportSession(sessionId, format, messageScope);
      const savedPath = await options.saveExportArtifact(artifact);
      return {
        message: '已导出当前会话。',
        detail: savedPath,
      };
    },

    async exportProviderSessions(
      providerId: ProviderId,
      format: CaptureExportFormat,
      messageScope: CaptureExportMessageScope = 'complete'
    ): Promise<{ message: string; detail: string }> {
      const captureStore = options.getCaptureStore();
      if (!captureStore) {
        throw new Error('Capture store is not ready yet.');
      }

      const artifact = captureStore.exportProviderSessions(providerId, format, messageScope);
      const savedPath = await options.saveExportArtifact(artifact);
      return {
        message: '已导出当前 provider 的会话档案。',
        detail: savedPath,
      };
    },
    async exportAllSessions(
      format: CaptureExportFormat,
      messageScope: CaptureExportMessageScope = 'complete'
    ): Promise<{ message: string; detail: string }> {
      const captureStore = options.getCaptureStore();
      if (!captureStore) {
        throw new Error('Capture store is not ready yet.');
      }

      const artifact = captureStore.exportAllSessions(format, messageScope);
      const savedPath = await options.saveExportArtifact(artifact);
      return {
        message: '已导出全部会话档案。',
        detail: savedPath,
      };
    },
  };
}
