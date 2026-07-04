import type { CaptureSessionRecord, ProviderId } from '@amberkeeper/shared-types';

const PROVIDER_LABELS: Record<ProviderId, string> = {
  chatgpt: 'ChatGPT',
  claude: 'Claude',
  deepseek: 'DeepSeek',
  gemini: 'Gemini',
  grok: 'Grok',
  kimi: 'Kimi',
  qianwen: 'Qianwen',
  doubao: 'Doubao',
  'xiaomi-aistudio': 'MiMo',
};

const GENERIC_SESSION_TITLES = new Set([
  'chatgpt',
  'claude',
  'deepseek',
  'deepseek - into the unknown',
  'gemini',
  'google gemini',
  'grok',
  'kimi',
  'qianwen',
  'doubao',
  'mimo',
  'xiaomi ai studio',
  'deepseek - 探索未至之境',
  '千问-阿里 ai 助手',
  '豆包 - 字节跳动旗下 ai 智能助手',
  'new chat',
  'new conversation',
  'untitled',
  'untitled conversation',
  '新对话',
  '新会话',
  '未命名对话',
]);

const UUID_LIKE_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type SessionTitleInput = Pick<
  CaptureSessionRecord,
  'id' | 'provider' | 'title' | 'previewText' | 'remoteConversationId'
>;

export function resolveSessionTitle(session: SessionTitleInput): string {
  const rawTitle = session.title?.trim() ?? '';
  const title = stripProviderTitleChrome(rawTitle, session.provider);
  if (isMeaningfulSessionTitle(rawTitle, session) && isMeaningfulSessionTitle(title, session)) {
    return title;
  }

  const previewText = normalizePreviewText(
    session.provider,
    session.previewText?.replace(/\s+/g, ' ').trim() ?? ''
  );
  if (previewText) {
    return previewText.slice(0, 72);
  }

  const remoteConversationId = session.remoteConversationId?.trim() ?? '';
  if (remoteConversationId) {
    return remoteConversationId;
  }

  return session.id;
}

export function getProviderLabel(providerId: ProviderId): string {
  return PROVIDER_LABELS[providerId] ?? providerId;
}

function isMeaningfulSessionTitle(
  sessionTitle: string,
  session: Pick<CaptureSessionRecord, 'provider' | 'remoteConversationId'>
): boolean {
  if (!sessionTitle) {
    return false;
  }

  if (UUID_LIKE_PATTERN.test(sessionTitle)) {
    return false;
  }

  if (session.remoteConversationId?.trim() === sessionTitle) {
    return false;
  }

  const normalizedTitle = normalizeTitle(sessionTitle);
  if (!normalizedTitle) {
    return false;
  }

  if (GENERIC_SESSION_TITLES.has(normalizedTitle)) {
    return false;
  }

  if (normalizedTitle === normalizeTitle(getProviderLabel(session.provider))) {
    return false;
  }

  return true;
}

function normalizeTitle(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLowerCase();
}

function stripProviderTitleChrome(value: string, providerId: ProviderId): string {
  const patterns: Partial<Record<ProviderId, RegExp[]>> = {
    deepseek: [/^\s*DeepSeek\s*[-–—]\s*/i, /\s*[-–—]\s*DeepSeek\s*$/i],
    doubao: [/^\s*豆包\s*[-–—]\s*/i, /\s*[-–—]\s*豆包\s*$/i],
    qianwen: [/^\s*(?:千问|通义千问)\s*[-–—]\s*/i, /\s*[-–—]\s*(?:千问|通义千问)\s*$/i],
  };

  return (patterns[providerId] ?? []).reduce((title, pattern) => title.replace(pattern, ''), value).trim();
}

function normalizePreviewText(providerId: ProviderId, previewText: string): string {
  if (!previewText) {
    return '';
  }

  if (providerId !== 'gemini') {
    return previewText;
  }

  return previewText.replace(/^(?:you said[:\s]*)+/i, '').trim();
}
