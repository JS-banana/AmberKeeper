import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test } from 'vitest';

test('renderer csp allows remote icon fetching and data-url icon rendering', () => {
  const html = readFileSync(resolve(import.meta.dirname, '../src/renderer/index.html'), 'utf8');

  expect(html).toContain("img-src 'self' data: https:");
  expect(html).toContain("connect-src 'self' https:");
});
