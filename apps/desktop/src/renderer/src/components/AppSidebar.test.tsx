// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import type { ServiceRecord } from '@amberkeeper/shared-types';
import { AppSidebar } from './AppSidebar';

afterEach(() => {
  cleanup();
});

test('shows enabled built-in and custom services in the rail and keeps the workbench entry active for utility surfaces', () => {
  const onSelectService = vi.fn();
  const onOpenUtility = vi.fn();

  render(
    <AppSidebar
      services={[
        buildService({ id: 'chatgpt', kind: 'builtin', name: 'ChatGPT' }),
        buildService({
          id: 'custom-service-1',
          kind: 'custom',
          name: 'Perplexity',
          displayUrl: 'https://www.perplexity.ai',
          launchUrl: 'https://www.perplexity.ai/discover',
        }),
        buildService({
          id: 'claude',
          kind: 'builtin',
          name: 'Claude',
          enabled: false,
          displayUrl: 'https://claude.ai',
          launchUrl: 'https://claude.ai',
        }),
      ]}
      activeServiceId="custom-service-1"
      activeSurface="settings"
      onSelectService={onSelectService}
      onOpenUtility={onOpenUtility}
    />
  );

  expect(screen.getByRole('button', { name: '打开 ChatGPT' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '打开 Perplexity' })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: '打开 Claude' })).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: '打开工作台' })).toHaveAttribute('aria-pressed', 'true');

  fireEvent.click(screen.getByRole('button', { name: '打开 Perplexity' }));
  expect(onSelectService).toHaveBeenCalledWith('custom-service-1');

  fireEvent.click(screen.getByRole('button', { name: '打开工作台' }));
  expect(onOpenUtility).toHaveBeenCalled();
});

test('marks the selected custom service as active while chat mode is focused', () => {
  render(
    <AppSidebar
      services={[
        buildService({ id: 'chatgpt', kind: 'builtin', name: 'ChatGPT' }),
        buildService({
          id: 'custom-service-1',
          kind: 'custom',
          name: 'Perplexity',
          displayUrl: 'https://www.perplexity.ai',
          launchUrl: 'https://www.perplexity.ai/discover',
        }),
      ]}
      activeServiceId="custom-service-1"
      activeSurface="chat"
      onSelectService={vi.fn()}
      onOpenUtility={vi.fn()}
    />
  );

  expect(screen.getByRole('button', { name: '打开 Perplexity' })).toHaveAttribute('aria-pressed', 'true');
  expect(screen.getByRole('button', { name: '打开 ChatGPT' })).toHaveAttribute('aria-pressed', 'false');
});

function buildService(
  input: Partial<ServiceRecord> &
    Pick<ServiceRecord, 'id' | 'kind' | 'name'>
): ServiceRecord {
  return {
    id: input.id,
    providerId: input.kind === 'builtin' ? ((input.id as ServiceRecord['providerId']) ?? null) : null,
    kind: input.kind,
    name: input.name,
    displayUrl: input.displayUrl ?? `https://${input.id}.com`,
    launchUrl: input.launchUrl ?? `https://${input.id}.com`,
    iconUrl: input.iconUrl ?? null,
    enabled: input.enabled ?? true,
    builtin: input.builtin ?? input.kind === 'builtin',
    active: input.active ?? false,
    supportsCapture: input.supportsCapture ?? input.kind === 'builtin',
    supportsDataManagement: input.supportsDataManagement ?? input.kind === 'builtin',
    createdAt: input.createdAt ?? '2026-03-01T00:00:00.000Z',
    updatedAt: input.updatedAt ?? '2026-03-01T00:00:00.000Z',
  };
}
