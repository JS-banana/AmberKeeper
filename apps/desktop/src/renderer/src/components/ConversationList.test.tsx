// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import type { CaptureSessionRecord } from '@amberkeeper/shared-types';
import { ConversationList } from './ConversationList';

afterEach(() => {
  cleanup();
});

test('renders archive metadata and falls back to remote conversation id when title is missing', () => {
  const onSelect = vi.fn();
  render(
    <ConversationList
      sessions={[
        buildSession({
          id: 'session-with-title',
          title: '产品复盘',
          remoteConversationId: 'conv-1',
          updatedAt: '2026-03-19T10:00:00.000Z',
        }),
        buildSession({
          id: 'session-fallback',
          title: null,
          remoteConversationId: 'legacy-conv',
          updatedAt: '2026-03-18T08:30:00.000Z',
        }),
      ]}
      selectedSessionId="session-with-title"
      onSelect={onSelect}
    />
  );

  expect(screen.getByText('产品复盘')).toBeInTheDocument();
  expect(screen.getByText('legacy-conv')).toBeInTheDocument();
  expect(screen.getAllByText(/条消息/)).toHaveLength(2);
  expect(screen.getAllByText(/更新于/)).toHaveLength(2);

  fireEvent.click(screen.getByRole('button', { name: /legacy-conv/i }));
  expect(onSelect).toHaveBeenCalledWith('session-fallback');
});

function buildSession(
  input: Pick<CaptureSessionRecord, 'id' | 'remoteConversationId' | 'updatedAt'> & {
    title?: string | null;
  }
): CaptureSessionRecord {
  return {
    id: input.id,
    provider: 'chatgpt',
    title: input.title ?? null,
    remoteConversationId: input.remoteConversationId,
    sourceSessionKey: 'chatgpt-primary',
    pageUrl: 'https://example.com/conversation',
    messageCount: 3,
    createdAt: '2026-03-19T00:00:00.000Z',
    updatedAt: input.updatedAt,
  };
}
