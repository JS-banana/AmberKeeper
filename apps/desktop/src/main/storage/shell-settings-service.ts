import type {
  CreateCustomServiceInput,
  InterfaceLanguage,
  ProviderId,
  ProviderMoveDirection,
  ProviderRecord,
  ServiceMoveDirection,
  ServiceRecord,
} from '@amberkeeper/shared-types';
import type { CaptureStore } from './capture-store';

type AppSettingsRepositoryLike = {
  setInterfaceLanguage(language: InterfaceLanguage): InterfaceLanguage;
};

export function createShellSettingsService(options: {
  getCaptureStore: () => CaptureStore | null;
  getAppSettingsRepository: () => AppSettingsRepositoryLike | null;
  afterStoreMutation: () => void;
  afterInterfaceLanguageMutation?: (language: InterfaceLanguage) => void;
}) {
  return {
    setActiveProvider(providerId: ProviderId): ProviderRecord | null {
      const captureStore = options.getCaptureStore();
      if (!captureStore) {
        return null;
      }

      const provider = captureStore.setActiveProvider(providerId);
      captureStore.setActiveService(providerId);
      options.afterStoreMutation();
      return provider;
    },
    setActiveService(serviceId: string): ServiceRecord | null {
      const captureStore = options.getCaptureStore();
      if (!captureStore) {
        return null;
      }

      const service = captureStore.setActiveService(serviceId);
      if (service.providerId) {
        captureStore.setActiveProvider(service.providerId);
      }
      options.afterStoreMutation();
      return service;
    },
    setProviderEnabled(providerId: ProviderId, enabled: boolean): ProviderRecord | null {
      const captureStore = options.getCaptureStore();
      if (!captureStore) {
        return null;
      }

      const provider = captureStore.setProviderEnabled(providerId, enabled);
      options.afterStoreMutation();
      return provider;
    },
    setServiceEnabled(serviceId: string, enabled: boolean): ServiceRecord | null {
      const captureStore = options.getCaptureStore();
      if (!captureStore) {
        return null;
      }

      const service = captureStore.setServiceEnabled(serviceId, enabled);
      options.afterStoreMutation();
      return service;
    },
    moveProvider(
      providerId: ProviderId,
      direction: ProviderMoveDirection
    ): ProviderRecord[] | null {
      const captureStore = options.getCaptureStore();
      if (!captureStore) {
        return null;
      }

      const providers = captureStore.moveProvider(providerId, direction);
      options.afterStoreMutation();
      return providers;
    },
    moveService(serviceId: string, direction: ServiceMoveDirection): ServiceRecord[] | null {
      const captureStore = options.getCaptureStore();
      if (!captureStore) {
        return null;
      }

      const services = captureStore.moveService(serviceId, direction);
      options.afterStoreMutation();
      return services;
    },
    addCustomService(input: CreateCustomServiceInput): ServiceRecord | null {
      const captureStore = options.getCaptureStore();
      if (!captureStore) {
        return null;
      }

      const service = captureStore.addCustomService(input);
      options.afterStoreMutation();
      return service;
    },
    removeCustomService(serviceId: string): void {
      const captureStore = options.getCaptureStore();
      if (!captureStore) {
        return;
      }

      captureStore.removeCustomService(serviceId);
      options.afterStoreMutation();
    },
    updateCustomServiceIcon(serviceId: string, iconUrl: string | null): ServiceRecord | null {
      const captureStore = options.getCaptureStore();
      if (!captureStore) {
        return null;
      }

      const service = captureStore.updateCustomServiceIcon(serviceId, iconUrl);
      options.afterStoreMutation();
      return service;
    },
    setInterfaceLanguage(language: InterfaceLanguage): InterfaceLanguage {
      const nextLanguage =
        options.getAppSettingsRepository()?.setInterfaceLanguage(language) ?? 'system';

      options.afterInterfaceLanguageMutation?.(nextLanguage);
      return nextLanguage;
    },
  };
}
