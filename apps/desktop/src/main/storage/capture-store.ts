import crypto from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import {
  createCaptureEventRepository,
  createConversationRepository,
  createMessageRepository,
  persistCompletedTurn,
  type CompletedTurn,
} from '@anychat/capture-core';
import type {
  CaptureAttemptLogRecord,
  CaptureEnvelope,
  CaptureMessageRecord,
  CaptureSessionRecord,
  ProviderId,
  ProviderRecord,
} from '@anychat/shared-types';
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
