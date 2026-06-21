import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, describe, expect, test, vi } from 'vitest';
import {
  CHAT_DATA_DB_BASENAME,
  getChatDataArtifactPaths,
  readChatDataLocationState,
  requestChatDataLocationChange,
  requestDefaultChatDataLocation,
  runStartupChatDataMigration,
} from '../src/main/storage/chat-data-location';
import { ensureCaptureStoreSchema } from '../src/main/storage/schema';

const roots: string[] = [];

afterEach(() => {
  roots.splice(0).forEach((root) => fs.rmSync(root, { recursive: true, force: true }));
});

describe('chat-data-location', () => {
  test('returns the chat data database artifacts for a directory', () => {
    const directory = tempDir();
    const dbPath = path.join(directory, CHAT_DATA_DB_BASENAME);

    expect(getChatDataArtifactPaths(directory)).toEqual([dbPath, `${dbPath}-wal`, `${dbPath}-shm`]);
  });

  test('uses the default userData directory when no pointer file exists', () => {
    const userData = tempDir();
    const state = readChatDataLocationState(userData);

    expect(state).toEqual({
      currentDirectory: userData,
      defaultDirectory: userData,
      pendingDirectory: null,
      status: 'current',
      error: null,
    });
  });

  test('records a pending target without changing the current directory', () => {
    const userData = tempDir();
    const target = tempDir();

    const state = requestChatDataLocationChange(userData, target);

    expect(state.currentDirectory).toBe(userData);
    expect(state.pendingDirectory).toBe(target);
    expect(state.status).toBe('pending-restart');
  });

  test('migrates the latest current store on startup and clears the pending target', () => {
    const userData = tempDir();
    const target = tempDir();
    seedStore(path.join(userData, CHAT_DATA_DB_BASENAME));
    requestChatDataLocationChange(userData, target);

    const result = runStartupChatDataMigration(userData);

    expect(result.storePath).toBe(path.join(target, CHAT_DATA_DB_BASENAME));
    expect(result.state).toMatchObject({
      currentDirectory: target,
      pendingDirectory: null,
      status: 'current',
      error: null,
    });
    expect(fs.existsSync(path.join(target, CHAT_DATA_DB_BASENAME))).toBe(true);
    expect(fs.existsSync(path.join(userData, CHAT_DATA_DB_BASENAME))).toBe(false);
  });

  test('rejects a target folder that already contains chat data artifacts', () => {
    const userData = tempDir();
    const target = tempDir();
    seedStore(path.join(userData, CHAT_DATA_DB_BASENAME));
    seedStore(path.join(target, CHAT_DATA_DB_BASENAME));
    requestChatDataLocationChange(userData, target);

    const result = runStartupChatDataMigration(userData);

    expect(result.storePath).toBe(path.join(userData, CHAT_DATA_DB_BASENAME));
    expect(result.state.currentDirectory).toBe(userData);
    expect(result.state.pendingDirectory).toBe(target);
    expect(result.state.status).toBe('pending-restart');
    expect(result.state.error).toContain('already contains AmberKeeper chat data');
  });

  test('does not update the pointer when the target cannot be written', () => {
    const userData = tempDir();
    const missingParent = path.join(tempDir(), 'missing', 'target');
    seedStore(path.join(userData, CHAT_DATA_DB_BASENAME));
    requestChatDataLocationChange(userData, missingParent);

    const result = runStartupChatDataMigration(userData);

    expect(result.storePath).toBe(path.join(userData, CHAT_DATA_DB_BASENAME));
    expect(result.state.currentDirectory).toBe(userData);
    expect(result.state.pendingDirectory).toBe(missingParent);
    expect(result.state.error).toContain('not writable');
  });

  test('reports unavailable instead of creating a new default store when current location is gone', () => {
    const userData = tempDir();
    const target = tempDir();
    seedStore(path.join(userData, CHAT_DATA_DB_BASENAME));
    requestChatDataLocationChange(userData, target);
    runStartupChatDataMigration(userData);
    fs.rmSync(target, { recursive: true, force: true });

    const result = runStartupChatDataMigration(userData);

    expect(result.storePath).toBeNull();
    expect(result.state.status).toBe('unavailable');
    expect(result.state.currentDirectory).toBe(target);
  });

  test('reports unavailable instead of recreating a configured store when its database is gone', () => {
    const userData = tempDir();
    const target = tempDir();
    seedStore(path.join(userData, CHAT_DATA_DB_BASENAME));
    requestChatDataLocationChange(userData, target);
    runStartupChatDataMigration(userData);
    fs.rmSync(path.join(target, CHAT_DATA_DB_BASENAME), { force: true });

    const result = runStartupChatDataMigration(userData);

    expect(result.storePath).toBeNull();
    expect(result.state.status).toBe('unavailable');
    expect(result.state.currentDirectory).toBe(target);
    expect(fs.existsSync(path.join(target, CHAT_DATA_DB_BASENAME))).toBe(false);
  });

  test('restores the default location explicitly when the configured current location is gone', () => {
    const userData = tempDir();
    const target = tempDir();
    seedStore(path.join(userData, CHAT_DATA_DB_BASENAME));
    requestChatDataLocationChange(userData, target);
    runStartupChatDataMigration(userData);
    fs.rmSync(target, { recursive: true, force: true });

    const restoreState = requestDefaultChatDataLocation(userData);

    expect(restoreState.currentDirectory).toBe(target);
    expect(restoreState.pendingDirectory).toBe(userData);
    expect(restoreState.status).toBe('pending-restart');

    const result = runStartupChatDataMigration(userData);

    expect(result.storePath).toBe(path.join(userData, CHAT_DATA_DB_BASENAME));
    expect(result.state).toMatchObject({
      currentDirectory: userData,
      pendingDirectory: null,
      status: 'current',
      error: null,
    });
    expect(fs.existsSync(path.join(userData, CHAT_DATA_DB_BASENAME))).toBe(true);
  });

  test('restores an explicit non-default location when the configured current location is gone', () => {
    const userData = tempDir();
    const current = tempDir();
    const nextTarget = tempDir();
    seedStore(path.join(userData, CHAT_DATA_DB_BASENAME));
    requestChatDataLocationChange(userData, current);
    runStartupChatDataMigration(userData);
    fs.rmSync(current, { recursive: true, force: true });

    requestChatDataLocationChange(userData, nextTarget);
    const result = runStartupChatDataMigration(userData);

    expect(result.storePath).toBe(path.join(nextTarget, CHAT_DATA_DB_BASENAME));
    expect(result.state).toMatchObject({
      currentDirectory: nextTarget,
      pendingDirectory: null,
      status: 'current',
      error: null,
    });
    expect(fs.existsSync(path.join(nextTarget, CHAT_DATA_DB_BASENAME))).toBe(true);
  });

  test('keeps the new pointer when old artifact cleanup fails after migration', () => {
    const userData = tempDir();
    const current = tempDir();
    const target = tempDir();
    seedStore(path.join(userData, CHAT_DATA_DB_BASENAME));
    requestChatDataLocationChange(userData, current);
    runStartupChatDataMigration(userData);
    requestChatDataLocationChange(userData, target);

    const cleanupFailurePath = path.join(current, `${CHAT_DATA_DB_BASENAME}-wal`);
    const rmSync = fs.rmSync.bind(fs);
    const rmSpy = vi.spyOn(fs, 'rmSync').mockImplementation(
      ((entryPath: Parameters<typeof fs.rmSync>[0], options?: Parameters<typeof fs.rmSync>[1]) => {
        if (String(entryPath) === cleanupFailurePath) {
          throw new Error('cleanup failed');
        }
        rmSync(entryPath, options);
      }) as typeof fs.rmSync
    );

    try {
      const result = runStartupChatDataMigration(userData);

      expect(result.storePath).toBe(path.join(target, CHAT_DATA_DB_BASENAME));
      expect(result.state).toMatchObject({
        currentDirectory: target,
        pendingDirectory: null,
        status: 'current',
        error: null,
      });
      expect(readChatDataLocationState(userData).currentDirectory).toBe(target);
    } finally {
      rmSpy.mockRestore();
    }
  });
});

function tempDir(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'amberkeeper-chat-data-'));
  roots.push(root);
  return root;
}

function seedStore(filePath: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const db = new DatabaseSync(filePath);
  ensureCaptureStoreSchema(db);
  db.close();
}
