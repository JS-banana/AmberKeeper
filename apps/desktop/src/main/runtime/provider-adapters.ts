import type { ProviderSignal } from '@amberkeeper/capture-core';
import { claudeAdapter } from '@amberkeeper/provider-claude';
import { deepseekAdapter } from '@amberkeeper/provider-deepseek';
import { doubaoAdapter, doubaoLiveAutomationSpec } from '@amberkeeper/provider-doubao';
import { geminiAdapter } from '@amberkeeper/provider-gemini';
import { grokAdapter, grokLiveAutomationSpec } from '@amberkeeper/provider-grok';
import { chatgptAdapter } from '@amberkeeper/provider-chatgpt';
import { kimiAdapter, kimiLiveAutomationSpec } from '@amberkeeper/provider-kimi';
import { qianwenAdapter, qianwenLiveAutomationSpec } from '@amberkeeper/provider-qianwen';
import {
  xiaomiAistudioAdapter,
  xiaomiAistudioLiveAutomationSpec,
} from '@amberkeeper/provider-xiaomi-aistudio';
import type { ProviderAdapter, ProviderId, ProviderLiveAutomationSpec } from '@amberkeeper/shared-types';

const PROVIDER_ADAPTERS: Partial<Record<ProviderId, ProviderAdapter<ProviderSignal>>> = {
  chatgpt: chatgptAdapter,
  claude: claudeAdapter,
  deepseek: deepseekAdapter,
  gemini: geminiAdapter,
  grok: grokAdapter,
  kimi: kimiAdapter,
  qianwen: qianwenAdapter,
  doubao: doubaoAdapter,
  'xiaomi-aistudio': xiaomiAistudioAdapter,
};

const PROVIDER_AUTOMATION_SPECS: Partial<Record<ProviderId, ProviderLiveAutomationSpec>> = {
  grok: grokLiveAutomationSpec,
  kimi: kimiLiveAutomationSpec,
  qianwen: qianwenLiveAutomationSpec,
  doubao: doubaoLiveAutomationSpec,
  'xiaomi-aistudio': xiaomiAistudioLiveAutomationSpec,
};

export function getProviderAdapter(providerId: ProviderId): ProviderAdapter<ProviderSignal> | null {
  return PROVIDER_ADAPTERS[providerId] ?? null;
}

export function listRegisteredProviderAdapters(): ProviderAdapter<ProviderSignal>[] {
  return Object.values(PROVIDER_ADAPTERS).filter(
    (adapter): adapter is ProviderAdapter<ProviderSignal> => adapter !== undefined
  );
}

export function getProviderLiveAutomationSpec(providerId: ProviderId): ProviderLiveAutomationSpec | null {
  return PROVIDER_AUTOMATION_SPECS[providerId] ?? null;
}

export function listRegisteredProviderAutomationSpecs(): ProviderLiveAutomationSpec[] {
  return Object.values(PROVIDER_AUTOMATION_SPECS).filter(
    (spec): spec is ProviderLiveAutomationSpec => spec !== undefined
  );
}
