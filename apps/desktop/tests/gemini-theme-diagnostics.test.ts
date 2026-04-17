import { describe, expect, test } from 'vitest';
import { resolveBrowserSessionConfig } from '../src/main/runtime/browser-session';
import {
  buildGeminiThemeDiagnosticConfig,
  buildGeminiThemeProbeScript,
  recordGeminiThemeDiagnosticResult,
} from '../src/main/runtime/gemini-theme-diagnostics';

describe('gemini-theme-diagnostics', () => {
  test('builds a fresh Gemini diagnostic config without changing the legacy partition contract', () => {
    const legacy = buildGeminiThemeDiagnosticConfig('legacy');
    const fresh = buildGeminiThemeDiagnosticConfig('fresh');

    expect(legacy.partition).toBe(resolveBrowserSessionConfig('gemini').partition);
    expect(legacy.homeUrl).toBe(resolveBrowserSessionConfig('gemini').homeUrl);
    expect(fresh.partition).toBe('persist:amberkeeper-gemini-theme-diagnostic-fresh');
    expect(fresh.homeUrl).toBe(resolveBrowserSessionConfig('gemini').homeUrl);
  });

  test('records whether legacy or fresh Gemini partition was used', () => {
    expect(
      recordGeminiThemeDiagnosticResult({
        mode: 'legacy',
        issueDetected: true,
      })
    ).toEqual(
      expect.objectContaining({
        mode: 'legacy',
        partition: 'persist:anychat-gemini',
        issueDetected: true,
      })
    );

    expect(
      recordGeminiThemeDiagnosticResult({
        mode: 'fresh',
        issueDetected: false,
      })
    ).toEqual(
      expect.objectContaining({
        mode: 'fresh',
        partition: 'persist:amberkeeper-gemini-theme-diagnostic-fresh',
        issueDetected: false,
      })
    );
  });

  test('does not treat prefers-color-scheme alone as a Gemini theme failure', () => {
    const script = buildGeminiThemeProbeScript();

    expect(script).toContain('luminance');
    expect(script).toContain('hasDarkBackground');
    expect(script).not.toContain('prefersDark ||');
  });
});
