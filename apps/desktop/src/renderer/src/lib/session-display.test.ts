import { expect, test } from 'vitest';
import { formatCaptureTimestamp } from './session-display';

test('formats capture timestamps with the system local timezone', () => {
  const value = '2026-07-03T11:23:19.841Z';
  const expected = new Intl.DateTimeFormat('zh-CN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));

  expect(formatCaptureTimestamp(value)).toBe(expected);
});

test('keeps invalid timestamps visible for diagnostics', () => {
  expect(formatCaptureTimestamp('not-a-date')).toBe('not-a-date');
});
