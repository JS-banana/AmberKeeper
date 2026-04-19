import type { ProviderLiveAutomationSpec } from '@amberkeeper/shared-types';

export const kimiLiveAutomationSpec: ProviderLiveAutomationSpec = {
  id: 'kimi',
  providerId: 'kimi',
  newMessage: {
    readySelectors: ['textarea', '[contenteditable="true"]', '[role="textbox"]'],
    composerSelectors: ['textarea', '[role="textbox"]', '[contenteditable="true"]'],
    sendButtonSelectors: [
      'button[type="submit"]',
      'button[aria-label*="发送"]',
      'button[aria-label*="send" i]',
      'button[class*="send"]',
      'button[class*="submit"]',
    ],
    submitButtonTextCandidates: ['发送', 'send', 'submit'],
    submitStrategy: 'button-or-enter',
  },
  historyClick: {
    readySelectors: ['a[href*="/chat/"]', '.chat-info-item', '[class*="history"]', '[class*="session"]'],
    itemSelectors: [
      'a[href*="/chat/"]',
      '.chat-info-item',
      '[class*="history"] a',
      '[class*="history"] [role="listitem"]',
      '[class*="conversation"] a',
      '[class*="session"] a',
    ],
    ignoreTextPatterns: ['新建对话', 'new chat', '设置', '发现'],
    routeFragments: ['/chat/'],
    maxItems: 12,
  },
};
