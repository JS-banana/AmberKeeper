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

      <main
        className={
          showChatSurface
            ? 'product-main product-main--stage'
            : 'product-main product-main--utility'
        }
      >
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
    { id: 'settings', label: '服务管理' },
    { id: 'library', label: '历史会话' },
  ];

  if (props.diagnosticsEnabled) {
    menuItems.push({ id: 'diagnostics', label: '诊断' });
  }

  const currentSurface = props.activeSurface === 'chat' ? 'settings' : props.activeSurface;

  return (
    <section
      className={
        currentSurface === 'library'
          ? 'utility-workbench utility-workbench--library'
          : 'utility-workbench'
      }
    >
      <nav className="utility-workbench__nav" aria-label="设置与历史">
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

      <div
        className={
          currentSurface === 'library'
            ? 'utility-workbench__body utility-workbench__body--library'
            : 'utility-workbench__body'
        }
      >
        {props.children}
      </div>
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
          providers={input.state.providers}
          sessions={input.state.sessions}
          selectedSession={input.selectedSession}
          selectedSessionId={input.state.selectedSessionId}
          messages={input.state.messages}
          loading={input.state.loading}
          onSelectSession={input.actions.selectSession}
          onDeleteSession={input.actions.deleteSession}
          onExportSession={input.actions.exportSession}
          onExportProviderSessions={input.actions.exportProviderSessions}
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
