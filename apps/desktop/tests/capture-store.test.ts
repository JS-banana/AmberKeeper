import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { createCaptureOrchestrator } from '@amberkeeper/capture-core';
import { doubaoAdapter } from '@amberkeeper/provider-doubao';
import type { CaptureEnvelope } from '@amberkeeper/shared-types';
import { CaptureStore } from '../src/main/storage/capture-store';

describe('capture-store', () => {
  let tempDir: string;
  let dbPath: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'anychat-electron-store-'));
    dbPath = path.join(tempDir, 'capture.db');
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  test('creates and reuses a session when remoteConversationId is present', () => {
    const store = new CaptureStore(dbPath);

    const firstSessionId = store.persistEnvelope(buildEnvelope({ remoteConversationId: 'conv-123' }));
    const secondSessionId = store.persistEnvelope(
      buildEnvelope({
        remoteConversationId: 'conv-123',
        messages: [
          {
            role: 'assistant',
            content: 'Second answer',
            createdAt: '2026-03-19T10:00:02.000Z',
          },
        ],
      })
    );

    expect(secondSessionId).toBe(firstSessionId);
    expect(store.listSessions()).toEqual([
      expect.objectContaining({
        remoteConversationId: 'conv-123',
        messageCount: 2,
      }),
    ]);
  });
  test('merges a Doubao temporary local conversation into the final remote conversation', () => {
    const store = new CaptureStore(dbPath);
    const messages = [
      {
        role: 'user' as const,
        content: '在吗',
        createdAt: '2026-03-19T10:00:00.000Z',
      },
      {
        role: 'assistant' as const,
        content: '我在我在',
        createdAt: '2026-03-19T10:00:01.000Z',
      },
    ];

    store.persistEnvelope(
      buildEnvelope({
        provider: 'doubao',
        sourceSessionKey: 'doubao-primary-view',
        pageUrl: 'https://www.doubao.com/chat/local_9139387259118100',
        remoteConversationId: 'local_9139387259118100',
        messages,
      })
    );
    store.persistEnvelope(
      buildEnvelope({
        provider: 'doubao',
        sourceSessionKey: 'doubao-primary-view',
        pageUrl: 'https://www.doubao.com/chat/38433782403373826',
        remoteConversationId: '38433782403373826',
        remoteConversationAliases: ['local_9139387259118100'],
        capturedAt: '2026-03-19T10:00:02.000Z',
        messages,
      })
    );

    const sessions = store.listSessions();

    expect(sessions).toHaveLength(1);
    expect(sessions[0]).toEqual(
      expect.objectContaining({
        remoteConversationId: '38433782403373826',
      })
    );
    expect(store.listMessages(sessions[0].id).map((message) => message.role)).toEqual([
      'user',
      'assistant',
    ]);
  });

  test('keeps Doubao turns interleaved when a later request is seen before an earlier response body', () => {
    const store = new CaptureStore(dbPath);
    const orchestrator = createCaptureOrchestrator({
      persist: (turn) => store.persistTurn(turn),
    });
    const remoteConversationId = '38433792484788226';
    const requestOneAt = '2026-07-04T02:05:04.502Z';
    const requestTwoAt = '2026-07-04T02:05:07.432Z';

    store.persistEnvelope(
      buildEnvelope({
        provider: 'doubao',
        sourceSessionKey: 'doubao-primary-view',
        pageUrl: `https://www.doubao.com/chat/${remoteConversationId}`,
        remoteConversationId,
        capturedAt: requestOneAt,
        messages: [
          {
            role: 'user',
            content: '合肥最佳旅游季节',
            createdAt: requestOneAt,
          },
        ],
      })
    );

    const requestTwoSignals = doubaoAdapter.interpretRequest({
      url: 'https://www.doubao.com/chat/completion',
      method: 'POST',
      body: JSON.stringify({
        conversation_id: remoteConversationId,
        prompt: '有啥玩的呢',
      }),
      pageUrl: `https://www.doubao.com/chat/${remoteConversationId}`,
      capturedAt: requestTwoAt,
      sourceSessionKey: 'doubao-primary-view',
    });
    store.persistEnvelope(
      buildEnvelope({
        provider: 'doubao',
        sourceSessionKey: 'doubao-primary-view',
        pageUrl: `https://www.doubao.com/chat/${remoteConversationId}`,
        remoteConversationId,
        capturedAt: requestTwoAt,
        messages: [
          {
            role: 'user',
            content: '有啥玩的呢',
            createdAt: requestTwoAt,
          },
        ],
      })
    );
    requestTwoSignals.forEach((signal) => orchestrator.consume(signal));

    [
      {
        requestCapturedAt: requestOneAt,
        capturedAt: '2026-07-04T02:05:08.200Z',
        prompt: '合肥最佳旅游季节',
        answer: '合肥最佳旅游季节推荐春秋季。',
      },
      {
        requestCapturedAt: requestTwoAt,
        capturedAt: '2026-07-04T02:05:36.439Z',
        prompt: '有啥玩的呢',
        answer: '合肥可以去包公园和淮河路。',
      },
    ].forEach((turn) => {
      const response = doubaoAdapter.interpretResponseBody({
        url: 'https://www.doubao.com/chat/completion',
        method: 'POST',
        body: buildDoubaoSseBody({
          conversationId: remoteConversationId,
          content: turn.answer,
        }),
        requestBody: JSON.stringify({
          conversation_id: remoteConversationId,
          prompt: turn.prompt,
        }),
        requestCapturedAt: turn.requestCapturedAt,
        pageUrl: `https://www.doubao.com/chat/${remoteConversationId}`,
        capturedAt: turn.capturedAt,
        sourceSessionKey: 'doubao-primary-view',
      });
      response.signals.forEach((signal) => orchestrator.consume(signal));
    });

    const [session] = store.listSessions();
    expect(store.listMessages(session.id).map((message) => message.role)).toEqual([
      'user',
      'assistant',
      'user',
      'assistant',
    ]);
    expect(store.listMessages(session.id).map((message) => message.content)).toEqual([
      '合肥最佳旅游季节',
      '推荐春秋季。',
      '有啥玩的呢',
      '合肥可以去包公园和淮河路。',
    ]);
  });

  test('keeps later Doubao assistant replies when stream event ids repeat the conversation id', () => {
    const store = new CaptureStore(dbPath);
    const orchestrator = createCaptureOrchestrator({
      persist: (turn) => store.persistTurn(turn),
    });
    const remoteConversationId = '38433792484788226';

    [
      {
        requestCapturedAt: '2026-07-04T02:05:04.502Z',
        capturedAt: '2026-07-04T02:05:08.200Z',
        prompt: '第一问',
        answer: '第一答',
      },
      {
        requestCapturedAt: '2026-07-04T02:05:07.432Z',
        capturedAt: '2026-07-04T02:05:36.439Z',
        prompt: '第二问',
        answer: '第二答',
      },
    ].forEach((turn) => {
      const response = doubaoAdapter.interpretResponseBody({
        url: 'https://www.doubao.com/chat/completion',
        method: 'POST',
        body: buildDoubaoSseBody({
          conversationId: remoteConversationId,
          eventId: remoteConversationId,
          content: turn.answer,
        }),
        requestBody: JSON.stringify({
          conversation_id: remoteConversationId,
          prompt: turn.prompt,
        }),
        requestCapturedAt: turn.requestCapturedAt,
        pageUrl: `https://www.doubao.com/chat/${remoteConversationId}`,
        capturedAt: turn.capturedAt,
        sourceSessionKey: 'doubao-primary-view',
      });
      response.signals.forEach((signal) => orchestrator.consume(signal));
    });

    const [session] = store.listSessions();
    expect(store.listMessages(session.id).map((message) => message.content)).toEqual([
      '第一问',
      '第一答',
      '第二问',
      '第二答',
    ]);
  });

  test('creates a fallback session when remoteConversationId is missing', () => {
    const store = new CaptureStore(dbPath);

    const sessionId = store.persistEnvelope(
      buildEnvelope({
        remoteConversationId: undefined,
        sourceSessionKey: 'chatgpt-primary-view',
      })
    );

    expect(store.listSessions()).toEqual([
      expect.objectContaining({
        id: sessionId,
        remoteConversationId: null,
        sourceSessionKey: 'chatgpt-primary-view',
      }),
    ]);
  });

  test('deduplicates identical messages when the same remote message id is persisted twice', () => {
    const store = new CaptureStore(dbPath);
    const envelope = buildEnvelope({
      remoteConversationId: 'conv-123',
      messages: [
        {
          role: 'assistant',
          content: 'Same assistant answer',
          createdAt: '2026-03-19T10:00:02.000Z',
          remoteMessageId: 'msg-1',
        },
      ],
    });

    store.persistEnvelope(envelope);
    store.persistEnvelope(envelope);

    const [session] = store.listSessions();

    expect(store.listMessages(session.id)).toHaveLength(1);
  });

  test('keeps repeated same-content messages when they are distinct conversation events', () => {
    const store = new CaptureStore(dbPath);
    const sessionId = store.persistEnvelope(
      buildEnvelope({
        remoteConversationId: 'conv-123',
        messages: [
          {
            role: 'user',
            content: 'Repeat after me',
            createdAt: '2026-03-19T10:00:00.000Z',
          },
        ],
      })
    );

    store.persistEnvelope(
      buildEnvelope({
        remoteConversationId: 'conv-123',
        capturedAt: '2026-03-19T10:00:05.000Z',
        messages: [
          {
            role: 'user',
            content: 'Repeat after me',
            createdAt: '2026-03-19T10:00:05.000Z',
          },
        ],
      })
    );

    expect(store.listMessages(sessionId)).toEqual([
      expect.objectContaining({
        role: 'user',
        content: 'Repeat after me',
        createdAt: '2026-03-19T10:00:00.000Z',
      }),
      expect.objectContaining({
        role: 'user',
        content: 'Repeat after me',
        createdAt: '2026-03-19T10:00:05.000Z',
      }),
    ]);
  });

  test('deduplicates the same message when DOM and network capture both see it', () => {
    const store = new CaptureStore(dbPath);
    const sessionId = store.persistEnvelope(
      buildEnvelope({
        provider: 'doubao',
        source: 'preload-dom',
        remoteConversationId: 'doubao-conv-1',
        messages: [
          {
            role: 'user',
            content: '南昌适合什么季节去玩',
            createdAt: '2026-07-03T13:33:18.889Z',
          },
        ],
      })
    );

    store.persistEnvelope(
      buildEnvelope({
        provider: 'doubao',
        source: 'cdp-network',
        remoteConversationId: 'doubao-conv-1',
        capturedAt: '2026-07-03T13:33:29.024Z',
        messages: [
          {
            role: 'user',
            content: '南昌适合什么季节去玩',
            createdAt: '2026-07-03T13:33:09.557Z',
          },
          {
            role: 'assistant',
            content: '南昌春秋两季最适合旅游。',
            createdAt: '2026-07-03T13:33:29.024Z',
          },
        ],
      })
    );

    expect(store.listMessages(sessionId).map((message) => message.content)).toEqual([
      '南昌适合什么季节去玩',
      '南昌春秋两季最适合旅游。',
    ]);
  });

  test('deduplicates cross-source user messages with equivalent whitespace', () => {
    const store = new CaptureStore(dbPath);
    const sessionId = store.persistEnvelope(
      buildEnvelope({
        provider: 'doubao',
        source: 'preload-dom',
        remoteConversationId: 'doubao-conv-whitespace',
        capturedAt: '2026-07-04T14:02:10.048Z',
        messages: [
          {
            role: 'user',
            content: '现在开发一个网站，如果后端也考虑\u00A0nodejs\n的话',
            createdAt: '2026-07-04T14:02:10.048Z',
          },
        ],
      })
    );

    store.persistEnvelope(
      buildEnvelope({
        provider: 'doubao',
        source: 'cdp-network',
        remoteConversationId: 'doubao-conv-whitespace',
        capturedAt: '2026-07-04T14:03:54.532Z',
        messages: [
          {
            role: 'user',
            content: '现在开发一个网站，如果后端也考虑 nodejs\n 的话',
            createdAt: '2026-07-04T14:02:09.262Z',
          },
        ],
      })
    );

    expect(store.listMessages(sessionId).map((message) => message.content)).toEqual([
      '现在开发一个网站，如果后端也考虑\u00A0nodejs\n的话',
    ]);
  });

  test('keeps repeated same-content messages across capture sources when they are distinct turns', () => {
    const store = new CaptureStore(dbPath);
    const sessionId = store.persistEnvelope(
      buildEnvelope({
        provider: 'doubao',
        source: 'cdp-network',
        remoteConversationId: 'doubao-conv-repeat',
        capturedAt: '2026-07-03T13:00:00.000Z',
        messages: [
          {
            role: 'user',
            content: '继续',
            createdAt: '2026-07-03T13:00:00.000Z',
          },
        ],
      })
    );

    store.persistEnvelope(
      buildEnvelope({
        provider: 'doubao',
        source: 'preload-dom',
        remoteConversationId: 'doubao-conv-repeat',
        capturedAt: '2026-07-03T13:05:00.000Z',
        messages: [
          {
            role: 'user',
            content: '继续',
            createdAt: '2026-07-03T13:05:00.000Z',
          },
        ],
      })
    );

    expect(store.listMessages(sessionId).map((message) => message.content)).toEqual(['继续', '继续']);
  });

  test('keeps repeated same-content messages in one DOM snapshot', () => {
    const store = new CaptureStore(dbPath);
    const sessionId = store.persistEnvelope(
      buildEnvelope({
        source: 'preload-dom',
        remoteConversationId: 'conv-dom-repeat',
        messages: [
          {
            role: 'user',
            content: '继续',
            createdAt: '2026-07-03T13:00:00.000Z',
          },
          {
            role: 'user',
            content: '继续',
            createdAt: '2026-07-03T13:00:02.000Z',
          },
        ],
      })
    );

    expect(store.listMessages(sessionId).map((message) => message.content)).toEqual(['继续', '继续']);
  });

  test('falls back to capturedAt when provider message timestamps are missing or placeholders', () => {
    const store = new CaptureStore(dbPath);
    const sessionId = store.persistEnvelope(
      buildEnvelope({
        capturedAt: '2026-06-19T15:53:54.437Z',
        messages: [
          {
            role: 'user',
            content: 'Timestamp was missing',
            createdAt: '',
          },
          {
            role: 'assistant',
            content: 'Timestamp was a placeholder',
            createdAt: '1970-01-01T00:00:00.000Z',
          },
        ],
      })
    );

    expect(store.listSessions()).toEqual([
      expect.objectContaining({
        id: sessionId,
        createdAt: '2026-06-19T15:53:54.437Z',
        updatedAt: '2026-06-19T15:53:54.437Z',
      }),
    ]);
    expect(store.listMessages(sessionId)).toEqual([
      expect.objectContaining({
        content: 'Timestamp was missing',
        createdAt: '2026-06-19T15:53:54.437Z',
      }),
      expect.objectContaining({
        content: 'Timestamp was a placeholder',
        createdAt: '2026-06-19T15:53:54.437Z',
      }),
    ]);
  });

  test('replaces existing session messages when hydrating selected session history', () => {
    const store = new CaptureStore(dbPath);
    const sessionId = store.persistEnvelope(
      buildEnvelope({
        remoteConversationId: 'conv-123',
        messages: [
          {
            role: 'assistant',
            content: 'Placeholder answer',
            createdAt: '2026-03-19T10:00:01.000Z',
          },
        ],
      })
    );

    store.replaceSessionEnvelope(
      sessionId,
      buildEnvelope({
        source: 'preload-dom',
        capturedAt: '2026-03-19T10:05:00.000Z',
        messages: [
          {
            role: 'user',
            content: 'Recovered prompt',
            createdAt: '2026-03-19T10:04:59.000Z',
          },
          {
            role: 'assistant',
            content: 'Recovered answer',
            createdAt: '2026-03-19T10:05:00.000Z',
          },
        ],
      })
    );

    expect(store.listMessages(sessionId)).toEqual([
      expect.objectContaining({
        role: 'user',
        content: 'Recovered prompt',
        source: 'preload-dom',
      }),
      expect.objectContaining({
        role: 'assistant',
        content: 'Recovered answer',
        source: 'preload-dom',
      }),
    ]);
    expect(store.listSessions()).toEqual([
      expect.objectContaining({
        id: sessionId,
        messageCount: 2,
      }),
    ]);
  });

  test('only replaces the targeted session when hydrating selected session history', () => {
    const store = new CaptureStore(dbPath);
    const firstSessionId = store.persistEnvelope(
      buildEnvelope({
        remoteConversationId: 'conv-123',
        messages: [
          {
            role: 'assistant',
            content: 'First placeholder answer',
            createdAt: '2026-03-19T10:00:01.000Z',
          },
        ],
      })
    );
    const secondSessionId = store.persistEnvelope(
      buildEnvelope({
        remoteConversationId: 'conv-456',
        pageUrl: 'https://chatgpt.com/c/conv-456',
        capturedAt: '2026-03-19T10:02:00.000Z',
        messages: [
          {
            role: 'assistant',
            content: 'Second session answer',
            createdAt: '2026-03-19T10:02:00.000Z',
          },
        ],
      })
    );

    store.replaceSessionEnvelope(
      firstSessionId,
      buildEnvelope({
        source: 'preload-dom',
        capturedAt: '2026-03-19T10:05:00.000Z',
        messages: [
          {
            role: 'user',
            content: 'Recovered prompt',
            createdAt: '2026-03-19T10:04:59.000Z',
          },
          {
            role: 'assistant',
            content: 'Recovered answer',
            createdAt: '2026-03-19T10:05:00.000Z',
          },
        ],
      })
    );

    expect(store.listMessages(firstSessionId)).toEqual([
      expect.objectContaining({
        role: 'user',
        content: 'Recovered prompt',
      }),
      expect.objectContaining({
        role: 'assistant',
        content: 'Recovered answer',
      }),
    ]);
    expect(store.listMessages(secondSessionId)).toEqual([
      expect.objectContaining({
        role: 'assistant',
        content: 'Second session answer',
      }),
    ]);
  });

  test('finds sessions by provider and remote conversation id', () => {
    const store = new CaptureStore(dbPath);
    const sessionId = store.persistEnvelope(
      buildEnvelope({
        provider: 'claude',
        remoteConversationId: 'claude-conv-1',
        pageUrl: 'https://claude.ai/chat/claude-conv-1',
      })
    );

    expect(store.findSessionByRemoteConversation('claude', 'claude-conv-1')).toEqual(
      expect.objectContaining({
        id: sessionId,
        provider: 'claude',
        remoteConversationId: 'claude-conv-1',
      })
    );
    expect(store.findSessionByRemoteConversation('claude', 'missing-conv')).toBeNull();
  });

  test('persists sessions and messages across store instances', () => {
    const firstStore = new CaptureStore(dbPath);
    const sessionId = firstStore.persistEnvelope(buildEnvelope({ remoteConversationId: 'conv-123' }));

    const secondStore = new CaptureStore(dbPath);

    expect(secondStore.listSessions()).toEqual([
      expect.objectContaining({
        id: sessionId,
        remoteConversationId: 'conv-123',
      }),
    ]);
    expect(secondStore.listMessages(sessionId)).toEqual([
      expect.objectContaining({
        content: 'User question',
      }),
    ]);
  });

  test('writes envelopes into conversations, messages, and capture events tables', () => {
    const store = new CaptureStore(dbPath);

    store.persistEnvelope(
      buildEnvelope({
        messages: [
          {
            role: 'user',
            content: 'User question',
            createdAt: '2026-03-19T10:00:00.000Z',
          },
          {
            role: 'assistant',
            content: 'Assistant answer',
            createdAt: '2026-03-19T10:00:02.000Z',
          },
        ],
      })
    );

    const db = new DatabaseSync(dbPath);

    expect(countRows(db, 'conversations')).toBe(1);
    expect(countRows(db, 'messages')).toBe(2);
    expect(countRows(db, 'capture_events')).toBeGreaterThan(0);

    db.close();
  });

  test('keeps assistant text out of durable records when save scope is user only', () => {
    const store = new CaptureStore(dbPath);

    store.setCaptureSaveScope('user');
    const sessionId = store.persistEnvelope(
      buildEnvelope({
        messages: [
          {
            role: 'user',
            content: 'User-only prompt',
            createdAt: '2026-03-19T10:00:00.000Z',
          },
          {
            role: 'assistant',
            content: 'Assistant text must stay transient',
            createdAt: '2026-03-19T10:00:02.000Z',
          },
        ],
      })
    );

    expect(store.listMessages(sessionId)).toEqual([
      expect.objectContaining({
        role: 'user',
        content: 'User-only prompt',
      }),
    ]);

    const payloads = store
      .getDb()
      .prepare(
        `
          SELECT payload_json AS payloadJson
          FROM capture_events
          ORDER BY created_at ASC
        `
      )
      .all() as Array<{ payloadJson: string }>;

    expect(payloads.map((row) => row.payloadJson).join('\n')).not.toContain(
      'Assistant text must stay transient'
    );
  });

  test('rolls back persistEnvelope when capture-event persistence fails late', () => {
    const store = new CaptureStore(dbPath);
    store.getDb().exec(`
      CREATE TRIGGER fail_capture_events_before_insert
      BEFORE INSERT ON capture_events
      BEGIN
        SELECT RAISE(ABORT, 'capture event insert failed');
      END;
    `);

    expect(() =>
      store.persistEnvelope(
        buildEnvelope({
          remoteConversationId: 'conv-atomic-fail',
        })
      )
    ).toThrow('capture event insert failed');

    const db = new DatabaseSync(dbPath);
    expect(countRows(db, 'conversations')).toBe(0);
    expect(countRows(db, 'messages')).toBe(0);
    expect(countRows(db, 'capture_events')).toBe(0);
    db.close();
  });

  test('rolls back replaceSessionEnvelope and preserves the original session when later writes fail', () => {
    const store = new CaptureStore(dbPath);
    const sessionId = store.persistEnvelope(
      buildEnvelope({
        remoteConversationId: 'conv-replace-safe',
        messages: [
          {
            role: 'assistant',
            content: 'Original answer',
            createdAt: '2026-03-19T10:00:01.000Z',
          },
        ],
      })
    );

    store.getDb().exec(`
      CREATE TRIGGER fail_capture_events_before_insert
      BEFORE INSERT ON capture_events
      BEGIN
        SELECT RAISE(ABORT, 'replace capture event insert failed');
      END;
    `);

    expect(() =>
      store.replaceSessionEnvelope(
        sessionId,
        buildEnvelope({
          source: 'preload-dom',
          capturedAt: '2026-03-19T10:05:00.000Z',
          messages: [
            {
              role: 'user',
              content: 'Recovered prompt',
              createdAt: '2026-03-19T10:04:59.000Z',
            },
            {
              role: 'assistant',
              content: 'Recovered answer',
              createdAt: '2026-03-19T10:05:00.000Z',
            },
          ],
        })
      )
    ).toThrow('replace capture event insert failed');

    expect(store.listMessages(sessionId)).toEqual([
      expect.objectContaining({
        role: 'assistant',
        content: 'Original answer',
      }),
    ]);
    expect(store.listSessions()).toEqual([
      expect.objectContaining({
        id: sessionId,
        remoteConversationId: 'conv-replace-safe',
        messageCount: 1,
      }),
    ]);
  });

  test('rolls back completed-turn persistence when capture-event persistence fails', () => {
    const store = new CaptureStore(dbPath);
    store.getDb().exec(`
      CREATE TRIGGER fail_capture_events_before_insert
      BEFORE INSERT ON capture_events
      BEGIN
        SELECT RAISE(ABORT, 'completed turn capture event insert failed');
      END;
    `);

    expect(() =>
      store.persistTurn({
        provider: 'chatgpt',
        source: 'cdp-network',
        sourceSessionKey: 'chatgpt-primary-view',
        pageUrl: 'https://chatgpt.com/c/conv-turn-fail',
        capturedAt: '2026-03-19T10:00:02.000Z',
        conversationId: 'conv-turn-fail',
        messages: [
          {
            role: 'user',
            content: 'turn question',
            createdAt: '2026-03-19T10:00:00.000Z',
          },
          {
            role: 'assistant',
            content: 'turn answer',
            createdAt: '2026-03-19T10:00:01.000Z',
          },
        ],
      })
    ).toThrow('completed turn capture event insert failed');

    const db = new DatabaseSync(dbPath);
    expect(countRows(db, 'conversations')).toBe(0);
    expect(countRows(db, 'messages')).toBe(0);
    expect(countRows(db, 'capture_events')).toBe(0);
    db.close();
  });

  test('keeps assistant text out of completed-turn persistence when save scope is user only', () => {
    const store = new CaptureStore(dbPath);

    store.setCaptureSaveScope('user');
    const sessionId = store.persistTurn({
      provider: 'chatgpt',
      source: 'cdp-network',
      sourceSessionKey: 'chatgpt-primary-view',
      pageUrl: 'https://chatgpt.com/c/conv-user-turn',
      capturedAt: '2026-03-19T10:00:02.000Z',
      conversationId: 'conv-user-turn',
      messages: [
        {
          role: 'user',
          content: 'Turn prompt',
          createdAt: '2026-03-19T10:00:00.000Z',
        },
        {
          role: 'assistant',
          content: 'Turn answer must stay transient',
          createdAt: '2026-03-19T10:00:01.000Z',
        },
      ],
    });

    expect(store.listMessages(sessionId)).toEqual([
      expect.objectContaining({
        role: 'user',
        content: 'Turn prompt',
      }),
    ]);

    const payloads = store
      .getDb()
      .prepare(
        `
          SELECT payload_json AS payloadJson
          FROM capture_events
          ORDER BY created_at ASC
        `
      )
      .all() as Array<{ payloadJson: string }>;

    expect(payloads.map((row) => row.payloadJson).join('\n')).not.toContain(
      'Turn answer must stay transient'
    );
  });

  test('does not retain new assistant text or remove old assistant records when replacing under user-only save scope', () => {
    const store = new CaptureStore(dbPath);
    const sessionId = store.persistEnvelope(
      buildEnvelope({
        remoteConversationId: 'conv-replace-user-only',
        messages: [
          {
            role: 'user',
            content: 'Original prompt',
            createdAt: '2026-03-19T10:00:00.000Z',
          },
          {
            role: 'assistant',
            content: 'Original answer kept from complete scope',
            createdAt: '2026-03-19T10:00:01.000Z',
          },
        ],
      })
    );

    store.setCaptureSaveScope('user');
    store.replaceSessionEnvelope(
      sessionId,
      buildEnvelope({
        remoteConversationId: 'conv-replace-user-only',
        capturedAt: '2026-03-19T10:05:00.000Z',
        messages: [
          {
            role: 'user',
            content: 'Hydrated prompt',
            createdAt: '2026-03-19T10:04:59.000Z',
          },
          {
            role: 'assistant',
            content: 'Hydrated answer must stay transient',
            createdAt: '2026-03-19T10:05:00.000Z',
          },
        ],
      })
    );

    const contents = store.listMessages(sessionId).map((message) => message.content);

    expect(contents).toContain('Original answer kept from complete scope');
    expect(contents).toContain('Hydrated prompt');
    expect(contents).not.toContain('Hydrated answer must stay transient');
    expect(contents).not.toContain('Original prompt');

    const payloads = store
      .getDb()
      .prepare(
        `
          SELECT payload_json AS payloadJson
          FROM capture_events
          ORDER BY created_at ASC
        `
      )
      .all() as Array<{ payloadJson: string }>;

    expect(payloads.map((row) => row.payloadJson).join('\n')).not.toContain(
      'Hydrated answer must stay transient'
    );
  });

  test('keeps user-only assistant-only captures visible and exportable without assistant content', () => {
    const store = new CaptureStore(dbPath);

    store.setCaptureSaveScope('user');
    const sessionId = store.persistEnvelope(
      buildEnvelope({
        remoteConversationId: 'conv-assistant-only',
        messages: [
          {
            role: 'assistant',
            content: 'Assistant-only context must stay transient',
            createdAt: '2026-03-19T10:00:01.000Z',
          },
        ],
      })
    );

    expect(store.listSessions()).toEqual([
      expect.objectContaining({
        id: sessionId,
        remoteConversationId: 'conv-assistant-only',
        messageCount: 0,
      }),
    ]);
    expect(store.listMessages(sessionId)).toEqual([]);
    expect(store.exportSession(sessionId, 'markdown').content).not.toContain(
      'Assistant-only context must stay transient'
    );
  });

  test('reconciles a fallback session into the final remote conversation', () => {
    const store = new CaptureStore(dbPath);

    const fallbackSessionId = store.persistEnvelope(
      buildEnvelope({
        remoteConversationId: undefined,
        pageUrl: 'https://chatgpt.com',
      })
    );

    const resolvedSessionId = store.persistEnvelope(
      buildEnvelope({
        remoteConversationId: 'conv-123',
        pageUrl: 'https://chatgpt.com/c/conv-123',
        messages: [
          {
            role: 'assistant',
            content: 'Resolved answer',
            createdAt: '2026-03-19T10:00:02.000Z',
          },
        ],
      })
    );

    expect(resolvedSessionId).toBe(fallbackSessionId);
    expect(store.listSessions()).toEqual([
      expect.objectContaining({
        id: fallbackSessionId,
        remoteConversationId: 'conv-123',
        messageCount: 2,
      }),
    ]);
  });

  test('uses preview-based fallback titles when exporting sessions with provider-generic page titles', () => {
    const store = new CaptureStore(dbPath);
    const sessionId = store.persistEnvelope(
      buildEnvelope({
        provider: 'deepseek',
        pageUrl: 'https://chat.deepseek.com/a/chat/s/deepseek-conv',
        remoteConversationId: 'deepseek-conv',
        title: 'DeepSeek - Into the Unknown',
        messages: [
          {
            role: 'user',
            content: 'Draft launch checklist for the DeepSeek workspace',
            createdAt: '2026-03-19T10:00:00.000Z',
          },
        ],
      })
    );

    const artifact = store.exportSession(sessionId, 'markdown');

    expect(artifact.fileName).toBe(
      'amberkeeper-deepseek-draft-launch-checklist-for-the-deepseek-workspace.md'
    );
    expect(artifact.content).toContain('## Draft launch checklist for the DeepSeek workspace');
    expect(artifact.content).not.toContain('## DeepSeek - Into the Unknown');
  });

  test('filters exported messages by selected export scope', () => {
    const store = new CaptureStore(dbPath);
    const sessionId = store.persistEnvelope(
      buildEnvelope({
        provider: 'chatgpt',
        remoteConversationId: 'chatgpt-export-scope',
        title: 'Provider export title',
        titleSource: 'provider',
        messages: [
          {
            role: 'user',
            content: 'Keep my research prompt',
            createdAt: '2026-03-19T10:00:00.000Z',
          },
          {
            role: 'assistant',
            content: 'Long assistant answer',
            createdAt: '2026-03-19T10:00:02.000Z',
          },
        ],
      })
    );

    const userArtifact = store.exportSession(sessionId, 'json', 'user');
    const assistantArtifact = store.exportAllSessions('markdown', 'assistant');

    expect(JSON.parse(userArtifact.content).messages).toEqual([
      expect.objectContaining({
        role: 'user',
        content: 'Keep my research prompt',
      }),
    ]);
    expect(userArtifact.content).not.toContain('Long assistant answer');
    expect(assistantArtifact.content).toContain('Long assistant answer');
    expect(assistantArtifact.content).not.toContain('Keep my research prompt');
  });

  test('migrates legacy capture tables into the new read model', () => {
    const db = new DatabaseSync(dbPath);
    db.exec(`
      CREATE TABLE capture_sessions (
        id TEXT PRIMARY KEY,
        provider TEXT NOT NULL,
        remote_conversation_id TEXT,
        source_session_key TEXT NOT NULL,
        page_url TEXT NOT NULL,
        message_count INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE capture_messages (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        provider TEXT NOT NULL,
        remote_conversation_id TEXT,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        content_hash TEXT NOT NULL,
        remote_message_id TEXT,
        model TEXT,
        source TEXT NOT NULL,
        created_at TEXT NOT NULL,
        captured_at TEXT NOT NULL
      );
    `);
    db.prepare(
      `
        INSERT INTO capture_sessions (
          id,
          provider,
          remote_conversation_id,
          source_session_key,
          page_url,
          message_count,
          created_at,
          updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `
    ).run(
      'legacy-session-1',
      'chatgpt',
      'conv-legacy',
      'chatgpt-primary-view',
      'https://chatgpt.com/c/conv-legacy',
      1,
      '2026-03-19T09:59:00.000Z',
      '2026-03-19T09:59:10.000Z'
    );
    db.prepare(
      `
        INSERT INTO capture_messages (
          id,
          session_id,
          provider,
          remote_conversation_id,
          role,
          content,
          content_hash,
          remote_message_id,
          model,
          source,
          created_at,
          captured_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `
    ).run(
      'legacy-message-1',
      'legacy-session-1',
      'chatgpt',
      'conv-legacy',
      'assistant',
      'Legacy answer',
      'legacy-hash-1',
      null,
      'gpt-4o',
      'cdp-network',
      '2026-03-19T09:59:05.000Z',
      '2026-03-19T09:59:10.000Z'
    );
    db.close();

    const store = new CaptureStore(dbPath);
    const migratedDb = new DatabaseSync(dbPath);

    expect(store.listSessions()).toEqual([
      expect.objectContaining({
        id: 'legacy-session-1',
        remoteConversationId: 'conv-legacy',
        messageCount: 1,
      }),
    ]);
    expect(store.listMessages('legacy-session-1')).toEqual([
      expect.objectContaining({
        id: 'legacy-message-1',
        sessionId: 'legacy-session-1',
        content: 'Legacy answer',
      }),
    ]);
    expect(countRows(migratedDb, 'conversations')).toBe(1);
    expect(countRows(migratedDb, 'messages')).toBe(1);

    migratedDb.close();
  });
});

function buildEnvelope(
  overrides: Partial<CaptureEnvelope> = {}
): CaptureEnvelope {
  return {
    provider: 'chatgpt',
    source: 'cdp-network',
    pageUrl: 'https://chatgpt.com/c/conv-123',
    sourceSessionKey: 'chatgpt-primary-view',
    capturedAt: '2026-03-19T10:00:00.000Z',
    remoteConversationId: 'conv-123',
    messages: [
      {
        role: 'user',
        content: 'User question',
        createdAt: '2026-03-19T10:00:00.000Z',
      },
    ],
    ...overrides,
  };
}

function countRows(db: DatabaseSync, tableName: string): number {
  const row = db
    .prepare(`SELECT COUNT(*) AS count FROM ${tableName}`)
    .get() as { count: number };

  return row.count;
}

function buildDoubaoSseBody(input: { conversationId: string; content: string; eventId?: string }): string {
  return [
    `data: ${JSON.stringify({
      event_type: 2001,
      event_data: JSON.stringify({
        id: input.eventId,
        conversation_id: input.conversationId,
        message: {
          content: {
            text: input.content,
          },
        },
      }),
    })}`,
    'data: [DONE]',
  ].join('\n');
}
