import { describe, expect, test } from 'vitest';
import { createCdpObserver } from '../src/main/runtime/cdp-observer';

describe('cdp-observer', () => {
  test('emits standardized request and response events', async () => {
    const emitted: string[] = [];
    const debuggerTarget = createFakeDebuggerTarget();
    const observer = createCdpObserver({
      debuggerTarget,
      provider: 'chatgpt',
      sourceSessionKey: 'chatgpt-primary-view',
      getCurrentUrl: () => 'https://chatgpt.com',
      onSignal(signal) {
        emitted.push(signal.kind);
      },
    });

    await observer.attach();

    debuggerTarget.emit('Network.requestWillBeSent', {
      requestId: 'req-1',
      request: {
        url: 'https://chatgpt.com/backend-api/f/conversation',
        method: 'POST',
        postData: '{"messages":[]}',
      },
      type: 'XHR',
    });
    debuggerTarget.emit('Network.responseReceived', {
      requestId: 'req-1',
      response: {
        url: 'https://chatgpt.com/backend-api/f/conversation',
        status: 200,
        mimeType: 'text/event-stream',
      },
    });

    expect(emitted).toContain('requestSeen');
    expect(emitted).toContain('responseMetaSeen');
  });
});

function createFakeDebuggerTarget() {
  const listeners = new Set<
    (event: unknown, method: string, params: Record<string, unknown>) => void | Promise<void>
  >();

  return {
    attached: false,
    commands: [] as Array<{ command: string; params?: Record<string, unknown> }>,
    isAttached() {
      return this.attached;
    },
    attach(_version: string) {
      this.attached = true;
    },
    async sendCommand(command: string, params?: Record<string, unknown>) {
      this.commands.push({ command, params });
      return { body: '', base64Encoded: false };
    },
    on(event: string, listener: (event: unknown, method: string, params: Record<string, unknown>) => void) {
      if (event === 'message') {
        listeners.add(listener);
      }
    },
    emit(method: string, params: Record<string, unknown>) {
      for (const listener of listeners) {
        void listener({}, method, params);
      }
    },
  };
}
