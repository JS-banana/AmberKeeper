import type {
  CaptureMessageRecord,
  CaptureSessionRecord,
  ProviderId,
  ProviderRecord,
  RuntimeStatus,
  ServiceRecord,
  ShellInfo,
} from '@amberkeeper/shared-types';

export interface WorkspaceState {
  services: ServiceRecord[];
  activeServiceId: string | null;
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

export type CaptureActionResult = { message: string; detail: string };

export const INITIAL_STATE: WorkspaceState = {
  services: [],
  activeServiceId: null,
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

export function resolveSelectedSessionId(
  sessions: CaptureSessionRecord[],
  preferredSessionId: string | null
): string | null {
  if (preferredSessionId && sessions.some((session) => session.id === preferredSessionId)) {
    return preferredSessionId;
  }

  return sessions[0]?.id ?? null;
}

export function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
