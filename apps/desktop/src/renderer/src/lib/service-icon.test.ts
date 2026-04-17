import { describe, expect, test, vi } from 'vitest';
import {
  getServiceIconCandidates,
  resolveServiceIconCandidates,
} from './service-icon';

describe('service-icon', () => {
  test('keeps a stable explicit icon before fallback candidates', () => {
    expect(
      getServiceIconCandidates('https://docs.example.com/portal', 'https://docs.example.com/icon.png')[0]
    ).toBe('https://docs.example.com/icon.png');
  });

  test('orders first-party icon candidates ahead of third-party fallback providers', () => {
    const candidates = getServiceIconCandidates('https://chat.deepseek.com/', undefined, [
      'https://deepseek.com/favicon.ico',
    ]);

    expect(candidates.indexOf('https://deepseek.com/favicon.ico')).toBeLessThan(
      candidates.indexOf('https://icons.duckduckgo.com/ip3/deepseek.com.ico')
    );
    expect(candidates.indexOf('https://deepseek.com/favicon.ico')).toBeLessThan(
      candidates.indexOf('https://www.google.com/s2/favicons?domain=deepseek.com&sz=64')
    );
  });

  test('includes parent-domain fallback candidates for subdomain services', () => {
    const candidates = getServiceIconCandidates('https://research.docs.example.com/portal');

    expect(candidates).toContain('https://docs.example.com/favicon.ico');
    expect(candidates).toContain('https://example.com/favicon.ico');
  });

  test('inserts html-discovered icons before third-party fallback candidates when no stable explicit icon exists', async () => {
    const discoverSiteIcon = vi.fn(async () => 'https://service.example.com/assets/favicon-32.png');

    await expect(
      resolveServiceIconCandidates('https://service.example.com/workspace', undefined, [], {
        discoverSiteIcon,
      })
    ).resolves.toEqual(
      expect.arrayContaining([
        'https://service.example.com/assets/favicon-32.png',
        'https://icons.duckduckgo.com/ip3/service.example.com.ico',
      ])
    );

    const candidates = await resolveServiceIconCandidates(
      'https://service.example.com/workspace',
      undefined,
      [],
      { discoverSiteIcon }
    );
    expect(candidates.indexOf('https://service.example.com/assets/favicon-32.png')).toBeLessThan(
      candidates.indexOf('https://icons.duckduckgo.com/ip3/service.example.com.ico')
    );
  });
});
