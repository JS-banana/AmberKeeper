import { startTransition, useEffect, useEffectEvent, useRef } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import {
  formatError,
  resolveSelectedSessionId,
  type WorkspaceState,
} from './workspace-store-types';

export function useWorkspaceQuery(options: {
  state: WorkspaceState;
  setState: Dispatch<SetStateAction<WorkspaceState>>;
}) {
  const latestSelectedSessionIdRef = useRef<string | null>(null);
  const lastCaptureAtRef = useRef<string | null>(null);
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refreshShellState = useEffectEvent(async () => {
    try {
      const [services, activeService, providers, activeProvider, runtimeStatus, shellInfo] =
        await Promise.all([
          window.captureApi.listServices(),
          window.captureApi.getActiveService(),
          window.captureApi.listProviders(),
          window.captureApi.getActiveProvider(),
          window.captureApi.getRuntimeStatus(),
          window.captureApi.getShellInfo(),
        ]);
      const activeProviderId =
        activeProvider?.id ?? providers.find((provider) => provider.active)?.id ?? null;
      const activeServiceId =
        activeService?.id ?? services.find((service) => service.active)?.id ?? null;
      lastCaptureAtRef.current = runtimeStatus.lastCaptureAt;

      startTransition(() => {
        options.setState((current) => ({
          ...current,
          services,
          activeServiceId,
          providers,
          activeProviderId,
          runtimeStatus,
          shellInfo,
          loading: false,
          error: null,
        }));
      });
    } catch (error) {
      startTransition(() => {
        options.setState((current) => ({
          ...current,
          loading: false,
          error: formatError(error),
        }));
      });
    }
  });

  const refresh = useEffectEvent(async (preferredSessionId?: string | null) => {
    startTransition(() => {
      options.setState((current) => ({
        ...current,
        loading: true,
        error: null,
      }));
    });

    try {
      const [services, activeService, providers, activeProvider, sessions, runtimeStatus, shellInfo] =
        await Promise.all([
          window.captureApi.listServices(),
          window.captureApi.getActiveService(),
          window.captureApi.listProviders(),
          window.captureApi.getActiveProvider(),
          window.captureApi.listSessions(),
          window.captureApi.getRuntimeStatus(),
          window.captureApi.getShellInfo(),
        ]);
      const activeProviderId =
        activeProvider?.id ?? providers.find((provider) => provider.active)?.id ?? null;
      const activeServiceId =
        activeService?.id ?? services.find((service) => service.active)?.id ?? null;
      const nextSelectedSessionId = resolveSelectedSessionId(
        sessions,
        preferredSessionId ?? options.state.selectedSessionId
      );
      const messages = nextSelectedSessionId
        ? await window.captureApi.listMessages(nextSelectedSessionId)
        : [];
      lastCaptureAtRef.current = runtimeStatus.lastCaptureAt;

      startTransition(() => {
        options.setState({
          services,
          activeServiceId,
          providers,
          activeProviderId,
          sessions,
          selectedSessionId: nextSelectedSessionId,
          messages,
          runtimeStatus,
          shellInfo,
          loading: false,
          error: null,
        });
      });
    } catch (error) {
      startTransition(() => {
        options.setState((current) => ({
          ...current,
          loading: false,
          error: formatError(error),
        }));
      });
    }
  });

  const scheduleRefresh = useEffectEvent((preferredSessionId?: string | null) => {
    if (refreshTimerRef.current !== null) {
      return;
    }

    refreshTimerRef.current = setTimeout(() => {
      refreshTimerRef.current = null;
      void refresh(preferredSessionId ?? latestSelectedSessionIdRef.current);
    }, 400);
  });

  useEffect(() => {
    latestSelectedSessionIdRef.current = options.state.selectedSessionId;
  }, [options.state.selectedSessionId]);

  useEffect(() => {
    if (!window.captureApi) {
      startTransition(() => {
        options.setState((current) => ({
          ...current,
          loading: false,
          error: '桌面桥接未就绪，请重启应用后重试。',
        }));
      });

      return;
    }

    void refresh(null);

    return window.captureApi.onRuntimeStatus((runtimeStatus) => {
      if (
        runtimeStatus.lastCaptureAt &&
        runtimeStatus.lastCaptureAt !== lastCaptureAtRef.current
      ) {
        lastCaptureAtRef.current = runtimeStatus.lastCaptureAt;
        scheduleRefresh(latestSelectedSessionIdRef.current);
      }

      startTransition(() => {
        options.setState((current) => ({
          ...current,
          runtimeStatus,
        }));
      });
    });
  }, []);

  useEffect(() => {
    return () => {
      if (refreshTimerRef.current !== null) {
        clearTimeout(refreshTimerRef.current);
      }
    };
  }, []);

  return {
    refresh,
    refreshShellState,
  };
}
