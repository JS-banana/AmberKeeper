import type { CaptureSessionRecord, ProviderId } from '@amberkeeper/shared-types';

const PROVIDER_LABELS: Record<ProviderId, string> = {
  chatgpt: 'ChatGPT',
  claude: 'Claude',
  deepseek: 'DeepSeek',
  gemini: 'Gemini',
};

export function resolveSessionTitle(session: CaptureSessionRecord): string {
  const title = session.title?.trim() ?? '';
  if (isMeaningfulTitle(title, session)) {
    return title;
  }

  const previewText = session.previewText?.replace(/\s+/g, ' ').trim() ?? '';
  if (previewText) {
    return previewText.slice(0, 72);
  }

  const remoteConversationId = session.remoteConversationId?.trim() ?? '';
  if (remoteConversationId) {
    return remoteConversationId;
  }

  return session.id;
}

export function formatSessionUpdatedAt(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat('zh-CN', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'UTC',
  }).format(date);
}

export function getProviderLabel(providerId: ProviderId): string {
  return PROVIDER_LABELS[providerId] ?? providerId;
}

function isMeaningfulTitle(sessionTitle: string, session: CaptureSessionRecord): boolean {
  if (!sessionTitle) {
    return false;
  }

  if (UUID_LIKE_PATTERN.test(sessionTitle)) {
    return false;
  }

  if (session.remoteConversationId?.trim() === sessionTitle) {
    return false;
  }

  return true;
}

const UUID_LIKE_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
