import crypto from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import {
  createCaptureEventRepository,
  createConversationRepository,
  createMessageRepository,
  persistCompletedTurn,
  type CompletedTurn,
} from '@amberkeeper/capture-core';
import type {
  CaptureAttemptLogRecord,
  CaptureEnvelope,
  CaptureExportArtifact,
  CaptureExportFormat,
  CaptureMessageRecord,
  CaptureSessionRecord,
  ProviderId,
  ProviderMoveDirection,
  ProviderRecord,
} from '@amberkeeper/shared-types';
import { createProviderSettingsRepository } from './provider-settings-repository';
import { ensureCaptureStoreSchema, hasTable } from './schema';

export class CaptureStore {
  private readonly database: DatabaseSync;
  private readonly conversationRepository: ReturnType<typeof createConversationRepository>;
  private readonly messageRepository: ReturnType<typeof createMessageRepository>;
  private readonly captureEventRepository: ReturnType<typeof createCaptureEventRepository>;
  private readonly providerSettingsRepository: ReturnType<typeof createProviderSettingsRepository>;

  constructor(filePath: string) {
    this.database = new DatabaseSync(filePath);
    this.database.exec("PRAGMA journal_mode = WAL;");
    this.database.exec('PRAGMA foreign_keys = ON;');
    ensureCaptureStoreSchema(this.database);
    this.migrateLegacyData();
    this.conversationRepository = createConversationRepository(this.database);
    this.messageRepository = createMessageRepository(this.database);
    this.captureEventRepository = createCaptureEventRepository(this.database);
    this.providerSettingsRepository = createProviderSettingsRepository(this.database);
  }

  persistEnvelope(envelope: CaptureEnvelope): string {
    const conversationId = this.conversationRepository.resolve({
      provider: envelope.provider,
      remoteConversationId: envelope.remoteConversationId,
      sourceSessionKey: envelope.sourceSessionKey,
      pageUrl: envelope.pageUrl,
      title: envelope.title,
      titleSource: envelope.titleSource,
      createdAt: envelope.messages[0]?.createdAt ?? envelope.capturedAt,
      updatedAt: envelope.capturedAt,
    });
    const insertedMessages = this.messageRepository.insertMany({
      conversationId,
      provider: envelope.provider,
      remoteConversationId: envelope.remoteConversationId,
      source: envelope.source,
      capturedAt: envelope.capturedAt,
      messages: envelope.messages,
    });
    const messageCount = this.messageRepository.countByConversation(conversationId);

    this.conversationRepository.updateMessageCount(
      conversationId,
      messageCount,
      envelope.capturedAt
    );
    this.recordCaptureEvents(envelope, {
      insertedMessages,
      messageCount,
    });

    return conversationId;
  }

  replaceSessionEnvelope(_sessionId: string, envelope: CaptureEnvelope): string {
    const conversationId = this.conversationRepository.resolve({
      provider: envelope.provider,
      remoteConversationId: envelope.remoteConversationId,
      sourceSessionKey: envelope.sourceSessionKey,
      pageUrl: envelope.pageUrl,
      title: envelope.title,
      titleSource: envelope.titleSource,
      createdAt: envelope.messages[0]?.createdAt ?? envelope.capturedAt,
      updatedAt: envelope.capturedAt,
    });

    this.messageRepository.deleteByConversation(conversationId);

    const insertedMessages = this.messageRepository.insertMany({
      conversationId,
      provider: envelope.provider,
      remoteConversationId: envelope.remoteConversationId,
      source: envelope.source,
      capturedAt: envelope.capturedAt,
      messages: envelope.messages,
    });
    const messageCount = this.messageRepository.countByConversation(conversationId);

    this.conversationRepository.updateMessageCount(
      conversationId,
      messageCount,
      envelope.capturedAt
    );
    this.recordCaptureEvents(envelope, {
      insertedMessages,
      messageCount,
    });

    return conversationId;
  }

  persistTurn(turn: CompletedTurn): string {
    return persistCompletedTurn(this.database, turn);
  }

  listSessions(): CaptureSessionRecord[] {
    return this.database
      .prepare(
        `
          SELECT
            id,
            provider,
            remote_conversation_id AS remoteConversationId,
            source_session_key AS sourceSessionKey,
            page_url AS pageUrl,
            title,
            title_source AS titleSource,
            COALESCE(
              (
                SELECT content
                FROM messages
                WHERE conversation_id = conversations.id AND role = 'user'
                ORDER BY created_at ASC
                LIMIT 1
              ),
              (
                SELECT content
                FROM messages
                WHERE conversation_id = conversations.id
                ORDER BY created_at ASC
                LIMIT 1
              )
            ) AS previewText,
            message_count AS messageCount,
            created_at AS createdAt,
            updated_at AS updatedAt
          FROM conversations
          ORDER BY updated_at DESC
        `
      )
      .all() as unknown as CaptureSessionRecord[];
  }

  listMessages(sessionId: string): CaptureMessageRecord[] {
    return this.database
      .prepare(
        `
          SELECT
            id,
            conversation_id AS sessionId,
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
          WHERE conversation_id = ?
          ORDER BY created_at ASC
        `
      )
      .all(sessionId) as unknown as CaptureMessageRecord[];
  }

  deleteSession(sessionId: string): void {
    const result = this.database
      .prepare(
        `
          DELETE FROM conversations
          WHERE id = ?
        `
      )
      .run(sessionId) as { changes?: number };

    if (!result.changes) {
      throw new Error(`Unknown session: ${sessionId}.`);
    }
  }

  exportSession(sessionId: string, format: CaptureExportFormat): CaptureExportArtifact {
    const session = this.getSessionById(sessionId);

    if (!session) {
      throw new Error(`Unknown session: ${sessionId}.`);
    }

    const messages = this.listMessages(sessionId);

    return buildSessionExportArtifact(session, messages, format);
  }

  exportProviderSessions(
    providerId: ProviderId,
    format: CaptureExportFormat
  ): CaptureExportArtifact {
    const provider = this.listProviders().find((entry) => entry.id === providerId) ?? null;

    if (!provider) {
      throw new Error(`Unknown provider: ${providerId}.`);
    }

    const sessions = this.listSessions().filter((session) => session.provider === providerId);

    return buildProviderExportArtifact(
      providerId,
      provider.name,
      sessions.map((session) => ({
        session,
        messages: this.listMessages(session.id),
      })),
      format
    );
  }

  listProviders(): ProviderRecord[] {
    return this.providerSettingsRepository.list();
  }

  getActiveProvider(): ProviderRecord | null {
    return this.providerSettingsRepository.getActive();
  }

  setActiveProvider(providerId: ProviderId): ProviderRecord {
    return this.providerSettingsRepository.setActive(providerId);
  }

  setProviderEnabled(providerId: ProviderId, enabled: boolean): ProviderRecord {
    return this.providerSettingsRepository.setEnabled(providerId, enabled);
  }

  moveProvider(providerId: ProviderId, direction: ProviderMoveDirection): ProviderRecord[] {
    return this.providerSettingsRepository.move(providerId, direction);
  }

  logAttempt(input: {
    source: 'cdp-network' | 'preload-dom' | 'runtime';
    stage: string;
    status: 'info' | 'captured' | 'error';
    message: string;
    detail?: string | null;
    createdAt: string;
  }): void {
    this.database
      .prepare(
        `
          INSERT INTO capture_attempt_logs (
            id,
            source,
            stage,
            status,
            message,
            detail,
            created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?)
        `
      )
      .run(
        `attempt-${crypto.randomUUID()}`,
        input.source,
        input.stage,
        input.status,
        input.message,
        input.detail ?? null,
        input.createdAt
      );
  }

  listAttemptLogs(limit = 10): CaptureAttemptLogRecord[] {
    return this.database
      .prepare(
        `
          SELECT
            id,
            source,
            stage,
            status,
            message,
            detail,
            created_at AS createdAt
          FROM capture_attempt_logs
          ORDER BY created_at DESC
          LIMIT ?
        `
      )
      .all(limit) as unknown as CaptureAttemptLogRecord[];
  }

  close(): void {
    this.database.close();
  }

  private getSessionById(sessionId: string): CaptureSessionRecord | null {
    return (
      (this.database
        .prepare(
          `
            SELECT
              id,
              provider,
            remote_conversation_id AS remoteConversationId,
            source_session_key AS sourceSessionKey,
            page_url AS pageUrl,
            title,
            title_source AS titleSource,
            COALESCE(
              (
                SELECT content
                FROM messages
                WHERE conversation_id = conversations.id AND role = 'user'
                ORDER BY created_at ASC
                LIMIT 1
              ),
              (
                SELECT content
                FROM messages
                WHERE conversation_id = conversations.id
                ORDER BY created_at ASC
                LIMIT 1
              )
            ) AS previewText,
            message_count AS messageCount,
            created_at AS createdAt,
            updated_at AS updatedAt
            FROM conversations
            WHERE id = ?
          `
        )
        .get(sessionId) as CaptureSessionRecord | undefined) ?? null
    );
  }

  private recordCaptureEvents(
    envelope: CaptureEnvelope,
    input: {
      insertedMessages: number;
      messageCount: number;
    }
  ): void {
    envelope.messages.forEach((message) => {
      this.captureEventRepository.insert({
        provider: envelope.provider,
        source: envelope.source,
        sourceSessionKey: envelope.sourceSessionKey,
        pageUrl: envelope.pageUrl,
        remoteConversationId: envelope.remoteConversationId,
        eventKind: 'message_persisted',
        payloadJson: JSON.stringify({
          role: message.role,
          content: message.content,
          createdAt: message.createdAt,
        }),
        createdAt: envelope.capturedAt,
      });
    });

    this.captureEventRepository.insert({
      provider: envelope.provider,
      source: envelope.source,
      sourceSessionKey: envelope.sourceSessionKey,
      pageUrl: envelope.pageUrl,
      remoteConversationId: envelope.remoteConversationId,
      eventKind: 'turn_persisted',
      payloadJson: JSON.stringify({
        insertedMessages: input.insertedMessages,
        messageCount: input.messageCount,
      }),
      createdAt: envelope.capturedAt,
    });
  }

  private migrateLegacyData(): void {
    const hasLegacySessions = hasTable(this.database, 'capture_sessions');
    const hasLegacyMessages = hasTable(this.database, 'capture_messages');

    if (!hasLegacySessions && !hasLegacyMessages) {
      return;
    }

    this.database.exec('BEGIN');

    try {
      if (hasLegacySessions) {
        this.database.prepare(
          `
            INSERT INTO conversations (
              id,
              provider,
              remote_conversation_id,
              source_session_key,
              page_url,
              message_count,
              created_at,
              updated_at
            )
            SELECT
              id,
              provider,
              remote_conversation_id,
              source_session_key,
              page_url,
              message_count,
              created_at,
              updated_at
            FROM capture_sessions
            WHERE NOT EXISTS (
              SELECT 1
              FROM conversations
              WHERE conversations.id = capture_sessions.id
            )
          `
        ).run();
      }

      if (hasLegacyMessages) {
        this.database.prepare(
          `
            INSERT INTO messages (
              id,
              conversation_id,
              provider,
              remote_conversation_id,
              role,
              content,
              content_hash,
              remote_message_id,
              model,
              source,
              created_at,
              captured_at
            )
            SELECT
              id,
              session_id,
              provider,
              remote_conversation_id,
              role,
              content,
              content_hash,
              remote_message_id,
              model,
              source,
              created_at,
              captured_at
            FROM capture_messages
            WHERE NOT EXISTS (
              SELECT 1
              FROM messages
              WHERE messages.id = capture_messages.id
            )
          `
        ).run();
      }

      if (hasLegacySessions) {
        this.database.prepare(
          `
            UPDATE conversations
            SET
              message_count = (
                SELECT COUNT(*)
                FROM messages
                WHERE messages.conversation_id = conversations.id
              ),
              updated_at = COALESCE(
                (
                  SELECT MAX(captured_at)
                  FROM messages
                  WHERE messages.conversation_id = conversations.id
                ),
                updated_at
              )
            WHERE id IN (SELECT id FROM capture_sessions)
          `
        ).run();
      }

      this.database.exec('COMMIT');
    } catch (error) {
      this.database.exec('ROLLBACK');
      throw error;
    }
  }
}

function buildSessionExportArtifact(
  session: CaptureSessionRecord,
  messages: CaptureMessageRecord[],
  format: CaptureExportFormat
): CaptureExportArtifact {
  const title = resolveSessionTitle(session);
  const extension = format === 'json' ? 'json' : 'md';

  return {
    scope: 'session',
    format,
    sessionId: session.id,
    providerId: session.provider,
    fileName: `amberkeeper-${session.provider}-${toFileSegment(title)}.${extension}`,
    mimeType: format === 'json' ? 'application/json' : 'text/markdown',
    content:
      format === 'json'
        ? JSON.stringify(
            {
              exportedAt: new Date().toISOString(),
              session,
              messages,
            },
            null,
            2
          )
        : renderSessionMarkdown(session, messages),
  };
}

function buildProviderExportArtifact(
  providerId: ProviderId,
  providerName: string,
  entries: Array<{ session: CaptureSessionRecord; messages: CaptureMessageRecord[] }>,
  format: CaptureExportFormat
): CaptureExportArtifact {
  const extension = format === 'json' ? 'json' : 'md';

  return {
    scope: 'provider',
    format,
    providerId,
    fileName: `amberkeeper-${providerId}-knowledge-base-export.${extension}`,
    mimeType: format === 'json' ? 'application/json' : 'text/markdown',
    content:
      format === 'json'
        ? JSON.stringify(
            {
              exportedAt: new Date().toISOString(),
              provider: {
                id: providerId,
                name: providerName,
              },
              sessionCount: entries.length,
              sessions: entries.map((entry) => ({
                session: entry.session,
                messages: entry.messages,
              })),
            },
            null,
            2
          )
        : renderProviderMarkdown(providerName, entries),
  };
}

function renderProviderMarkdown(
  providerName: string,
  entries: Array<{ session: CaptureSessionRecord; messages: CaptureMessageRecord[] }>
): string {
  const sections = entries.map((entry) => renderSessionMarkdown(entry.session, entry.messages));

  return [`# ${providerName} 知识库导出`, '', `- 导出时间：${new Date().toISOString()}`, `- 会话数量：${entries.length}`, '', ...sections]
    .join('\n')
    .trim();
}

function renderSessionMarkdown(
  session: CaptureSessionRecord,
  messages: CaptureMessageRecord[]
): string {
  const title = resolveSessionTitle(session);
  const metadata = [
    `- 会话 ID：${session.id}`,
    `- Provider：${session.provider}`,
    `- 远端会话 ID：${session.remoteConversationId ?? '未解析'}`,
    `- 标题来源：${session.titleSource ?? 'fallback'}`,
    `- 更新时间：${session.updatedAt}`,
    `- 来源页面：${session.pageUrl}`,
    `- 消息数：${messages.length}`,
  ];

  const messageLines =
    messages.length === 0
      ? ['> 当前会话还没有已持久化消息。']
      : messages.flatMap((message, index) => [
          `### ${index + 1}. ${message.role === 'assistant' ? '助手' : '用户'}`,
          '',
          `- 时间：${message.createdAt}`,
          message.model ? `- 模型：${message.model}` : null,
          '',
          message.content,
          '',
        ]);

  return [`## ${title}`, '', ...metadata, '', ...messageLines.filter(Boolean as unknown as <T>(value: T | null) => value is T)]
    .join('\n')
    .trim();
}

function resolveSessionTitle(session: Pick<CaptureSessionRecord, 'id' | 'title' | 'remoteConversationId'>): string {
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

function toFileSegment(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64) || 'session';
}
