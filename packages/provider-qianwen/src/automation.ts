import type { ProviderLiveAutomationSpec } from '@amberkeeper/shared-types';

export const qianwenLiveAutomationSpec: ProviderLiveAutomationSpec = {
  id: 'qianwen',
  providerId: 'qianwen',
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
    readySelectors: [
      'a[href*="/chat/"]',
      'div[class*="cursor-pointer"][class*="rounded-8"]',
      '[class*="history"]',
      '[class*="session"]',
    ],
    itemSelectors: [
      'a[href*="/chat/"]',
      'div.group.relative.flex.justify-between.py-\\[0\\.375rem\\].pl-3.items-center.cursor-pointer.rounded-8',
      'div[class*="cursor-pointer"][class*="rounded-8"][class*="justify-between"]',
      'div[role="list"] div[class*="cursor-pointer"][class*="rounded-8"]',
      '[class*="session"] a',
      '[class*="history"] a',
      '[class*="history"] [role="listitem"]',
      '[class*="conversation"] a',
    ],
    ignoreTextPatterns: ['新建对话', 'new chat', '设置', '管理', '搜索', '我的空间', '智能体', '最近对话', '对话分组', '新分组'],
    routeFragments: ['/chat/', '/conversation/', '/session/'],
    maxItems: 12,
  },
};
