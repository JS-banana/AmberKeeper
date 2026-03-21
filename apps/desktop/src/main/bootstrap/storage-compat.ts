import path from 'node:path';

export const LEGACY_USER_DATA_DIRNAME = 'electron-chatgpt-capture';

export interface UserDataPathAppLike {
  getPath(name: 'appData'): string;
  setPath(name: 'userData', path: string): void;
}

export function resolveLegacyCompatibleUserDataPath(appDataPath: string): string {
  return path.join(appDataPath, LEGACY_USER_DATA_DIRNAME);
}

export function configureLegacyCompatibleUserDataPath(appLike: UserDataPathAppLike): string {
  const legacyUserDataPath = resolveLegacyCompatibleUserDataPath(appLike.getPath('appData'));
  appLike.setPath('userData', legacyUserDataPath);
  return legacyUserDataPath;
}
