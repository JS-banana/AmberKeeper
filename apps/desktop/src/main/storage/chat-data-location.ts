import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { ChatDataLocationState } from '@amberkeeper/shared-types';
import { ensureCaptureStoreSchema } from './schema';

export const CHAT_DATA_DB_BASENAME = 'capture-lab.db';
export const CHAT_DATA_LOCATION_CONFIG_BASENAME = 'chat-data-location.json';

type ChatDataLocationConfig = {
  currentDirectory?: string;
  pendingDirectory?: string | null;
  lastError?: string | null;
};

export type StartupChatDataMigrationResult = {
  storePath: string | null;
  state: ChatDataLocationState;
};

export function getChatDataArtifactPaths(directory: string): string[] {
  const dbPath = path.join(directory, CHAT_DATA_DB_BASENAME);
  return [dbPath, `${dbPath}-wal`, `${dbPath}-shm`];
}

export function readChatDataLocationState(userDataDirectory: string): ChatDataLocationState {
  const config = readConfig(userDataDirectory);
  const currentDirectory = config.currentDirectory ?? userDataDirectory;
  const pendingDirectory = config.pendingDirectory ?? null;
  const unavailable =
    !isExistingWritableDirectory(currentDirectory) ||
    (Boolean(config.currentDirectory) && !hasPrimaryStore(currentDirectory));

  return {
    currentDirectory,
    defaultDirectory: userDataDirectory,
    pendingDirectory,
    status: pendingDirectory ? 'pending-restart' : unavailable ? 'unavailable' : 'current',
    error: unavailable
      ? `Chat data location is unavailable: ${currentDirectory}`
      : config.lastError ?? null,
  };
}

export function requestChatDataLocationChange(
  userDataDirectory: string,
  targetDirectory: string
): ChatDataLocationState {
  const current = readChatDataLocationState(userDataDirectory);
  const normalizedTarget = path.resolve(targetDirectory);

  if (normalizedTarget === current.currentDirectory) {
    writeConfig(userDataDirectory, {
      currentDirectory: current.currentDirectory,
      pendingDirectory: null,
      lastError: null,
    });
    return readChatDataLocationState(userDataDirectory);
  }

  writeConfig(userDataDirectory, {
    currentDirectory: current.currentDirectory,
    pendingDirectory: normalizedTarget,
    lastError: null,
  });

  return readChatDataLocationState(userDataDirectory);
}

export function requestDefaultChatDataLocation(userDataDirectory: string): ChatDataLocationState {
  return requestChatDataLocationChange(userDataDirectory, userDataDirectory);
}

export function runStartupChatDataMigration(
  userDataDirectory: string
): StartupChatDataMigrationResult {
  const state = readChatDataLocationState(userDataDirectory);

  if (!state.pendingDirectory && state.status === 'unavailable') {
    return { storePath: null, state };
  }

  if (!state.pendingDirectory) {
    return {
      storePath: path.join(state.currentDirectory, CHAT_DATA_DB_BASENAME),
      state,
    };
  }

  try {
    assertWritableDirectory(state.pendingDirectory);
    assertNoTargetArtifacts(state.pendingDirectory);
    if (!isExplicitRestoreFromUnavailableCurrent(state)) {
      assertSourceStoreAvailable(state.currentDirectory);
    }
    copyChatDataArtifacts(state.currentDirectory, state.pendingDirectory);
    validateStore(path.join(state.pendingDirectory, CHAT_DATA_DB_BASENAME));
    writeConfig(userDataDirectory, {
      currentDirectory: state.pendingDirectory,
      pendingDirectory: null,
      lastError: null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    writeConfig(userDataDirectory, {
      currentDirectory: state.currentDirectory,
      pendingDirectory: state.pendingDirectory,
      lastError: message,
    });
    const nextState = readChatDataLocationState(userDataDirectory);
    return {
      storePath: isExistingWritableDirectory(nextState.currentDirectory) && hasPrimaryStore(nextState.currentDirectory)
        ? path.join(nextState.currentDirectory, CHAT_DATA_DB_BASENAME)
        : null,
      state: nextState,
    };
  }

  const nextState = readChatDataLocationState(userDataDirectory);
  try {
    cleanupChatDataArtifacts(state.currentDirectory);
  } catch {
    // Cleanup is best-effort after the new store is validated and selected.
  }

  return {
    storePath: path.join(nextState.currentDirectory, CHAT_DATA_DB_BASENAME),
    state: nextState,
  };
}

function readConfig(userDataDirectory: string): ChatDataLocationConfig {
  const configPath = path.join(userDataDirectory, CHAT_DATA_LOCATION_CONFIG_BASENAME);
  if (!fs.existsSync(configPath)) {
    return {};
  }
  return JSON.parse(fs.readFileSync(configPath, 'utf8')) as ChatDataLocationConfig;
}

function writeConfig(userDataDirectory: string, config: ChatDataLocationConfig): void {
  fs.mkdirSync(userDataDirectory, { recursive: true });
  const configPath = path.join(userDataDirectory, CHAT_DATA_LOCATION_CONFIG_BASENAME);
  const tempPath = `${configPath}.tmp`;
  fs.writeFileSync(tempPath, `${JSON.stringify(config, null, 2)}\n`);
  fs.renameSync(tempPath, configPath);
}

function assertWritableDirectory(directory: string): void {
  if (!isExistingWritableDirectory(directory)) {
    throw new Error(`Chat data target is not writable: ${directory}`);
  }
}

function isExistingWritableDirectory(directory: string): boolean {
  try {
    const stat = fs.statSync(directory);
    if (!stat.isDirectory()) {
      return false;
    }
    fs.accessSync(directory, fs.constants.R_OK | fs.constants.W_OK);
    return true;
  } catch {
    return false;
  }
}

function assertNoTargetArtifacts(directory: string): void {
  const existing = getChatDataArtifactPaths(directory).filter((artifact) => fs.existsSync(artifact));
  if (existing.length > 0) {
    throw new Error(`Target already contains AmberKeeper chat data: ${directory}`);
  }
}

function assertSourceStoreAvailable(directory: string): void {
  if (!isExistingWritableDirectory(directory) || !hasPrimaryStore(directory)) {
    throw new Error(`Current chat data store is unavailable: ${directory}`);
  }
}

function hasPrimaryStore(directory: string): boolean {
  return fs.existsSync(path.join(directory, CHAT_DATA_DB_BASENAME));
}

function isExplicitRestoreFromUnavailableCurrent(state: ChatDataLocationState): boolean {
  return !isExistingWritableDirectory(state.currentDirectory) || !hasPrimaryStore(state.currentDirectory);
}

function copyChatDataArtifacts(sourceDirectory: string, targetDirectory: string): void {
  for (const source of getChatDataArtifactPaths(sourceDirectory)) {
    if (!fs.existsSync(source)) {
      continue;
    }
    fs.copyFileSync(source, path.join(targetDirectory, path.basename(source)));
  }
}

function validateStore(dbPath: string): void {
  const db = new DatabaseSync(dbPath);
  try {
    ensureCaptureStoreSchema(db);
    db.prepare('SELECT COUNT(*) AS count FROM conversations').get();
  } finally {
    db.close();
  }
}

function cleanupChatDataArtifacts(directory: string): void {
  for (const artifact of getChatDataArtifactPaths(directory)) {
    fs.rmSync(artifact, { force: true });
  }
}
