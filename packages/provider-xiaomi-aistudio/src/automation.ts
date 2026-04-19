import type { ProviderLiveAutomationSpec } from '@amberkeeper/shared-types';

export const xiaomiAistudioLiveAutomationSpec: ProviderLiveAutomationSpec = {
  id: 'xiaomi-aistudio',
  providerId: 'xiaomi-aistudio',
  newMessage: {
    readySelectors: ['#message-list', 'textarea', '[contenteditable="true"]', '.message-list'],
    launcherButtonSelectors: ['button[aria-label="New conversation"]', 'button[aria-label="MiMo Chat"]'],
    launcherButtonTextCandidates: ['New conversation', 'MiMo Chat', 'Create Now', 'Continue Creating'],
    composerSelectors: [
      '#message-list ~ * textarea',
      '.flex.gap-2.items-end textarea',
      '.mimo-chat textarea',
      'textarea',
      '[role="textbox"]',
      '[contenteditable="true"]',
    ],
    sendButtonSelectors: [],
    submitButtonTextCandidates: [],
    submitStrategy: 'enter-only',
  },
  historyClick: {
    readySelectors: [
      '#message-list',
      'button[aria-label="Hide sidebar"]',
      'button[aria-label="Show sidebar"]',
      'button[aria-label="MiMo Chat"]',
    ],
    itemSelectors: [
      '.hide-scrollbar .group.cursor-pointer',
      '.hide-scrollbar > div.group',
      '.hide-scrollbar .cursor-pointer',
      'a[href*="#/chat/"]',
      'a[href*="/chat/"]',
      '[data-conversation-id]',
      '.hide-scrollbar > div',
      '.hide-scrollbar .truncate',
      '[class*="history"] a',
      '[class*="history"] [role="listitem"]',
      'nav a[href*="#/chat/"]',
    ],
    ignoreTextPatterns: ['新建对话', 'new chat', '设置', '管理', 'history', 'mimo chat', 'mimo claw', 'api service', '帅帅'],
    routeFragments: ['#/chat/', '/chat/'],
    maxItems: 12,
  },
};
