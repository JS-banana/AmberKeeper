import crypto from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import type { SessionTitleSource } from '@amberkeeper/shared-types';
import { ensureCaptureCorePersistenceSchema } from './schema';

export function createConversationRepository(db: DatabaseSync) {
  ensureCaptureCorePersistenceSchema(db);

  return {
    resolve(input: {
      provider: string;
      remoteConversationId?: string | null;
      sourceSessionKey: string;
      pageUrl: string;
      title?: string | null;
      titleSource?: SessionTitleSource;
      createdAt: string;
      updatedAt: string;
    }): string {
      const remoteConversationId = input.remoteConversationId ?? null;
      const incomingTitle = normalizeTitle(input.title);
      const incomingTitleSource = incomingTitle ? (input.titleSource ?? 'provider') : 'fallback';

      if (remoteConversationId) {
        const existingResolved = db
          .prepare(
            `
              SELECT id, created_at AS createdAt, title, title_source AS titleSource
              FROM conversations
              WHERE provider = ? AND remote_conversation_id = ?
            `
          )
          .get(input.provider, remoteConversationId) as
            | { id?: string; createdAt?: string; title?: string | null; titleSource?: SessionTitleSource | null }
            | undefined;

        if (existingResolved?.id) {
          const nextTitle = resolveStoredTitle({
            existingTitle: existingResolved.title,
            existingTitleSource: existingResolved.titleSource,
            incomingTitle,
            incomingTitleSource,
          });

          db.prepare(
            `
              UPDATE conversations
              SET source_session_key = ?, page_url = ?, title = ?, title_source = ?, created_at = ?, updated_at = ?
              WHERE id = ?
            `
          ).run(
            input.sourceSessionKey,
            input.pageUrl,
            nextTitle.title,
            nextTitle.titleSource,
            chooseConversationCreatedAt(existingResolved.createdAt, input.createdAt),
            input.updatedAt,
            existingResolved.id
          );

          return existingResolved.id;
        }

        const fallback = db
          .prepare(
            `
              SELECT id, created_at AS createdAt, title, title_source AS titleSource
              FROM conversations
              WHERE provider = ? AND source_session_key = ? AND remote_conversation_id IS NULL
            `
          )
          .get(input.provider, input.sourceSessionKey) as
            | { id?: string; createdAt?: string; title?: string | null; titleSource?: SessionTitleSource | null }
            | undefined;

        if (fallback?.id) {
          const nextTitle = resolveStoredTitle({
            existingTitle: fallback.title,
            existingTitleSource: fallback.titleSource,
            incomingTitle,
            incomingTitleSource,
          });

          db.prepare(
            `
              UPDATE conversations
              SET remote_conversation_id = ?, page_url = ?, title = ?, title_source = ?, created_at = ?, updated_at = ?
              WHERE id = ?
            `
          ).run(
            remoteConversationId,
            input.pageUrl,
            nextTitle.title,
            nextTitle.titleSource,
            chooseConversationCreatedAt(fallback.createdAt, input.createdAt),
            input.updatedAt,
            fallback.id
          );

          db.prepare(
            `
              UPDATE messages
              SET remote_conversation_id = ?
              WHERE conversation_id = ? AND remote_conversation_id IS NULL
            `
          ).run(remoteConversationId, fallback.id);

          return fallback.id;
        }
      }

      const fallback = db
        .prepare(
          `
            SELECT id, created_at AS createdAt, title, title_source AS titleSource
            FROM conversations
            WHERE provider = ? AND source_session_key = ? AND ifnull(remote_conversation_id, '') = ifnull(?, '')
          `
        )
        .get(input.provider, input.sourceSessionKey, remoteConversationId) as
          | { id?: string; createdAt?: string; title?: string | null; titleSource?: SessionTitleSource | null }
          | undefined;

      if (fallback?.id) {
        const nextTitle = resolveStoredTitle({
          existingTitle: fallback.title,
          existingTitleSource: fallback.titleSource,
          incomingTitle,
          incomingTitleSource,
        });

        db.prepare(
          `
            UPDATE conversations
            SET page_url = ?, title = ?, title_source = ?, created_at = ?, updated_at = ?
            WHERE id = ?
          `
        ).run(
          input.pageUrl,
          nextTitle.title,
          nextTitle.titleSource,
          chooseConversationCreatedAt(fallback.createdAt, input.createdAt),
          input.updatedAt,
          fallback.id
        );

        return fallback.id;
      }

      const conversationId = `conversation-${crypto.randomUUID()}`;
      db.prepare(
        `
          INSERT INTO conversations (
            id,
            provider,
            remote_conversation_id,
            source_session_key,
            page_url,
            title,
            title_source,
            created_at,
            updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `
      ).run(
        conversationId,
        input.provider,
        remoteConversationId,
        input.sourceSessionKey,
        input.pageUrl,
        incomingTitle,
        incomingTitleSource,
        input.createdAt,
        input.updatedAt
      );

      return conversationId;
    },
    updateMessageCount(conversationId: string, messageCount: number, updatedAt: string): void {
      db.prepare(
        `
          UPDATE conversations
          SET message_count = ?, updated_at = ?
          WHERE id = ?
        `
      ).run(messageCount, updatedAt, conversationId);
    },
  };
}

function normalizeTitle(input: string | null | undefined): string | null {
  const title = input?.trim();
  return title ? title : null;
}

function resolveStoredTitle(input: {
  existingTitle?: string | null;
  existingTitleSource?: SessionTitleSource | null;
  incomingTitle: string | null;
  incomingTitleSource: SessionTitleSource;
}): { title: string | null; titleSource: SessionTitleSource } {
  const existingTitle = normalizeTitle(input.existingTitle);
  const existingTitleSource = input.existingTitleSource ?? 'fallback';

  if (!input.incomingTitle) {
    return {
      title: existingTitle,
      titleSource: existingTitle ? existingTitleSource : 'fallback',
    };
  }

  if (!existingTitle) {
    return {
      title: input.incomingTitle,
      titleSource: input.incomingTitleSource,
    };
  }

  if (input.incomingTitleSource === 'provider') {
    return {
      title: input.incomingTitle,
      titleSource: 'provider',
    };
  }

  return {
    title: existingTitle,
    titleSource: existingTitleSource,
  };
}

function chooseConversationCreatedAt(existingCreatedAt: string | undefined, nextCreatedAt: string): string {
  if (!existingCreatedAt) {
    return nextCreatedAt;
  }

  if (isPlaceholderTimestamp(existingCreatedAt) && !isPlaceholderTimestamp(nextCreatedAt)) {
    return nextCreatedAt;
  }

  return existingCreatedAt;
}

function isPlaceholderTimestamp(input: string): boolean {
  return input === new Date(0).toISOString();
}
