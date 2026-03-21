import type { CaptureSessionRecord, NormalizedMessage, ProviderId } from '@amberkeeper/shared-types';

type StructuredSnapshotMessage = {
  role?: string;
  content?: string;
};

interface DeepSeekHydrationHistoryFetchSummary {
  ok?: boolean;
  status?: number | null;
  url?: string;
  preview?: string;
}

interface DeepSeekHydrationDomSummary {
  locationHref?: string;
  title?: string;
  bodyTextSample?: string;
  mainHtmlSample?: string;
  selectorCounts?: Record<string, number>;
  candidateNodes?: Array<{
    selector?: string;
    tagName?: string;
    className?: string;
    textSample?: string;
    htmlSample?: string;
  }>;
}

export function normalizeHydratedDomMessages(
  messages: StructuredSnapshotMessage[],
  input: {
    capturedAt: string;
    conversationId?: string | null;
  }
): NormalizedMessage[] {
  const normalized: NormalizedMessage[] = [];

  messages.forEach((message, index) => {
    const role = message.role;
    const content = message.content?.trim();

    if ((role !== 'user' && role !== 'assistant') || !content) {
      return;
    }

    normalized.push({
      role,
      content,
      createdAt: offsetIsoTimestamp(input.capturedAt, index),
      remoteConversationId: input.conversationId ?? undefined,
    });
  });

  return normalized;
}

export function resolveSessionNavigationUrl(
  session: CaptureSessionRecord,
  providerHomeUrl: string
): string {
  if (isValidAbsoluteUrl(session.pageUrl)) {
    return session.pageUrl;
  }

  const remoteConversationId = session.remoteConversationId?.trim();
  if (!remoteConversationId) {
    return providerHomeUrl;
  }

  return buildConversationUrl(session.provider, remoteConversationId) ?? providerHomeUrl;
}

export function summarizeDeepSeekHydrationDiagnostics(input: {
  historyFetch?: DeepSeekHydrationHistoryFetchSummary | null;
  dom?: DeepSeekHydrationDomSummary | null;
  relayBridgeType?: string;
  relaySendType?: string;
  relayInstalled?: boolean | null;
}): string {
  return JSON.stringify({
    historyFetch: input.historyFetch
      ? {
          ok: input.historyFetch.ok ?? false,
          status: input.historyFetch.status ?? null,
          url: input.historyFetch.url ?? '',
          preview: normalizeWhitespace(input.historyFetch.preview),
        }
      : null,
    dom: input.dom
      ? {
          locationHref: input.dom.locationHref ?? '',
          title: input.dom.title ?? '',
          bodyTextSample: normalizeWhitespace(input.dom.bodyTextSample),
          mainHtmlSample: normalizeWhitespace(input.dom.mainHtmlSample),
          selectorCounts: input.dom.selectorCounts ?? {},
          candidateNodes: (input.dom.candidateNodes ?? []).map((node) => ({
            selector: node.selector ?? '',
            tagName: node.tagName ?? '',
            className: normalizeWhitespace(node.className),
            textSample: normalizeWhitespace(node.textSample),
            htmlSample: normalizeWhitespace(node.htmlSample),
          })),
        }
      : null,
    relayBridgeType: input.relayBridgeType ?? '',
    relaySendType: input.relaySendType ?? '',
    relayInstalled: input.relayInstalled ?? null,
  });
}

function buildConversationUrl(providerId: ProviderId, remoteConversationId: string): string | null {
  switch (providerId) {
    case 'chatgpt':
      return `https://chatgpt.com/c/${remoteConversationId}`;
    case 'claude':
      return `https://claude.ai/chat/${remoteConversationId}`;
    case 'deepseek':
      return `https://chat.deepseek.com/a/chat/s/${remoteConversationId}`;
    case 'gemini':
      return `https://gemini.google.com/app/${remoteConversationId}`;
    default:
      return null;
  }
}

function offsetIsoTimestamp(baseIso: string, offset: number): string {
  const base = new Date(baseIso);
  if (Number.isNaN(base.getTime())) {
    return new Date(offset).toISOString();
  }

  return new Date(base.getTime() + offset).toISOString();
}

function isValidAbsoluteUrl(input: string): boolean {
  try {
    const parsed = new URL(input);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

function normalizeWhitespace(input?: string): string {
  return input?.replace(/\s+/g, ' ').trim() ?? '';
}
