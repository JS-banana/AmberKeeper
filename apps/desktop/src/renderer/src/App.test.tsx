// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import type {
  CaptureExportFormat,
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
  expect(screen.queryByRole('button', { name: '知识库' })).not.toBeInTheDocument();
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

test('opens the library in all-record mode, hides the native stage, and hydrates provider-specific history on demand', async () => {
  const state = createHydrationFixture();
  const api = installCaptureApiMock(state, {
    shellInfo: { diagnosticsEnabled: false, isPackaged: true },
  });

  render(<App />);

  fireEvent.click(await screen.findByRole('button', { name: '打开设置' }));
  fireEvent.click(screen.getByRole('button', { name: '历史会话' }));

  expect(await screen.findByRole('heading', { name: '历史记录' })).toBeInTheDocument();
  expect(screen.getByText('2 条记录 · 1 个服务')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '查看全部记录' })).toHaveAttribute('aria-pressed', 'true');
  expect(screen.getByText('全部记录总览')).toBeInTheDocument();
  expect(screen.queryByText('Recent answer')).not.toBeInTheDocument();
  await waitFor(() => {
    expect(api.setNativeStageVisible).toHaveBeenLastCalledWith(false);
  });
  fireEvent.click(screen.getByRole('button', { name: '查看 ChatGPT 记录' }));
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

test('renders the utility area with a left nav and compact service rows', async () => {
  const state = createWorkspaceFixture({ deepseekEnabled: true });
  installCaptureApiMock(state, {
    shellInfo: { diagnosticsEnabled: true, isPackaged: false },
  });

  render(<App />);

  fireEvent.click(await screen.findByRole('button', { name: '打开设置' }));

  const nav = screen.getByRole('navigation', { name: '设置与历史' });
  expect(nav.closest('.utility-workbench')).toHaveClass('utility-workbench--sidebar');
  expect(within(nav).getByRole('button', { name: '服务管理' })).toHaveAttribute('aria-current', 'page');
  expect(within(nav).getByRole('button', { name: '历史会话' })).toBeInTheDocument();
  expect(within(nav).getByRole('button', { name: '诊断' })).toBeInTheDocument();

  const chatgptItem = within(screen.getByRole('list', { name: '内置应用列表' }))
    .getAllByRole('listitem')
    .find((item) => item.getAttribute('data-provider-id') === 'chatgpt');

  expect(chatgptItem).toBeDefined();
  expect(within(chatgptItem!).queryByText('https://chatgpt.com')).not.toBeInTheDocument();
  expect(
    within(chatgptItem!).queryByText(/拖动整行即可调整服务顺序|拖动到目标位置后松手完成排序/)
  ).not.toBeInTheDocument();
  expect(within(chatgptItem!).getByRole('button', { name: '打开 ChatGPT' })).toHaveAttribute(
    'title',
    '打开 ChatGPT'
  );
  expect(within(chatgptItem!).getByRole('button', { name: '停用 ChatGPT' })).toHaveAttribute(
    'title',
    '停用 ChatGPT'
  );
});

test('shows the library as an all-provider knowledge base instead of scoping to the active provider', async () => {
  const state = createWorkspaceFixture();
  const api = installCaptureApiMock(state, {
    shellInfo: { diagnosticsEnabled: false, isPackaged: true },
  });

  render(<App />);

  fireEvent.click(await screen.findByRole('button', { name: '打开 Claude' }));

  await waitFor(() => {
    expect(api.setActiveProvider).toHaveBeenCalledWith('claude');
  });

  fireEvent.click(await screen.findByRole('button', { name: '打开设置' }));
  fireEvent.click(screen.getByRole('button', { name: '历史会话' }));

  expect(await screen.findByRole('heading', { name: '历史记录' })).toBeInTheDocument();
  expect(screen.getByText('3 条记录 · 3 个服务')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '查看全部记录' })).toHaveAttribute('aria-pressed', 'true');
  expect(screen.getByText('全部记录总览')).toBeInTheDocument();
  expect(screen.queryByRole('list', { name: '历史记录列表' })).not.toBeInTheDocument();
  expect(screen.queryByRole('heading', { name: '记录详情' })).not.toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: '查看 Claude 记录' }));

  expect(await screen.findByRole('list', { name: '历史记录列表' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /claude-conv/i })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /chatgpt-conv/i })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /gemini-conv/i })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /claude-conv/i }));
  expect(await screen.findByText('Claude answer')).toBeInTheDocument();
});

test('keeps all-provider history visible even when the active provider has no sessions', async () => {
  const state = createWorkspaceFixture({ deepseekEnabled: true });
  const api = installCaptureApiMock(state, {
    shellInfo: { diagnosticsEnabled: false, isPackaged: true },
  });

  render(<App />);

  fireEvent.click(await screen.findByRole('button', { name: '打开 DeepSeek' }));

  await waitFor(() => {
    expect(api.setActiveProvider).toHaveBeenCalledWith('deepseek');
  });

  fireEvent.click(await screen.findByRole('button', { name: '打开设置' }));
  fireEvent.click(screen.getByRole('button', { name: '历史会话' }));

  expect(await screen.findByRole('heading', { name: '历史记录' })).toBeInTheDocument();
  expect(screen.getByText('3 条记录 · 4 个服务')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '查看全部记录' })).toHaveAttribute('aria-pressed', 'true');
  fireEvent.click(screen.getByRole('button', { name: '查看 ChatGPT 记录' }));
  expect(await screen.findByRole('button', { name: /chatgpt-conv/i })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: '查看 Claude 记录' }));
  expect(await screen.findByRole('button', { name: /claude-conv/i })).toBeInTheDocument();
});

test('uses semantic fallback titles in the knowledge base when provider page titles are generic', async () => {
  const state = createWorkspaceFixture({ deepseekEnabled: true });
  state.sessions.unshift(
    buildSession({
      id: 'deepseek-session',
      provider: 'deepseek',
      remoteConversationId: 'deepseek-conv',
      title: 'DeepSeek - Into the Unknown',
      previewText: 'Draft launch checklist for the DeepSeek workspace',
    })
  );
  state.messages['deepseek-session'] = [
    buildMessage({
      id: 'deepseek-message-1',
      sessionId: 'deepseek-session',
      provider: 'deepseek',
      role: 'user',
      content: 'Draft launch checklist for the DeepSeek workspace',
    }),
  ];
  installCaptureApiMock(state, {
    shellInfo: { diagnosticsEnabled: false, isPackaged: true },
  });

  render(<App />);

  fireEvent.click(await screen.findByRole('button', { name: '打开设置' }));
  fireEvent.click(await screen.findByRole('button', { name: '历史会话' }));
  fireEvent.click(await screen.findByRole('button', { name: '查看 DeepSeek 记录' }));

  expect(
    await screen.findByRole('button', {
      name: /Draft launch checklist for the DeepSeek workspace/i,
    })
  ).toBeInTheDocument();
  expect(screen.queryByText('DeepSeek - Into the Unknown')).not.toBeInTheDocument();
});

test('allows enabling and reordering built-in providers from settings', async () => {
  const state = createWorkspaceFixture({ deepseekEnabled: true });
  const api = installCaptureApiMock(state, {
    shellInfo: { diagnosticsEnabled: false, isPackaged: true },
  });

  render(<App />);

  fireEvent.click(await screen.findByRole('button', { name: '打开设置' }));

  expect(await screen.findByRole('heading', { name: '服务管理' })).toBeInTheDocument();
  await waitFor(() => {
    expect(api.setNativeStageVisible).toHaveBeenLastCalledWith(false);
  });

  fireEvent.click(screen.getByRole('button', { name: '停用 Claude' }));
  await waitFor(() => {
    expect(api.setProviderEnabled).toHaveBeenCalledWith('claude', false);
  });

  const dataTransfer = createDataTransfer();
  fireEvent.dragStart(
    within(screen.getByRole('list', { name: '内置应用列表' }))
      .getAllByRole('listitem')
      .find((item) => item.getAttribute('data-provider-id') === 'gemini')!,
    { dataTransfer }
  );
  fireEvent.drop(
    within(screen.getByRole('list', { name: '内置应用列表' }))
      .getAllByRole('listitem')
      .find((item) => item.getAttribute('data-provider-id') === 'deepseek')!,
    { dataTransfer }
  );
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
  const secondDataTransfer = createDataTransfer();
  fireEvent.dragStart(
    within(screen.getByRole('list', { name: '内置应用列表' }))
      .getAllByRole('listitem')
      .find((item) => item.getAttribute('data-provider-id') === 'gemini')!,
    { dataTransfer: secondDataTransfer }
  );
  fireEvent.drop(
    within(screen.getByRole('list', { name: '内置应用列表' }))
      .getAllByRole('listitem')
      .find((item) => item.getAttribute('data-provider-id') === 'claude')!,
    { dataTransfer: secondDataTransfer }
  );
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

  fireEvent.click(screen.getByRole('button', { name: '历史会话' }));
  fireEvent.click(screen.getByRole('button', { name: '打开设置' }));

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

test('supports provider export and session delete actions from the knowledge base', async () => {
  const state = createHydrationFixture();
  const api = installCaptureApiMock(state, {
    shellInfo: { diagnosticsEnabled: false, isPackaged: true },
  });
  const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);

  render(<App />);

  fireEvent.click(await screen.findByRole('button', { name: '打开设置' }));
  fireEvent.click(screen.getByRole('button', { name: '历史会话' }));

  fireEvent.change(screen.getByRole('combobox', { name: '选择要导出的服务' }), {
    target: { value: 'chatgpt' },
  });
  fireEvent.change(screen.getByRole('combobox', { name: '选择导出格式' }), {
    target: { value: 'markdown' satisfies CaptureExportFormat },
  });
  fireEvent.click(screen.getByRole('button', { name: '导出 ChatGPT 记录' }));

  await waitFor(() => {
    expect(api.exportProviderSessions).toHaveBeenCalledWith('chatgpt', 'markdown');
  });

  fireEvent.click(screen.getByRole('button', { name: '查看 ChatGPT 记录' }));

  fireEvent.change(screen.getByRole('combobox', { name: '选择会话导出格式' }), {
    target: { value: 'markdown' satisfies CaptureExportFormat },
  });
  fireEvent.click(screen.getByRole('button', { name: '导出当前记录' }));

  await waitFor(() => {
    expect(api.exportSession).toHaveBeenCalledWith('chatgpt-recent-session', 'markdown');
  });

  fireEvent.click(screen.getByRole('button', { name: '删除当前记录' }));

  expect(confirmSpy).toHaveBeenCalled();
  await waitFor(() => {
    expect(api.deleteSession).toHaveBeenCalledWith('chatgpt-recent-session');
  });
  expect((await screen.findAllByText('chatgpt-older-conv')).length).toBeGreaterThan(0);
});

test('lets operators manually refresh the history list so new sessions surface', async () => {
  const state = createWorkspaceFixture({ deepseekEnabled: true });
  const api = installCaptureApiMock(state, {
    shellInfo: { diagnosticsEnabled: false, isPackaged: true },
  });

  render(<App />);

  fireEvent.click(await screen.findByRole('button', { name: '打开设置' }));
  fireEvent.click(screen.getByRole('button', { name: '历史会话' }));

  expect(await screen.findByRole('heading', { name: '历史记录' })).toBeInTheDocument();
  const initialListSessionCalls = api.listSessions.mock.calls.length;

  state.sessions.unshift(
    buildSession({
      id: 'deepseek-session',
      provider: 'deepseek',
      remoteConversationId: 'deepseek-conv',
      title: 'DeepSeek launch summary',
      previewText: 'DeepSeek launch summary',
    })
  );
  state.messages['deepseek-session'] = [
    buildMessage({
      id: 'deepseek-message-1',
      sessionId: 'deepseek-session',
      provider: 'deepseek',
      role: 'assistant',
      content: 'DeepSeek launch summary',
    }),
  ];

  fireEvent.click(screen.getByRole('button', { name: '刷新会话' }));

  await waitFor(() => {
    expect(api.listSessions.mock.calls.length).toBeGreaterThan(initialListSessionCalls);
  });
  expect(screen.queryByText('已刷新历史会话列表。')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: '查看 DeepSeek 记录' }));
  expect(await screen.findByRole('button', { name: /DeepSeek launch summary/i })).toBeInTheDocument();
});

test('refreshes sessions after capture-driven runtime status updates', async () => {
  const state = createWorkspaceFixture({ deepseekEnabled: true });
  const api = installCaptureApiMock(state, {
    shellInfo: { diagnosticsEnabled: false, isPackaged: true },
  });

  render(<App />);

  fireEvent.click(await screen.findByRole('button', { name: '打开设置' }));
  fireEvent.click(screen.getByRole('button', { name: '历史会话' }));

  expect(await screen.findByRole('heading', { name: '历史记录' })).toBeInTheDocument();
  const initialListSessionCalls = api.listSessions.mock.calls.length;

  state.sessions.unshift(
    buildSession({
      id: 'deepseek-session-auto',
      provider: 'deepseek',
      remoteConversationId: 'deepseek-auto-conv',
      title: 'Auto refreshed DeepSeek session',
      previewText: 'Auto refreshed DeepSeek session',
    })
  );
  state.messages['deepseek-session-auto'] = [
    buildMessage({
      id: 'deepseek-message-auto',
      sessionId: 'deepseek-session-auto',
      provider: 'deepseek',
      role: 'assistant',
      content: 'Auto refreshed DeepSeek session',
    }),
  ];

  api.emitRuntimeStatus({ lastCaptureAt: '2026-04-01T09:35:00.000Z' });

  await waitFor(() => {
    expect(api.listSessions.mock.calls.length).toBeGreaterThan(initialListSessionCalls);
  });
  fireEvent.click(screen.getByRole('button', { name: '查看 DeepSeek 记录' }));
  expect(
    await screen.findByRole('button', { name: /Auto refreshed DeepSeek session/i })
  ).toBeInTheDocument();
});

test('shows provider-specific history with a scrollable list and active record state', async () => {
  const state = createHydrationFixture();
  const api = installCaptureApiMock(state, {
    shellInfo: { diagnosticsEnabled: false, isPackaged: true },
  });

  render(<App />);

  fireEvent.click(await screen.findByRole('button', { name: '打开设置' }));
  fireEvent.click(screen.getByRole('button', { name: '历史会话' }));
  fireEvent.click(screen.getByRole('button', { name: '查看 ChatGPT 记录' }));

  const list = await screen.findByRole('list', { name: '历史记录列表' });
  expect(list).toHaveClass('conversation-list--scroll');

  const recentRecordButton = screen.getByRole('button', { name: /chatgpt-recent-conv/i });
  const olderRecordButton = screen.getByRole('button', { name: /chatgpt-older-conv/i });

  expect(recentRecordButton).toHaveAttribute('aria-pressed', 'true');
  expect(olderRecordButton).toHaveAttribute('aria-pressed', 'false');

  fireEvent.click(olderRecordButton);

  await waitFor(() => {
    expect(api.openSession).toHaveBeenCalledWith('chatgpt-older-session');
  });
  expect(await screen.findByText('Hydrated old answer')).toBeInTheDocument();
  await waitFor(() => {
    expect(olderRecordButton).toHaveAttribute('aria-pressed', 'true');
  });
  expect(recentRecordButton).toHaveAttribute('aria-pressed', 'false');
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
    runtimeStatus?: Partial<RuntimeStatus>;
  }
) {
  let runtimeStatusListener: ((status: RuntimeStatus) => void) | null = null;
  let runtimeStatusOverrides = input?.runtimeStatus ?? {};
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

  const deleteSession = vi.fn(async (sessionId: string) => {
    state.sessions = state.sessions.filter((session) => session.id !== sessionId);
    delete state.messages[sessionId];

    return {
      message: 'deleted',
      detail: `${sessionId} removed`,
    };
  });

  const exportSession = vi.fn(
    async (_sessionId: string, format: CaptureExportFormat) => ({
      message: 'exported',
      detail: `session:${format}`,
    })
  );

  const exportProviderSessions = vi.fn(
    async (_providerId: string, format: CaptureExportFormat) => ({
      message: 'exported',
      detail: `provider:${format}`,
    })
  );

  const setNativeStageVisible = vi.fn(async (_visible: boolean) => undefined);
  const listSessions = vi.fn(async () => state.sessions);
  const listMessages = vi.fn(async (sessionId: string) => state.messages[sessionId] ?? []);
  const getRuntimeStatus = vi.fn(
    async () => ({ ...buildRuntimeStatus(state.providers), ...runtimeStatusOverrides })
  );

  window.captureApi = {
    listSessions,
    listMessages,
    openSession,
    deleteSession,
    exportSession,
    exportProviderSessions,
    listProviders: async () => state.providers,
    getActiveProvider: async () => state.providers.find((provider) => provider.active) ?? null,
    setActiveProvider,
    setProviderEnabled,
    moveProvider,
    getRuntimeStatus,
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
    onRuntimeStatus: (callback: (status: RuntimeStatus) => void) => {
      runtimeStatusListener = callback;
      return () => {
        if (runtimeStatusListener === callback) {
          runtimeStatusListener = null;
        }
      };
    },
  } as never;

  return {
    listSessions,
    listMessages,
    getRuntimeStatus,
    setActiveProvider,
    setProviderEnabled,
    moveProvider,
    openSession,
    deleteSession,
    exportSession,
    exportProviderSessions,
    setNativeStageVisible,
    emitRuntimeStatus: (overrides?: Partial<RuntimeStatus>) => {
      runtimeStatusOverrides = { ...runtimeStatusOverrides, ...overrides };
      runtimeStatusListener?.({
        ...buildRuntimeStatus(state.providers),
        ...runtimeStatusOverrides,
      });
    },
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

function createDataTransfer() {
  const data = new Map<string, string>();
  return {
    setData: (type: string, value: string) => {
      data.set(type, value);
    },
    getData: (type: string) => data.get(type) ?? '',
    effectAllowed: 'move',
  };
}

function buildSession(
  input: Pick<CaptureSessionRecord, 'id' | 'provider' | 'remoteConversationId'> & {
    title?: string | null;
    previewText?: string | null;
  }
): CaptureSessionRecord {
  return {
    id: input.id,
    provider: input.provider,
    title: input.title ?? null,
    previewText: input.previewText ?? null,
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
