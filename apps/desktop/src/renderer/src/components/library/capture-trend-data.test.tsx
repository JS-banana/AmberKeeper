import { describe, expect, test } from 'vitest';
import type { CaptureSessionRecord } from '@amberkeeper/shared-types';
import {
  buildCaptureTrendData,
  CAPTURE_TREND_RANGES,
  type CaptureTrendRange,
} from './capture-trend-data';

describe('buildCaptureTrendData', () => {
  const now = new Date('2026-05-14T12:00:00+08:00');

  test('uses current month by default shape and leaves future dates blank', () => {
    const data = buildCaptureTrendData({
      sessions: [
        buildSession('may-1', '2026-05-01T08:00:00+08:00'),
        buildSession('may-14-a', '2026-05-14T09:00:00+08:00'),
        buildSession('may-14-b', '2026-05-14T11:00:00+08:00'),
      ],
      range: 'month',
      now,
    });

    expect(data).toHaveLength(31);
    expect(data[0]).toMatchObject({ key: '2026-05-01', label: '05-01', count: 1 });
    expect(data[13]).toMatchObject({ key: '2026-05-14', label: '05-14', count: 2 });
    expect(data[14]).toMatchObject({ key: '2026-05-15', label: '05-15', count: null });
    expect(data.at(-1)).toMatchObject({ key: '2026-05-31', label: '05-31', count: null });
  });

  test('keeps 30 day range as a trailing local-day window', () => {
    const data = buildCaptureTrendData({
      sessions: [
        buildSession('apr-15', '2026-04-15T10:00:00+08:00'),
        buildSession('may-14', '2026-05-14T10:00:00+08:00'),
      ],
      range: '30d',
      now,
    });

    expect(data).toHaveLength(30);
    expect(data[0]).toMatchObject({ key: '2026-04-15', label: '04-15', count: 1 });
    expect(data.at(-1)).toMatchObject({ key: '2026-05-14', label: '05-14', count: 1 });
  });

  test('uses local dates across the UTC midnight boundary', () => {
    const boundaryNow = new Date('2026-05-14T00:30:00+08:00');
    const expectedKey = toLocalDayKey(boundaryNow);
    const data = buildCaptureTrendData({
      sessions: [buildSession('today', '2026-05-14T00:10:00+08:00')],
      range: '7d',
      now: boundaryNow,
    });

    expect(data.at(-1)).toMatchObject({
      key: expectedKey,
      label: expectedKey.slice(5),
      count: 1,
    });
  });

  test('aggregates the year range by local month and blanks future months', () => {
    const data = buildCaptureTrendData({
      sessions: [
        buildSession('jan', '2026-01-20T10:00:00+08:00'),
        buildSession('may-a', '2026-05-01T10:00:00+08:00'),
        buildSession('may-b', '2026-05-14T10:00:00+08:00'),
      ],
      range: 'year',
      now,
    });

    expect(data).toHaveLength(12);
    expect(data[0]).toMatchObject({ key: '2026-01', label: '1 月', count: 1 });
    expect(data[4]).toMatchObject({ key: '2026-05', label: '5 月', count: 2 });
    expect(data[5]).toMatchObject({ key: '2026-06', label: '6 月', count: null });
    expect(data.at(-1)).toMatchObject({ key: '2026-12', label: '12 月', count: null });
  });

  test('ignores invalid createdAt values', () => {
    const data = buildCaptureTrendData({
      sessions: [buildSession('bad-date', 'not-a-date')],
      range: '7d',
      now,
    });

    expect(data).toHaveLength(7);
    expect(data.every((bucket) => bucket.count === 0)).toBe(true);
  });
});

test('exposes the expected range labels in display order', () => {
  expect(CAPTURE_TREND_RANGES.map((range) => range.id satisfies CaptureTrendRange)).toEqual([
    '7d',
    '30d',
    'month',
    'year',
  ]);
  expect(CAPTURE_TREND_RANGES.map((range) => range.label)).toEqual([
    '7 日',
    '30 日',
    '本月',
    '今年',
  ]);
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

function toLocalDayKey(date: Date): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

function pad2(value: number): string {
  return String(value).padStart(2, '0');
}
