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
  const menuItems: Array<{ id: Exclude<AppSurfaceId, 'chat'>; label: string; icon: ReactNode }> = [
    { id: 'settings', label: '服务管理', icon: <WorkbenchGlyph kind="settings" /> },
    { id: 'library', label: '历史记录', icon: <WorkbenchGlyph kind="library" /> },
  ];

  if (props.diagnosticsEnabled) {
    menuItems.push({ id: 'diagnostics', label: '诊断', icon: <WorkbenchGlyph kind="diagnostics" /> });
  }

  const currentSurface = props.activeSurface === 'chat' ? 'settings' : props.activeSurface;

  return (
    <section
      className={[
        'utility-workbench',
        'utility-workbench--sidebar',
        currentSurface === 'library' ? 'utility-workbench--library' : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <nav className="utility-workbench__nav" aria-label="设置与历史">
        {menuItems.map((item) => {
          const isActive = currentSurface === item.id;

          return (
            <button
              key={item.id}
              type="button"
              aria-pressed={isActive}
              aria-current={isActive ? 'page' : undefined}
              className={isActive ? 'utility-workbench__tab active' : 'utility-workbench__tab'}
              onClick={() => {
                props.onSelectSurface(item.id);
              }}
            >
              <span className="utility-workbench__tab-icon" aria-hidden="true">
                {item.icon}
              </span>
              <span className="utility-workbench__tab-label">{item.label}</span>
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
          onRefresh={() => input.actions.refresh(input.state.selectedSessionId)}
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

function WorkbenchGlyph(props: {
  kind: Exclude<AppSurfaceId, 'chat'>;
}) {
  switch (props.kind) {
    case 'settings':
      return (
        <svg aria-hidden="true" viewBox="0 0 24 24" className="utility-workbench__glyph">
          <path
            d="M5 7.25h6M15.5 7.25H19M5 12h3M11.5 12H19M5 16.75h8M16.5 16.75H19"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
          <circle cx="13.25" cy="7.25" r="1.95" fill="none" stroke="currentColor" strokeWidth="1.7" />
          <circle cx="9.25" cy="12" r="1.95" fill="none" stroke="currentColor" strokeWidth="1.7" />
          <circle
            cx="14.5"
            cy="16.75"
            r="1.95"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
          />
        </svg>
      );
    case 'library':
      return (
        <svg aria-hidden="true" viewBox="0 0 24 24" className="utility-workbench__glyph">
          <path
            d="M7 5.5h10.5A1.5 1.5 0 0 1 19 7v10.5A1.5 1.5 0 0 1 17.5 19H7a2 2 0 0 1-2-2V7.5a2 2 0 0 1 2-2Z"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinejoin="round"
          />
          <path
            d="M8.5 9.25h7M8.5 12.25h7M8.5 15.25h4.25"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
          />
        </svg>
      );
    case 'diagnostics':
      return (
        <svg aria-hidden="true" viewBox="0 0 24 24" className="utility-workbench__glyph">
          <path
            d="M6 16.75h12M8.25 13.5h2.5v3.25h-2.5zM11.75 10h2.5v6.75h-2.5zM15.25 6.5h2.5v10.25h-2.5z"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      );
    case 'chat':
      return null;
  }
}
