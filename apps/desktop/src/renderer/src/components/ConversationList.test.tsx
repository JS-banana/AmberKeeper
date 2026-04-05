// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import type { CaptureSessionRecord } from '@amberkeeper/shared-types';
import { ConversationList } from './ConversationList';

afterEach(() => {
  cleanup();
});

test('renders chat record metadata, preserves the scroll list, and falls back to preview text when titles are generic', () => {
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
          title: '4ffe4cb3-1488-4098-80cd-d99365144411',
          remoteConversationId: '4ffe4cb3-1488-4098-80cd-d99365144411',
          previewText: '这是更像标题的首条用户消息',
          updatedAt: '2026-03-18T08:30:00.000Z',
        }),
      ]}
      selectedSessionId="session-with-title"
      onSelect={onSelect}
    />
  );

  expect(screen.getByRole('heading', { name: '聊天记录' })).toBeInTheDocument();
  expect(screen.getByRole('list')).toHaveClass('conversation-list--scroll');
  expect(screen.getByText('产品复盘')).toBeInTheDocument();
  expect(screen.getByText('这是更像标题的首条用户消息')).toBeInTheDocument();
  expect(screen.getAllByText(/^3 条记录$/)).toHaveLength(2);
  expect(screen.getAllByText(/2026年/)).toHaveLength(2);
  expect(screen.getByRole('button', { name: /产品复盘/i })).toHaveClass('active');

  fireEvent.click(screen.getByRole('button', { name: /这是更像标题的首条用户消息/i }));
  expect(onSelect).toHaveBeenCalledWith('session-fallback');
});

function buildSession(
  input: Pick<CaptureSessionRecord, 'id' | 'remoteConversationId' | 'updatedAt'> & {
    title?: string | null;
    previewText?: string | null;
  }
): CaptureSessionRecord {
  return {
    id: input.id,
    provider: 'chatgpt',
    title: input.title ?? null,
    previewText: input.previewText ?? null,
    remoteConversationId: input.remoteConversationId,
    sourceSessionKey: 'chatgpt-primary',
    pageUrl: 'https://example.com/conversation',
    messageCount: 3,
    createdAt: '2026-03-19T00:00:00.000Z',
    updatedAt: input.updatedAt,
  };
}
