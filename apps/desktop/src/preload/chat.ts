import { contextBridge, ipcRenderer } from 'electron';
import {
  AMBERKEEPER_CHAT_CAPTURE_COMMAND_CHANNEL,
  AMBERKEEPER_CHAT_CAPTURE_KEY,
  AMBERKEEPER_CHAT_CAPTURE_RESULT_CHANNEL,
  AMBERKEEPER_CHAT_CAPTURE_WORLD_ID,
  type ChatCaptureCommandKind,
} from '../shared/chat-capture-bridge';
import { createChatCaptureApi } from './provider-chat-capture';

applyPageLocaleOverride();

function publishPageContext() {
  ipcRenderer.send('chat:page-context', {
    url: location.href,
    title: document.title,
  });
}

window.addEventListener('load', publishPageContext);
window.addEventListener('popstate', publishPageContext);
setInterval(publishPageContext, 2000);

const chatCaptureApi = createChatCaptureApi({
  getUrl: () => location.href,
  getTitle: () => document.title,
  getCapturedAt: () => new Date().toISOString(),
  root: document,
});

contextBridge.exposeInMainWorld(AMBERKEEPER_CHAT_CAPTURE_KEY, chatCaptureApi);
contextBridge.exposeInIsolatedWorld(
  AMBERKEEPER_CHAT_CAPTURE_WORLD_ID,
  AMBERKEEPER_CHAT_CAPTURE_KEY,
  chatCaptureApi
);

ipcRenderer.on(
  AMBERKEEPER_CHAT_CAPTURE_COMMAND_CHANNEL,
  (
    _event,
    payload: {
      requestId?: string;
      kind?: ChatCaptureCommandKind;
    }
  ) => {
    const requestId = payload?.requestId;
    if (!requestId) {
      return;
    }

    try {
      const result =
        payload.kind === 'snapshot-dom'
          ? chatCaptureApi.snapshotDom()
          : chatCaptureApi.snapshotSignal();

      ipcRenderer.send(AMBERKEEPER_CHAT_CAPTURE_RESULT_CHANNEL, {
        requestId,
        ok: true,
        payload: result,
      });
    } catch (error) {
      ipcRenderer.send(AMBERKEEPER_CHAT_CAPTURE_RESULT_CHANNEL, {
        requestId,
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
);

function applyPageLocaleOverride(): void {
  const config = readInterfaceLocaleConfig();
  if (!config) {
    return;
  }

  contextBridge.executeInMainWorld({
    func: (locale: string, languages: string[]) => {
      const nextLanguages =
        Array.isArray(languages) && languages.length > 0 ? [...languages] : [locale];
      const defineGetter = (target: object, key: string, value: unknown) => {
        try {
          Object.defineProperty(target, key, {
            configurable: true,
            enumerable: true,
            get: () => value,
          });
        } catch {
          // Ignore sites that lock down descriptors.
        }
      };

      defineGetter(Navigator.prototype, 'language', locale);
      defineGetter(Navigator.prototype, 'languages', Object.freeze(nextLanguages));

      const originalResolvedOptions =
        (globalThis as typeof globalThis & {
          __amberkeeperOriginalDateTimeFormatResolvedOptions?: typeof Intl.DateTimeFormat.prototype.resolvedOptions;
        }).__amberkeeperOriginalDateTimeFormatResolvedOptions ??
        Intl.DateTimeFormat.prototype.resolvedOptions;

      (globalThis as typeof globalThis & {
        __amberkeeperOriginalDateTimeFormatResolvedOptions?: typeof Intl.DateTimeFormat.prototype.resolvedOptions;
      }).__amberkeeperOriginalDateTimeFormatResolvedOptions = originalResolvedOptions;

      Intl.DateTimeFormat.prototype.resolvedOptions = function (
        this: Intl.DateTimeFormat,
        ...args: []
      ) {
        const result = originalResolvedOptions.apply(this, args);
        return {
          ...result,
          locale,
        };
      };

      document.documentElement?.setAttribute('lang', locale);
    },
    args: [config.locale, config.languages],
  });
}

function readInterfaceLocaleConfig():
  | {
      locale: string;
      languages: string[];
    }
  | null {
  const raw = ipcRenderer.sendSync('settings:getInterfaceLocaleConfig') as
    | {
        locale?: unknown;
        languages?: unknown;
      }
    | null
    | undefined;

  if (!raw || typeof raw.locale !== 'string' || !raw.locale.trim()) {
    return null;
  }

  const languages = Array.isArray(raw.languages)
    ? raw.languages.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)
    : [];

  return {
    locale: raw.locale,
    languages,
  };
}
