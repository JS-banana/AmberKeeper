import { startTransition, useEffect, useState, type ReactNode } from 'react';
import { Database, Settings, Info, Activity, Server } from 'lucide-react';
import { TooltipProvider } from '@/components/ui/tooltip';
import { AppSidebar, type AppSurfaceId } from './components/AppSidebar';
import { DiagnosticsPage } from './pages/DiagnosticsPage';
import { AboutPage } from './pages/AboutPage';
import { LibraryPage } from './pages/LibraryPage';
import { ServicesPage } from './pages/ServicesPage';
import { SettingsPage } from './pages/SettingsPage';
import { useWorkspaceStore } from './stores/workspace-store';
import { cn } from '@/lib/cn';
import type { ProviderRecord } from '@amberkeeper/shared-types';

type UtilitySurfaceId = Exclude<AppSurfaceId, 'chat'>;
type HistoryScope = 'all' | ProviderRecord['id'];

export function App() {
  const { state, activeService, activeProvider, selectedSession, actions } = useWorkspaceStore();
  const [activeSurface, setActiveSurface] = useState<AppSurfaceId>('chat');
  const [lastUtilitySurface, setLastUtilitySurface] = useState<UtilitySurfaceId>('library');
  const [libraryHistoryScope, setLibraryHistoryScope] = useState<HistoryScope>('all');
  const diagnosticsEnabled = state.shellInfo?.diagnosticsEnabled ?? false;
  const showChatSurface = activeSurface === 'chat';

  useEffect(() => {
    void window.captureApi?.setNativeStageVisible?.(showChatSurface);
  }, [showChatSurface]);

  useEffect(() => {
    if (!diagnosticsEnabled && activeSurface === 'diagnostics') {
      startTransition(() => setActiveSurface('chat'));
    }
    if (!diagnosticsEnabled && lastUtilitySurface === 'diagnostics') {
      startTransition(() => setLastUtilitySurface('library'));
    }
  }, [activeSurface, diagnosticsEnabled, lastUtilitySurface]);

  return (
    <TooltipProvider delayDuration={300}>
    <div className="grid h-screen min-h-screen overflow-hidden bg-white grid-cols-[66px_minmax(0,1fr)]">
      <AppSidebar
        services={state.services}
        activeServiceId={state.activeServiceId}
        activeSurface={activeSurface}
        onSelectService={(serviceId) => {
          startTransition(() => setActiveSurface('chat'));
          void actions.selectService(serviceId);
        }}
        onOpenUtility={() => {
          startTransition(() => setActiveSurface(lastUtilitySurface));
        }}
      />

      <main
        className={
          showChatSurface
            ? 'relative min-w-0 min-h-screen p-0 overflow-hidden'
            : 'flex flex-col min-w-0 min-h-screen overflow-hidden p-0'
        }
      >
        {showChatSurface ? (
          <div className="min-h-screen" aria-hidden="true" />
        ) : (
          <UtilityWorkbench
            activeSurface={activeSurface}
            diagnosticsEnabled={diagnosticsEnabled}
            onSelectSurface={(surface) => {
              startTransition(() => {
                setLastUtilitySurface(surface);
                setActiveSurface(surface);
              });
            }}
          >
            {renderUtilitySurface({
              activeSurface,
              libraryHistoryScope,
              onChangeLibraryHistoryScope: setLibraryHistoryScope,
              activeService,
              activeProvider,
              state,
              selectedSession,
              actions,
            })}
          </UtilityWorkbench>
        )}
      </main>
    </div>
    </TooltipProvider>
  );
}

function UtilityWorkbench(props: {
  activeSurface: AppSurfaceId;
  diagnosticsEnabled: boolean;
  onSelectSurface: (surface: Exclude<AppSurfaceId, 'chat'>) => void;
  children: ReactNode;
}) {
  const menuItems: Array<{ id: Exclude<AppSurfaceId, 'chat'>; label: string; icon: ReactNode }> = [
    { id: 'library', label: '数据', icon: <Database className="size-4" /> },
    { id: 'services', label: '服务', icon: <Server className="size-4" /> },
    { id: 'settings', label: '设置', icon: <Settings className="size-4" /> },
    { id: 'about', label: '关于', icon: <Info className="size-4" /> },
  ];

  if (props.diagnosticsEnabled) {
    menuItems.push({ id: 'diagnostics', label: '诊断', icon: <Activity className="size-4" /> });
  }

  const currentSurface = props.activeSurface === 'chat' ? 'library' : props.activeSurface;

  return (
    <section className="flex items-stretch flex-1 min-h-0">
      <nav className="flex flex-col gap-1 w-[180px] shrink-0 border-r border-border bg-background/60 p-3 overflow-y-auto" aria-label="工作台导航">
        {menuItems.map((item) => {
          const isActive = currentSurface === item.id;
          return (
            <button
              key={item.id}
              type="button"
              aria-pressed={isActive}
              aria-current={isActive ? 'page' : undefined}
              className={cn(
                'flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm font-medium text-muted-foreground transition-colors duration-150',
                'hover:text-foreground hover:bg-secondary/60',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                isActive && 'text-foreground bg-secondary shadow-sm relative before:absolute before:left-0 before:top-1/2 before:-translate-y-1/2 before:h-5 before:w-0.5 before:rounded-full before:bg-primary'
              )}
              onClick={() => props.onSelectSurface(item.id)}
            >
              <span className="shrink-0" aria-hidden="true">{item.icon}</span>
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>

      <div className="flex flex-col flex-1 min-w-0 min-h-0 overflow-y-auto px-4 py-6 bg-white">
        {props.children}
      </div>
    </section>
  );
}

function renderUtilitySurface(input: {
  activeSurface: AppSurfaceId;
  libraryHistoryScope: HistoryScope;
  onChangeLibraryHistoryScope: (scope: HistoryScope) => void;
  activeService: ReturnType<typeof useWorkspaceStore>['activeService'];
  activeProvider: ReturnType<typeof useWorkspaceStore>['activeProvider'];
  state: ReturnType<typeof useWorkspaceStore>['state'];
  selectedSession: ReturnType<typeof useWorkspaceStore>['selectedSession'];
  actions: ReturnType<typeof useWorkspaceStore>['actions'];
}) {
  switch (input.activeSurface) {
    case 'library':
      return (
        <LibraryPage
          activeProvider={input.activeProvider}
          providers={input.state.providers}
          infoBanner={
            input.activeService && !input.activeService.supportsDataManagement
              ? `${input.activeService.name} 仅作为壳层服务入口，不支持本地采集、历史、导出或缓存开关。`
              : null
          }
          historyScope={input.libraryHistoryScope}
          onChangeHistoryScope={input.onChangeLibraryHistoryScope}
          sessions={input.state.sessions}
          selectedSession={input.selectedSession}
          selectedSessionId={input.state.selectedSessionId}
          messages={input.state.messages}
          loading={input.state.loading}
          onRefresh={() => input.actions.refresh(input.state.selectedSessionId)}
          onSelectSession={input.actions.selectSession}
          onDeleteSession={input.actions.deleteSession}
          onExportSession={input.actions.exportSession}
          onExportProviderSessions={input.actions.exportProviderSessions}
          onExportAllSessions={input.actions.exportAllSessions}
        />
      );
    case 'services':
      return (
        <ServicesPage
          services={input.state.services}
          activeServiceId={input.state.activeServiceId}
          onSelectService={input.actions.selectService}
          onToggleService={input.actions.setServiceEnabled}
          onToggleProviderCache={input.actions.setProviderCacheEnabled}
          onMoveService={input.actions.moveService}
          onAddCustomService={input.actions.addCustomService}
          onDeleteCustomService={input.actions.removeCustomService}
          onResolvedCustomIcon={input.actions.updateCustomServiceIcon}
        />
      );
    case 'settings':
      return (
        <SettingsPage
          shellInfo={input.state.shellInfo}
          onSetInterfaceLanguage={input.actions.setInterfaceLanguage}
          onSetCaptureSaveScope={input.actions.setCaptureSaveScope}
        />
      );
    case 'about':
      return <AboutPage shellInfo={input.state.shellInfo} />;
    case 'diagnostics':
      return <DiagnosticsPage />;
    case 'chat':
      return null;
  }
}
