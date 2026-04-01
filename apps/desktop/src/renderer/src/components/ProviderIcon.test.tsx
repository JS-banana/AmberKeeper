// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';

const useCachedIconMock = vi.fn();

vi.mock('../hooks/useCachedIcon', () => ({
  useCachedIcon: (...args: unknown[]) => useCachedIconMock(...args),
}));

import { ProviderIcon } from './ProviderIcon';

afterEach(() => {
  useCachedIconMock.mockReset();
});

test('prefers the bundled fallback icon while a built-in provider candidate is still unresolved', () => {
  useCachedIconMock.mockReturnValue({
    iconSrc: 'https://claude.ai/favicon.ico',
    loading: false,
    resolved: false,
    onError: vi.fn(),
    onLoad: vi.fn(),
  });

  render(<ProviderIcon providerId="claude" providerName="Claude" homeUrl="https://claude.ai" />);

  const icon = screen.getByRole('img', { name: 'Claude' });
  expect(icon).toBeInTheDocument();
  expect(icon).toHaveAttribute('data-provider-id', 'claude');
  expect(icon).not.toHaveAttribute('src', 'https://claude.ai/favicon.ico');
});
