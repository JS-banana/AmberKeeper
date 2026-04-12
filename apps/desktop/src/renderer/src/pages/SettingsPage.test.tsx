// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import type { ProviderRecord, ShellInfo } from '@amberkeeper/shared-types';
import { TooltipProvider } from '../components/ui/tooltip';
import { SettingsPage } from './SettingsPage';

afterEach(() => {
  cleanup();
});

test('renders grouped settings sections with provider cache and interface language controls', () => {
  const onSelectProvider = vi.fn();
  const onToggleProvider = vi.fn();
  const onToggleProviderCache = vi.fn();
  const onSetInterfaceLanguage = vi.fn();

  render(
    <TooltipProvider>
      <SettingsPage
        shellInfo={buildShellInfo()}
        providers={[
          buildProvider({ id: 'chatgpt', name: 'ChatGPT' }),
          buildProvider({
            id: 'claude',
            name: 'Claude',
            enabled: false,
            cacheEnabled: false,
            homeUrl: 'https://claude.ai',
          }),
        ]}
        activeProviderId="chatgpt"
        onSetInterfaceLanguage={onSetInterfaceLanguage}
        onSelectProvider={onSelectProvider}
        onToggleProvider={onToggleProvider}
        onToggleProviderCache={onToggleProviderCache}
        onMoveProvider={vi.fn()}
      />
    </TooltipProvider>
  );

  expect(screen.getByRole('heading', { name: '外观与语言' })).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: '服务管理' })).toBeInTheDocument();
  expect(screen.getByLabelText('界面语言')).toBeInTheDocument();
  expect(screen.getByText('https://chatgpt.com')).toBeInTheDocument();
  expect(screen.getByText('https://claude.ai')).toBeInTheDocument();

  // Radix Switch: uses aria-checked
  expect(screen.getByRole('switch', { name: 'ChatGPT 本地缓存' })).toBeChecked();
  expect(screen.getByRole('switch', { name: 'Claude 本地缓存' })).not.toBeChecked();

  // Radix Select: click trigger, then click option
  const langTrigger = screen.getByRole('combobox');
  fireEvent.click(langTrigger);
  const zhOption = screen.getByRole('option', { name: '简体中文' });
  fireEvent.click(zhOption);
  expect(onSetInterfaceLanguage).toHaveBeenCalledWith('zh-CN');

  fireEvent.click(screen.getByRole('button', { name: '当前服务 ChatGPT' }));
  expect(onSelectProvider).toHaveBeenCalledWith('chatgpt');

  fireEvent.click(screen.getByRole('button', { name: '停用 ChatGPT' }));
  expect(onToggleProvider).toHaveBeenCalledWith('chatgpt', false);

  fireEvent.click(screen.getByRole('switch', { name: 'Claude 本地缓存' }));
  expect(onToggleProviderCache).toHaveBeenCalledWith('claude', true);
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

function buildShellInfo(): ShellInfo {
  return {
    diagnosticsEnabled: false,
    isPackaged: true,
    appVersion: '0.0.1',
    interfaceLanguage: 'system',
  };
}
