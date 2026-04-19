import type {
  GeminiThemeDiagnosticEntry,
  GeminiThemeDiagnosticMode,
} from '@amberkeeper/shared-types';
import { resolveBrowserSessionConfig, type BrowserSessionConfig } from './browser-session';

export function buildGeminiThemeDiagnosticConfig(
  mode: GeminiThemeDiagnosticMode
): BrowserSessionConfig {
  const legacyConfig = resolveBrowserSessionConfig('gemini');

  if (mode === 'legacy') {
    return legacyConfig;
  }

  return {
    ...legacyConfig,
    partition: 'persist:amberkeeper-gemini-theme-diagnostic-fresh',
    sourceSessionKey: 'gemini-theme-diagnostic-fresh-primary-view',
  };
}

export function recordGeminiThemeDiagnosticResult(input: {
  mode: GeminiThemeDiagnosticMode;
  issueDetected: boolean;
}): Pick<GeminiThemeDiagnosticEntry, 'mode' | 'partition' | 'issueDetected'> {
  const config = buildGeminiThemeDiagnosticConfig(input.mode);

  return {
    mode: input.mode,
    partition: config.partition,
    issueDetected: input.issueDetected,
  };
}

export function buildGeminiThemeProbeScript(): string {
  return `
    (() => {
      const parseRgb = (value) => {
        if (typeof value !== 'string') {
          return null;
        }

        const match = value.match(/rgba?\\((\\d+),\\s*(\\d+),\\s*(\\d+)/i);
        if (!match) {
          return null;
        }

        return {
          r: Number(match[1]),
          g: Number(match[2]),
          b: Number(match[3]),
        };
      };

      const isDarkColor = (value) => {
        const rgb = parseRgb(value);
        if (!rgb) {
          return false;
        }

        const luminance = 0.2126 * rgb.r + 0.7152 * rgb.g + 0.0722 * rgb.b;
        return luminance < 90;
      };

      const themeKeys = ['theme', 'color-scheme', 'appearance', 'darkMode'];
      const readStorage = (storage) => Object.fromEntries(
        themeKeys.map((key) => {
          try {
            return [key, storage.getItem(key)];
          } catch {
            return [key, null];
          }
        })
      );

      const documentBackground = getComputedStyle(document.documentElement).backgroundColor || null;
      const bodyBackground = getComputedStyle(document.body).backgroundColor || null;
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      const htmlColorScheme = document.documentElement.style.getPropertyValue('color-scheme') || null;
      const metaColorScheme =
        document.querySelector('meta[name="color-scheme"]')?.getAttribute('content') ?? null;
      const themeStorage = {
        ...readStorage(localStorage),
        ...readStorage(sessionStorage),
      };
      const hasDarkBackground = [documentBackground, bodyBackground].some((value) => isDarkColor(value));
      const forcesDarkMeta = typeof metaColorScheme === 'string' && metaColorScheme.toLowerCase().includes('dark');
      const forcesDarkHtmlScheme =
        typeof htmlColorScheme === 'string' && htmlColorScheme.toLowerCase().includes('dark');

      const issueDetected = hasDarkBackground || (forcesDarkMeta && forcesDarkHtmlScheme);

      return {
        currentUrl: location.href,
        prefersDark,
        htmlColorScheme,
        metaColorScheme,
        documentBackground,
        bodyBackground,
        themeStorage,
        issueDetected,
      };
    })();
  `;
}
