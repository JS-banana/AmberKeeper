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
            content: message.content,
            createdAt,
            remoteMessageId,
            contentHash,
            source: input.source,
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
    updateRemoteConversationId(
      conversationId: string,
      remoteConversationId: string,
      options: { onlyMissing?: boolean } = {}
    ): void {
      db.prepare(
        `
          UPDATE messages
          SET remote_conversation_id = ?
          WHERE conversation_id = ?
          ${options.onlyMissing ? 'AND remote_conversation_id IS NULL' : ''}
        `
      ).run(remoteConversationId, conversationId);
    },
    moveToConversation(input: {
      sourceConversationId: string;
      targetConversationId: string;
      remoteConversationId: string;
    }): void {
      db.prepare(
        `
          UPDATE messages
          SET conversation_id = ?, remote_conversation_id = ?
          WHERE conversation_id = ?
        `
      ).run(input.targetConversationId, input.remoteConversationId, input.sourceConversationId);
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
  content: string;
  createdAt: string;
  remoteMessageId: string | null;
  contentHash: string;
  source: CaptureEnvelope['source'];
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

  const exactMatch = input.db
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

  if (exactMatch) {
    return exactMatch;
  }

  const crossSourceMatch = findUniqueCrossSourceContentMatch({
    ...input,
    maxCreatedAtDistanceMs: 60_000,
  });

  if (crossSourceMatch) {
    return crossSourceMatch;
  }

  const normalizedCrossSourceMatch = findUniqueCrossSourceNormalizedContentMatch({
    ...input,
    maxCreatedAtDistanceMs: 60_000,
  });
  if (normalizedCrossSourceMatch) {
    return normalizedCrossSourceMatch;
  }

  return undefined;
}

type MessageLookupRow = {
  id?: string;
  createdAt?: string;
  remoteMessageId?: string | null;
  model?: string | null;
};

function findUniqueCrossSourceContentMatch(input: {
  db: DatabaseSync;
  conversationId: string;
  role: NormalizedMessage['role'];
  createdAt: string;
  contentHash: string;
  source: CaptureEnvelope['source'];
  maxCreatedAtDistanceMs: number;
}): MessageLookupRow | undefined {
  const rows = input.db
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
          AND source != ?
        ORDER BY captured_at DESC
        LIMIT 2
      `
    )
    .all(input.conversationId, input.role, input.contentHash, input.source) as MessageLookupRow[];

  if (
    rows.length !== 1 ||
    !isNearTimestamp(rows[0]?.createdAt, input.createdAt, input.maxCreatedAtDistanceMs)
  ) {
    return undefined;
  }

  return rows[0];
}

function findUniqueCrossSourceNormalizedContentMatch(input: {
  db: DatabaseSync;
  conversationId: string;
  role: NormalizedMessage['role'];
  content: string;
  createdAt: string;
  source: CaptureEnvelope['source'];
  maxCreatedAtDistanceMs: number;
}): MessageLookupRow | undefined {
  const targetContent = normalizeComparableContent(input.content);
  if (!targetContent) {
    return undefined;
  }

  const rows = input.db
    .prepare(
      `
        SELECT
          id,
          created_at AS createdAt,
          remote_message_id AS remoteMessageId,
          model,
          content
        FROM messages
        WHERE conversation_id = ?
          AND role = ?
          AND source != ?
        ORDER BY captured_at DESC
        LIMIT 20
      `
    )
    .all(input.conversationId, input.role, input.source) as Array<MessageLookupRow & { content?: string }>;
  const matches = rows.filter(
    (row) =>
      normalizeComparableContent(row.content) === targetContent &&
      isNearTimestamp(row.createdAt, input.createdAt, input.maxCreatedAtDistanceMs)
  );

  return matches.length === 1 ? matches[0] : undefined;
}

function isNearTimestamp(first: string | undefined, second: string, maxDistanceMs: number): boolean {
  const firstTime = first ? new Date(first).getTime() : Number.NaN;
  const secondTime = new Date(second).getTime();
  return (
    !Number.isNaN(firstTime) &&
    !Number.isNaN(secondTime) &&
    Math.abs(firstTime - secondTime) <= maxDistanceMs
  );
}

function normalizeComparableContent(input: string | undefined): string {
  return (input ?? '').replace(/\u00A0/g, ' ').replace(/\u200B/g, '').replace(/\s+/g, ' ').trim();
}
