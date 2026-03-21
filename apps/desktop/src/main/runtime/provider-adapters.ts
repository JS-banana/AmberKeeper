import type { ProviderSignal } from '@amberkeeper/capture-core';
import { claudeAdapter } from '@amberkeeper/provider-claude';
import { deepseekAdapter } from '@amberkeeper/provider-deepseek';
import { geminiAdapter } from '@amberkeeper/provider-gemini';
import { chatgptAdapter } from '@amberkeeper/provider-chatgpt';
import type { ProviderAdapter, ProviderId } from '@amberkeeper/shared-types';

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
