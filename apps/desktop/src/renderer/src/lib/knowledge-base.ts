import type { CaptureSessionRecord } from '@amberkeeper/shared-types';

export function getSessionDisplayTitle(
  session: Pick<CaptureSessionRecord, 'id' | 'title' | 'remoteConversationId'>
): string {
  const title = session.title?.trim();
  if (title) {
    return title;
  }

  const remoteConversationId = session.remoteConversationId?.trim();
  if (remoteConversationId) {
    return remoteConversationId;
  }

  return session.id;
}

export function formatArchiveTimestamp(input: string, style: 'short' | 'long' = 'short'): string {
  const date = new Date(input);
  if (Number.isNaN(date.getTime())) {
    return input;
  }

  return new Intl.DateTimeFormat('zh-CN', {
    dateStyle: style === 'long' ? 'medium' : undefined,
    month: style === 'short' ? 'short' : undefined,
    day: style === 'short' ? 'numeric' : undefined,
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}
