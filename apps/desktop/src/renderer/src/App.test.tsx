// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import type {
  CaptureMessageRecord,
  CaptureSessionRecord,
  ProviderRecord,
} from '@amberkeeper/shared-types';
import { App } from './App';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

test('renders provider management in workspace and scopes sessions/messages to the active provider', async () => {
  const timerHandle = 0 as unknown as ReturnType<typeof window.setInterval>;
  vi.spyOn(window, 'setInterval').mockImplementation(() => timerHandle);
  vi.spyOn(window, 'clearInterval').mockImplementation(() => undefined);

  const state = createWorkspaceFixture();

  window.captureApi = {
    listSessions: async () => state.sessions,
    listMessages: async (sessionId: string) => state.messages[sessionId] ?? [],
    listProviders: async () => state.providers,
    getActiveProvider: async () => state.providers.find((provider) => provider.active) ?? null,
    setActiveProvider: async (providerId: string) => {
      state.providers = state.providers.map((provider) => ({
        ...provider,
        active: provider.id === providerId && provider.enabled,
      }));

      return state.providers.find((provider) => provider.active) ?? null;
    },
    setProviderEnabled: async (providerId: string, enabled: boolean) => {
      state.providers = state.providers.map((provider) => {
        if (provider.id !== providerId) {
          return provider;
        }

        return {
          ...provider,
          enabled,
          active: enabled ? provider.active : false,
        };
      });

      if (!state.providers.some((provider) => provider.active)) {
        const fallback = state.providers.find((provider) => provider.enabled);
        state.providers = state.providers.map((provider) => ({
          ...provider,
          active: provider.id === fallback?.id,
        }));
      }

      return state.providers.find((provider) => provider.id === providerId) ?? null;
    },
    getRuntimeStatus: async () => ({
      debuggerAttached: false,
      currentUrl:
        state.providers.find((provider) => provider.active)?.homeUrl ?? 'https://chatgpt.com',
      lastCaptureAt: null,
      pendingRequestCount: 0,
      recentAttempts: [],
    }),
    triggerDomSnapshot: async () => ({
      message: 'stubbed',
      detail: '',
    }),
    onRuntimeStatus: () => () => undefined,
  } as never;

  render(<App />);

  expect(await screen.findByRole('button', { name: 'Open ChatGPT' })).toBeInTheDocument();
  expect(await screen.findByRole('button', { name: 'Open Claude' })).toBeInTheDocument();
  expect(await screen.findByRole('button', { name: 'Open DeepSeek' })).toBeDisabled();
  expect(await screen.findByRole('button', { name: 'Open Gemini' })).toBeInTheDocument();

  expect(await screen.findByText('ChatGPT answer')).toBeInTheDocument();
  expect(screen.queryByText('Claude answer')).not.toBeInTheDocument();
  expect(screen.getAllByText('chatgpt-conv').length).toBeGreaterThan(0);

  fireEvent.click(screen.getByRole('button', { name: 'Open Claude' }));

  expect(await screen.findByText('Claude answer')).toBeInTheDocument();
  await waitFor(() => {
    expect(screen.queryByText('ChatGPT answer')).not.toBeInTheDocument();
  });
  expect(screen.getAllByText('claude-conv').length).toBeGreaterThan(0);

  fireEvent.click(screen.getByRole('button', { name: 'Disable Claude' }));

  expect(await screen.findByText('ChatGPT answer')).toBeInTheDocument();
  await waitFor(() => {
    expect(screen.queryByText('Claude answer')).not.toBeInTheDocument();
  });
  expect(screen.getByText('Active Provider')).toBeInTheDocument();
  expect(screen.getAllByText('ChatGPT').length).toBeGreaterThan(0);
});

test('opens the selected remote session and refreshes hydrated history', async () => {
  const timerHandle = 0 as unknown as ReturnType<typeof window.setInterval>;
  vi.spyOn(window, 'setInterval').mockImplementation(() => timerHandle);
  vi.spyOn(window, 'clearInterval').mockImplementation(() => undefined);

  const state = createHydrationFixture();
  const openSession = vi.fn(async (sessionId: string) => {
    if (sessionId !== 'chatgpt-older-session') {
      return { message: 'noop', detail: '' };
    }

    state.messages['chatgpt-older-session'] = [
      buildMessage({
        id: 'chatgpt-older-message-1',
        sessionId: 'chatgpt-older-session',
        provider: 'chatgpt',
        role: 'user',
        content: 'Old prompt',
      }),
      buildMessage({
        id: 'chatgpt-older-message-2',
        sessionId: 'chatgpt-older-session',
        provider: 'chatgpt',
        role: 'assistant',
        content: 'Hydrated old answer',
      }),
    ];

    return {
      message: 'hydrated',
      detail: '',
    };
  });

  window.captureApi = {
    listSessions: async () => state.sessions,
    listMessages: async (sessionId: string) => state.messages[sessionId] ?? [],
    openSession,
    listProviders: async () => state.providers,
    getActiveProvider: async () => state.providers.find((provider) => provider.active) ?? null,
    setActiveProvider: async (providerId: string) => {
      state.providers = state.providers.map((provider) => ({
        ...provider,
        active: provider.id === providerId && provider.enabled,
      }));

      return state.providers.find((provider) => provider.active) ?? null;
    },
    setProviderEnabled: async (providerId: string, enabled: boolean) => {
      state.providers = state.providers.map((provider) => {
        if (provider.id !== providerId) {
          return provider;
        }

        return {
          ...provider,
          enabled,
          active: enabled ? provider.active : false,
        };
      });

      if (!state.providers.some((provider) => provider.active)) {
        const fallback = state.providers.find((provider) => provider.enabled);
        state.providers = state.providers.map((provider) => ({
          ...provider,
          active: provider.id === fallback?.id,
        }));
      }

      return state.providers.find((provider) => provider.id === providerId) ?? null;
    },
    getRuntimeStatus: async () => ({
      debuggerAttached: false,
      currentUrl: 'https://chatgpt.com',
      lastCaptureAt: null,
      pendingRequestCount: 0,
      recentAttempts: [],
    }),
    triggerDomSnapshot: async () => ({
      message: 'stubbed',
      detail: '',
    }),
    onRuntimeStatus: () => () => undefined,
  } as never;

  render(<App />);

  expect(await screen.findByText('Recent answer')).toBeInTheDocument();
  await screen.findByRole('button', { name: /chatgpt-older-conv/i });

  fireEvent.click(screen.getByRole('button', { name: /chatgpt-older-conv/i }));

  await waitFor(() => {
    expect(openSession).toHaveBeenCalledWith('chatgpt-older-session');
  });
  expect(await screen.findByText('Hydrated old answer')).toBeInTheDocument();
  await waitFor(() => {
    expect(screen.queryByText('Recent answer')).not.toBeInTheDocument();
  });
});

test('hydrates the selected remote session from diagnostics too', async () => {
  const timerHandle = 0 as unknown as ReturnType<typeof window.setInterval>;
  vi.spyOn(window, 'setInterval').mockImplementation(() => timerHandle);
  vi.spyOn(window, 'clearInterval').mockImplementation(() => undefined);

  const state = createHydrationFixture();
  const openSession = vi.fn(async (sessionId: string) => {
    if (sessionId !== 'chatgpt-older-session') {
      return { message: 'noop', detail: '' };
    }

    state.messages['chatgpt-older-session'] = [
      buildMessage({
        id: 'chatgpt-older-message-1',
        sessionId: 'chatgpt-older-session',
        provider: 'chatgpt',
        role: 'user',
        content: 'Old prompt',
      }),
      buildMessage({
        id: 'chatgpt-older-message-2',
        sessionId: 'chatgpt-older-session',
        provider: 'chatgpt',
        role: 'assistant',
        content: 'Hydrated diagnostics answer',
      }),
    ];

    return {
      message: 'hydrated',
      detail: '',
    };
  });

  window.captureApi = {
    listSessions: async () => state.sessions,
    listMessages: async (sessionId: string) => state.messages[sessionId] ?? [],
    openSession,
    listProviders: async () => state.providers,
    getActiveProvider: async () => state.providers.find((provider) => provider.active) ?? null,
    setActiveProvider: async (providerId: string) => {
      state.providers = state.providers.map((provider) => ({
        ...provider,
        active: provider.id === providerId && provider.enabled,
      }));

      return state.providers.find((provider) => provider.active) ?? null;
    },
    setProviderEnabled: async (providerId: string, enabled: boolean) => {
      state.providers = state.providers.map((provider) => {
        if (provider.id !== providerId) {
          return provider;
        }

        return {
          ...provider,
          enabled,
          active: enabled ? provider.active : false,
        };
      });

      if (!state.providers.some((provider) => provider.active)) {
        const fallback = state.providers.find((provider) => provider.enabled);
        state.providers = state.providers.map((provider) => ({
          ...provider,
          active: provider.id === fallback?.id,
        }));
      }

      return state.providers.find((provider) => provider.id === providerId) ?? null;
    },
    getRuntimeStatus: async () => ({
      debuggerAttached: false,
      currentUrl: 'https://chatgpt.com',
      lastCaptureAt: null,
      pendingRequestCount: 0,
      recentAttempts: [],
    }),
    triggerDomSnapshot: async () => ({
      message: 'stubbed',
      detail: '',
    }),
    onRuntimeStatus: () => () => undefined,
  } as never;

  render(<App />);

  fireEvent.click(await screen.findByRole('button', { name: 'Diagnostics' }));
  await screen.findByRole('button', { name: /chatgpt-older-conv/i });

  fireEvent.click(screen.getByRole('button', { name: /chatgpt-older-conv/i }));

  await waitFor(() => {
    expect(openSession).toHaveBeenCalledWith('chatgpt-older-session');
  });
  expect(await screen.findByText('Hydrated diagnostics answer')).toBeInTheDocument();
});

function createWorkspaceFixture(): {
  providers: ProviderRecord[];
  sessions: CaptureSessionRecord[];
  messages: Record<string, CaptureMessageRecord[]>;
} {
  return {
    providers: [
      buildProvider({
        id: 'chatgpt',
        name: 'ChatGPT',
        homeUrl: 'https://chatgpt.com',
        enabled: true,
        active: true,
      }),
      buildProvider({
        id: 'claude',
        name: 'Claude',
        homeUrl: 'https://claude.ai',
        enabled: true,
      }),
      buildProvider({
        id: 'deepseek',
        name: 'DeepSeek',
        homeUrl: 'https://chat.deepseek.com/',
        enabled: false,
      }),
      buildProvider({
        id: 'gemini',
        name: 'Gemini',
        homeUrl: 'https://gemini.google.com/app',
        enabled: true,
      }),
    ],
    sessions: [
      buildSession({
        id: 'chatgpt-session',
        provider: 'chatgpt',
        remoteConversationId: 'chatgpt-conv',
      }),
      buildSession({
        id: 'claude-session',
        provider: 'claude',
        remoteConversationId: 'claude-conv',
      }),
      buildSession({
        id: 'gemini-session',
        provider: 'gemini',
        remoteConversationId: 'gemini-conv',
      }),
    ],
    messages: {
      'chatgpt-session': [
        buildMessage({
          id: 'chatgpt-message-1',
          sessionId: 'chatgpt-session',
          provider: 'chatgpt',
          role: 'assistant',
          content: 'ChatGPT answer',
        }),
      ],
      'claude-session': [
        buildMessage({
          id: 'claude-message-1',
          sessionId: 'claude-session',
          provider: 'claude',
          role: 'assistant',
          content: 'Claude answer',
        }),
      ],
      'gemini-session': [
        buildMessage({
          id: 'gemini-message-1',
          sessionId: 'gemini-session',
          provider: 'gemini',
          role: 'assistant',
          content: 'Gemini answer',
        }),
      ],
    },
  };
}

function createHydrationFixture(): {
  providers: ProviderRecord[];
  sessions: CaptureSessionRecord[];
  messages: Record<string, CaptureMessageRecord[]>;
} {
  return {
    providers: [
      buildProvider({
        id: 'chatgpt',
        name: 'ChatGPT',
        homeUrl: 'https://chatgpt.com',
        enabled: true,
        active: true,
      }),
    ],
    sessions: [
      buildSession({
        id: 'chatgpt-recent-session',
        provider: 'chatgpt',
        remoteConversationId: 'chatgpt-recent-conv',
      }),
      buildSession({
        id: 'chatgpt-older-session',
        provider: 'chatgpt',
        remoteConversationId: 'chatgpt-older-conv',
      }),
    ],
    messages: {
      'chatgpt-recent-session': [
        buildMessage({
          id: 'chatgpt-recent-message-1',
          sessionId: 'chatgpt-recent-session',
          provider: 'chatgpt',
          role: 'assistant',
          content: 'Recent answer',
        }),
      ],
      'chatgpt-older-session': [],
    },
  };
}

function buildProvider(
  input: Pick<ProviderRecord, 'id' | 'name' | 'homeUrl' | 'enabled'> & {
    active?: boolean;
  }
): ProviderRecord {
  return {
    id: input.id,
    name: input.name,
    homeUrl: input.homeUrl,
    enabled: input.enabled,
    builtin: true,
    active: input.active ?? false,
    createdAt: '2026-03-19T00:00:00.000Z',
    updatedAt: '2026-03-19T00:00:00.000Z',
  };
}

function buildSession(
  input: Pick<CaptureSessionRecord, 'id' | 'provider' | 'remoteConversationId'>
): CaptureSessionRecord {
  return {
    id: input.id,
    provider: input.provider,
    remoteConversationId: input.remoteConversationId,
    sourceSessionKey: `${input.provider}-primary-view`,
    pageUrl: `https://example.com/${input.remoteConversationId ?? input.id}`,
    messageCount: 1,
    createdAt: '2026-03-19T00:00:00.000Z',
    updatedAt: '2026-03-19T00:00:00.000Z',
  };
}

function buildMessage(
  input: Pick<
    CaptureMessageRecord,
    'id' | 'sessionId' | 'provider' | 'role' | 'content'
  >
): CaptureMessageRecord {
  return {
    id: input.id,
    sessionId: input.sessionId,
    provider: input.provider,
    remoteConversationId: `${input.provider}-conv`,
    role: input.role,
    content: input.content,
    contentHash: `${input.id}-hash`,
    remoteMessageId: null,
    model: null,
    source: 'cdp-network',
    createdAt: '2026-03-19T00:00:00.000Z',
    capturedAt: '2026-03-19T00:00:00.000Z',
  };
}
