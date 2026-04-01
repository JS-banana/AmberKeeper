import { startTransition, useEffect, useState, type ReactNode } from 'react';
import { AppSidebar, type AppSurfaceId } from './components/AppSidebar';
import { DiagnosticsPage } from './pages/DiagnosticsPage';
import { LibraryPage } from './pages/LibraryPage';
import { SettingsPage } from './pages/SettingsPage';
import { useWorkspaceStore } from './stores/workspace-store';

export function App() {
  const { state, activeProvider, selectedSession, actions } = useWorkspaceStore();
  const [activeSurface, setActiveSurface] = useState<AppSurfaceId>('chat');
  const diagnosticsEnabled = state.shellInfo?.diagnosticsEnabled ?? false;
  const showChatSurface = activeSurface === 'chat';

  useEffect(() => {
    void window.captureApi.setNativeStageVisible(showChatSurface);
  }, [showChatSurface]);

  useEffect(() => {
    if (!diagnosticsEnabled && activeSurface === 'diagnostics') {
      startTransition(() => setActiveSurface('chat'));
    }
  }, [activeSurface, diagnosticsEnabled]);

  return (
    <div className={showChatSurface ? 'product-shell product-shell--chat' : 'product-shell product-shell--utility'}>
      <AppSidebar
        providers={state.providers}
        activeProviderId={state.activeProviderId}
        activeSurface={activeSurface}
        onSelectProvider={(providerId) => {
          startTransition(() => setActiveSurface('chat'));
          void actions.selectProvider(providerId);
        }}
        onSelectSurface={(surface) => {
          startTransition(() => setActiveSurface(surface));
        }}
      />

      <main className={showChatSurface ? 'product-main product-main--stage' : 'product-main'}>
        {showChatSurface ? (
          <div className="native-stage-shell" aria-hidden="true" />
        ) : (
          <UtilityWorkbench
            activeSurface={activeSurface}
            diagnosticsEnabled={diagnosticsEnabled}
            onSelectSurface={(surface) => {
              startTransition(() => setActiveSurface(surface));
            }}
          >
            {renderUtilitySurface({
              activeSurface,
              activeProvider,
              state,
              selectedSession,
              actions,
            })}
          </UtilityWorkbench>
        )}
      </main>
    </div>
  );
}

function UtilityWorkbench(props: {
  activeSurface: AppSurfaceId;
  diagnosticsEnabled: boolean;
  onSelectSurface: (surface: Exclude<AppSurfaceId, 'chat'>) => void;
  children: ReactNode;
}) {
  const menuItems: Array<{ id: Exclude<AppSurfaceId, 'chat'>; label: string }> = [
    { id: 'library', label: '会话库' },
    { id: 'settings', label: '应用设置' },
  ];

  if (props.diagnosticsEnabled) {
    menuItems.push({ id: 'diagnostics', label: '诊断' });
  }

  const currentSurface = props.activeSurface === 'chat' ? 'settings' : props.activeSurface;

  return (
    <section className="utility-workbench">
      <nav className="utility-workbench__nav" aria-label="工作台菜单">
        {menuItems.map((item) => {
          const isActive = currentSurface === item.id;

          return (
            <button
              key={item.id}
              type="button"
              aria-pressed={isActive}
              className={isActive ? 'utility-workbench__tab active' : 'utility-workbench__tab'}
              onClick={() => {
                props.onSelectSurface(item.id);
              }}
            >
              {item.label}
            </button>
          );
        })}
      </nav>

      <div className="utility-workbench__body">{props.children}</div>
    </section>
  );
}

function renderUtilitySurface(input: {
  activeSurface: AppSurfaceId;
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
          sessions={input.state.sessions}
          selectedSession={input.selectedSession}
          selectedSessionId={input.state.selectedSessionId}
          messages={input.state.messages}
          loading={input.state.loading}
          onSelectSession={input.actions.selectSession}
        />
      );
    case 'settings':
      return (
        <SettingsPage
          providers={input.state.providers}
          activeProviderId={input.state.activeProviderId}
          onSelectProvider={input.actions.selectProvider}
          onToggleProvider={input.actions.setProviderEnabled}
          onMoveProvider={input.actions.moveProvider}
        />
      );
    case 'diagnostics':
      return <DiagnosticsPage />;
    case 'chat':
      return null;
  }
}
