import { existsSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { homedir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export const DEFAULT_GEMINI_CAPTURE_DB_PATH = path.join(
  homedir(),
  'Library/Application Support',
  'electron-chatgpt-capture',
  'capture-lab.db'
);

const HEX_REMOTE_CONVERSATION_ID_PATTERN = /^[a-f0-9]{16}$/i;
const GEMINI_ASSET_URL_PATTERN =
  /(fonts\.gstatic\.com|gstatic\.com\/s\/i\/short-term|googlesymbols\/expand|googleusercontent\.com)/i;
const GEMINI_RPC_NOISE_PATTERN = /^(die|[A-Za-z0-9]{5,8}|[\p{L}\p{N}\s]{1,24}die)$/u;

/**
 * @param {{
 *   conversations: Array<{
 *     id: string;
 *     provider: string;
 *     remoteConversationId: string | null;
 *     sourceSessionKey: string;
 *     pageUrl: string;
 *     messageCount: number;
 *     createdAt: string;
 *     updatedAt: string;
 *   }>;
 *   messages: Array<{
 *     id: string;
 *     conversationId: string;
 *     provider: string;
 *     remoteConversationId: string | null;
 *     role: string;
 *     content: string;
 *     contentHash: string;
 *     remoteMessageId: string | null;
 *     model: string | null;
 *     source: string;
 *     createdAt: string;
 *     capturedAt: string;
 *   }>;
 * }} input
 */
export function analyzeGeminiDirtyData(input) {
  const conversations = input.conversations.filter((conversation) => conversation.provider === 'gemini');
  const messages = input.messages.filter((message) => message.provider === 'gemini');
  const messagesByConversation = groupMessagesByConversation(messages);

  const candidates = conversations
    .map((conversation) => buildGeminiDirtyDataCandidate(conversation, messagesByConversation.get(conversation.id) ?? []))
    .filter(Boolean);

  const summaryByReason = {};
  for (const candidate of candidates) {
    for (const reasonCode of candidate.reasonCodes) {
      summaryByReason[reasonCode] = (summaryByReason[reasonCode] ?? 0) + 1;
    }
  }

  return {
    provider: 'gemini',
    scannedConversationCount: conversations.length,
    scannedMessageCount: messages.length,
    candidateCount: candidates.length,
    summaryByReason,
    candidates,
  };
}

/**
 * @param {{ dbPath?: string }} [options]
 */
export function runGeminiDirtyDataDryRun(options = {}) {
  const dbPath = options.dbPath ?? DEFAULT_GEMINI_CAPTURE_DB_PATH;
  if (!existsSync(dbPath)) {
    throw new Error(`Gemini dry-run database not found: ${dbPath}`);
  }

  const database = new DatabaseSync(dbPath);
  try {
    const report = analyzeGeminiDirtyData({
      conversations: database
        .prepare(
          `
            SELECT
              id,
              provider,
              remote_conversation_id AS remoteConversationId,
              source_session_key AS sourceSessionKey,
              page_url AS pageUrl,
              message_count AS messageCount,
              created_at AS createdAt,
              updated_at AS updatedAt
            FROM conversations
            WHERE provider = 'gemini'
            ORDER BY updated_at DESC
          `
        )
        .all(),
      messages: database
        .prepare(
          `
            SELECT
              id,
              conversation_id AS conversationId,
              provider,
              remote_conversation_id AS remoteConversationId,
              role,
              content,
              content_hash AS contentHash,
              remote_message_id AS remoteMessageId,
              model,
              source,
              created_at AS createdAt,
              captured_at AS capturedAt
            FROM messages
            WHERE provider = 'gemini'
            ORDER BY captured_at DESC
          `
        )
        .all(),
    });

    return {
      ...report,
      dbPath,
      generatedAt: new Date().toISOString(),
    };
  } finally {
    database.close();
  }
}

function groupMessagesByConversation(messages) {
  /** @type {Map<string, typeof messages>} */
  const messagesByConversation = new Map();

  for (const message of messages) {
    const group = messagesByConversation.get(message.conversationId) ?? [];
    group.push(message);
    messagesByConversation.set(message.conversationId, group);
  }

  return messagesByConversation;
}

function buildGeminiDirtyDataCandidate(conversation, messages) {
  const reasonCodes = new Set();
  const suspiciousMessageIds = new Set();
  const nonHexRemoteConversationId = isNonHexRemoteConversationId(conversation.remoteConversationId);

  if (nonHexRemoteConversationId) {
    reasonCodes.add('non_hex_remote_conversation_id');
  }

  for (const message of messages) {
    if (message.role === 'assistant' && containsGeminiAssetUrl(message.content)) {
      reasonCodes.add('assistant_asset_url_content');
      suspiciousMessageIds.add(message.id);
    }

    if (message.role === 'assistant' && hasRepeatedLeadingFragment(message.content)) {
      reasonCodes.add('assistant_repeated_cumulative_content');
      suspiciousMessageIds.add(message.id);
    }
  }

  const rpcNoiseMessages = messages.filter((message) => looksLikeGeminiRpcNoise(message.content));
  if (rpcNoiseMessages.length >= 2 || (rpcNoiseMessages.length >= 1 && nonHexRemoteConversationId)) {
    reasonCodes.add('rpc_noise_content');
    rpcNoiseMessages.forEach((message) => suspiciousMessageIds.add(message.id));
  }

  if (reasonCodes.size === 0) {
    return null;
  }

  const latestUser = [...messages].reverse().find((message) => message.role === 'user') ?? null;
  const latestAssistant = [...messages].reverse().find((message) => message.role === 'assistant') ?? null;

  return {
    conversationId: conversation.id,
    remoteConversationId: conversation.remoteConversationId,
    messageCount: messages.length,
    updatedAt: conversation.updatedAt,
    reasonCodes: [...reasonCodes].sort(),
    suspiciousMessageIds: [...suspiciousMessageIds],
    proposedAction: 'review_delete_conversation',
    preview: {
      latestUser: latestUser ? truncate(latestUser.content, 160) : null,
      latestAssistant: latestAssistant ? truncate(latestAssistant.content, 160) : null,
    },
  };
}

function isNonHexRemoteConversationId(remoteConversationId) {
  if (!remoteConversationId) {
    return true;
  }

  return !HEX_REMOTE_CONVERSATION_ID_PATTERN.test(remoteConversationId);
}

function containsGeminiAssetUrl(content) {
  return GEMINI_ASSET_URL_PATTERN.test(content);
}

function hasRepeatedLeadingFragment(content) {
  const normalized = content.trim();
  if (normalized.length < 24) {
    return false;
  }

  const maxPrefixLength = Math.min(96, Math.floor(normalized.length / 2));
  for (let prefixLength = 12; prefixLength <= maxPrefixLength; prefixLength += 1) {
    const prefix = normalized.slice(0, prefixLength);
    if (prefix.trim().length < 12) {
      continue;
    }

    if (normalized.startsWith(prefix + prefix)) {
      return true;
    }
  }

  return false;
}

function looksLikeGeminiRpcNoise(content) {
  return GEMINI_RPC_NOISE_PATTERN.test(content.trim());
}

function truncate(content, maxLength) {
  return content.length <= maxLength ? content : `${content.slice(0, maxLength)}...`;
}

function isDirectRun() {
  return process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
}

if (isDirectRun()) {
  const dbPath = process.argv[2] || process.env.ANYCHAT_CAPTURE_DB_PATH || DEFAULT_GEMINI_CAPTURE_DB_PATH;
  const report = runGeminiDirtyDataDryRun({ dbPath });
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}
