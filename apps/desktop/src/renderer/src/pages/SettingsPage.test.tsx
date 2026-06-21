// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import type { ShellInfo } from '@amberkeeper/shared-types';
import { SettingsPage } from './SettingsPage';

afterEach(() => {
  cleanup();
});

test('renders data save settings and calls setting actions', () => {
  const onSetCaptureSaveScope = vi.fn();
  const onChooseChatDataLocation = vi.fn();
  const onRestoreDefaultChatDataLocation = vi.fn();

  render(
    <SettingsPage
      shellInfo={buildShellInfo()}
      onSetCaptureSaveScope={onSetCaptureSaveScope}
      onChooseChatDataLocation={onChooseChatDataLocation}
      onRestoreDefaultChatDataLocation={onRestoreDefaultChatDataLocation}
    />
  );

  expect(screen.queryByLabelText('界面语言')).not.toBeInTheDocument();
  expect(screen.getByRole('heading', { name: '数据保存' })).toBeInTheDocument();
  expect(screen.getByLabelText('保存范围')).toBeInTheDocument();
  expect(screen.getByText('聊天数据位置')).toBeInTheDocument();
  expect(screen.getByText('当前生效位置')).toBeInTheDocument();
  expect(screen.getByText('/tmp/appData/electron-chatgpt-capture')).toBeInTheDocument();
  expect(screen.queryByText(/只影响 AmberKeeper/)).not.toBeInTheDocument();
  expect(screen.queryByText('状态')).not.toBeInTheDocument();
  expect(screen.queryByText('当前使用中')).not.toBeInTheDocument();

  const saveScopeTrigger = screen.getByLabelText('保存范围');
  fireEvent.click(saveScopeTrigger);
  const userOnlyOption = screen.getByRole('option', { name: '仅我的消息' });
  fireEvent.click(userOnlyOption);
  expect(onSetCaptureSaveScope).toHaveBeenCalledWith('user');

  fireEvent.click(screen.getByRole('button', { name: '选择文件夹' }));
  expect(onChooseChatDataLocation).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole('button', { name: '恢复默认位置' }));
  expect(onRestoreDefaultChatDataLocation).toHaveBeenCalledTimes(1);
});

test('shows only actionable chat data location status', () => {
  render(
    <SettingsPage
      shellInfo={{
        ...buildShellInfo(),
        chatDataLocation: {
          ...buildShellInfo().chatDataLocation,
          pendingDirectory: '/tmp/next-chat-data',
          status: 'pending-restart',
        },
      }}
      onSetCaptureSaveScope={vi.fn()}
      onChooseChatDataLocation={vi.fn()}
      onRestoreDefaultChatDataLocation={vi.fn()}
    />
  );

  expect(screen.getByText('待迁移位置')).toBeInTheDocument();
  expect(screen.getByText('/tmp/next-chat-data')).toBeInTheDocument();
  expect(screen.getByText('重启后生效')).toBeInTheDocument();
});

function buildShellInfo(): ShellInfo {
  return {
    diagnosticsEnabled: false,
    isPackaged: true,
    appVersion: '0.0.1',
    interfaceLanguage: 'system',
    captureSaveScope: 'complete',
    chatDataLocation: {
      currentDirectory: '/tmp/appData/electron-chatgpt-capture',
      defaultDirectory: '/tmp/appData/electron-chatgpt-capture',
      pendingDirectory: null,
      status: 'current',
      error: null,
    },
  };
}
