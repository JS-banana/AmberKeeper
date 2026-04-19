import { DatabaseSync } from 'node:sqlite';
import { describe, expect, test } from 'vitest';
import { createAppSettingsRepository } from '../src/main/storage/app-settings-repository';
import { ensureCaptureStoreSchema } from '../src/main/storage/schema';

describe('app-settings-repository', () => {
  test('seeds active_service_id as nullable', () => {
    const db = new DatabaseSync(':memory:');
    ensureCaptureStoreSchema(db);

    const repository = createAppSettingsRepository(db);

    expect(repository.getActiveServiceId()).toBeNull();
  });

  test('persists active_service_id across repository recreation', () => {
    const db = new DatabaseSync(':memory:');
    ensureCaptureStoreSchema(db);

    const firstRepository = createAppSettingsRepository(db);
    firstRepository.setActiveServiceId('custom-service-1');

    const secondRepository = createAppSettingsRepository(db);
    expect(secondRepository.getActiveServiceId()).toBe('custom-service-1');
  });

  test('keeps interface language behavior unchanged while storing active service state', () => {
    const db = new DatabaseSync(':memory:');
    ensureCaptureStoreSchema(db);

    const repository = createAppSettingsRepository(db);
    repository.setActiveServiceId('custom-service-1');

    expect(repository.getInterfaceLanguage()).toBe('system');
    expect(repository.setInterfaceLanguage('zh-CN')).toBe('zh-CN');
    expect(repository.getActiveServiceId()).toBe('custom-service-1');
  });
});
