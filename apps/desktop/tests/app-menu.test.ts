import { beforeEach, expect, test, vi } from 'vitest';
import type { MenuItemConstructorOptions } from 'electron';

const { buildFromTemplate, openExternal, setApplicationMenu, setName } = vi.hoisted(() => ({
  buildFromTemplate: vi.fn((template) => template),
  openExternal: vi.fn(),
  setApplicationMenu: vi.fn(),
  setName: vi.fn(),
}));

vi.mock('electron', () => ({
  app: {
    isPackaged: true,
    setName,
  },
  Menu: {
    buildFromTemplate,
    setApplicationMenu,
  },
  shell: {
    openExternal,
  },
}));

import { installApplicationMenu } from '../src/main/menu/app-menu';

beforeEach(() => {
  buildFromTemplate.mockClear();
  openExternal.mockClear();
  setApplicationMenu.mockClear();
  setName.mockClear();
});

test('installs the trimmed production application menu', () => {
  const template = installMenu({ isPackaged: true, platform: 'darwin' });

  expect(setName).toHaveBeenCalledWith('AmberKeeper');
  expect(template.map((item) => item.label)).toEqual(['AmberKeeper', 'Edit', 'View', 'Window', 'Help']);
  expect(template.map((item) => item.label)).not.toContain('File');
  expect(setApplicationMenu).toHaveBeenCalledWith(template);
});

test('opens the project URL from Help', () => {
  const template = installMenu({ isPackaged: true, platform: 'darwin' });
  const helpMenu = template.find((item) => item.label === 'Help');
  const projectItem = submenuOf(helpMenu)[0];

  expect(projectItem.label).toBe('GitHub Repository');
  (projectItem.click as () => void)();

  expect(openExternal).toHaveBeenCalledWith('https://github.com/JS-banana/amberkeeper');
});

test('adds developer commands inside View only outside packaged builds', () => {
  const template = installMenu({ isPackaged: false, platform: 'darwin' });
  const viewMenu = template.find((item) => item.label === 'View');

  expect(template.map((item) => item.label)).toEqual([
    'AmberKeeper',
    'Edit',
    'View',
    'Window',
    'Help',
  ]);
  expect(submenuOf(viewMenu).slice(0, 3).map((item) => item.label)).toEqual([
    'Reload',
    'Force Reload',
    'Toggle Developer Tools',
  ]);
  expect(template.map((item) => item.label)).not.toContain('Development');
});

function installMenu(options: { isPackaged: boolean; platform: NodeJS.Platform }) {
  installApplicationMenu({
    productName: 'AmberKeeper',
    isPackaged: options.isPackaged,
    platform: options.platform,
  });

  return buildFromTemplate.mock.calls[0]?.[0] as MenuItemConstructorOptions[];
}

function submenuOf(item: MenuItemConstructorOptions | undefined): MenuItemConstructorOptions[] {
  return (item?.submenu ?? []) as MenuItemConstructorOptions[];
}
