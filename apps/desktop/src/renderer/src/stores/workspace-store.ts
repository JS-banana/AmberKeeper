import { startTransition, useEffect, useEffectEvent, useRef, useState } from 'react';
import type {
  CaptureExportFormat,
  CaptureMessageRecord,
  CaptureSessionRecord,
  ProviderId,
  ProviderRecord,
  RuntimeStatus,
  ShellInfo,
  ProviderMoveDirection,
} from '@amberkeeper/shared-types';

interface WorkspaceState {
  providers: ProviderRecord[];
  activeProviderId: ProviderId | null;
  sessions: CaptureSessionRecord[];
  selectedSessionId: string | null;
  messages: CaptureMessageRecord[];
  runtimeStatus: RuntimeStatus | null;
  shellInfo: ShellInfo | null;
  loading: boolean;
  error: string | null;
}

type CaptureActionResult = { message: string; detail: string };

const INITIAL_STATE: WorkspaceState = {
  providers: [],
  activeProviderId: null,
  sessions: [],
  selectedSessionId: null,
  messages: [],
  runtimeStatus: null,
  shellInfo: null,
  loading: true,
  error: null,
};

export function useWorkspaceStore() {
  const [state, setState] = useState<WorkspaceState>(INITIAL_STATE);
  const latestSelectedSessionIdRef = useRef<string | null>(null);
  const lastCaptureAtRef = useRef<string | null>(null);
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refresh = useEffectEvent(async (preferredSessionId?: string | null) => {
    startTransition(() => {
      setState((current) => ({
        ...current,
        loading: true,
        error: null,
      }));
    });

    try {
      const [providers, activeProvider, sessions, runtimeStatus, shellInfo] = await Promise.all([
        window.captureApi.listProviders(),
        window.captureApi.getActiveProvider(),
        window.captureApi.listSessions(),
        window.captureApi.getRuntimeStatus(),
        window.captureApi.getShellInfo(),
      ]);
      const activeProviderId =
        activeProvider?.id ?? providers.find((provider) => provider.active)?.id ?? null;
      const nextSelectedSessionId = resolveSelectedSessionId(
        sessions,
        preferredSessionId ?? state.selectedSessionId
      );
      const messages = nextSelectedSessionId
        ? await window.captureApi.listMessages(nextSelectedSessionId)
        : [];
      lastCaptureAtRef.current = runtimeStatus.lastCaptureAt;

      startTransition(() => {
        setState({
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
        setState((current) => ({
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

  const selectProvider = useEffectEvent(async (providerId: ProviderId) => {
    try {
      await window.captureApi.setActiveProvider(providerId);
      await refresh(null);
    } catch (error) {
      startTransition(() => {
        setState((current) => ({
          ...current,
          error: formatError(error),
        }));
      });
    }
  });

  const setProviderEnabled = useEffectEvent(async (providerId: ProviderId, enabled: boolean) => {
    try {
      await window.captureApi.setProviderEnabled(providerId, enabled);
      await refresh(null);
    } catch (error) {
      startTransition(() => {
        setState((current) => ({
          ...current,
          error: formatError(error),
        }));
      });
    }
  });

  const moveProvider = useEffectEvent(async (providerId: ProviderId, direction: ProviderMoveDirection) => {
    try {
      await window.captureApi.moveProvider(providerId, direction);
      await refresh(null);
    } catch (error) {
      startTransition(() => {
        setState((current) => ({
          ...current,
          error: formatError(error),
        }));
      });
    }
  });

  const selectSession = useEffectEvent(async (sessionId: string) => {
    try {
      const targetSession =
        state.sessions.find((session) => session.id === sessionId) ?? null;
      const messages = await window.captureApi.listMessages(sessionId);

      startTransition(() => {
        setState((current) => ({
          ...current,
          selectedSessionId: sessionId,
          messages,
          error: null,
        }));
      });

      if (!targetSession || targetSession.provider !== state.activeProviderId) {
        return;
      }

      await window.captureApi.openSession(sessionId);
      const refreshedMessages = await window.captureApi.listMessages(sessionId);

      startTransition(() => {
        setState((current) => {
          if (current.selectedSessionId !== sessionId) {
            return current;
          }

          return {
            ...current,
            messages: refreshedMessages,
            error: null,
          };
        });
      });
    } catch (error) {
      startTransition(() => {
        setState((current) => ({
          ...current,
          error: formatError(error),
        }));
      });
    }
  });

  const deleteSession = useEffectEvent(async (sessionId: string): Promise<CaptureActionResult> => {
    const remainingSessions = state.sessions.filter((session) => session.id !== sessionId);
    const preferredSessionId =
      state.selectedSessionId === sessionId
        ? remainingSessions[0]?.id ?? null
        : state.selectedSessionId;

    try {
      const result = await window.captureApi.deleteSession(sessionId);
      await refresh(preferredSessionId);
      return result;
    } catch (error) {
      const message = formatError(error);
      startTransition(() => {
        setState((current) => ({
          ...current,
          error: message,
        }));
      });
      throw error;
    }
  });

  const exportSession = useEffectEvent(
    async (sessionId: string, format: CaptureExportFormat): Promise<CaptureActionResult> => {
      try {
        return await window.captureApi.exportSession(sessionId, format);
      } catch (error) {
        startTransition(() => {
          setState((current) => ({
            ...current,
            error: formatError(error),
          }));
        });
        throw error;
      }
    }
  );

  const exportProviderSessions = useEffectEvent(
    async (providerId: ProviderId, format: CaptureExportFormat): Promise<CaptureActionResult> => {
      try {
        return await window.captureApi.exportProviderSessions(providerId, format);
      } catch (error) {
        startTransition(() => {
          setState((current) => ({
            ...current,
            error: formatError(error),
          }));
        });
        throw error;
      }
    }
  );

  useEffect(() => {
    latestSelectedSessionIdRef.current = state.selectedSessionId;
  }, [state.selectedSessionId]);

  useEffect(() => {
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
        setState((current) => ({
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

  const activeProvider =
    state.providers.find((provider) => provider.id === state.activeProviderId) ?? null;
  const selectedSession =
    state.sessions.find((session) => session.id === state.selectedSessionId) ?? null;

  return {
    state,
    activeProvider,
    selectedSession,
    actions: {
      refresh,
      selectProvider,
      setProviderEnabled,
      moveProvider,
      selectSession,
      deleteSession,
      exportSession,
      exportProviderSessions,
    },
  };
}

function resolveSelectedSessionId(
  sessions: CaptureSessionRecord[],
  preferredSessionId: string | null
): string | null {
  if (preferredSessionId && sessions.some((session) => session.id === preferredSessionId)) {
    return preferredSessionId;
  }

  return sessions[0]?.id ?? null;
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
