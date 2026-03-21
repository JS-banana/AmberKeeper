import type { RuntimeSignal } from '@anychat/capture-core';
import type { ProviderId } from '@anychat/shared-types';

export interface DebuggerTarget {
  isAttached(): boolean;
  attach(version: string): void;
  sendCommand(command: string, params?: Record<string, unknown>): Promise<unknown>;
  on(
    event: 'message',
    listener: (event: unknown, method: string, params: Record<string, unknown>) => void | Promise<void>
  ): void;
}

export function createCdpObserver(options: {
  debuggerTarget: DebuggerTarget;
  provider: ProviderId;
  sourceSessionKey: string;
  getCurrentUrl: () => string;
  onSignal: (signal: RuntimeSignal) => void | Promise<void>;
}) {
  let listenerRegistered = false;

  const handleMessage = async (
    _event: unknown,
    method: string,
    params: Record<string, unknown>
  ): Promise<void> => {
    if (method === 'Network.requestWillBeSent') {
      const request = params.request as
        | {
            url?: string;
            method?: string;
            postData?: string;
          }
        | undefined;

      if (!request?.url) {
        return;
      }

      await options.onSignal({
        kind: 'requestSeen',
        provider: options.provider,
        source: 'cdp-network',
        sourceSessionKey: options.sourceSessionKey,
        pageUrl: options.getCurrentUrl(),
        capturedAt: new Date().toISOString(),
        requestId: String(params.requestId),
        url: request.url,
        method: request.method ?? 'GET',
        postData: request.postData,
        resourceType: String(params.type ?? 'Other'),
      });
      return;
    }

    if (method === 'Network.responseReceived') {
      const response = params.response as
        | {
            url?: string;
            status?: number;
            mimeType?: string;
          }
        | undefined;

      if (!response?.url) {
        return;
      }

      await options.onSignal({
        kind: 'responseMetaSeen',
        provider: options.provider,
        source: 'cdp-network',
        sourceSessionKey: options.sourceSessionKey,
        pageUrl: options.getCurrentUrl(),
        capturedAt: new Date().toISOString(),
        requestId: String(params.requestId),
        url: response.url,
        status: response.status ?? null,
        mimeType: response.mimeType ?? null,
      });
      return;
    }

    if (method === 'Network.webSocketCreated') {
      await options.onSignal({
        kind: 'websocketSeen',
        provider: options.provider,
        source: 'cdp-network',
        sourceSessionKey: options.sourceSessionKey,
        pageUrl: options.getCurrentUrl(),
        capturedAt: new Date().toISOString(),
        url: String(params.url ?? ''),
      });
      return;
    }

    if (method !== 'Network.loadingFinished') {
      return;
    }

    const requestId = String(params.requestId ?? '');
    if (!requestId) {
      return;
    }

    try {
      const response = (await options.debuggerTarget.sendCommand('Network.getResponseBody', {
        requestId,
      })) as {
        body?: string;
        base64Encoded?: boolean;
      };

      await options.onSignal({
        kind: 'responseBodySeen',
        provider: options.provider,
        source: 'cdp-network',
        sourceSessionKey: options.sourceSessionKey,
        pageUrl: options.getCurrentUrl(),
        capturedAt: new Date().toISOString(),
        requestId,
        body: response.body ?? '',
        base64Encoded: response.base64Encoded ?? false,
      });
    } catch (error) {
      await options.onSignal({
        kind: 'responseBodyFailed',
        provider: options.provider,
        source: 'cdp-network',
        sourceSessionKey: options.sourceSessionKey,
        pageUrl: options.getCurrentUrl(),
        capturedAt: new Date().toISOString(),
        requestId,
        error,
      });
    }
  };

  return {
    async attach(): Promise<void> {
      if (!options.debuggerTarget.isAttached()) {
        options.debuggerTarget.attach('1.3');
      }

      await options.debuggerTarget.sendCommand('Network.enable');

      if (!listenerRegistered) {
        options.debuggerTarget.on('message', handleMessage);
        listenerRegistered = true;
      }
    },
    isAttached(): boolean {
      return options.debuggerTarget.isAttached();
    },
  };
}
