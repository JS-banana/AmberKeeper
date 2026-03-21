import { startTransition, useEffect, useEffectEvent, useState } from 'react';
import type {
  CaptureMessageRecord,
  CaptureSessionRecord,
  RuntimeStatus,
} from '@anychat/shared-types';

export const EMPTY_STATUS: RuntimeStatus = {
  debuggerAttached: false,
  currentUrl: 'https://chatgpt.com',
  lastCaptureAt: null,
  pendingRequestCount: 0,
  recentAttempts: [],
};

export function useDiagnosticsStore() {
  const [runtimeStatus, setRuntimeStatus] = useState<RuntimeStatus>(EMPTY_STATUS);
  const [sessions, setSessions] = useState<CaptureSessionRecord[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<CaptureMessageRecord[]>([]);
  const [snapshotFeedback, setSnapshotFeedback] = useState('');

  const selectedSession =
    sessions.find((session) => session.id === selectedSessionId) ?? null;

  const refreshData = useEffectEvent(async () => {
    const [status, nextSessions] = await Promise.all([
      window.captureApi.getRuntimeStatus(),
      window.captureApi.listSessions(),
    ]);

    startTransition(() => {
      setRuntimeStatus(status);
      setSessions(nextSessions);
      setSelectedSessionId((current) => {
        if (current && nextSessions.some((session) => session.id === current)) {
          return current;
        }

        return nextSessions[0]?.id ?? null;
      });
    });
  });

  const refreshMessages = useEffectEvent(async (sessionId: string | null) => {
    if (!sessionId) {
      startTransition(() => setMessages([]));
      return;
    }

    const nextMessages = await window.captureApi.listMessages(sessionId);
    startTransition(() => setMessages(nextMessages));
  });

  const triggerSnapshot = useEffectEvent(async () => {
    const result = await window.captureApi.triggerDomSnapshot();

    startTransition(() => setSnapshotFeedback(result.message));
    await refreshData();

    return result;
  });

  const selectSession = useEffectEvent(async (sessionId: string) => {
    try {
      startTransition(() => setSelectedSessionId(sessionId));

      const nextMessages = await window.captureApi.listMessages(sessionId);
      startTransition(() => setMessages(nextMessages));

      await window.captureApi.openSession(sessionId);
      await refreshData();
      await refreshMessages(sessionId);
    } catch (error) {
      startTransition(() => setSnapshotFeedback(formatError(error)));
    }
  });

  useEffect(() => {
    void refreshData();

    const cancel = window.captureApi.onRuntimeStatus((status) => {
      startTransition(() => setRuntimeStatus(status));
      void refreshData();
    });

    const timer = window.setInterval(() => {
      void refreshData();
    }, 2500);

    return () => {
      cancel();
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    void refreshMessages(selectedSessionId);
  }, [selectedSessionId]);

  return {
    runtimeStatus,
    sessions,
    selectedSessionId,
    selectedSession,
    messages,
    snapshotFeedback,
    selectSession,
    triggerSnapshot,
  };
}

function formatError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}
