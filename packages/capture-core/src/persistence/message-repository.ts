import crypto from 'node:crypto';
import { createHash } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import type { CaptureEnvelope, NormalizedMessage } from '@amberkeeper/shared-types';
import { ensureCaptureCorePersistenceSchema } from './schema';

export function createMessageRepository(db: DatabaseSync) {
  ensureCaptureCorePersistenceSchema(db);

  return {
    insertMany(input: {
      conversationId: string;
      provider: string;
      remoteConversationId?: string | null;
      source: CaptureEnvelope['source'];
      capturedAt: string;
      messages: NormalizedMessage[];
    }): number {
      let inserted = 0;

      for (const message of input.messages) {
        const contentHash = createHash('sha256').update(message.content).digest('hex');
        const remoteConversationId =
          input.remoteConversationId ?? message.remoteConversationId ?? null;
        const remoteMessageId = message.remoteMessageId ?? null;
        const createdAt = normalizeTimestamp(message.createdAt, input.capturedAt);

        const existing =
          findExistingMessage({
            db,
            conversationId: input.conversationId,
            provider: input.provider,
            remoteConversationId,
            role: message.role,
            createdAt,
            remoteMessageId,
            contentHash,
          }) as
            | {
                id?: string;
                createdAt?: string;
                remoteMessageId?: string | null;
                model?: string | null;
              }
            | undefined;

        if (existing?.id) {
          const existingId = existing.id;
          db.prepare(
            `
              UPDATE messages
              SET
                created_at = ?,
                remote_message_id = ?,
                model = ?
              WHERE id = ?
            `
          ).run(
            chooseMessageCreatedAt(existing.createdAt, createdAt),
            existing.remoteMessageId ?? message.remoteMessageId ?? null,
            existing.model ?? message.model ?? null,
            existingId
          );
          continue;
        }

        db.prepare(
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
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `
        ).run(
          `message-${crypto.randomUUID()}`,
          input.conversationId,
          input.provider,
          remoteConversationId,
          message.role,
          message.content,
          contentHash,
          remoteMessageId,
          message.model ?? null,
          input.source,
          createdAt,
          input.capturedAt
        );

        inserted += 1;
      }

      return inserted;
    },
    countByConversation(conversationId: string): number {
      const row = db
        .prepare(
          `
            SELECT COUNT(*) AS count
            FROM messages
            WHERE conversation_id = ?
          `
        )
        .get(conversationId) as { count: number };

      return row.count;
    },
    deleteByConversation(conversationId: string): void {
      db.prepare(
        `
          DELETE FROM messages
          WHERE conversation_id = ?
        `
      ).run(conversationId);
    },
  };
}

function chooseMessageCreatedAt(existingCreatedAt: string | undefined, nextCreatedAt: string): string {
  if (!existingCreatedAt) {
    return nextCreatedAt;
  }

  if (isPlaceholderTimestamp(existingCreatedAt) && !isPlaceholderTimestamp(nextCreatedAt)) {
    return nextCreatedAt;
  }

  return new Date(nextCreatedAt).getTime() < new Date(existingCreatedAt).getTime()
    ? nextCreatedAt
    : existingCreatedAt;
}

function isPlaceholderTimestamp(input: string): boolean {
  return input === new Date(0).toISOString();
}

function normalizeTimestamp(input: string, fallback: string): string {
  const date = new Date(input);
  if (!input || Number.isNaN(date.getTime()) || isPlaceholderTimestamp(input)) {
    return fallback;
  }

  return input;
}

function findExistingMessage(input: {
  db: DatabaseSync;
  conversationId: string;
  provider: string;
  remoteConversationId: string | null;
  role: NormalizedMessage['role'];
  createdAt: string;
  remoteMessageId: string | null;
  contentHash: string;
}) {
  if (input.remoteMessageId) {
    const exactMatch = input.db
      .prepare(
        `
          SELECT
            id,
            created_at AS createdAt,
            remote_message_id AS remoteMessageId,
            model
          FROM messages
          WHERE provider = ?
            AND ifnull(remote_conversation_id, '') = ifnull(?, '')
            AND remote_message_id = ?
        `
      )
      .get(input.provider, input.remoteConversationId, input.remoteMessageId);

    if (exactMatch) {
      return exactMatch;
    }

    return input.db
      .prepare(
        `
          SELECT
            id,
            created_at AS createdAt,
            remote_message_id AS remoteMessageId,
            model
          FROM messages
          WHERE conversation_id = ?
            AND role = ?
            AND content_hash = ?
            AND remote_message_id IS NULL
          ORDER BY
            CASE
              WHEN created_at = ? THEN 0
              WHEN created_at = ? THEN 1
              ELSE 2
            END,
            created_at ASC
          LIMIT 1
        `
      )
      .get(
        input.conversationId,
        input.role,
        input.contentHash,
        new Date(0).toISOString(),
        input.createdAt
      );
  }

  return input.db
    .prepare(
      `
        SELECT
          id,
          created_at AS createdAt,
          remote_message_id AS remoteMessageId,
          model
        FROM messages
        WHERE conversation_id = ?
          AND role = ?
          AND created_at = ?
          AND content_hash = ?
      `
    )
    .get(input.conversationId, input.role, input.createdAt, input.contentHash);
}
