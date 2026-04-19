import type { ProviderLiveAutomationSpec } from '@amberkeeper/shared-types';

export const grokLiveAutomationSpec: ProviderLiveAutomationSpec = {
  id: 'grok',
  providerId: 'grok',
  newMessage: {
    readySelectors: ['textarea', '[contenteditable="true"]', '[role="textbox"]'],
    composerSelectors: ['[contenteditable="true"]', '[role="textbox"]', 'textarea'],
    sendButtonSelectors: [
      'button[type="submit"]',
      'button[aria-label*="send" i]',
      'button[class*="send"]',
      'button[class*="submit"]',
    ],
    submitButtonTextCandidates: ['send', 'submit'],
    submitStrategy: 'button-or-enter',
  },
  historyClick: {
    readySelectors: ['a[href*="/c/"]', '[class*="history"]', '[class*="conversation"]'],
    itemSelectors: [
      'a[href*="/c/"]',
      '[class*="history"] a',
      '[class*="history"] [role="listitem"]',
      '[class*="conversation"] a',
      '[class*="session"] a',
    ],
    ignoreTextPatterns: ['new chat', 'settings', 'discover'],
    routeFragments: ['/c/'],
    maxItems: 12,
  },
};
