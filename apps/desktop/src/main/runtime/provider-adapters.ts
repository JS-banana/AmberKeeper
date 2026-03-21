import type { ProviderSignal } from '@anychat/capture-core';
import { claudeAdapter } from '@anychat/provider-claude';
import { deepseekAdapter } from '@anychat/provider-deepseek';
import { geminiAdapter } from '@anychat/provider-gemini';
import { chatgptAdapter } from '@anychat/provider-chatgpt';
import type { ProviderAdapter, ProviderId } from '@anychat/shared-types';

const PROVIDER_ADAPTERS: Partial<Record<ProviderId, ProviderAdapter<ProviderSignal>>> = {
  chatgpt: chatgptAdapter,
  claude: claudeAdapter,
  deepseek: deepseekAdapter,
  gemini: geminiAdapter,
};

export function getProviderAdapter(providerId: ProviderId): ProviderAdapter<ProviderSignal> | null {
  return PROVIDER_ADAPTERS[providerId] ?? null;
}

export function listRegisteredProviderAdapters(): ProviderAdapter<ProviderSignal>[] {
  return Object.values(PROVIDER_ADAPTERS).filter(
    (adapter): adapter is ProviderAdapter<ProviderSignal> => adapter !== undefined
  );
}
