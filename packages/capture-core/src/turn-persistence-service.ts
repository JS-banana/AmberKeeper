import type { DatabaseSync } from 'node:sqlite';
import type { CaptureEnvelope } from '@amberkeeper/shared-types';
import { createCaptureEventRepository } from './persistence/capture-event-repository';
import {
  createConversationRepository,
  type ConversationResolution,
} from './persistence/conversation-repository';
import { createMessageRepository } from './persistence/message-repository';
import type { CompletedTurn } from './signals';

export function createTurnPersistenceService(options: {
  persistEnvelope?: (envelope: CaptureEnvelope) => void;
  persistTurn?: (turn: CompletedTurn) => void;
}) {
  return {
    persist(turn: CompletedTurn): void {
      if (options.persistTurn) {
        options.persistTurn(turn);
        return;
      }

      if (options.persistEnvelope) {
        options.persistEnvelope(toCaptureEnvelope(turn));
        return;
      }

      throw new Error('Turn persistence service requires either persistTurn or persistEnvelope.');
    },
  };
}

export function persistCompletedTurn(db: DatabaseSync, turn: CompletedTurn): string {
  return runInTransaction(db, () => {
    const conversationRepository = createConversationRepository(db);
    const messageRepository = createMessageRepository(db);
    const captureEventRepository = createCaptureEventRepository(db);

    const conversationResolution = conversationRepository.resolve({
      provider: turn.provider,
      remoteConversationId: turn.conversationId,
      remoteConversationAliases: turn.remoteConversationAliases,
      sourceSessionKey: turn.sourceSessionKey,
      pageUrl: turn.pageUrl,
      title: turn.title,
      titleSource: turn.titleSource,
      createdAt: turn.messages[0]?.createdAt ?? turn.capturedAt,
      updatedAt: turn.capturedAt,
    });
    applyConversationResolution(conversationResolution, {
      conversationRepository,
      messageRepository,
    });
    const conversationId = conversationResolution.id;

    const insertedMessages = messageRepository.insertMany({
      conversationId,
      provider: turn.provider,
      remoteConversationId: turn.conversationId,
      source: turn.source,
      capturedAt: turn.capturedAt,
      messages: turn.messages,
    });
    const messageCount = messageRepository.countByConversation(conversationId);
    conversationRepository.updateMessageCount(conversationId, messageCount, turn.capturedAt);

    turn.messages.forEach((message) => {
      captureEventRepository.insert({
        provider: turn.provider,
        source: turn.source,
        sourceSessionKey: turn.sourceSessionKey,
        pageUrl: turn.pageUrl,
        remoteConversationId: turn.conversationId,
        eventKind: 'message_persisted',
        payloadJson: JSON.stringify({
          role: message.role,
          content: message.content,
          createdAt: message.createdAt,
        }),
        createdAt: turn.capturedAt,
      });
    });

    captureEventRepository.insert({
      provider: turn.provider,
      source: turn.source,
      sourceSessionKey: turn.sourceSessionKey,
      pageUrl: turn.pageUrl,
      remoteConversationId: turn.conversationId,
      eventKind: 'turn_persisted',
      payloadJson: JSON.stringify({
        insertedMessages,
        messageCount,
      }),
      createdAt: turn.capturedAt,
    });

    return conversationId;
  });
}

export function toCaptureEnvelope(turn: CompletedTurn): CaptureEnvelope {
  return {
    provider: turn.provider,
    source: turn.source,
    pageUrl: turn.pageUrl,
    capturedAt: turn.capturedAt,
    sourceSessionKey: turn.sourceSessionKey,
    remoteConversationId: turn.conversationId,
    remoteConversationAliases: turn.remoteConversationAliases,
    title: turn.title,
    titleSource: turn.titleSource,
    messages: turn.messages,
  };
}

function applyConversationResolution(
  resolution: ConversationResolution,
  repositories: {
    conversationRepository: ReturnType<typeof createConversationRepository>;
    messageRepository: ReturnType<typeof createMessageRepository>;
  }
): void {
  for (const action of resolution.messageActions) {
    if (action.kind === 'moveMessagesToConversation') {
      repositories.messageRepository.moveToConversation(action);
      continue;
    }

    repositories.messageRepository.updateRemoteConversationId(
      action.conversationId,
      action.remoteConversationId,
      { onlyMissing: action.onlyMissing }
    );
  }

  for (const action of resolution.conversationActions) {
    repositories.conversationRepository.deleteById(action.conversationId);
  }
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
