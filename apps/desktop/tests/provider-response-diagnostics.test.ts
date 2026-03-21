import { describe, expect, test } from 'vitest';
import { shouldRecordParsedResponseDiagnostics } from '../src/main/runtime/response-diagnostics';

describe('provider response diagnostics policy', () => {
  test('records parsed-response diagnostics for DeepSeek and Gemini capture traffic', () => {
    expect(shouldRecordParsedResponseDiagnostics({ provider: 'deepseek', classification: 'capture' })).toBe(
      true
    );
    expect(shouldRecordParsedResponseDiagnostics({ provider: 'gemini', classification: 'capture' })).toBe(true);
    expect(shouldRecordParsedResponseDiagnostics({ provider: 'gemini', classification: 'discover' })).toBe(false);
    expect(shouldRecordParsedResponseDiagnostics({ provider: 'chatgpt', classification: 'capture' })).toBe(false);
  });
});
