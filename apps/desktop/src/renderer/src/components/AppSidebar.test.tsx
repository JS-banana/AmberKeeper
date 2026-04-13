// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import type { ProviderRecord } from '@amberkeeper/shared-types';
import { AppSidebar } from './AppSidebar';

afterEach(() => {
  cleanup();
});

test('shows only enabled providers in the rail and keeps the settings entry active for utility surfaces', () => {
  const onSelectProvider = vi.fn();
  const onOpenUtility = vi.fn();

  render(
    <AppSidebar
      providers={[
        buildProvider({ id: 'chatgpt', name: 'ChatGPT' }),
        buildProvider({ id: 'claude', name: 'Claude', enabled: false, homeUrl: 'https://claude.ai' }),
      ]}
      activeProviderId="chatgpt"
      activeSurface="settings"
      onSelectProvider={onSelectProvider}
      onOpenUtility={onOpenUtility}
    />
  );

  expect(screen.getByRole('button', { name: '打开 ChatGPT' })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: '打开 Claude' })).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: '打开工作台' })).toHaveAttribute('aria-pressed', 'true');

  fireEvent.click(screen.getByRole('button', { name: '打开 ChatGPT' }));
  expect(onSelectProvider).toHaveBeenCalledWith('chatgpt');

  fireEvent.click(screen.getByRole('button', { name: '打开工作台' }));
  expect(onOpenUtility).toHaveBeenCalled();
});

function buildProvider(input: Partial<ProviderRecord> & Pick<ProviderRecord, 'id' | 'name'>): ProviderRecord {
  return {
    id: input.id,
    name: input.name,
    enabled: input.enabled ?? true,
    cacheEnabled: input.cacheEnabled ?? true,
    homeUrl: input.homeUrl ?? `https://${input.id}.com`,
    builtin: input.builtin ?? true,
    active: input.active ?? false,
    createdAt: input.createdAt ?? '2026-03-01T00:00:00.000Z',
    updatedAt: input.updatedAt ?? '2026-03-01T00:00:00.000Z',
  };
}
