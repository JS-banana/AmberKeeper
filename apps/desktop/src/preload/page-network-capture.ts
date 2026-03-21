export interface RelayedPageNetworkPayload {
  url: string;
  method: string;
  status: number | null;
  body: string;
}

interface PageNetworkCaptureDocumentLike {
  head?: ParentNode | null;
  body?: ParentNode | null;
  documentElement?: (ParentNode & { dataset?: Record<string, string | undefined> }) | null;
  createElement: (tagName: string) => { textContent: string; remove: () => void };
  addEventListener?: (type: string, listener: EventListener) => void;
  removeEventListener?: (type: string, listener: EventListener) => void;
}

interface PageNetworkCaptureWindowLike {
  addEventListener: (type: string, listener: EventListener) => void;
  removeEventListener?: (type: string, listener: EventListener) => void;
}

const PAGE_NETWORK_CAPTURE_DATASET_FLAG = 'amberkeeperPageNetworkCaptureInjected';
export const PAGE_NETWORK_RELAY_BRIDGE = 'amberkeeperPageNetworkRelay';
const PAGE_NETWORK_CAPTURE_EVENT = 'amberkeeper:page-network-payload';
const DEEPSEEK_HISTORY_PATH = '/api/v0/chat/history_messages';

export function shouldRelayPageNetworkPayload(input: {
  url: string;
  method: string;
}): boolean {
  const parsed = safeParseUrl(input.url);
  if (!parsed) {
    return false;
  }

  return (
    input.method.toUpperCase() === 'GET' &&
    isDeepSeekHost(parsed.hostname) &&
    parsed.pathname === DEEPSEEK_HISTORY_PATH
  );
}

export function installPageNetworkCapture(input: {
  relay: (payload: RelayedPageNetworkPayload) => void;
  windowObject?: PageNetworkCaptureWindowLike;
  documentObject?: PageNetworkCaptureDocumentLike;
}): void {
  const windowObject = input.windowObject ?? window;
  const documentObject = input.documentObject ?? document;

  windowObject.addEventListener(PAGE_NETWORK_CAPTURE_EVENT, (event) => {
    const detail = (event as CustomEvent<Partial<RelayedPageNetworkPayload>>).detail;
    if (!detail?.url || !detail?.method || typeof detail.body !== 'string') {
      return;
    }

    const payload: RelayedPageNetworkPayload = {
      url: detail.url,
      method: detail.method,
      status: typeof detail.status === 'number' ? detail.status : null,
      body: detail.body,
    };

    if (!shouldRelayPageNetworkPayload(payload)) {
      return;
    }

    input.relay(payload);
  });

  if (injectPageNetworkCaptureScript(documentObject, PAGE_NETWORK_CAPTURE_EVENT)) {
    return;
  }

  const retryInjection = () => {
    if (!injectPageNetworkCaptureScript(documentObject, PAGE_NETWORK_CAPTURE_EVENT)) {
      return;
    }

    documentObject.removeEventListener?.('DOMContentLoaded', retryInjection);
    windowObject.removeEventListener?.('load', retryInjection);
  };

  documentObject.addEventListener?.('DOMContentLoaded', retryInjection);
  windowObject.addEventListener('load', retryInjection);
}

function injectPageNetworkCaptureScript(
  documentObject: PageNetworkCaptureDocumentLike,
  eventName: string
): boolean {
  if (documentObject.documentElement?.dataset?.[PAGE_NETWORK_CAPTURE_DATASET_FLAG] === 'true') {
    return true;
  }

  const target =
    documentObject.head ?? documentObject.documentElement ?? documentObject.body ?? null;
  if (!target) {
    return false;
  }

  if (documentObject.documentElement?.dataset) {
    documentObject.documentElement.dataset[PAGE_NETWORK_CAPTURE_DATASET_FLAG] = 'true';
  }

  const script = documentObject.createElement('script');
  script.textContent = buildPageNetworkCaptureScript(eventName);
  target.appendChild(script as never);
  script.remove();
  return true;
}

function buildPageNetworkCaptureScript(eventName: string): string {
  return `
    (() => {
      if (window.__amberkeeperPageNetworkCaptureInstalled) {
        return;
      }

      window.__amberkeeperPageNetworkCaptureInstalled = true;
      const eventName = ${JSON.stringify(eventName)};
      const historyPath = ${JSON.stringify(DEEPSEEK_HISTORY_PATH)};

      const isDeepSeekHost = (hostname) =>
        hostname === 'chat.deepseek.com' || hostname.endsWith('.deepseek.com');

      const shouldCapture = (url, method) => {
        try {
          const parsed = new URL(url, location.href);
          return method.toUpperCase() === 'GET' && isDeepSeekHost(parsed.hostname) && parsed.pathname === historyPath;
        } catch {
          return false;
        }
      };

      const dispatchPayload = (payload) => {
        try {
          if (window.${PAGE_NETWORK_RELAY_BRIDGE} && typeof window.${PAGE_NETWORK_RELAY_BRIDGE}.send === 'function') {
            window.${PAGE_NETWORK_RELAY_BRIDGE}.send(payload);
            return;
          }
        } catch {}

        window.dispatchEvent(new CustomEvent(eventName, { detail: payload }));
      };

      try {
        const currentUrl = new URL(location.href);
        if (isDeepSeekHost(currentUrl.hostname)) {
          dispatchPayload({
            url: currentUrl.origin + historyPath + '?chat_session_id=amberkeeper-relay-probe',
            method: 'GET',
            status: 299,
            body: '{"probe":true}',
          });
        }
      } catch {}

      const originalFetch = window.fetch.bind(window);
      window.fetch = async function amberkeeperCapturedFetch(input, init) {
        const response = await originalFetch(input, init);

        try {
          const requestUrl =
            typeof input === 'string' ? input : input && typeof input.url === 'string' ? input.url : response.url;
          const requestMethod =
            typeof init?.method === 'string'
              ? init.method
              : input && typeof input.method === 'string'
                ? input.method
                : 'GET';
          const resolvedUrl = new URL(response.url || requestUrl, location.href).toString();

          if (shouldCapture(resolvedUrl, requestMethod)) {
            dispatchPayload({
              url: resolvedUrl,
              method: String(requestMethod).toUpperCase(),
              status: Number.isFinite(response.status) ? response.status : null,
              body: await response.clone().text(),
            });
          }
        } catch {}

        return response;
      };

      const originalOpen = XMLHttpRequest.prototype.open;
      const originalSend = XMLHttpRequest.prototype.send;

      XMLHttpRequest.prototype.open = function amberkeeperCapturedOpen(method, url, ...args) {
        this.__amberkeeperMethod = typeof method === 'string' ? method : 'GET';
        this.__amberkeeperUrl = typeof url === 'string' ? url : String(url);
        return originalOpen.call(this, method, url, ...args);
      };

      XMLHttpRequest.prototype.send = function amberkeeperCapturedSend(...args) {
        this.addEventListener(
          'loadend',
          function amberkeeperCapturedLoadEnd() {
            try {
              const requestMethod =
                typeof this.__amberkeeperMethod === 'string' ? this.__amberkeeperMethod : 'GET';
              const resolvedUrl = new URL(
                this.responseURL || this.__amberkeeperUrl || '',
                location.href
              ).toString();

              if (shouldCapture(resolvedUrl, requestMethod)) {
                dispatchPayload({
                  url: resolvedUrl,
                  method: String(requestMethod).toUpperCase(),
                  status: Number.isFinite(this.status) ? this.status : null,
                  body: typeof this.responseText === 'string' ? this.responseText : '',
                });
              }
            } catch {}
          },
          { once: true }
        );

        return originalSend.apply(this, args);
      };
    })();
  `;
}

function safeParseUrl(input: string): URL | null {
  try {
    return new URL(input);
  } catch {
    return null;
  }
}

function isDeepSeekHost(hostname: string): boolean {
  return hostname === 'chat.deepseek.com' || hostname.endsWith('.deepseek.com');
}
