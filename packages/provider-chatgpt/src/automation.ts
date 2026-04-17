import type { ProviderLiveAutomationSpec } from '@amberkeeper/shared-types';

export const chatgptLiveAutomationSpec: ProviderLiveAutomationSpec = {
  id: 'chatgpt',
  providerId: 'chatgpt',
  newMessage: {
    readySelectors: ['textarea[aria-label*="chat" i]', 'textarea', '[data-testid="prompt-textarea"]'],
    composerSelectors: ['textarea[aria-label*="chat" i]', '[data-testid="prompt-textarea"]', 'textarea'],
    sendButtonSelectors: [
      'button[data-testid="send-button"]',
      'button[aria-label*="send prompt" i]',
      'button[aria-label*="send message" i]',
      'button[aria-label*="send" i]',
    ],
    submitButtonTextCandidates: ['send'],
    submitStrategy: 'button-or-enter',
  },
  historyClick: {
    readySelectors: ['a[href*="/c/"]', 'nav a[href*="/c/"]', 'aside a[href*="/c/"]'],
    itemSelectors: ['a[href*="/c/"]', 'nav a[href*="/c/"]', 'aside a[href*="/c/"]'],
    ignoreTextPatterns: ['new chat', 'home', 'codex'],
    routeFragments: ['/c/'],
    maxItems: 20,
  },
};
