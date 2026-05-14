import type { CaptureSessionRecord } from '@amberkeeper/shared-types';

export type CaptureTrendRange = '7d' | '30d' | 'month' | 'year';

export interface CaptureTrendRangeOption {
  id: CaptureTrendRange;
  label: string;
}

export interface CaptureTrendBucket {
  key: string;
  label: string;
  count: number | null;
}

export const CAPTURE_TREND_RANGES: CaptureTrendRangeOption[] = [
  { id: '7d', label: '7 日' },
  { id: '30d', label: '30 日' },
  { id: 'month', label: '本月' },
  { id: 'year', label: '今年' },
];

export function buildCaptureTrendData(input: {
  sessions: CaptureSessionRecord[];
  range: CaptureTrendRange;
  now?: Date;
}): CaptureTrendBucket[] {
  const now = input.now ?? new Date();
  const dayCounts = countSessionsByLocalDay(input.sessions);

  if (input.range === 'year') {
    return buildYearBuckets(now, dayCounts);
  }

  const days =
    input.range === '7d'
      ? buildTrailingDayWindow(now, 7)
      : input.range === '30d'
        ? buildTrailingDayWindow(now, 30)
        : buildCurrentMonthDayWindow(now);

  const todayKey = toLocalDayKey(now);

  return days.map((day) => {
    const key = toLocalDayKey(day);
    const future = key > todayKey;

    return {
      key,
      label: key.slice(5),
      count: future ? null : dayCounts.get(key) ?? 0,
    };
  });
}

function countSessionsByLocalDay(sessions: CaptureSessionRecord[]): Map<string, number> {
  const countMap = new Map<string, number>();

  for (const session of sessions) {
    const date = new Date(session.createdAt);
    if (Number.isNaN(date.getTime())) {
      continue;
    }

    const key = toLocalDayKey(date);
    countMap.set(key, (countMap.get(key) ?? 0) + 1);
  }

  return countMap;
}

function buildTrailingDayWindow(now: Date, length: number): Date[] {
  const days: Date[] = [];

  for (let offset = length - 1; offset >= 0; offset--) {
    days.push(addLocalDays(startOfLocalDay(now), -offset));
  }

  return days;
}

function buildCurrentMonthDayWindow(now: Date): Date[] {
  const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const days: Date[] = [];

  for (let index = 0; index < daysInMonth; index++) {
    days.push(addLocalDays(firstDay, index));
  }

  return days;
}

function buildYearBuckets(now: Date, dayCounts: Map<string, number>): CaptureTrendBucket[] {
  const currentMonth = now.getMonth();
  const year = now.getFullYear();
  const buckets: CaptureTrendBucket[] = [];

  for (let month = 0; month < 12; month++) {
    const key = `${year}-${pad2(month + 1)}`;
    const future = month > currentMonth;
    let count = 0;

    if (!future) {
      for (const [dayKey, dayCount] of dayCounts) {
        if (dayKey.startsWith(`${key}-`)) {
          count += dayCount;
        }
      }
    }

    buckets.push({
      key,
      label: `${month + 1} 月`,
      count: future ? null : count,
    });
  }

  return buckets;
}

function startOfLocalDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function addLocalDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function toLocalDayKey(date: Date): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

function pad2(value: number): string {
  return String(value).padStart(2, '0');
}
