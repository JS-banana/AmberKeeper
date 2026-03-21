import type { ProviderId } from '@amberkeeper/shared-types';

export function shouldRecordParsedResponseDiagnostics(input: {
  provider: ProviderId;
  classification: 'capture' | 'discover';
}): boolean {
  return input.classification === 'capture' && ['deepseek', 'gemini'].includes(input.provider);
}
