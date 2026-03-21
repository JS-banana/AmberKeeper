import { startTransition, useEffect, useEffectEvent, useState } from 'react';
import type {
  CaptureMessageRecord,
  CaptureSessionRecord,
  ProviderId,
  ProviderRecord,
  RuntimeStatus,
} from '@amberkeeper/shared-types';

interface WorkspaceState {
  providers: ProviderRecord[];
  activeProviderId: ProviderId | null;
  sessions: CaptureSessionRecord[];
  selectedSessionId: string | null;
  messages: CaptureMessageRecord[];
  runtimeStatus: RuntimeStatus | null;
  loading: boolean;
  error: string | null;
}

const INITIAL_STATE: WorkspaceState = {
  providers: [],
  activeProviderId: null,
  sessions: [],
  selectedSessionId: null,
  messages: [],
  runtimeStatus: null,
  loading: true,
  error: null,
};

export function useWorkspaceStore() {
  const [state, setState] = useState<WorkspaceState>(INITIAL_STATE);

  const refresh = useEffectEvent(async (preferredSessionId?: string | null) => {
    startTransition(() => {
      setState((current) => ({
        ...current,
        loading: true,
        error: null,
      }));
    });

    try {
      const [providers, activeProvider, sessions, runtimeStatus] = await Promise.all([
        window.captureApi.listProviders(),
        window.captureApi.getActiveProvider(),
        window.captureApi.listSessions(),
        window.captureApi.getRuntimeStatus(),
      ]);
      const activeProviderId =
        activeProvider?.id ?? providers.find((provider) => provider.active)?.id ?? null;
      const scopedSessions = activeProviderId
        ? sessions.filter((session) => session.provider === activeProviderId)
        : [];
      const nextSelectedSessionId = resolveSelectedSessionId(
        scopedSessions,
        preferredSessionId ?? state.selectedSessionId
      );
      const messages = nextSelectedSessionId
        ? await window.captureApi.listMessages(nextSelectedSessionId)
        : [];

      startTransition(() => {
        setState({
          providers,
          activeProviderId,
          sessions: scopedSessions,
          selectedSessionId: nextSelectedSessionId,
          messages,
          runtimeStatus,
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

  const selectSession = useEffectEvent(async (sessionId: string) => {
    try {
      const messages = await window.captureApi.listMessages(sessionId);

      startTransition(() => {
        setState((current) => ({
          ...current,
          selectedSessionId: sessionId,
          messages,
          error: null,
        }));
      });

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

  useEffect(() => {
    void refresh(null);

    return window.captureApi.onRuntimeStatus((runtimeStatus) => {
      startTransition(() => {
        setState((current) => ({
          ...current,
          runtimeStatus,
        }));
      });
    });
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
      selectSession,
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
