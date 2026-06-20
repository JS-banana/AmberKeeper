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
  CaptureExportMessageScope,
  CaptureSaveScope,
  CaptureMessageRecord,
  CaptureSessionRecord,
  CreateCustomServiceInput,
  ProviderId,
  ProviderMoveDirection,
  ProviderRecord,
  ServiceMoveDirection,
  ServiceRecord,
} from '@amberkeeper/shared-types';
import { resolveSessionTitle } from '../../shared/session-title';
import { createAppSettingsRepository } from './app-settings-repository';
import { createProviderSettingsRepository } from './provider-settings-repository';
import { createServiceSettingsRepository } from './service-settings-repository';
import { createSettingsWriteCoordinator } from './settings-write-coordinator';
import { ensureCaptureStoreSchema, hasTable } from './schema';

export class CaptureStore {
  private readonly database: DatabaseSync;
  private readonly conversationRepository: ReturnType<typeof createConversationRepository>;
  private readonly messageRepository: ReturnType<typeof createMessageRepository>;
  private readonly captureEventRepository: ReturnType<typeof createCaptureEventRepository>;
  private readonly appSettingsRepository: ReturnType<typeof createAppSettingsRepository>;
  private readonly providerSettingsRepository: ReturnType<typeof createProviderSettingsRepository>;
  private readonly serviceSettingsRepository: ReturnType<typeof createServiceSettingsRepository>;
  private readonly settingsWriteCoordinator: ReturnType<typeof createSettingsWriteCoordinator>;

  constructor(filePath: string) {
    this.database = new DatabaseSync(filePath);
    this.database.exec("PRAGMA journal_mode = WAL;");
    this.database.exec('PRAGMA foreign_keys = ON;');
    ensureCaptureStoreSchema(this.database);
    this.migrateLegacyData();
    this.conversationRepository = createConversationRepository(this.database);
    this.messageRepository = createMessageRepository(this.database);
    this.captureEventRepository = createCaptureEventRepository(this.database);
    this.appSettingsRepository = createAppSettingsRepository(this.database);
    this.providerSettingsRepository = createProviderSettingsRepository(this.database);
    this.serviceSettingsRepository = createServiceSettingsRepository(this.database, {
      getActiveProviderId: () => this.providerSettingsRepository.getActive()?.id ?? null,
      setActiveServiceId: (serviceId) => this.appSettingsRepository.setActiveServiceId(serviceId),
      getActiveServiceId: () => this.appSettingsRepository.getActiveServiceId(),
    });
    this.settingsWriteCoordinator = createSettingsWriteCoordinator({
      db: this.database,
      listServices: () => this.serviceSettingsRepository.list(),
      getActiveServiceId: () => this.appSettingsRepository.getActiveServiceId(),
      setActiveServiceId: (serviceId) => this.appSettingsRepository.setActiveServiceId(serviceId),
      setProviderEnabledWithinTransaction: (providerId, enabled) =>
        this.providerSettingsRepository.setEnabledWithinTransaction(providerId, enabled),
    });
  }

  getDb(): DatabaseSync {
    return this.database;
  }

  persistEnvelope(envelope: CaptureEnvelope): string {
    return runInTransaction(this.database, () => {
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
    });
  }

  replaceSessionEnvelope(sessionId: string, envelope: CaptureEnvelope): string {
    return runInTransaction(this.database, () => {
      const existingSession = this.getSessionById(sessionId);

      if (!existingSession) {
        throw new Error(`Unknown session: ${sessionId}.`);
      }

      if (existingSession.provider !== envelope.provider) {
        throw new Error(
          `Session ${sessionId} belongs to ${existingSession.provider}, not ${envelope.provider}.`
        );
      }

      const remoteConversationId =
        envelope.remoteConversationId ?? existingSession.remoteConversationId ?? null;
      const nextTitle = envelope.title ?? existingSession.title ?? null;
      const nextTitleSource = envelope.titleSource ?? existingSession.titleSource ?? 'fallback';

      if (remoteConversationId) {
        const conflictingSessionId = this.findSessionIdByRemoteConversation(
          existingSession.provider,
          remoteConversationId
        );

        if (conflictingSessionId && conflictingSessionId !== sessionId) {
          throw new Error(
            `Session ${sessionId} cannot be replaced with remote conversation ${remoteConversationId} because it already belongs to ${conflictingSessionId}.`
          );
        }
      }

      this.database
        .prepare(
          `
            UPDATE conversations
            SET
              remote_conversation_id = ?,
              source_session_key = ?,
              page_url = ?,
              title = ?,
              title_source = ?,
              updated_at = ?
            WHERE id = ?
          `
        )
        .run(
          remoteConversationId,
          envelope.sourceSessionKey,
          envelope.pageUrl,
          nextTitle,
          nextTitleSource,
          envelope.capturedAt,
          sessionId
        );

      this.messageRepository.deleteByConversation(sessionId);

      const insertedMessages = this.messageRepository.insertMany({
        conversationId: sessionId,
        provider: envelope.provider,
        remoteConversationId,
        source: envelope.source,
        capturedAt: envelope.capturedAt,
        messages: envelope.messages,
      });
      const messageCount = this.messageRepository.countByConversation(sessionId);

      this.conversationRepository.updateMessageCount(
        sessionId,
        messageCount,
        envelope.capturedAt
      );
      this.recordCaptureEvents(envelope, {
        insertedMessages,
        messageCount,
      });

      return sessionId;
    });
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

  findSessionByRemoteConversation(
    provider: ProviderId,
    remoteConversationId: string
  ): CaptureSessionRecord | null {
    const sessionId = this.findSessionIdByRemoteConversation(provider, remoteConversationId);
    return sessionId ? this.getSessionById(sessionId) : null;
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

  exportSession(
    sessionId: string,
    format: CaptureExportFormat,
    messageScope: CaptureExportMessageScope = 'complete'
  ): CaptureExportArtifact {
    const session = this.getSessionById(sessionId);

    if (!session) {
      throw new Error(`Unknown session: ${sessionId}.`);
    }

    const messages = filterMessagesByExportScope(this.listMessages(sessionId), messageScope);

    return buildSessionExportArtifact(session, messages, format, messageScope);
  }

  exportProviderSessions(
    providerId: ProviderId,
    format: CaptureExportFormat,
    messageScope: CaptureExportMessageScope = 'complete'
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
        messages: filterMessagesByExportScope(this.listMessages(session.id), messageScope),
      })),
      format,
      messageScope
    );
  }

  exportAllSessions(
    format: CaptureExportFormat,
    messageScope: CaptureExportMessageScope = 'complete'
  ): CaptureExportArtifact {
    const providerNames = new Map(this.listProviders().map((provider) => [provider.id, provider.name]));
    const sessions = this.listSessions();

    return buildAllSessionsExportArtifact(
      sessions.map((session) => ({
        session,
        providerName: providerNames.get(session.provider) ?? session.provider,
        messages: filterMessagesByExportScope(this.listMessages(session.id), messageScope),
      })),
      format,
      messageScope
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
    return this.settingsWriteCoordinator.setProviderEnabled(providerId, enabled);
  }

  setProviderCacheEnabled(providerId: ProviderId, cacheEnabled: boolean): ProviderRecord {
    return this.providerSettingsRepository.setCacheEnabled(providerId, cacheEnabled);
  }

  moveProvider(providerId: ProviderId, direction: ProviderMoveDirection): ProviderRecord[] {
    return this.providerSettingsRepository.move(providerId, direction);
  }

  listServices(): ServiceRecord[] {
    return this.serviceSettingsRepository.list();
  }

  getActiveService(): ServiceRecord | null {
    return this.serviceSettingsRepository.getActive();
  }

  setActiveService(serviceId: string): ServiceRecord {
    return this.serviceSettingsRepository.setActive(serviceId);
  }

  addCustomService(input: CreateCustomServiceInput): ServiceRecord {
    return this.serviceSettingsRepository.addCustom(input);
  }

  removeCustomService(serviceId: string): void {
    this.serviceSettingsRepository.removeCustom(serviceId);
  }

  setServiceEnabled(serviceId: string, enabled: boolean): ServiceRecord {
    const service = this.serviceSettingsRepository.list().find((entry) => entry.id === serviceId) ?? null;

    if (service?.kind === 'builtin') {
      this.settingsWriteCoordinator.setProviderEnabled(service.id as ProviderId, enabled);
      return this.serviceSettingsRepository.list().find((entry) => entry.id === serviceId) as ServiceRecord;
    }

    return this.serviceSettingsRepository.setEnabled(serviceId, enabled);
  }

  moveService(serviceId: string, direction: ServiceMoveDirection): ServiceRecord[] {
    return this.serviceSettingsRepository.move(serviceId, direction);
  }

  updateCustomServiceIcon(serviceId: string, iconUrl: string | null): ServiceRecord {
    return this.serviceSettingsRepository.updateCustomIcon(serviceId, iconUrl);
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

  private findSessionIdByRemoteConversation(
    provider: string,
    remoteConversationId: string
  ): string | null {
    const row = this.database
      .prepare(
        `
          SELECT id
          FROM conversations
          WHERE provider = ? AND remote_conversation_id = ?
          LIMIT 1
        `
      )
      .get(provider, remoteConversationId) as { id?: string } | undefined;

    return row?.id ?? null;
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
  format: CaptureExportFormat,
  messageScope: CaptureExportMessageScope
): CaptureExportArtifact {
  const title = resolveSessionTitle(session);
  const extension = format === 'json' ? 'json' : 'md';

  return {
    scope: 'session',
    format,
    messageScope,
    sessionId: session.id,
    providerId: session.provider,
    fileName: `amberkeeper-${session.provider}-${toFileSegment(title)}.${extension}`,
    mimeType: format === 'json' ? 'application/json' : 'text/markdown',
    content:
      format === 'json'
        ? JSON.stringify(
            {
              exportedAt: new Date().toISOString(),
              messageScope,
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
  format: CaptureExportFormat,
  messageScope: CaptureExportMessageScope
): CaptureExportArtifact {
  const extension = format === 'json' ? 'json' : 'md';

  return {
    scope: 'provider',
    format,
    messageScope,
    providerId,
    fileName: `amberkeeper-${providerId}-knowledge-base-export.${extension}`,
    mimeType: format === 'json' ? 'application/json' : 'text/markdown',
    content:
      format === 'json'
        ? JSON.stringify(
            {
              exportedAt: new Date().toISOString(),
              messageScope,
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

function buildAllSessionsExportArtifact(
  entries: Array<{ session: CaptureSessionRecord; providerName: string; messages: CaptureMessageRecord[] }>,
  format: CaptureExportFormat,
  messageScope: CaptureExportMessageScope
): CaptureExportArtifact {
  const extension = format === 'json' ? 'json' : 'md';

  return {
    scope: 'all',
    format,
    messageScope,
    fileName: `amberkeeper-all-records-export.${extension}`,
    mimeType: format === 'json' ? 'application/json' : 'text/markdown',
    content:
      format === 'json'
        ? JSON.stringify(
            {
              exportedAt: new Date().toISOString(),
              messageScope,
              sessionCount: entries.length,
              sessions: entries.map((entry) => ({
                providerName: entry.providerName,
                session: entry.session,
                messages: entry.messages,
              })),
            },
            null,
            2
          )
        : renderAllSessionsMarkdown(entries),
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

function renderAllSessionsMarkdown(
  entries: Array<{ session: CaptureSessionRecord; providerName: string; messages: CaptureMessageRecord[] }>
): string {
  const sections = entries.map((entry) => [
    `# ${entry.providerName}`,
    '',
    renderSessionMarkdown(entry.session, entry.messages),
  ].join('\n'));

  return [`# AmberKeeper 全部记录导出`, '', `- 导出时间：${new Date().toISOString()}`, `- 会话数量：${entries.length}`, '', ...sections]
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

function toFileSegment(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64) || 'session';
}

function filterMessagesByExportScope(
  messages: CaptureMessageRecord[],
  messageScope: CaptureExportMessageScope
): CaptureMessageRecord[] {
  if (messageScope === 'complete') {
    return messages;
  }

  return messages.filter((message) => message.role === messageScope);
}

function applySaveScope(envelope: CaptureEnvelope, saveScope: CaptureSaveScope): CaptureEnvelope {
  if (saveScope === 'complete') {
    return envelope;
  }

  return {
    ...envelope,
    messages: envelope.messages.filter((message) => message.role === 'user'),
  };
}

function applyTurnSaveScope(turn: CompletedTurn, saveScope: CaptureSaveScope): CompletedTurn {
  if (saveScope === 'complete') {
    return turn;
  }

  return {
    ...turn,
    messages: turn.messages.filter((message) => message.role === 'user'),
  };
}

function runInTransaction<T>(db: DatabaseSync, work: () => T): T {
  db.exec('BEGIN');

  try {
    const result = work();
    db.exec('COMMIT');
    return result;
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}
