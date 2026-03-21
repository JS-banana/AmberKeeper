import type { ProviderId } from '@amberkeeper/shared-types';
import { app, BrowserWindow, WebContentsView } from 'electron';

export interface StageViewBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ProviderStageView<
  TView extends { setBounds(bounds: StageViewBounds): void } = WebContentsView,
> {
  providerId: ProviderId;
  view: TView;
}

export function createMainWindow(options: {
  rendererPreloadPath: string;
  rendererHtmlPath: string;
}): BrowserWindow {
  const mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1100,
    minHeight: 720,
    backgroundColor: '#0b1020',
    webPreferences: {
      preload: options.rendererPreloadPath,
      contextIsolation: true,
      sandbox: false,
    },
  });

  if (!app.isPackaged && process.env.ELECTRON_RENDERER_URL) {
    void mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    void mainWindow.loadFile(options.rendererHtmlPath);
  }

  return mainWindow;
}

export function attachChatView(
  mainWindow: BrowserWindow,
  chatView: WebContentsView,
  panelWidth: number
): void {
  const updateBounds = () => {
    const bounds = mainWindow.getContentBounds();
    chatView.setBounds({
      x: panelWidth,
      y: 0,
      width: Math.max(bounds.width - panelWidth, 360),
      height: bounds.height,
    });
  };

  mainWindow.contentView.addChildView(chatView);
  updateBounds();
  mainWindow.on('resize', updateBounds);
}

export function applyProviderStageLayout<TView extends { setBounds(bounds: StageViewBounds): void }>(
  options: {
    providerViews: Array<ProviderStageView<TView>>;
    activeProviderId: ProviderId | null;
    panelWidth: number;
    contentBounds: {
      width: number;
      height: number;
    };
    ensureAttached?: (view: TView) => void;
  }
): void {
  const activeBounds: StageViewBounds = {
    x: options.panelWidth,
    y: 0,
    width: Math.max(options.contentBounds.width - options.panelWidth, 360),
    height: options.contentBounds.height,
  };
  const hiddenBounds: StageViewBounds = {
    x: options.contentBounds.width,
    y: 0,
    width: 0,
    height: options.contentBounds.height,
  };

  options.providerViews.forEach(({ providerId, view }) => {
    options.ensureAttached?.(view);
    view.setBounds(providerId === options.activeProviderId ? activeBounds : hiddenBounds);
  });
}

export function createProviderStageController(mainWindow: BrowserWindow, panelWidth: number) {
  let providerViews: Array<ProviderStageView<WebContentsView>> = [];
  let activeProviderId: ProviderId | null = null;
  const attachedViews = new WeakSet<WebContentsView>();

  const syncBounds = () => {
    applyProviderStageLayout({
      providerViews,
      activeProviderId,
      panelWidth,
      contentBounds: mainWindow.getContentBounds(),
      ensureAttached(view) {
        if (attachedViews.has(view)) {
          return;
        }

        mainWindow.contentView.addChildView(view);
        attachedViews.add(view);
      },
    });
  };

  mainWindow.on('resize', syncBounds);

  return {
    sync(nextProviderViews: Array<ProviderStageView<WebContentsView>>, nextActiveProviderId: ProviderId | null): void {
      providerViews = nextProviderViews;
      activeProviderId = nextActiveProviderId;
      syncBounds();
    },
  };
}
