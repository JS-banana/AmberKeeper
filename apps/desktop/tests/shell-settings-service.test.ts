import { describe, expect, test, vi } from 'vitest';
import { createShellSettingsService } from '../src/main/storage/shell-settings-service';

describe('shell-settings-service', () => {
  test('invokes the post-language-mutation hook after persisting interface language', () => {
    const afterInterfaceLanguageMutation = vi.fn();
    const setInterfaceLanguage = vi.fn(() => 'zh-CN' as const);
    const service = createShellSettingsService({
      getCaptureStore: () => null,
      getAppSettingsRepository: () => ({
        setInterfaceLanguage,
      }),
      afterStoreMutation: () => undefined,
      afterInterfaceLanguageMutation,
    });

    expect(service.setInterfaceLanguage('zh-CN')).toBe('zh-CN');
    expect(setInterfaceLanguage).toHaveBeenCalledWith('zh-CN');
    expect(afterInterfaceLanguageMutation).toHaveBeenCalledWith('zh-CN');
  });
});
