// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import type { ShellInfo } from '@amberkeeper/shared-types';
import { SettingsPage } from './SettingsPage';

afterEach(() => {
  cleanup();
});

test('renders interface language selector and calls onSetInterfaceLanguage on change', () => {
  const onSetInterfaceLanguage = vi.fn();
  const onSetCaptureSaveScope = vi.fn();

  render(
    <SettingsPage
      shellInfo={buildShellInfo()}
      onSetInterfaceLanguage={onSetInterfaceLanguage}
      onSetCaptureSaveScope={onSetCaptureSaveScope}
    />
  );

  expect(screen.getByRole('heading', { name: '外观与语言' })).toBeInTheDocument();
  expect(screen.getByLabelText('界面语言')).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: '数据保存' })).toBeInTheDocument();
  expect(screen.getByLabelText('保存范围')).toBeInTheDocument();

  const langTrigger = screen.getByLabelText('界面语言');
  fireEvent.click(langTrigger);
  const zhOption = screen.getByRole('option', { name: '简体中文' });
  fireEvent.click(zhOption);
  expect(onSetInterfaceLanguage).toHaveBeenCalledWith('zh-CN');

  const saveScopeTrigger = screen.getByLabelText('保存范围');
  fireEvent.click(saveScopeTrigger);
  const userOnlyOption = screen.getByRole('option', { name: '仅我的消息' });
  fireEvent.click(userOnlyOption);
  expect(onSetCaptureSaveScope).toHaveBeenCalledWith('user');
});

function buildShellInfo(): ShellInfo {
  return {
    diagnosticsEnabled: false,
    isPackaged: true,
    appVersion: '0.0.1',
    interfaceLanguage: 'system',
    captureSaveScope: 'complete',
  };
}
