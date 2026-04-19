import { existsSync } from 'node:fs';
import { app, BrowserWindow, WebContentsView, nativeImage } from 'electron';

export interface StageViewBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ProviderStageView<
  TView extends { setBounds(bounds: StageViewBounds): void } = WebContentsView,
> {
  providerId: string;
  view: TView;
}

export function createMainWindow(options: {
  rendererPreloadPath: string;
  rendererHtmlPath: string;
  appIconPath?: string;
}): BrowserWindow {
  const resolvedIconPath = resolveWindowIconPath(options.appIconPath);
  const icon = resolvedIconPath ? nativeImage.createFromPath(resolvedIconPath) : undefined;
  const mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1100,
    minHeight: 720,
    backgroundColor: '#0b1020',
    titleBarStyle: 'hiddenInset',
    icon,
    webPreferences: {
      ...buildMainRendererWebPreferences(options.rendererPreloadPath),
    },
  });

  if (process.platform === 'darwin' && icon && !icon.isEmpty()) {
    app.dock?.setIcon(icon);
  }

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
    activeProviderId: string | null;
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
  let activeProviderId: string | null = null;
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
    sync(nextProviderViews: Array<ProviderStageView<WebContentsView>>, nextActiveProviderId: string | null): void {
      providerViews = nextProviderViews;
      activeProviderId = nextActiveProviderId;
      syncBounds();
    },
    detach(view: WebContentsView): void {
      if (!attachedViews.has(view)) {
        return;
      }

      mainWindow.contentView.removeChildView(view);
      attachedViews.delete(view);
    },
  };
}

export function buildMainRendererWebPreferences(preloadPath: string) {
  return {
    preload: preloadPath,
    contextIsolation: true,
    // Runtime evidence: sandboxing the local renderer breaks the shell bridge and
    // causes the left navigation/menu surfaces to disappear. Keep the shell renderer
    // unsandboxed for now; remote-content surfaces stay sandboxed separately.
    sandbox: false,
    nodeIntegration: false,
    webSecurity: true,
    webviewTag: false,
  };
}

function resolveWindowIconPath(appIconPath: string | undefined): string | undefined {
  if (!appIconPath || !existsSync(appIconPath)) {
    return undefined;
  }

  return appIconPath;
}
