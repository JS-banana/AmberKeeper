// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import type { ServiceRecord } from '@amberkeeper/shared-types';
import { TooltipProvider } from '@/components/ui/tooltip';
import { encodeCustomServicePresetIcon } from '../lib/custom-service-preset-icon';
import { ServicesPage } from './ServicesPage';

afterEach(() => {
  cleanup();
});

test('renders built-in and custom rows with the correct management controls', () => {
  render(
    <TooltipProvider>
      <ServicesPage
        services={[
          buildService({
            id: 'gemini',
            kind: 'builtin',
            name: 'Gemini',
            displayUrl: 'https://gemini.google.com',
            launchUrl: 'https://gemini.google.com/app',
          }),
          buildService({
            id: 'custom-service-1',
            kind: 'custom',
            name: 'Perplexity',
            displayUrl: 'https://www.perplexity.ai',
            launchUrl: 'https://www.perplexity.ai/discover',
          }),
        ]}
        activeServiceId="gemini"
        onSelectService={vi.fn()}
        onToggleService={vi.fn()}
        onToggleProviderCache={vi.fn()}
        onMoveService={vi.fn()}
        onAddCustomService={vi.fn()}
        onDeleteCustomService={vi.fn()}
      />
    </TooltipProvider>
  );

  const list = screen.getByRole('list', { name: '服务列表' });
  const builtInRow = within(list).getAllByRole('listitem')[0]!;
  const customRow = within(list).getAllByRole('listitem')[1]!;

  expect(within(builtInRow).getByText('https://gemini.google.com')).toBeInTheDocument();
  expect(within(builtInRow).queryByText('https://gemini.google.com/app')).not.toBeInTheDocument();
  expect(within(builtInRow).getByRole('button', { name: '关闭 Gemini 本地缓存' })).toBeInTheDocument();
  expect(within(builtInRow).queryByRole('button', { name: '删除 Perplexity' })).not.toBeInTheDocument();

  expect(within(customRow).getByText('https://www.perplexity.ai')).toBeInTheDocument();
  expect(within(customRow).queryByText('https://www.perplexity.ai/discover')).not.toBeInTheDocument();
  expect(within(customRow).getByRole('button', { name: '删除 Perplexity' })).toBeInTheDocument();
  expect(within(customRow).queryByRole('button', { name: '关闭 Perplexity 本地缓存' })).not.toBeInTheDocument();
});

test('normalizes custom service url before submission', () => {
  const onAddCustomService = vi.fn();
  window.captureApi = {
    discoverSiteIcon: vi.fn(async () => null),
  } as never;

  render(
    <TooltipProvider>
      <ServicesPage
        services={[]}
        activeServiceId={null}
        onSelectService={vi.fn()}
        onToggleService={vi.fn()}
        onToggleProviderCache={vi.fn()}
        onMoveService={vi.fn()}
        onAddCustomService={onAddCustomService}
        onDeleteCustomService={vi.fn()}
      />
    </TooltipProvider>
  );

  fireEvent.click(screen.getByRole('button', { name: '添加服务' }));

  const dialog = screen.getByRole('dialog', { name: '添加自定义服务' });
  fireEvent.change(within(dialog).getByLabelText('服务名称'), {
    target: { value: 'Docs' },
  });
  fireEvent.change(within(dialog).getByLabelText('服务地址'), {
    target: { value: 'docs.example.com/portal' },
  });
  expect(within(dialog).getByPlaceholderText('例如：My AI Chat')).toBeInTheDocument();
  expect(within(dialog).getByPlaceholderText('例如：https://chat.example.com')).toBeInTheDocument();
  expect(within(dialog).getByText('图标预览')).toBeInTheDocument();
  expect(within(dialog).getByText('预设图标')).toBeInTheDocument();
  expect(within(dialog).getByRole('button', { name: '聊天' })).toBeInTheDocument();
  fireEvent.click(within(dialog).getByRole('button', { name: '保存' }));

  expect(onAddCustomService).toHaveBeenCalledWith({
    name: 'Docs',
    url: 'https://docs.example.com/portal',
    iconUrl: undefined,
  });
});

test('persists the selected preset icon when adding a custom service', () => {
  const onAddCustomService = vi.fn();
  window.captureApi = {
    discoverSiteIcon: vi.fn(async () => null),
  } as never;

  render(
    <TooltipProvider>
      <ServicesPage
        services={[]}
        activeServiceId={null}
        onSelectService={vi.fn()}
        onToggleService={vi.fn()}
        onToggleProviderCache={vi.fn()}
        onMoveService={vi.fn()}
        onAddCustomService={onAddCustomService}
        onDeleteCustomService={vi.fn()}
      />
    </TooltipProvider>
  );

  fireEvent.click(screen.getByRole('button', { name: '添加服务' }));

  const dialog = screen.getByRole('dialog', { name: '添加自定义服务' });
  fireEvent.change(within(dialog).getByLabelText('服务名称'), {
    target: { value: 'Docs' },
  });
  fireEvent.change(within(dialog).getByLabelText('服务地址'), {
    target: { value: 'docs.example.com/portal' },
  });
  fireEvent.click(within(dialog).getByRole('button', { name: '聊天' }));
  fireEvent.click(within(dialog).getByRole('button', { name: '保存' }));

  expect(onAddCustomService).toHaveBeenCalledWith({
    name: 'Docs',
    url: 'https://docs.example.com/portal',
    iconUrl: encodeCustomServicePresetIcon('message'),
  });
});

test('supports mixed drag reorder with service ids', () => {
  const onMoveService = vi.fn();

  render(
    <TooltipProvider>
      <ServicesPage
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
        activeServiceId="chatgpt"
        onSelectService={vi.fn()}
        onToggleService={vi.fn()}
        onToggleProviderCache={vi.fn()}
        onMoveService={onMoveService}
        onAddCustomService={vi.fn()}
        onDeleteCustomService={vi.fn()}
      />
    </TooltipProvider>
  );

  const list = screen.getByRole('list', { name: '服务列表' });
  const [builtInRow, customRow] = within(list).getAllByRole('listitem');
  const dataTransfer = createDataTransfer();

  fireEvent.dragStart(customRow!, { dataTransfer });
  fireEvent.dragOver(builtInRow!, { dataTransfer });
  fireEvent.drop(builtInRow!, { dataTransfer });

  expect(onMoveService).toHaveBeenCalledWith('custom-service-1', 'up');
});

test('lets users hide or delete custom services without affecting built-in delete affordances', () => {
  const onToggleService = vi.fn();
  const onDeleteCustomService = vi.fn();

  render(
    <TooltipProvider>
      <ServicesPage
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
        activeServiceId="chatgpt"
        onSelectService={vi.fn()}
        onToggleService={onToggleService}
        onToggleProviderCache={vi.fn()}
        onMoveService={vi.fn()}
        onAddCustomService={vi.fn()}
        onDeleteCustomService={onDeleteCustomService}
      />
    </TooltipProvider>
  );

  fireEvent.click(screen.getByRole('button', { name: '停用 Perplexity' }));
  expect(onToggleService).toHaveBeenCalledWith('custom-service-1', false);

  fireEvent.click(screen.getByRole('button', { name: '删除 Perplexity' }));
  expect(onDeleteCustomService).toHaveBeenCalledWith('custom-service-1');
  expect(screen.queryByRole('button', { name: '删除 ChatGPT' })).not.toBeInTheDocument();
});

function buildService(
  input: Partial<ServiceRecord> & Pick<ServiceRecord, 'id' | 'kind' | 'name'>
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
