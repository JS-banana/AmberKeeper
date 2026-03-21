import { startTransition, useState } from 'react';
import { DiagnosticsPage } from './pages/DiagnosticsPage';
import { WorkspacePage } from './pages/WorkspacePage';

type SurfaceId = 'workspace' | 'diagnostics';

export function App() {
  const [activeSurface, setActiveSurface] = useState<SurfaceId>('workspace');

  const showWorkspace = activeSurface === 'workspace';

  return (
    <div className="app-shell">
      <aside className="shell-sidebar">
        <header className="shell-header">
          <div>
            <p className="shell-kicker">AmberKeeper Desktop</p>
            <h1 className="shell-title">Workspace and Diagnostics</h1>
          </div>
          <nav className="surface-switcher" aria-label="Surface switcher">
            <button
              aria-pressed={showWorkspace}
              className={showWorkspace ? 'surface-button active' : 'surface-button'}
              type="button"
              onClick={() => {
                startTransition(() => setActiveSurface('workspace'));
              }}
            >
              Workspace
            </button>
            <button
              aria-pressed={!showWorkspace}
              className={!showWorkspace ? 'surface-button active' : 'surface-button'}
              type="button"
              onClick={() => {
                startTransition(() => setActiveSurface('diagnostics'));
              }}
            >
              Diagnostics
            </button>
          </nav>
        </header>

        <div className="shell-panel">
          {showWorkspace ? <WorkspacePage /> : <DiagnosticsPage />}
        </div>
      </aside>

      <main className="native-stage" aria-hidden="true">
        <div className="native-stage__overlay">
          <p className="native-stage__eyebrow">Native Chat View</p>
          <h2>The active provider lives in the Electron native view on this stage.</h2>
          <p>
            The React shell controls product framing and diagnostics, while the provider page
            renders through `WebContentsView`.
          </p>
        </div>
      </main>
    </div>
  );
}
