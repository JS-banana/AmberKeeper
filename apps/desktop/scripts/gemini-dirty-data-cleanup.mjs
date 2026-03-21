import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  DEFAULT_GEMINI_CAPTURE_DB_PATH,
  analyzeGeminiDirtyData,
} from './gemini-dirty-data-dry-run.mjs';

/**
 * @param {{
 *   dbPath?: string;
 *   apply?: boolean;
 *   backupDir?: string;
 *   now?: () => string;
 * }} [options]
 */
export function runGeminiDirtyDataCleanup(options = {}) {
  const dbPath = options.dbPath ?? DEFAULT_GEMINI_CAPTURE_DB_PATH;
  if (!fs.existsSync(dbPath)) {
    throw new Error(`Gemini cleanup database not found: ${dbPath}`);
  }

  const generatedAt = options.now?.() ?? new Date().toISOString();
  const initialDatabase = new DatabaseSync(dbPath);

  try {
    initialDatabase.exec('PRAGMA busy_timeout = 1000;');

    const initialSnapshot = loadGeminiSnapshot(initialDatabase);
    const initialReport = analyzeGeminiDirtyData(initialSnapshot);
    const candidateContexts = buildCandidateContexts(initialReport.candidates, initialSnapshot.conversations);

    if (!options.apply || candidateContexts.length === 0) {
      return {
        ...initialReport,
        mode: options.apply ? 'apply' : 'dry-run',
        dbPath,
        generatedAt,
        backupPath: null,
        deletedConversationCount: 0,
        deletedMessageCount: 0,
        deletedCaptureEventCount: 0,
        remainingCandidateCount: initialReport.candidateCount,
        remainingCandidates: initialReport.candidates,
      };
    }

    assertDatabaseWritable(initialDatabase);
    checkpointDatabase(initialDatabase);

    const backupPath = createDatabaseBackup({
      dbPath,
      backupDir: options.backupDir ?? path.dirname(dbPath),
      generatedAt,
    });

    const deletedCaptureEventCount = deleteCandidateData(initialDatabase, candidateContexts);

    const verificationSnapshot = loadGeminiSnapshot(initialDatabase);
    const verificationReport = analyzeGeminiDirtyData(verificationSnapshot);

    return {
      ...initialReport,
      mode: 'apply',
      dbPath,
      generatedAt,
      backupPath,
      deletedConversationCount: candidateContexts.length,
      deletedMessageCount: countDeletedMessages(initialSnapshot.messages, candidateContexts),
      deletedCaptureEventCount,
      remainingCandidateCount: verificationReport.candidateCount,
      remainingCandidates: verificationReport.candidates,
    };
  } finally {
    initialDatabase.close();
  }
}

function loadGeminiSnapshot(database) {
  return {
    conversations: database
      .prepare(
        `
          SELECT
            id,
            provider,
            remote_conversation_id AS remoteConversationId,
            source_session_key AS sourceSessionKey,
            page_url AS pageUrl,
            message_count AS messageCount,
            created_at AS createdAt,
            updated_at AS updatedAt
          FROM conversations
          WHERE provider = 'gemini'
          ORDER BY updated_at DESC
        `
      )
      .all(),
    messages: database
      .prepare(
        `
          SELECT
            id,
            conversation_id AS conversationId,
            provider,
            remote_conversation_id AS remoteConversationId,
            role,
            content,
            content_hash AS contentHash,
            remote_message_id AS remoteMessageId,
            model,
            source,
            created_at AS createdAt,
            captured_at AS capturedAt
          FROM messages
          WHERE provider = 'gemini'
          ORDER BY captured_at DESC
        `
      )
      .all(),
  };
}

function buildCandidateContexts(candidates, conversations) {
  const conversationsById = new Map(conversations.map((conversation) => [conversation.id, conversation]));

  return candidates.map((candidate) => {
    const conversation = conversationsById.get(candidate.conversationId);
    if (!conversation) {
      throw new Error(`Gemini cleanup could not resolve conversation metadata: ${candidate.conversationId}`);
    }

    return {
      conversationId: conversation.id,
      remoteConversationId: conversation.remoteConversationId,
      sourceSessionKey: conversation.sourceSessionKey,
      pageUrl: conversation.pageUrl,
    };
  });
}

function assertDatabaseWritable(database) {
  database.exec('BEGIN IMMEDIATE');
  database.exec('ROLLBACK');
}

function checkpointDatabase(database) {
  database.exec('PRAGMA wal_checkpoint(TRUNCATE);');
}

function createDatabaseBackup(input) {
  fs.mkdirSync(input.backupDir, { recursive: true });

  const parsed = path.parse(input.dbPath);
  const timestamp = input.generatedAt.replaceAll(':', '-').replaceAll('.', '-');
  const backupPath = path.join(
    input.backupDir,
    `${parsed.name}.gemini-dirty-data-backup-${timestamp}${parsed.ext || '.db'}`
  );

  if (fs.existsSync(backupPath)) {
    throw new Error(`Gemini cleanup backup already exists: ${backupPath}`);
  }

  fs.copyFileSync(input.dbPath, backupPath);
  return backupPath;
}

function deleteCandidateData(database, candidateContexts) {
  const deleteCaptureEventsByRemoteConversationId = database.prepare(
    `
      DELETE FROM capture_events
      WHERE provider = 'gemini' AND remote_conversation_id = ?
    `
  );
  const deleteCaptureEventsByFallback = database.prepare(
    `
      DELETE FROM capture_events
      WHERE provider = 'gemini'
        AND remote_conversation_id IS NULL
        AND source_session_key = ?
        AND page_url = ?
    `
  );
  const deleteMessagesByConversation = database.prepare(
    `
      DELETE FROM messages
      WHERE provider = 'gemini' AND conversation_id = ?
    `
  );
  const deleteConversationById = database.prepare(
    `
      DELETE FROM conversations
      WHERE provider = 'gemini' AND id = ?
    `
  );

  let deletedCaptureEventCount = 0;

  database.exec('BEGIN');

  try {
    for (const candidate of candidateContexts) {
      if (candidate.remoteConversationId) {
        deletedCaptureEventCount += Number(
          deleteCaptureEventsByRemoteConversationId.run(candidate.remoteConversationId).changes
        );
      } else {
        deletedCaptureEventCount += Number(
          deleteCaptureEventsByFallback.run(candidate.sourceSessionKey, candidate.pageUrl).changes
        );
      }

      deleteMessagesByConversation.run(candidate.conversationId);
      deleteConversationById.run(candidate.conversationId);
    }

    database.exec('COMMIT');
  } catch (error) {
    database.exec('ROLLBACK');
    throw error;
  }

  return deletedCaptureEventCount;
}

function countDeletedMessages(messages, candidateContexts) {
  const candidateConversationIds = new Set(candidateContexts.map((candidate) => candidate.conversationId));
  return messages.filter((message) => candidateConversationIds.has(message.conversationId)).length;
}

function isDirectRun() {
  return process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
}

function parseCliArgs(argv) {
  const args = argv.slice(2);
  const apply = args.includes('--apply');
  const positionalArgs = args.filter((argument) => !argument.startsWith('--'));
  return {
    apply,
    dbPath: positionalArgs[0] || process.env.ANYCHAT_CAPTURE_DB_PATH || DEFAULT_GEMINI_CAPTURE_DB_PATH,
  };
}

if (isDirectRun()) {
  const cliOptions = parseCliArgs(process.argv);
  const report = runGeminiDirtyDataCleanup(cliOptions);
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}
