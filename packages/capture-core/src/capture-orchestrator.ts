import type { CompletedTurn, ProviderSignal } from './signals';
import {
  createCompletedTurnFingerprint,
  markTurnPersisted,
  reduceTurn,
  toCompletedTurn,
  type TurnState,
} from './turn-state';

export function createCaptureOrchestrator(options: {
  persist: (turn: CompletedTurn) => void;
}) {
  const states = new Map<string, TurnState>();
  const persistedFingerprints = new Set<string>();

  return {
    consume(signal: ProviderSignal): void {
      const key = createTurnKey(signal);
      const nextState = reduceTurn(states.get(key), signal);
      states.set(key, nextState);

      const completedTurn = toCompletedTurn(nextState);
      if (!completedTurn) {
        return;
      }

      const fingerprint = createCompletedTurnFingerprint(completedTurn);
      if (persistedFingerprints.has(fingerprint)) {
        return;
      }

      options.persist(completedTurn);
      persistedFingerprints.add(fingerprint);
      states.set(key, markTurnPersisted(nextState));
    },
    getState(key: string): TurnState | undefined {
      return states.get(key);
    },
  };
}

export function createTurnKey(signal: ProviderSignal): string {
  return `${signal.provider}:${signal.sourceSessionKey}`;
}
