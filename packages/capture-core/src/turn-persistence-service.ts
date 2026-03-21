import type { DatabaseSync } from 'node:sqlite';
import type { CaptureEnvelope } from '@amberkeeper/shared-types';
import { createCaptureEventRepository } from './persistence/capture-event-repository';
import { createConversationRepository } from './persistence/conversation-repository';
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
  const conversationRepository = createConversationRepository(db);
  const messageRepository = createMessageRepository(db);
  const captureEventRepository = createCaptureEventRepository(db);

  const conversationId = conversationRepository.resolve({
    provider: turn.provider,
    remoteConversationId: turn.conversationId,
    sourceSessionKey: turn.sourceSessionKey,
    pageUrl: turn.pageUrl,
    createdAt: turn.messages[0]?.createdAt ?? turn.capturedAt,
    updatedAt: turn.capturedAt,
  });

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
}

export function toCaptureEnvelope(turn: CompletedTurn): CaptureEnvelope {
  return {
    provider: turn.provider,
    source: turn.source,
    pageUrl: turn.pageUrl,
    capturedAt: turn.capturedAt,
    sourceSessionKey: turn.sourceSessionKey,
    remoteConversationId: turn.conversationId,
    messages: turn.messages,
  };
}
