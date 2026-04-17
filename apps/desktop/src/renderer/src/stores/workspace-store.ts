import { useState } from 'react';
import {
  INITIAL_STATE,
  type WorkspaceState,
} from './workspace-store-types';
import { useWorkspaceActions } from './use-workspace-actions';
import { useWorkspaceQuery } from './use-workspace-query';

export function useWorkspaceStore() {
  const [state, setState] = useState<WorkspaceState>(INITIAL_STATE);
  const { refresh, refreshShellState } = useWorkspaceQuery({
    state,
    setState,
  });

  const actions = useWorkspaceActions({
    state,
    setState,
    refresh,
    refreshShellState,
  });

  const activeProvider =
    state.providers.find((provider) => provider.id === state.activeProviderId) ?? null;
  const activeService =
    state.services.find((service) => service.id === state.activeServiceId) ?? null;
  const selectedSession =
    state.sessions.find((session) => session.id === state.selectedSessionId) ?? null;

  return {
    state,
    activeService,
    activeProvider,
    selectedSession,
    actions: {
      refresh,
      ...actions,
    },
  };
}
