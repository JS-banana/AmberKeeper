import { describe, expect, test, vi } from 'vitest';
import { createShellSettingsService } from '../src/main/storage/shell-settings-service';

describe('shell-settings-service', () => {
  test('invokes the post-language-mutation hook after persisting interface language', () => {
    const afterInterfaceLanguageMutation = vi.fn();
    const setInterfaceLanguage = vi.fn(() => 'zh-CN' as const);
    const setCaptureSaveScope = vi.fn(() => 'complete' as const);
    const service = createShellSettingsService({
      getCaptureStore: () => null,
      getAppSettingsRepository: () => ({
        setInterfaceLanguage,
        setCaptureSaveScope,
      }),
      afterStoreMutation: () => undefined,
      afterInterfaceLanguageMutation,
    });

    expect(service.setInterfaceLanguage('zh-CN')).toBe('zh-CN');
    expect(setInterfaceLanguage).toHaveBeenCalledWith('zh-CN');
    expect(afterInterfaceLanguageMutation).toHaveBeenCalledWith('zh-CN');
  });

  test('persists capture save scope through app settings', () => {
    const setInterfaceLanguage = vi.fn(() => 'system' as const);
    const setCaptureSaveScope = vi.fn(() => 'user' as const);
    const service = createShellSettingsService({
      getCaptureStore: () => null,
      getAppSettingsRepository: () => ({
        setInterfaceLanguage,
        setCaptureSaveScope,
      }),
      afterStoreMutation: () => undefined,
    });

    expect(service.setCaptureSaveScope('user')).toBe('user');
    expect(setCaptureSaveScope).toHaveBeenCalledWith('user');
  });
});
