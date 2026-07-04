import type { ServiceRecord } from '@amberkeeper/shared-types';

type RuntimeRegistryLike = {
  listResolvedRuntimes(): any[];
  getActiveRuntime(): any | null;
};

type CustomRuntimeRegistryLike = {
  listResolvedRuntimes(): any[];
  getActiveRuntime(): any | null;
  syncServices(nextServices: ServiceRecord[], nextActiveServiceId?: string | null): void;
};

type RuntimeViewLike = {
  webContents?: {
    id?: number;
  };
};

export interface ShellRuntimeLike {
  serviceId: string;
  providerId: string | null;
  view: RuntimeViewLike;
  browserSession: unknown;
  cdpObserver: unknown;
  currentUrl: string;
}

export function isProviderRuntime(
  runtime: ShellRuntimeLike | null | undefined
): runtime is ShellRuntimeLike & { providerId: string } {
  return Boolean(runtime?.providerId);
}

export function syncCustomServiceRuntimes(options: {
  services: ServiceRecord[];
  activeServiceId: string | null;
  customRuntimeRegistry: CustomRuntimeRegistryLike | null;
}): void {
  const customServices = options.services.filter((service) => service.kind === 'custom');
  const nextActiveCustomServiceId =
    options.activeServiceId &&
    customServices.some((service) => service.id === options.activeServiceId)
      ? options.activeServiceId
      : null;

  options.customRuntimeRegistry?.syncServices(customServices, nextActiveCustomServiceId);
}

export function listResolvedShellRuntimes(options: {
  runtimeRegistry: RuntimeRegistryLike | null;
  customRuntimeRegistry: CustomRuntimeRegistryLike | null;
}): ShellRuntimeLike[] {
  const providerRuntimes = options.runtimeRegistry?.listResolvedRuntimes() ?? [];
  const customRuntimes = options.customRuntimeRegistry?.listResolvedRuntimes() ?? [];

  return [...providerRuntimes, ...customRuntimes];
}

export function getActiveShellRuntime(options: {
  activeServiceId: string | null;
  activeProviderId: string | null;
  runtimeRegistry: RuntimeRegistryLike | null;
  customRuntimeRegistry: CustomRuntimeRegistryLike | null;
}): ShellRuntimeLike | null {
  if (!options.activeServiceId) {
    return null;
  }

  if (options.activeServiceId === options.activeProviderId) {
    return options.runtimeRegistry?.getActiveRuntime() ?? null;
  }

  return options.customRuntimeRegistry?.getActiveRuntime() ?? null;
}

export function resolveShellRuntimeByWebContentsId(options: {
  runtimeRegistry: RuntimeRegistryLike | null;
  customRuntimeRegistry: CustomRuntimeRegistryLike | null;
  webContentsId: number;
}): ShellRuntimeLike | null {
  return (
    listResolvedShellRuntimes(options).find(
      (runtime) => runtime.view.webContents?.id === options.webContentsId
    ) ?? null
  );
}

export function syncShellStageController(options: {
  stageController: {
    sync(
      nextProviderViews: Array<{
        providerId: string;
        view: unknown;
      }>,
      nextActiveProviderId: string | null
    ): void;
  } | null;
  activeServiceId: string | null;
  activeProviderId: string | null;
  nativeStageVisible: boolean;
  runtimeRegistry: RuntimeRegistryLike | null;
  customRuntimeRegistry: CustomRuntimeRegistryLike | null;
}): { activeRuntime: ShellRuntimeLike | null } {
  const activeRuntime = getActiveShellRuntime(options);
  const runtimes = listResolvedShellRuntimes(options);

  options.stageController?.sync(
    runtimes.map(({ serviceId, view }) => ({
      providerId: serviceId,
      view,
    })),
    options.nativeStageVisible ? options.activeServiceId : null
  );

  return {
    activeRuntime,
  };
}
