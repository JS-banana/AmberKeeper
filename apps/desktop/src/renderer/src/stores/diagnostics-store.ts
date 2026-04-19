import { startTransition, useEffect, useEffectEvent, useState } from 'react';
import type {
  CaptureMessageRecord,
  CaptureSessionRecord,
  GeminiThemeDiagnosticReport,
  RuntimeStatus,
} from '@amberkeeper/shared-types';

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
  const [geminiDiagnosticReport, setGeminiDiagnosticReport] =
    useState<GeminiThemeDiagnosticReport | null>(null);
  const [geminiDiagnosticFeedback, setGeminiDiagnosticFeedback] = useState('');

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

  const runGeminiThemeDiagnostic = useEffectEvent(async () => {
    try {
      const report = await window.captureApi.runGeminiThemeDiagnostic();
      startTransition(() => {
        setGeminiDiagnosticReport(report);
        setGeminiDiagnosticFeedback(`Gemini 诊断完成：${report.summary}`);
      });
      return report;
    } catch (error) {
      const message = formatError(error);
      startTransition(() => setGeminiDiagnosticFeedback(message));
      throw error;
    }
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
    geminiDiagnosticReport,
    geminiDiagnosticFeedback,
    selectSession,
    triggerSnapshot,
    runGeminiThemeDiagnostic,
  };
}

function formatError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}
