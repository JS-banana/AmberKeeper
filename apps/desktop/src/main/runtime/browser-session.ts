import type { DomSnapshotSeenSignal } from '@amberkeeper/capture-core';
import type { InterfaceLanguage, ProviderId } from '@amberkeeper/shared-types';
import { randomUUID } from 'node:crypto';
import { ipcMain, shell, WebContentsView } from 'electron';
import type { HandlerDetails } from 'electron/main';
import {
  AMBERKEEPER_CHAT_CAPTURE_COMMAND_CHANNEL,
  AMBERKEEPER_CHAT_CAPTURE_KEY,
  AMBERKEEPER_CHAT_CAPTURE_RESULT_CHANNEL,
  AMBERKEEPER_CHAT_CAPTURE_WORLD_ID,
  type ChatCaptureCommandKind,
} from '../../shared/chat-capture-bridge';
import { createSerializedNavigationExecutor } from './navigation-queue';

export type BrowserSessionProviderId = ProviderId;

export interface BrowserSessionConfig {
  id: string;
  name: string;
  homeUrl: string;
  partition: string;
  sourceSessionKey: string;
}

// Keep legacy AnyChat partitions for the first AmberKeeper standalone release.
export const BUILT_IN_BROWSER_SESSION_CONFIGS: readonly BrowserSessionConfig[] = [
  {
    id: 'chatgpt',
    name: 'ChatGPT',
    homeUrl: 'https://chatgpt.com',
    partition: 'persist:anychat-chatgpt',
    sourceSessionKey: 'chatgpt-primary-view',
  },
  {
    id: 'claude',
    name: 'Claude',
    homeUrl: 'https://claude.ai',
    partition: 'persist:anychat-claude',
    sourceSessionKey: 'claude-primary-view',
  },
  {
    id: 'deepseek',
    name: 'DeepSeek',
    homeUrl: 'https://chat.deepseek.com/',
    partition: 'persist:anychat-deepseek',
    sourceSessionKey: 'deepseek-primary-view',
  },
  {
    id: 'gemini',
    name: 'Gemini',
    homeUrl: 'https://gemini.google.com/app',
    partition: 'persist:anychat-gemini',
    sourceSessionKey: 'gemini-primary-view',
  },
  {
    id: 'grok',
    name: 'Grok',
    homeUrl: 'https://grok.com',
    partition: 'persist:anychat-grok',
    sourceSessionKey: 'grok-primary-view',
  },
  {
    id: 'kimi',
    name: 'Kimi',
    homeUrl: 'https://www.kimi.com/',
    partition: 'persist:anychat-kimi',
    sourceSessionKey: 'kimi-primary-view',
  },
  {
    id: 'qianwen',
    name: 'Qianwen',
    homeUrl: 'https://www.qianwen.com',
    partition: 'persist:anychat-qianwen',
    sourceSessionKey: 'qianwen-primary-view',
  },
  {
    id: 'doubao',
    name: 'Doubao',
    homeUrl: 'https://www.doubao.com/chat',
    partition: 'persist:anychat-doubao',
    sourceSessionKey: 'doubao-primary-view',
  },
  {
    id: 'xiaomi-aistudio',
    name: 'MiMo',
    homeUrl: 'https://aistudio.xiaomimimo.com/#/c',
    partition: 'persist:anychat-xiaomi-aistudio',
    sourceSessionKey: 'xiaomi-aistudio-primary-view',
  },
] as const;

const PROVIDER_CONFIGS: Record<BrowserSessionProviderId, BrowserSessionConfig> = {
  chatgpt: {
    id: 'chatgpt',
    name: 'ChatGPT',
    homeUrl: 'https://chatgpt.com',
    partition: 'persist:anychat-chatgpt',
    sourceSessionKey: 'chatgpt-primary-view',
  },
  claude: {
    id: 'claude',
    name: 'Claude',
    homeUrl: 'https://claude.ai',
    partition: 'persist:anychat-claude',
    sourceSessionKey: 'claude-primary-view',
  },
  deepseek: {
    id: 'deepseek',
    name: 'DeepSeek',
    homeUrl: 'https://chat.deepseek.com/',
    partition: 'persist:anychat-deepseek',
    sourceSessionKey: 'deepseek-primary-view',
  },
  gemini: {
    id: 'gemini',
    name: 'Gemini',
    homeUrl: 'https://gemini.google.com/app',
    partition: 'persist:anychat-gemini',
    sourceSessionKey: 'gemini-primary-view',
  },
  grok: {
    id: 'grok',
    name: 'Grok',
    homeUrl: 'https://grok.com',
    partition: 'persist:anychat-grok',
    sourceSessionKey: 'grok-primary-view',
  },
  kimi: {
    id: 'kimi',
    name: 'Kimi',
    homeUrl: 'https://www.kimi.com/',
    partition: 'persist:anychat-kimi',
    sourceSessionKey: 'kimi-primary-view',
  },
  qianwen: {
    id: 'qianwen',
    name: 'Qianwen',
    homeUrl: 'https://www.qianwen.com',
    partition: 'persist:anychat-qianwen',
    sourceSessionKey: 'qianwen-primary-view',
  },
  doubao: {
    id: 'doubao',
    name: 'Doubao',
    homeUrl: 'https://www.doubao.com/chat',
    partition: 'persist:anychat-doubao',
    sourceSessionKey: 'doubao-primary-view',
  },
  'xiaomi-aistudio': {
    id: 'xiaomi-aistudio',
    name: 'MiMo',
    homeUrl: 'https://aistudio.xiaomimimo.com/#/c',
    partition: 'persist:anychat-xiaomi-aistudio',
    sourceSessionKey: 'xiaomi-aistudio-primary-view',
  },
};

export function resolveBrowserSessionConfig(providerId: BrowserSessionProviderId): BrowserSessionConfig {
  return PROVIDER_CONFIGS[providerId];
}

export function listBuiltInBrowserSessionConfigs(): BrowserSessionConfig[] {
  return BUILT_IN_BROWSER_SESSION_CONFIGS.map((config) => ({ ...config }));
}

export function buildCustomBrowserSessionConfig(input: {
  id: string;
  name: string;
  launchUrl: string;
}): BrowserSessionConfig {
  return {
    id: input.id,
    name: input.name,
    homeUrl: input.launchUrl,
    partition: `persist:amberkeeper-custom-${sanitizeBrowserSessionId(input.id)}`,
    sourceSessionKey: `${sanitizeBrowserSessionId(input.id)}-primary-view`,
  };
}

export interface BrowserSessionRuntime {
  config: BrowserSessionConfig;
  view: WebContentsView;
  loadInitialUrl: () => Promise<void>;
  loadUrl: (url: string) => Promise<void>;
  executeJavaScript: <TResult = unknown>(code: string, userGesture?: boolean) => Promise<TResult>;
  runDomSnapshot: () => Promise<{ message: string; detail: string }>;
  readStructuredDomSnapshot: (
    fallbackUrl: string
  ) => Promise<{
    url: string;
    title: string;
    messages: Array<{ role?: string; content?: string }>;
  }>;
  dispose: () => void;
}

type UserAgentWebContents = {
  getUserAgent: () => string;
  setUserAgent: (userAgent: string, acceptLanguages?: string) => void;
};

function sanitizeBrowserSessionId(value: string): string {
  return value.replace(/[^a-zA-Z0-9-]/g, '-');
}

type StructuredSnapshotResult = {
  url?: string;
  title?: string;
  messages?: Array<{ role?: string; content?: string }>;
};

export function createBrowserSessionRuntime(options: {
  providerId: BrowserSessionProviderId;
  chatPreloadPath: string;
  onUrlChanged: (url: string) => void;
  interfaceLanguage?: InterfaceLanguage;
  systemLocale?: string;
}): BrowserSessionRuntime {
  const config = resolveBrowserSessionConfig(options.providerId);
  return createBrowserSessionRuntimeWithConfig({
    config,
    chatPreloadPath: options.chatPreloadPath,
    onUrlChanged: options.onUrlChanged,
    interfaceLanguage: options.interfaceLanguage,
    systemLocale: options.systemLocale,
  });
}

export function createBrowserSessionRuntimeWithConfig(options: {
  config: BrowserSessionConfig;
  chatPreloadPath: string;
  onUrlChanged: (url: string) => void;
  interfaceLanguage?: InterfaceLanguage;
  systemLocale?: string;
}): BrowserSessionRuntime {
  const config = options.config;
  const view = new WebContentsView({
    webPreferences: {
      ...buildRemoteContentWebPreferences({
        preloadPath: options.chatPreloadPath,
        partition: config.partition,
      }),
    },
  });
  applyInterfaceLanguageToWebContents(
    view.webContents,
    options.interfaceLanguage ?? 'system',
    options.systemLocale ?? 'en-US'
  );
  view.setBackgroundColor('#ffffff');

  view.webContents.on('did-finish-load', () => {
    void view.webContents.insertCSS('html { color-scheme: light !important; }');
  });

  view.webContents.on('preload-error', (_event, preloadPath, error) => {
    console.error(`[browser-session:${config.id}] preload error in ${preloadPath}:`, error);
  });

  view.webContents.on('did-navigate', (_event, url) => {
    options.onUrlChanged(url);
  });

  view.webContents.on('did-navigate-in-page', (_event, url) => {
    options.onUrlChanged(url);
  });

  view.webContents.setWindowOpenHandler((details) =>
    buildPopupHandler(details, {
      partition: config.partition,
      chatPreloadPath: options.chatPreloadPath,
      openExternal: shell.openExternal,
    })
  );

  const navigate = createSerializedNavigationExecutor(async (url) => {
    await view.webContents.loadURL(url);
  });

  return {
    config,
    view,
    loadInitialUrl: async () => {
      await navigate(config.homeUrl);
    },
    loadUrl: async (url: string) => {
      await navigate(url);
    },
    executeJavaScript: async <TResult = unknown>(code: string, userGesture = true) =>
      (await view.webContents.executeJavaScript(code, userGesture)) as TResult,
    runDomSnapshot: async () => {
      const raw =
        (await requestChatCapturePayload<{ message?: string; detail?: string }>(
          view.webContents,
          'snapshot-dom'
        )) ??
        (await executeChatCaptureScript(
          view.webContents,
          `
            (async () => {
              const capture = globalThis.${AMBERKEEPER_CHAT_CAPTURE_KEY};
              if (!capture?.snapshotDom) {
                return { message: 'Chat preload snapshot API unavailable.', detail: '' };
              }
              return capture.snapshotDom();
            })();
          `,
          true
        ));

      return {
        message: (raw as { message?: string } | undefined)?.message ?? 'DOM snapshot completed.',
        detail: (raw as { detail?: string } | undefined)?.detail ?? '',
      };
    },
    readStructuredDomSnapshot: async (fallbackUrl: string) => {
      const raw = ((await requestChatCapturePayload<
        StructuredSnapshotResult | Partial<DomSnapshotSeenSignal>
      >(view.webContents, 'snapshot-structured')) ??
        (await executeChatCaptureScript(
          view.webContents,
          `
            (async () => {
              const capture = globalThis.${AMBERKEEPER_CHAT_CAPTURE_KEY};
              if (capture?.snapshotSignal) {
                return capture.snapshotSignal();
              }
              if (!capture?.snapshotMessages) {
                return { url: location.href, title: document.title, messages: [] };
              }
              return capture.snapshotMessages();
            })();
          `,
          true
        ))) as
        | StructuredSnapshotResult
        | Partial<DomSnapshotSeenSignal>
        | undefined;
      const pageUrl =
        raw && typeof raw === 'object' && 'pageUrl' in raw && typeof raw.pageUrl === 'string'
          ? raw.pageUrl
          : undefined;
      const url =
        raw && typeof raw === 'object' && 'url' in raw && typeof raw.url === 'string'
          ? raw.url
          : undefined;

      return {
        url: pageUrl ?? url ?? fallbackUrl,
        title: raw?.title ?? '',
        messages: Array.isArray(raw?.messages) ? raw.messages : [],
      };
    },
    dispose: () => {
      if (!view.webContents.isDestroyed()) {
        view.webContents.close();
      }
    },
  };
}

type ChatCaptureWebContents = {
  executeJavaScript: (code: string, userGesture?: boolean) => Promise<unknown>;
  executeJavaScriptInIsolatedWorld?: (
    worldId: number,
    scripts: Array<{ code: string }>,
    userGesture?: boolean
  ) => Promise<unknown>;
};

export async function executeChatCaptureScript<TResult = unknown>(
  webContents: ChatCaptureWebContents,
  code: string,
  userGesture = true
): Promise<TResult> {
  if (typeof webContents.executeJavaScriptInIsolatedWorld === 'function') {
    try {
      return (await webContents.executeJavaScriptInIsolatedWorld(
        AMBERKEEPER_CHAT_CAPTURE_WORLD_ID,
        [{ code }],
        userGesture
      )) as TResult;
    } catch {
      // Fall back to the page world for tests, mocks, and any non-isolated
      // bridge environments.
    }
  }

  return (await webContents.executeJavaScript(code, userGesture)) as TResult;
}

export function resolveEffectiveInterfaceLocale(
  interfaceLanguage: InterfaceLanguage,
  systemLocale: string
): string {
  const requestedLocale = interfaceLanguage === 'system' ? systemLocale : interfaceLanguage;
  const normalized = normalizeLocaleTag(requestedLocale);

  if (normalized) {
    return normalized;
  }

  return interfaceLanguage === 'zh-CN' ? 'zh-CN' : 'en-US';
}

export function resolveAcceptLanguagesForInterfaceLanguage(
  interfaceLanguage: InterfaceLanguage,
  systemLocale: string
): string {
  const candidates = resolveLocalePreferenceChain(interfaceLanguage, systemLocale);

  return candidates
    .map((locale, index) => {
      if (index === 0) {
        return locale;
      }

      const quality = Math.max(0.1, 1 - index * 0.1).toFixed(1);
      return `${locale};q=${quality}`;
    })
    .join(',');
}

export function applyInterfaceLanguageToWebContents(
  webContents: UserAgentWebContents,
  interfaceLanguage: InterfaceLanguage,
  systemLocale: string
): string {
  const acceptLanguages = resolveAcceptLanguagesForInterfaceLanguage(
    interfaceLanguage,
    systemLocale
  );
  webContents.setUserAgent(webContents.getUserAgent(), acceptLanguages);
  return acceptLanguages;
}

export function resolveLocalePreferenceChain(
  interfaceLanguage: InterfaceLanguage,
  systemLocale: string
): string[] {
  const effectiveLocale = resolveEffectiveInterfaceLocale(interfaceLanguage, systemLocale);
  return dedupeLocaleChain([effectiveLocale, ...fallbackLocalesFor(effectiveLocale)]);
}

const CHAT_CAPTURE_COMMAND_TIMEOUT_MS = 2_500;

async function requestChatCapturePayload<TResult>(
  webContents: ChatCaptureWebContents & {
    id?: number;
    send?: (channel: string, payload: unknown) => void;
  },
  kind: ChatCaptureCommandKind
): Promise<TResult | null> {
  if (typeof webContents.send !== 'function' || typeof webContents.id !== 'number') {
    return null;
  }

  const requestId = randomUUID();
  const send = webContents.send.bind(webContents);

  return await new Promise<TResult | null>((resolve) => {
    const timeout = setTimeout(() => {
      cleanup();
      resolve(null);
    }, CHAT_CAPTURE_COMMAND_TIMEOUT_MS);

    const cleanup = () => {
      clearTimeout(timeout);
      ipcMain.off(AMBERKEEPER_CHAT_CAPTURE_RESULT_CHANNEL, onResponse);
    };

    const onResponse = (
      event: Electron.IpcMainEvent,
      payload?: {
        requestId?: string;
        ok?: boolean;
        payload?: TResult;
      }
    ) => {
      if (event.sender.id !== webContents.id || payload?.requestId !== requestId) {
        return;
      }

      cleanup();
      resolve(payload?.ok === false ? null : (payload?.payload ?? null));
    };

    ipcMain.on(AMBERKEEPER_CHAT_CAPTURE_RESULT_CHANNEL, onResponse);
    send(AMBERKEEPER_CHAT_CAPTURE_COMMAND_CHANNEL, { requestId, kind });
  });
}

export function buildPopupHandler(
  details: Pick<HandlerDetails, 'url' | 'disposition'>,
  options: {
    partition: string;
    chatPreloadPath: string;
    openExternal?: (url: string) => Promise<void> | void;
  }
) {
  if (shouldOpenPopupExternally(details)) {
    void Promise.resolve((options.openExternal ?? shell.openExternal)(details.url)).catch(
      (error) => {
        console.error(`[browser-session] failed to open external link: ${details.url}`, error);
      }
    );
    return { action: 'deny' as const };
  }

  return {
    action: 'allow' as const,
    overrideBrowserWindowOptions: {
      width: 520,
      height: 720,
      title: 'AmberKeeper Auth',
      webPreferences: {
        ...buildRemoteContentWebPreferences({
          preloadPath: options.chatPreloadPath,
          partition: options.partition,
        }),
      },
    },
  };
}

function shouldOpenPopupExternally(
  details: Pick<HandlerDetails, 'url' | 'disposition'>
): boolean {
  if (details.disposition !== 'foreground-tab' && details.disposition !== 'background-tab') {
    return false;
  }

  try {
    const protocol = new URL(details.url).protocol;
    return protocol === 'http:' || protocol === 'https:';
  } catch {
    return false;
  }
}

export function buildRemoteContentWebPreferences(options: {
  preloadPath: string;
  partition: string;
}) {
  return {
    partition: options.partition,
    contextIsolation: true,
    sandbox: true,
    preload: options.preloadPath,
    nodeIntegration: false,
    webSecurity: true,
    webviewTag: false,
  };
}

function normalizeLocaleTag(locale: string | null | undefined): string | null {
  const trimmed = locale?.trim();
  if (!trimmed) {
    return null;
  }

  const normalized = trimmed.replace(/_/g, '-');

  try {
    return new Intl.Locale(normalized).toString();
  } catch {
    return normalized;
  }
}

function fallbackLocalesFor(locale: string): string[] {
  const lowerLocale = locale.toLowerCase();

  if (lowerLocale.startsWith('zh')) {
    return ['zh-CN', 'zh', 'en-US', 'en'];
  }

  if (lowerLocale.startsWith('en')) {
    return ['en-US', 'en', 'zh-CN', 'zh'];
  }

  const language = locale.split('-')[0] ?? locale;
  return [language, 'en-US', 'en', 'zh-CN', 'zh'];
}

function dedupeLocaleChain(locales: string[]): string[] {
  const seen = new Set<string>();
  const resolved: string[] = [];

  for (const locale of locales) {
    const normalized = normalizeLocaleTag(locale);
    if (!normalized) {
      continue;
    }

    const key = normalized.toLowerCase();
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    resolved.push(normalized);
  }

  return resolved;
}
