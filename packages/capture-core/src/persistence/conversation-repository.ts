import crypto from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import type { SessionTitleSource } from '@amberkeeper/shared-types';
import { ensureCaptureCorePersistenceSchema } from './schema';

export type ConversationResolution = {
  id: string;
  messageActions: Array<
    | {
        kind: 'moveMessagesToConversation';
        sourceConversationId: string;
        targetConversationId: string;
        remoteConversationId: string;
      }
    | {
        kind: 'updateMessageRemoteConversationId';
        conversationId: string;
        remoteConversationId: string;
        onlyMissing: boolean;
      }
  >;
  conversationActions: Array<{
    kind: 'deleteConversation';
    conversationId: string;
  }>;
};

export function createConversationRepository(db: DatabaseSync) {
  ensureCaptureCorePersistenceSchema(db);

  return {
    resolve(input: {
      provider: string;
      remoteConversationId?: string | null;
      remoteConversationAliases?: string[];
      sourceSessionKey: string;
      pageUrl: string;
      title?: string | null;
      titleSource?: SessionTitleSource;
      createdAt: string;
      updatedAt: string;
    }): ConversationResolution {
      const remoteConversationId = input.remoteConversationId ?? null;
      const remoteConversationAliases = normalizeAliases(
        input.remoteConversationAliases,
        remoteConversationId
      );
      const incomingTitle = normalizeTitle(input.title);
      const incomingTitleSource = incomingTitle ? (input.titleSource ?? 'provider') : 'fallback';
      const createdAt = normalizeTimestamp(input.createdAt, input.updatedAt);

      if (remoteConversationId) {
        const existingResolved = findConversationByRemoteId(db, input.provider, remoteConversationId);
        const aliasResolved = findConversationByRemoteAliases(db, input.provider, remoteConversationAliases);

        if (existingResolved?.id) {
          const messageActions: ConversationResolution['messageActions'] = [];
          const conversationActions: ConversationResolution['conversationActions'] = [];

          if (aliasResolved?.id && aliasResolved.id !== existingResolved.id) {
            messageActions.push({
              kind: 'moveMessagesToConversation',
              sourceConversationId: aliasResolved.id,
              targetConversationId: existingResolved.id,
              remoteConversationId,
            });
            conversationActions.push({
              kind: 'deleteConversation',
              conversationId: aliasResolved.id,
            });
          }

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
            chooseConversationCreatedAt(existingResolved.createdAt, createdAt),
            input.updatedAt,
            existingResolved.id
          );

          messageActions.push({
            kind: 'updateMessageRemoteConversationId',
            conversationId: existingResolved.id,
            remoteConversationId,
            onlyMissing: false,
          });
          return {
            id: existingResolved.id,
            messageActions,
            conversationActions,
          };
        }

        if (aliasResolved?.id) {
          const nextTitle = resolveStoredTitle({
            existingTitle: aliasResolved.title,
            existingTitleSource: aliasResolved.titleSource,
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
            chooseConversationCreatedAt(aliasResolved.createdAt, createdAt),
            input.updatedAt,
            aliasResolved.id
          );

          return {
            id: aliasResolved.id,
            messageActions: [
              {
                kind: 'updateMessageRemoteConversationId',
                conversationId: aliasResolved.id,
                remoteConversationId,
                onlyMissing: false,
              },
            ],
            conversationActions: [],
          };
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
            | ConversationLookupRow
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
            chooseConversationCreatedAt(fallback.createdAt, createdAt),
            input.updatedAt,
            fallback.id
          );

          return {
            id: fallback.id,
            messageActions: [
              {
                kind: 'updateMessageRemoteConversationId',
                conversationId: fallback.id,
                remoteConversationId,
                onlyMissing: true,
              },
            ],
            conversationActions: [],
          };
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
          | ConversationLookupRow
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
          chooseConversationCreatedAt(fallback.createdAt, createdAt),
          input.updatedAt,
          fallback.id
        );

        return {
          id: fallback.id,
          messageActions: [],
          conversationActions: [],
        };
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
        createdAt,
        input.updatedAt
      );

      return {
        id: conversationId,
        messageActions: [],
        conversationActions: [],
      };
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
    deleteById(conversationId: string): void {
      db.prepare(
        `
          DELETE FROM conversations
          WHERE id = ?
        `
      ).run(conversationId);
    },
  };
}

type ConversationLookupRow = {
  id?: string;
  createdAt?: string;
  title?: string | null;
  titleSource?: SessionTitleSource | null;
};

function findConversationByRemoteId(
  db: DatabaseSync,
  provider: string,
  remoteConversationId: string
): ConversationLookupRow | undefined {
  return db
    .prepare(
      `
        SELECT
          id,
          created_at AS createdAt,
          title,
          title_source AS titleSource
        FROM conversations
        WHERE provider = ? AND remote_conversation_id = ?
      `
    )
    .get(provider, remoteConversationId) as ConversationLookupRow | undefined;
}

function findConversationByRemoteAliases(
  db: DatabaseSync,
  provider: string,
  aliases: string[]
): ConversationLookupRow | undefined {
  for (const alias of aliases) {
    const row = findConversationByRemoteId(db, provider, alias);
    if (row?.id) {
      return row;
    }
  }

  return undefined;
}

function normalizeAliases(
  aliases: string[] | undefined,
  remoteConversationId: string | null
): string[] {
  const normalized: string[] = [];
  for (const alias of aliases ?? []) {
    const value = alias.trim();
    if (value && value !== remoteConversationId && !normalized.includes(value)) {
      normalized.push(value);
    }
  }
  return normalized;
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
