// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import type { CaptureSessionRecord } from '@amberkeeper/shared-types';
import { CaptureTrendChart } from './CaptureTrendChart';

vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="responsive-container">{children}</div>
  ),
  AreaChart: ({
    children,
    data,
  }: {
    children: React.ReactNode;
    data: Array<{ label: string }>;
  }) => (
    <svg data-testid="area-chart" data-points={data.map((point) => point.label).join('|')}>
      {children}
    </svg>
  ),
  Area: () => <div data-testid="area" />,
  XAxis: () => <div data-testid="x-axis" />,
  YAxis: () => <div data-testid="y-axis" />,
  CartesianGrid: () => <div data-testid="grid" />,
  Tooltip: () => <div data-testid="tooltip" />,
}));

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

test('defaults the trend chart to current month and exposes range choices', () => {
  vi.setSystemTime(new Date('2026-05-14T12:00:00+08:00'));

  render(
    <CaptureTrendChart
      sessions={[
        buildSession('may-1', '2026-05-01T08:00:00+08:00'),
        buildSession('may-14', '2026-05-14T09:00:00+08:00'),
      ]}
    />
  );

  expect(screen.getByRole('heading', { name: '会话活跃趋势' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '7 日' })).toHaveAttribute('aria-pressed', 'false');
  expect(screen.getByRole('button', { name: '30 日' })).toHaveAttribute('aria-pressed', 'false');
  expect(screen.getByRole('button', { name: '本月' })).toHaveAttribute('aria-pressed', 'true');
  expect(screen.getByRole('button', { name: '今年' })).toHaveAttribute('aria-pressed', 'false');
  expect(screen.getByTestId('area-chart')).toHaveAttribute('data-points', expect.stringContaining('05-31'));
});

test('switches to 30 day trailing range on demand', () => {
  vi.setSystemTime(new Date('2026-05-14T12:00:00+08:00'));

  render(<CaptureTrendChart sessions={[buildSession('may-14', '2026-05-14T09:00:00+08:00')]} />);

  fireEvent.click(screen.getByRole('button', { name: '30 日' }));

  expect(screen.getByRole('button', { name: '30 日' })).toHaveAttribute('aria-pressed', 'true');
  expect(screen.getByTestId('area-chart')).toHaveAttribute('data-points', expect.stringContaining('04-15'));
  expect(screen.getByTestId('area-chart')).toHaveAttribute('data-points', expect.stringContaining('05-14'));
});

test('switches to yearly month buckets on demand', () => {
  vi.setSystemTime(new Date('2026-05-14T12:00:00+08:00'));

  render(<CaptureTrendChart sessions={[buildSession('jan', '2026-01-20T09:00:00+08:00')]} />);

  fireEvent.click(screen.getByRole('button', { name: '今年' }));

  expect(screen.getByRole('button', { name: '今年' })).toHaveAttribute('aria-pressed', 'true');
  expect(screen.getByTestId('area-chart')).toHaveAttribute(
    'data-points',
    '1 月|2 月|3 月|4 月|5 月|6 月|7 月|8 月|9 月|10 月|11 月|12 月'
  );
});

test('keeps the empty state when there are no sessions', () => {
  render(<CaptureTrendChart sessions={[]} />);

  expect(screen.getByText('还没有任何会话')).toBeInTheDocument();
  expect(screen.getByText('去任意 provider 开始第一次对话')).toBeInTheDocument();
  expect(screen.queryByTestId('area-chart')).not.toBeInTheDocument();
});

function buildSession(id: string, createdAt: string): CaptureSessionRecord {
  return {
    id,
    provider: 'chatgpt',
    title: null,
    previewText: null,
    remoteConversationId: id,
    sourceSessionKey: 'chatgpt-primary',
    pageUrl: 'https://example.com/conversation',
    messageCount: 1,
    createdAt,
    updatedAt: createdAt,
  };
}
