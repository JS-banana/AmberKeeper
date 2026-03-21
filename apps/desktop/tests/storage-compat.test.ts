import { describe, expect, test } from 'vitest';
import { resolveLegacyCompatibleUserDataPath } from '../src/main/bootstrap/storage-compat';

describe('storage-compat', () => {
  test('keeps the legacy userData root for the first standalone AmberKeeper release', () => {
    expect(resolveLegacyCompatibleUserDataPath('/Users/demo/Library/Application Support')).toBe(
      '/Users/demo/Library/Application Support/electron-chatgpt-capture'
    );
  });
});
