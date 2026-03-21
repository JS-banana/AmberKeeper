import { describe, expect, test } from 'vitest';
import {
  installPageNetworkCapture,
  PAGE_NETWORK_RELAY_BRIDGE,
  shouldRelayPageNetworkPayload,
} from '../src/preload/page-network-capture';

describe('page-network-capture', () => {
  test('exposes the AmberKeeper relay bridge name', () => {
    expect(PAGE_NETWORK_RELAY_BRIDGE).toBe('amberkeeperPageNetworkRelay');
  });

  test('relays DeepSeek history_messages GET responses', () => {
    expect(
      shouldRelayPageNetworkPayload({
        url: 'https://chat.deepseek.com/api/v0/chat/history_messages?chat_session_id=deepseek-conv-1',
        method: 'GET',
      })
    ).toBe(true);
  });

  test('ignores unrelated routes and providers', () => {
    expect(
      shouldRelayPageNetworkPayload({
        url: 'https://chat.deepseek.com/api/v0/users/current',
        method: 'GET',
      })
    ).toBe(false);
    expect(
      shouldRelayPageNetworkPayload({
        url: 'https://claude.ai/api/organizations',
        method: 'GET',
      })
    ).toBe(false);
  });

  test('defers injection until a DOM target becomes available', () => {
    const appendedScripts: Array<{ textContent: string }> = [];
    const listeners = new Map<string, EventListener[]>();
    const windowListeners = new Map<string, EventListener[]>();
    const fakeDocument = {
      head: null,
      body: null,
      documentElement: null as
        | (ParentNode & {
            dataset: Record<string, string>;
          })
        | null,
      createElement: () => ({
        textContent: '',
        remove() {},
      }),
      addEventListener(type: string, listener: EventListener) {
        listeners.set(type, [...(listeners.get(type) ?? []), listener]);
      },
      removeEventListener(type: string, listener: EventListener) {
        listeners.set(
          type,
          (listeners.get(type) ?? []).filter((entry) => entry !== listener)
        );
      },
    };
    const fakeWindow = {
      addEventListener(type: string, listener: EventListener) {
        windowListeners.set(type, [...(windowListeners.get(type) ?? []), listener]);
      },
      dispatchEvent() {
        return true;
      },
    };

    installPageNetworkCapture({
      relay() {},
      documentObject: fakeDocument as never,
      windowObject: fakeWindow as never,
    });

    expect(listeners.has('DOMContentLoaded')).toBe(true);

    const container = {
      dataset: {} as Record<string, string>,
      appendChild(script: { textContent: string }) {
        appendedScripts.push(script);
        return script;
      },
      querySelectorAll() {
        return [];
      },
    };
    fakeDocument.documentElement = container as never;

    listeners.get('DOMContentLoaded')?.forEach((listener) => {
      listener(new Event('DOMContentLoaded'));
    });

    expect(appendedScripts).toHaveLength(1);
    expect(container.dataset.amberkeeperPageNetworkCaptureInjected).toBe('true');
  });
});
