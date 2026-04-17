import type { RuntimeStatus } from '@amberkeeper/shared-types';
import { buildGeminiThemeDiagnosticConfig, buildGeminiThemeProbeScript } from '../runtime/gemini-theme-diagnostics';
import { createBrowserSessionRuntimeWithConfig, type BrowserSessionRuntime } from '../runtime/browser-session';

export function createDiagnosticsService(options: {
  createBrowserSessionRuntime: (input: {
    config: ReturnType<typeof buildGeminiThemeDiagnosticConfig>;
  }) => BrowserSessionRuntime;
  getBrowserSession: () => BrowserSessionRuntime | null;
  getRuntimeStatusInput: () => Omit<RuntimeStatus, 'recentAttempts'> & {
    recentAttempts: RuntimeStatus['recentAttempts'];
  };
  wait: (milliseconds: number) => Promise<void>;
}) {
  return {
    async runDomSnapshot(): Promise<{ message: string; detail: string }> {
      const browserSession = options.getBrowserSession();
      if (!browserSession) {
        return {
          message: 'Chat view is not ready yet.',
          detail: '',
        };
      }

      return browserSession.runDomSnapshot();
    },

    async runGeminiThemeDiagnostic(): Promise<import('@amberkeeper/shared-types').GeminiThemeDiagnosticReport> {
      const inspectRuntime = async (
        mode: import('@amberkeeper/shared-types').GeminiThemeDiagnosticMode
      ): Promise<import('@amberkeeper/shared-types').GeminiThemeDiagnosticEntry> => {
        const config = buildGeminiThemeDiagnosticConfig(mode);
        const runtime = options.createBrowserSessionRuntime({ config });

        try {
          await runtime.loadInitialUrl();
          await options.wait(1500);
          const snapshot = await runtime.executeJavaScript<{
            currentUrl: string;
            prefersDark: boolean;
            htmlColorScheme: string | null;
            metaColorScheme: string | null;
            documentBackground: string | null;
            bodyBackground: string | null;
            themeStorage: Record<string, string | null>;
            issueDetected: boolean;
          }>(buildGeminiThemeProbeScript(), true);

          return {
            mode,
            partition: config.partition,
            currentUrl: snapshot.currentUrl ?? config.homeUrl,
            prefersDark: snapshot.prefersDark,
            htmlColorScheme: snapshot.htmlColorScheme,
            metaColorScheme: snapshot.metaColorScheme,
            documentBackground: snapshot.documentBackground,
            bodyBackground: snapshot.bodyBackground,
            themeStorage: snapshot.themeStorage,
            issueDetected: snapshot.issueDetected,
          };
        } finally {
          try {
            runtime.view.webContents.close();
          } catch {
            // Ignore cleanup failures during manual diagnostics.
          }
        }
      };

      const entries = await Promise.all([inspectRuntime('legacy'), inspectRuntime('fresh')]);
      const legacyIssue = entries.find((entry) => entry.mode === 'legacy')?.issueDetected ?? false;
      const freshIssue = entries.find((entry) => entry.mode === 'fresh')?.issueDetected ?? false;

      return {
        comparedAt: new Date().toISOString(),
        summary:
          legacyIssue && freshIssue
            ? 'both'
            : legacyIssue
              ? 'legacy-only'
              : freshIssue
                ? 'fresh-only'
                : 'none',
        entries,
      };
    },

    getRuntimeStatus(): RuntimeStatus {
      const input = options.getRuntimeStatusInput();
      return {
        debuggerAttached: input.debuggerAttached,
        currentUrl: input.currentUrl,
        lastCaptureAt: input.lastCaptureAt,
        pendingRequestCount: input.pendingRequestCount,
        recentAttempts: input.recentAttempts,
      };
    },
  };
}

export type DiagnosticsService = ReturnType<typeof createDiagnosticsService>;
