import type { NormalizedMessage } from '@amberkeeper/shared-types';
import type { CompletedTurn, ProviderSignal } from './signals';

export type TurnStatus =
  | 'idle'
  | 'collecting'
  | 'awaiting_conversation_id'
  | 'awaiting_assistant'
  | 'ready_to_persist'
  | 'persisted'
  | 'abandoned';

export interface TurnState {
  provider: ProviderSignal['provider'];
  source: ProviderSignal['source'];
  sourceSessionKey: string;
  pageUrl: string;
  capturedAt: string;
  status: TurnStatus;
  conversationId: string | null;
  userMessage: NormalizedMessage | null;
  assistantMessage: NormalizedMessage | null;
}

export function reduceTurn(previous: TurnState | undefined, signal: ProviderSignal): TurnState {
  const state = createBaseState(previous, signal);

  if (signal.kind === 'candidateUserMessage') {
    state.userMessage = toNormalizedMessage('user', signal);
    state.conversationId = signal.conversationId ?? state.conversationId;
  }

  if (signal.kind === 'conversationIdResolved') {
    state.conversationId = signal.conversationId;
  }

  if (signal.kind === 'assistantMayBeReady') {
    state.conversationId = signal.conversationId ?? state.conversationId;
    state.assistantMessage = signal.stable ? toNormalizedMessage('assistant', signal) : null;
  }

  state.status = resolveStatus(state);
  return state;
}

export function toCompletedTurn(state: TurnState): CompletedTurn | null {
  if (state.status !== 'ready_to_persist' || !state.userMessage || !state.assistantMessage || !state.conversationId) {
    return null;
  }

  return {
    provider: state.provider,
    source: state.source,
    sourceSessionKey: state.sourceSessionKey,
    pageUrl: state.pageUrl,
    capturedAt: state.capturedAt,
    conversationId: state.conversationId,
    messages: [
      {
        ...state.userMessage,
        remoteConversationId: state.conversationId,
      },
      {
        ...state.assistantMessage,
        remoteConversationId: state.conversationId,
      },
    ],
  };
}

export function markTurnPersisted(state: TurnState): TurnState {
  return {
    ...state,
    status: 'persisted',
  };
}

export function createCompletedTurnFingerprint(turn: CompletedTurn): string {
  return [
    turn.provider,
    turn.sourceSessionKey,
    turn.conversationId,
    ...turn.messages.map((message) =>
      [
        message.role,
        message.content,
        message.createdAt,
        message.remoteMessageId ?? '',
        message.model ?? '',
      ].join(':')
    ),
  ].join('|');
}

function createBaseState(previous: TurnState | undefined, signal: ProviderSignal): TurnState {
  if (!previous || shouldResetTurn(previous, signal)) {
    return {
      provider: signal.provider,
      source: signal.source,
      sourceSessionKey: signal.sourceSessionKey,
      pageUrl: signal.pageUrl,
      capturedAt: signal.capturedAt,
      status: 'idle',
      conversationId: null,
      userMessage: null,
      assistantMessage: null,
    };
  }

  return {
    ...previous,
    provider: signal.provider,
    source: signal.source,
    sourceSessionKey: signal.sourceSessionKey,
    pageUrl: signal.pageUrl,
    capturedAt: signal.capturedAt,
  };
}

function shouldResetTurn(previous: TurnState, signal: ProviderSignal): boolean {
  return (
    signal.kind === 'candidateUserMessage' &&
    (previous.status === 'persisted' || previous.userMessage?.content !== signal.content)
  );
}

function resolveStatus(state: TurnState): TurnStatus {
  if (!state.userMessage) {
    return 'idle';
  }

  if (!state.conversationId) {
    return 'awaiting_conversation_id';
  }

  if (!state.assistantMessage) {
    return 'awaiting_assistant';
  }

  return 'ready_to_persist';
}

function toNormalizedMessage(
  role: NormalizedMessage['role'],
  signal: Extract<ProviderSignal, { content: string; createdAt: string }>
): NormalizedMessage {
  return {
    role,
    content: signal.content,
    createdAt: signal.createdAt,
    remoteConversationId: 'conversationId' in signal ? signal.conversationId ?? undefined : undefined,
    remoteMessageId: signal.remoteMessageId,
    model: signal.model,
  };
}
