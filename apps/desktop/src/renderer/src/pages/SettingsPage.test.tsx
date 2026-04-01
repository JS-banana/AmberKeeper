// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import type { ProviderRecord } from '@amberkeeper/shared-types';
import { SettingsPage } from './SettingsPage';

afterEach(() => {
  cleanup();
});

test('renders compact service rows with url subtitles and neutral actions', () => {
  const onSelectProvider = vi.fn();
  const onToggleProvider = vi.fn();

  render(
    <SettingsPage
      providers={[buildProvider({ id: 'chatgpt', name: 'ChatGPT' }), buildProvider({ id: 'claude', name: 'Claude', enabled: false, homeUrl: 'https://claude.ai' })]}
      activeProviderId="chatgpt"
      onSelectProvider={onSelectProvider}
      onToggleProvider={onToggleProvider}
      onMoveProvider={vi.fn()}
    />
  );

  expect(screen.queryByRole('heading', { name: '服务管理' })).not.toBeInTheDocument();
  expect(screen.getByText('https://chatgpt.com')).toBeInTheDocument();
  expect(screen.getByText('https://claude.ai')).toBeInTheDocument();
  expect(screen.queryByText('当前使用')).not.toBeInTheDocument();
  expect(screen.queryByText('已启用')).not.toBeInTheDocument();
  expect(screen.queryByText('已停用')).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: '打开 ChatGPT' })).not.toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: '当前服务 ChatGPT' }));
  expect(onSelectProvider).toHaveBeenCalledWith('chatgpt');

  fireEvent.click(screen.getByRole('button', { name: '停用 ChatGPT' }));
  expect(onToggleProvider).toHaveBeenCalledWith('chatgpt', false);

  fireEvent.click(screen.getByRole('button', { name: '启用 Claude' }));
  expect(onToggleProvider).toHaveBeenCalledWith('claude', true);
});

function buildProvider(input: Partial<ProviderRecord> & Pick<ProviderRecord, 'id' | 'name'>): ProviderRecord {
  return {
    id: input.id,
    name: input.name,
    enabled: input.enabled ?? true,
    homeUrl: input.homeUrl ?? `https://${input.id}.com`,
    captureSelector: input.captureSelector ?? '[data-provider-root]',
    iconUrl: input.iconUrl ?? null,
    sortOrder: input.sortOrder ?? 0,
    createdAt: input.createdAt ?? '2026-03-01T00:00:00.000Z',
    updatedAt: input.updatedAt ?? '2026-03-01T00:00:00.000Z',
  };
}
