// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import type {
  CaptureMessageRecord,
  CaptureSessionRecord,
  ProviderRecord,
  RuntimeStatus,
} from '@amberkeeper/shared-types';
import { App } from './App';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

test('renders a user-facing chat shell and hides diagnostics in production mode', async () => {
  const state = createWorkspaceFixture();
  const api = installCaptureApiMock(state, {
    shellInfo: { diagnosticsEnabled: false, isPackaged: true },
  });

  render(<App />);

  expect(screen.queryByText('Workspace and Diagnostics')).not.toBeInTheDocument();
  expect(screen.queryByText('AK')).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: '诊断' })).not.toBeInTheDocument();
  expect(await screen.findByRole('button', { name: '打开 ChatGPT' })).toBeInTheDocument();
  expect(await screen.findByRole('button', { name: '打开 Claude' })).toBeInTheDocument();
  expect(screen.getByRole('navigation', { name: '应用列表' })).toBeInTheDocument();
  expect(screen.getByRole('navigation', { name: '工作台入口' })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: '会话库' })).not.toBeInTheDocument();
  expect(await screen.findByRole('button', { name: '打开设置' })).not.toHaveAttribute('title');
  expect(await screen.findByRole('button', { name: '打开设置' })).not.toHaveAttribute('data-tooltip');
  expect(screen.queryByText('当前应用')).not.toBeInTheDocument();

  await waitFor(() => {
    expect(api.setNativeStageVisible).toHaveBeenLastCalledWith(true);
  });
});

test('switches the active provider from the rail and keeps chat mode focused on the native stage', async () => {
  const state = createWorkspaceFixture();
  const api = installCaptureApiMock(state, {
    shellInfo: { diagnosticsEnabled: false, isPackaged: true },
  });

  render(<App />);

  fireEvent.click(await screen.findByRole('button', { name: '打开 Claude' }));

  await waitFor(() => {
    expect(api.setActiveProvider).toHaveBeenCalledWith('claude');
  });
  expect(await screen.findByRole('button', { name: '打开 Claude' })).toHaveAttribute(
    'aria-pressed',
    'true'
  );
  await waitFor(() => {
    expect(api.setNativeStageVisible).toHaveBeenLastCalledWith(true);
  });
});

test('opens the library, hides the native stage, and hydrates the selected session history', async () => {
  const state = createHydrationFixture();
  const api = installCaptureApiMock(state, {
    shellInfo: { diagnosticsEnabled: false, isPackaged: true },
  });

  render(<App />);

  fireEvent.click(await screen.findByRole('button', { name: '打开设置' }));
  fireEvent.click(await screen.findByRole('button', { name: '会话库' }));

  expect(await screen.findByText('聊天记录')).toBeInTheDocument();
  await waitFor(() => {
    expect(api.setNativeStageVisible).toHaveBeenLastCalledWith(false);
  });
  expect(await screen.findByText('Recent answer')).toBeInTheDocument();
  fireEvent.click(await screen.findByRole('button', { name: /chatgpt-older-conv/i }));

  await waitFor(() => {
    expect(api.openSession).toHaveBeenCalledWith('chatgpt-older-session');
  });
  expect(await screen.findByText('Hydrated old answer')).toBeInTheDocument();
  await waitFor(() => {
    expect(screen.queryByText('Recent answer')).not.toBeInTheDocument();
  });
});

test('allows enabling and reordering built-in providers from settings', async () => {
  const state = createWorkspaceFixture({ deepseekEnabled: true });
  const api = installCaptureApiMock(state, {
    shellInfo: { diagnosticsEnabled: false, isPackaged: true },
  });

  render(<App />);

  fireEvent.click(await screen.findByRole('button', { name: '打开设置' }));

  expect(await screen.findByRole('heading', { name: '应用设置' })).toBeInTheDocument();
  await waitFor(() => {
    expect(api.setNativeStageVisible).toHaveBeenLastCalledWith(false);
  });

  fireEvent.click(screen.getByRole('button', { name: '停用 Claude' }));
  await waitFor(() => {
    expect(api.setProviderEnabled).toHaveBeenCalledWith('claude', false);
  });

  fireEvent.click(screen.getByRole('button', { name: 'Gemini 上移' }));
  await waitFor(() => {
    expect(api.moveProvider).toHaveBeenCalledWith('gemini', 'up');
  });
  await waitFor(() => {
    const settingsList = screen.getByRole('list', { name: '内置应用列表' });
    const items = within(settingsList).getAllByRole('listitem');
    expect(items.map((item) => item.getAttribute('data-provider-id'))).toEqual([
      'chatgpt',
      'claude',
      'gemini',
      'deepseek',
    ]);
  });
  fireEvent.click(screen.getByRole('button', { name: 'Gemini 上移' }));
  await waitFor(() => {
    expect(api.moveProvider).toHaveBeenNthCalledWith(2, 'gemini', 'up');
  });
  await waitFor(() => {
    const refreshedList = screen.getByRole('list', { name: '内置应用列表' });
    const refreshedItems = within(refreshedList).getAllByRole('listitem');
    expect(refreshedItems.map((item) => item.getAttribute('data-provider-id'))).toEqual([
      'chatgpt',
      'gemini',
      'claude',
      'deepseek',
    ]);
  });

  fireEvent.click(screen.getByRole('button', { name: '会话库' }));
  fireEvent.click(screen.getByRole('button', { name: '应用设置' }));

  const settingsList = screen.getByRole('list', { name: '内置应用列表' });
  const items = within(settingsList).getAllByRole('listitem');
  expect(items.map((item) => item.getAttribute('data-provider-id'))).toEqual([
    'chatgpt',
    'gemini',
    'claude',
    'deepseek',
  ]);
  expect(screen.getByRole('button', { name: '启用 Claude' })).toBeInTheDocument();
});

test('shows diagnostics only when the shell info enables developer tools', async () => {
  const state = createHydrationFixture();
  installCaptureApiMock(state, {
    shellInfo: { diagnosticsEnabled: true, isPackaged: false },
  });

  render(<App />);

  fireEvent.click(await screen.findByRole('button', { name: '打开设置' }));
  fireEvent.click(await screen.findByRole('button', { name: '诊断' }));

  expect(await screen.findByText('抓取调试台与对账控制台')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '诊断' })).not.toHaveAttribute('title');
  expect(screen.getByRole('button', { name: '诊断' })).not.toHaveAttribute('data-tooltip');
});

test('renders diagnostics tooling with chinese labels for internal operators', async () => {
  const state = createHydrationFixture();
  installCaptureApiMock(state, {
    shellInfo: { diagnosticsEnabled: true, isPackaged: false },
  });

  render(<App />);

  fireEvent.click(await screen.findByRole('button', { name: '打开设置' }));
  fireEvent.click(await screen.findByRole('button', { name: '诊断' }));

  expect(await screen.findByRole('heading', { name: '运行状态' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '触发 DOM 快照' })).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: '最近尝试' })).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: '会话' })).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: '消息' })).toBeInTheDocument();
  expect(screen.getByText('当前地址')).toBeInTheDocument();
});

function installCaptureApiMock(
  state: WorkspaceFixtureState,
  input?: {
    shellInfo?: { diagnosticsEnabled: boolean; isPackaged: boolean };
  }
) {
  const setActiveProvider = vi.fn(async (providerId: string) => {
    state.providers = state.providers.map((provider) => ({
      ...provider,
      active: provider.id === providerId && provider.enabled,
    }));

    return state.providers.find((provider) => provider.active) ?? null;
  });

  const setProviderEnabled = vi.fn(async (providerId: string, enabled: boolean) => {
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
  });

  const moveProvider = vi.fn(async (providerId: string, direction: 'up' | 'down') => {
    const index = state.providers.findIndex((provider) => provider.id === providerId);
    if (index < 0) {
      return state.providers;
    }

    const nextIndex =
      direction === 'up'
        ? Math.max(index - 1, 0)
        : Math.min(index + 1, state.providers.length - 1);
    const nextProviders = [...state.providers];
    const [provider] = nextProviders.splice(index, 1);
    nextProviders.splice(nextIndex, 0, provider);
    state.providers = nextProviders;

    return state.providers;
  });

  const openSession = vi.fn(async (sessionId: string) => {
    if (sessionId === 'chatgpt-older-session') {
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
    }

    return {
      message: 'hydrated',
      detail: '',
    };
  });

  const setNativeStageVisible = vi.fn(async (_visible: boolean) => undefined);

  window.captureApi = {
    listSessions: async () => state.sessions,
    listMessages: async (sessionId: string) => state.messages[sessionId] ?? [],
    openSession,
    listProviders: async () => state.providers,
    getActiveProvider: async () => state.providers.find((provider) => provider.active) ?? null,
    setActiveProvider,
    setProviderEnabled,
    moveProvider,
    getRuntimeStatus: async () => buildRuntimeStatus(state.providers),
    triggerDomSnapshot: async () => ({
      message: 'stubbed',
      detail: '',
    }),
    getShellInfo: async () =>
      input?.shellInfo ?? {
        diagnosticsEnabled: false,
        isPackaged: true,
      },
    setNativeStageVisible,
    onRuntimeStatus: () => () => undefined,
  } as never;

  return {
    setActiveProvider,
    setProviderEnabled,
    moveProvider,
    openSession,
    setNativeStageVisible,
  };
}

function buildRuntimeStatus(providers: ProviderRecord[]): RuntimeStatus {
  return {
    debuggerAttached: false,
    currentUrl: providers.find((provider) => provider.active)?.homeUrl ?? 'https://chatgpt.com',
    lastCaptureAt: null,
    pendingRequestCount: 0,
    recentAttempts: [],
  };
}

type WorkspaceFixtureState = {
  providers: ProviderRecord[];
  sessions: CaptureSessionRecord[];
  messages: Record<string, CaptureMessageRecord[]>;
};

function createWorkspaceFixture(input?: { deepseekEnabled?: boolean }): WorkspaceFixtureState {
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
        enabled: input?.deepseekEnabled ?? false,
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

function createHydrationFixture(): WorkspaceFixtureState {
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
