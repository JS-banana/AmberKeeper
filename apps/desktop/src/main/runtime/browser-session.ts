import type { DomSnapshotSeenSignal } from '@amberkeeper/capture-core';
import type { ProviderId } from '@amberkeeper/shared-types';
import { WebContentsView } from 'electron';
import type { HandlerDetails } from 'electron/main';
import { createSerializedNavigationExecutor } from './navigation-queue';

export type BrowserSessionProviderId = ProviderId;

export interface BrowserSessionConfig {
  id: BrowserSessionProviderId;
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
    name: 'Xiaomi AI Studio',
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
    name: 'Xiaomi AI Studio',
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
}): BrowserSessionRuntime {
  const config = resolveBrowserSessionConfig(options.providerId);
  const view = new WebContentsView({
    webPreferences: {
      preload: options.chatPreloadPath,
      contextIsolation: true,
      sandbox: false,
      partition: config.partition,
    },
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
      const raw = await view.webContents.executeJavaScript(
        `
          (async () => {
            const capture = window.amberkeeperChatCapture;
            if (!capture?.snapshotDom) {
              return { message: 'Chat preload snapshot API unavailable.', detail: '' };
            }
            return capture.snapshotDom();
          })();
        `,
        true
      );

      return {
        message: (raw as { message?: string } | undefined)?.message ?? 'DOM snapshot completed.',
        detail: (raw as { detail?: string } | undefined)?.detail ?? '',
      };
    },
    readStructuredDomSnapshot: async (fallbackUrl: string) => {
      const raw = (await view.webContents.executeJavaScript(
        `
          (async () => {
            const capture = window.amberkeeperChatCapture;
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
      )) as
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
  };
}

function buildPopupHandler(
  _details: HandlerDetails,
  options: { partition: string; chatPreloadPath: string }
) {
  return {
    action: 'allow' as const,
    overrideBrowserWindowOptions: {
      width: 520,
      height: 720,
      title: 'AmberKeeper Auth',
      webPreferences: {
        partition: options.partition,
        contextIsolation: true,
        sandbox: false,
        preload: options.chatPreloadPath,
      },
    },
  };
}
