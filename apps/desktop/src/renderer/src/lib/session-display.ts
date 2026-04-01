import type { CaptureSessionRecord, ProviderId } from '@amberkeeper/shared-types';

const PROVIDER_LABELS: Record<ProviderId, string> = {
  chatgpt: 'ChatGPT',
  claude: 'Claude',
  deepseek: 'DeepSeek',
  gemini: 'Gemini',
};

export function resolveSessionTitle(session: CaptureSessionRecord): string {
  return session.title?.trim() || session.remoteConversationId || session.id;
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
