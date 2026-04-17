import { startTransition, useEffectEvent } from 'react';
import type {
  CaptureExportFormat,
  CreateCustomServiceInput,
  InterfaceLanguage,
  ProviderId,
  ProviderMoveDirection,
  ServiceMoveDirection,
} from '@amberkeeper/shared-types';
import type { Dispatch, SetStateAction } from 'react';
import {
  type CaptureActionResult,
  formatError,
  type WorkspaceState,
} from './workspace-store-types';

export function useWorkspaceActions(options: {
  state: WorkspaceState;
  setState: Dispatch<SetStateAction<WorkspaceState>>;
  refresh: (preferredSessionId?: string | null) => Promise<void>;
  refreshShellState: () => Promise<void>;
}) {
  const selectProvider = useEffectEvent(async (providerId: ProviderId) => {
    try {
      await window.captureApi.setActiveProvider(providerId);
      await options.refreshShellState();
    } catch (error) {
      startTransition(() => {
        options.setState((current) => ({
          ...current,
          error: formatError(error),
        }));
      });
    }
  });

  const selectService = useEffectEvent(async (serviceId: string) => {
    try {
      await window.captureApi.setActiveService(serviceId);
      await options.refreshShellState();
    } catch (error) {
      startTransition(() => {
        options.setState((current) => ({
          ...current,
          error: formatError(error),
        }));
      });
    }
  });

  const setProviderEnabled = useEffectEvent(async (providerId: ProviderId, enabled: boolean) => {
    try {
      await window.captureApi.setProviderEnabled(providerId, enabled);
      await options.refreshShellState();
    } catch (error) {
      startTransition(() => {
        options.setState((current) => ({
          ...current,
          error: formatError(error),
        }));
      });
    }
  });

  const setServiceEnabled = useEffectEvent(async (serviceId: string, enabled: boolean) => {
    try {
      await window.captureApi.setServiceEnabled(serviceId, enabled);
      await options.refreshShellState();
    } catch (error) {
      startTransition(() => {
        options.setState((current) => ({
          ...current,
          error: formatError(error),
        }));
      });
    }
  });

  const moveProvider = useEffectEvent(
    async (providerId: ProviderId, direction: ProviderMoveDirection) => {
      try {
        await window.captureApi.moveProvider(providerId, direction);
        await options.refreshShellState();
      } catch (error) {
        startTransition(() => {
          options.setState((current) => ({
            ...current,
            error: formatError(error),
          }));
        });
      }
    }
  );

  const moveService = useEffectEvent(async (serviceId: string, direction: ServiceMoveDirection) => {
    try {
      await window.captureApi.moveService(serviceId, direction);
      await options.refreshShellState();
    } catch (error) {
      startTransition(() => {
        options.setState((current) => ({
          ...current,
          error: formatError(error),
        }));
      });
    }
  });

  const addCustomService = useEffectEvent(async (input: CreateCustomServiceInput) => {
    try {
      await window.captureApi.addCustomService(input);
      await options.refreshShellState();
    } catch (error) {
      startTransition(() => {
        options.setState((current) => ({
          ...current,
          error: formatError(error),
        }));
      });
    }
  });

  const removeCustomService = useEffectEvent(async (serviceId: string) => {
    try {
      await window.captureApi.removeCustomService(serviceId);
      await options.refreshShellState();
    } catch (error) {
      startTransition(() => {
        options.setState((current) => ({
          ...current,
          error: formatError(error),
        }));
      });
    }
  });

  const updateCustomServiceIcon = useEffectEvent(async (serviceId: string, iconUrl: string | null) => {
    try {
      await window.captureApi.updateCustomServiceIcon(serviceId, iconUrl);
      await options.refreshShellState();
    } catch (error) {
      startTransition(() => {
        options.setState((current) => ({
          ...current,
          error: formatError(error),
        }));
      });
    }
  });

  const selectSession = useEffectEvent(async (sessionId: string) => {
    try {
      const targetSession =
        options.state.sessions.find((session) => session.id === sessionId) ?? null;
      const messages = await window.captureApi.listMessages(sessionId);

      startTransition(() => {
        options.setState((current) => ({
          ...current,
          selectedSessionId: sessionId,
          messages,
          error: null,
        }));
      });

      if (!targetSession || targetSession.provider !== options.state.activeProviderId) {
        return;
      }

      await window.captureApi.openSession(sessionId);
      const refreshedMessages = await window.captureApi.listMessages(sessionId);

      startTransition(() => {
        options.setState((current) => {
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
        options.setState((current) => ({
          ...current,
          error: formatError(error),
        }));
      });
    }
  });

  const deleteSession = useEffectEvent(async (sessionId: string): Promise<CaptureActionResult> => {
    const remainingSessions = options.state.sessions.filter((session) => session.id !== sessionId);
    const preferredSessionId =
      options.state.selectedSessionId === sessionId
        ? remainingSessions[0]?.id ?? null
        : options.state.selectedSessionId;

    try {
      const result = await window.captureApi.deleteSession(sessionId);
      await options.refresh(preferredSessionId);
      return result;
    } catch (error) {
      const message = formatError(error);
      startTransition(() => {
        options.setState((current) => ({
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
          options.setState((current) => ({
            ...current,
            error: formatError(error),
          }));
        });
        throw error;
      }
    }
  );

  const setProviderCacheEnabled = useEffectEvent(async (providerId: ProviderId, cacheEnabled: boolean) => {
    try {
      await window.captureApi.setProviderCacheEnabled(providerId, cacheEnabled);
      await options.refreshShellState();
    } catch (error) {
      startTransition(() => {
        options.setState((current) => ({
          ...current,
          error: formatError(error),
        }));
      });
    }
  });

  const setInterfaceLanguage = useEffectEvent(async (language: InterfaceLanguage) => {
    try {
      await window.captureApi.setInterfaceLanguage(language);
      await options.refreshShellState();
    } catch (error) {
      startTransition(() => {
        options.setState((current) => ({
          ...current,
          error: formatError(error),
        }));
      });
    }
  });

  const exportProviderSessions = useEffectEvent(
    async (providerId: ProviderId, format: CaptureExportFormat): Promise<CaptureActionResult> => {
      try {
        return await window.captureApi.exportProviderSessions(providerId, format);
      } catch (error) {
        startTransition(() => {
          options.setState((current) => ({
            ...current,
            error: formatError(error),
          }));
        });
        throw error;
      }
    }
  );

  return {
    selectProvider,
    selectService,
    setProviderEnabled,
    setServiceEnabled,
    moveProvider,
    moveService,
    addCustomService,
    removeCustomService,
    updateCustomServiceIcon,
    selectSession,
    deleteSession,
    exportSession,
    setProviderCacheEnabled,
    setInterfaceLanguage,
    exportProviderSessions,
  };
}
