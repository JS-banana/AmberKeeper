// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import type {
  CaptureExportFormat,
  CaptureMessageRecord,
  CaptureSessionRecord,
} from '@amberkeeper/shared-types';
import { ConversationMessagePane } from './ConversationMessagePane';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

test('renders archive detail actions and forwards export/delete intents', async () => {
  const onExportSession = vi.fn(
    async (_sessionId: string, format: CaptureExportFormat) => ({
      message: 'exported',
      detail: `session:${format}`,
    })
  );
  const onDeleteSession = vi.fn(async (_sessionId: string) => ({
    message: 'deleted',
    detail: 'deleted',
  }));
  vi.spyOn(window, 'confirm').mockReturnValue(true);

  render(
    <ConversationMessagePane
      session={buildSession()}
      messages={[buildMessage()]}
      loading={false}
      onExportSession={onExportSession}
      onDeleteSession={onDeleteSession}
    />
  );

  expect(screen.getByText('Amber 项目回顾')).toBeInTheDocument();
  expect(screen.getByText('ChatGPT')).toBeInTheDocument();
  expect(screen.getByText('conv-1')).toBeInTheDocument();

  fireEvent.change(screen.getByRole('combobox', { name: '选择会话导出格式' }), {
    target: { value: 'markdown' satisfies CaptureExportFormat },
  });
  fireEvent.click(screen.getByRole('button', { name: '导出当前记录' }));

  await waitFor(() => {
    expect(onExportSession).toHaveBeenCalledWith('session-1', 'markdown');
  });

  fireEvent.click(screen.getByRole('button', { name: '删除当前记录' }));

  await waitFor(() => {
    expect(onDeleteSession).toHaveBeenCalledWith('session-1');
  });
  expect(await screen.findByText('deleted')).toBeInTheDocument();
});

function buildSession(): CaptureSessionRecord {
  return {
    id: 'session-1',
    provider: 'chatgpt',
    title: 'Amber 项目回顾',
    remoteConversationId: 'conv-1',
    sourceSessionKey: 'chatgpt-primary',
    pageUrl: 'https://example.com/conversation',
    messageCount: 1,
    createdAt: '2026-03-19T00:00:00.000Z',
    updatedAt: '2026-03-19T01:00:00.000Z',
  };
}

function buildMessage(): CaptureMessageRecord {
  return {
    id: 'message-1',
    sessionId: 'session-1',
    provider: 'chatgpt',
    remoteConversationId: 'conv-1',
    role: 'assistant',
    content: '这里是历史摘要。',
    contentHash: 'hash',
    remoteMessageId: null,
    model: null,
    source: 'cdp-network',
    createdAt: '2026-03-19T01:00:00.000Z',
    capturedAt: '2026-03-19T01:00:00.000Z',
  };
}
