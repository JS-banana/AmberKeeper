import { describe, expect, test } from 'vitest';
import { geminiAdapter } from '../src/adapter';

describe('gemini-adapter', () => {
  test('normalizes request, response, and dom snapshots into provider signals', () => {
    const requestSignals = geminiAdapter.interpretRequest({
      url: 'https://gemini.google.com/_/BardChatUi/data/assistant.lamda.BardFrontendService/StreamGenerate?bl=boq_assistant-bard-web-server_20260318.01_p0&_reqid=12345&rt=c',
      method: 'POST',
      body: 'f.req=' + encodeURIComponent(JSON.stringify([[['Hello Gemini']], ['gemini-2.5-pro'], ['gemini-conv-1']])),
      pageUrl: 'https://gemini.google.com/app/gemini-conv-1',
      capturedAt: '2026-03-19T00:00:00.000Z',
      sourceSessionKey: 'gemini-primary-view',
    });

    const response = geminiAdapter.interpretResponseBody({
      url: 'https://gemini.google.com/_/BardChatUi/data/assistant.lamda.BardFrontendService/StreamGenerate?bl=boq_assistant-bard-web-server_20260318.01_p0&_reqid=12345&rt=c',
      method: 'POST',
      body: [
        ")]}'",
        JSON.stringify([
          [
            'wrb.fr',
            null,
            JSON.stringify([null, null, null, null, [['gemini-conv-1'], ['Hello from Gemini']]]),
          ],
        ]),
      ].join('\n'),
      pageUrl: 'https://gemini.google.com/app/gemini-conv-1',
      capturedAt: '2026-03-19T00:00:01.000Z',
      sourceSessionKey: 'gemini-primary-view',
    });

    const domResult = geminiAdapter.interpretDomSnapshot({
      pageUrl: 'https://gemini.google.com/app/gemini-conv-1',
      capturedAt: '2026-03-19T00:00:02.000Z',
      sourceSessionKey: 'gemini-primary-view',
      conversationId: 'gemini-conv-1',
      messages: [
        { role: 'user', content: 'Hello Gemini' },
        { role: 'assistant', content: 'Hello from Gemini' },
      ],
      previousAssistantContent: 'Hello from Gemini',
    });

    expect(requestSignals.some((signal) => signal.kind === 'candidateUserMessage')).toBe(true);
    expect(response.signals.some((signal) => signal.kind === 'assistantMayBeReady')).toBe(true);
    expect(domResult.stable).toBe(true);
    expect(domResult.signals.some((signal) => signal.kind === 'conversationIdResolved')).toBe(true);
  });

  test('parses Gemini StreamGenerate request bodies from the current production shape', () => {
    const requestSignals = geminiAdapter.interpretRequest({
      url: 'https://gemini.google.com/_/BardChatUi/data/assistant.lamda.BardFrontendService/StreamGenerate?bl=boq_assistant-bard-web-server_20260317.00_p3&_reqid=3756322&rt=c',
      method: 'POST',
      body:
        'f.req=' +
        encodeURIComponent(
          JSON.stringify([
            null,
            '[[\"GEMINI-PROBE-20260320-1\",0,null,null,null,null,0],[\"en\"],[\"\",\"\",\"\",null,null,null,null,null,null,\"\"],\"!token\"]',
          ])
        ),
      pageUrl: 'https://gemini.google.com/app/966e7f6b752c4405',
      capturedAt: '2026-03-20T07:39:41.578Z',
      sourceSessionKey: 'gemini-primary-view',
    });

    expect(requestSignals).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'candidateUserMessage',
          content: 'GEMINI-PROBE-20260320-1',
          conversationId: '966e7f6b752c4405',
        }),
      ])
    );
  });

  test('ignores non-chat Gemini batchexecute responses instead of turning rpc ids into messages', () => {
    const response = geminiAdapter.interpretResponseBody({
      url: 'https://gemini.google.com/_/BardChatUi/data/batchexecute?rpcids=aPya6c&source-path=%2Fapp%2F966e7f6b752c4405&bl=boq_assistant-bard-web-server_20260317.00_p3&_reqid=3956322&rt=c',
      method: 'POST',
      body: [")]}\'", JSON.stringify([['wrb.fr', null, JSON.stringify(['aPya6c', 'die'])]])].join('\n'),
      pageUrl: 'https://gemini.google.com/app/966e7f6b752c4405',
      capturedAt: '2026-03-20T07:39:44.195Z',
      sourceSessionKey: 'gemini-primary-view',
    });

    expect(response.signals).toEqual([]);
  });

  test('extracts Gemini conversation ids from source-path discovery urls', () => {
    expect(
      geminiAdapter.extractConversationIdFromUrl(
        'https://gemini.google.com/_/BardChatUi/data/batchexecute?rpcids=aPya6c&source-path=%2Fapp%2F62c89b373361ccd6&bl=boq_assistant-bard-web-server_20260317.00_p3&_reqid=2956673&rt=c'
      )
    ).toBe('62c89b373361ccd6');
  });

  test('parses current Gemini StreamGenerate responses without treating asset urls as assistant text', () => {
    const response = geminiAdapter.interpretResponseBody({
      url: 'https://gemini.google.com/_/BardChatUi/data/assistant.lamda.BardFrontendService/StreamGenerate?bl=boq_assistant-bard-web-server_20260317.00_p3&_reqid=2957704&rt=c',
      method: 'POST',
      body: [
        ")]}'",
        '160',
        JSON.stringify([
          ['wrb.fr', null, JSON.stringify([null, [null, 'r_d6c37c3f822d7199'], { 18: 'r_d6c37c3f822d7199' }])],
        ]),
        '1631',
        JSON.stringify([
          [
            'wrb.fr',
            null,
            JSON.stringify([
              null,
              ['c_923076df400ee934', 'r_d6c37c3f822d7199'],
              null,
              null,
              [
                [
                  'rc_736948f37b7dcd15',
                  ["I'm ready for the"],
                  null,
                  null,
                  null,
                  null,
                  true,
                  null,
                  [1],
                  'en',
                ],
                [
                  'Singapore',
                  'SWML_DESCRIPTION_FROM_YOUR_INTERNET_ADDRESS',
                  false,
                  null,
                  'https://fonts.gstatic.com/s/i/short-term/release/googlesymbols/expand/default/24px.svg',
                ],
              ],
            ]),
          ],
        ]),
      ].join('\n'),
      pageUrl: 'https://gemini.google.com/app',
      capturedAt: '2026-03-20T08:04:47.054Z',
      sourceSessionKey: 'gemini-primary-view',
    });

    expect(response.signals).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'assistantMayBeReady',
          conversationId: '923076df400ee934',
          content: "I'm ready for the",
        }),
      ])
    );
    expect(JSON.stringify(response.signals)).not.toContain('fonts.gstatic.com');
  });

  test('keeps only the latest cumulative Gemini assistant text instead of concatenating every stream update', () => {
    const response = geminiAdapter.interpretResponseBody({
      url: 'https://gemini.google.com/_/BardChatUi/data/assistant.lamda.BardFrontendService/StreamGenerate?bl=boq_assistant-bard-web-server_20260317.00_p3&_reqid=2658280&rt=c',
      method: 'POST',
      body: [
        ")]}'",
        JSON.stringify([
          [
            'wrb.fr',
            null,
            JSON.stringify([
              null,
              ['c_ad4a3694cb8a16d7', 'r_1f5761d6a352aacc'],
              null,
              null,
              [['rc_45a56ba8649eec81', ["I'm ready for the probe"], null, null, null, null, true, null, [1], 'en']],
            ]),
          ],
        ]),
        JSON.stringify([
          [
            'wrb.fr',
            null,
            JSON.stringify([
              null,
              ['c_ad4a3694cb8a16d7', 'r_1f5761d6a352aacc'],
              null,
              null,
              [[
                'rc_45a56ba8649eec81',
                [
                  "I'm ready for the probe. Please provide the specific query, data set, or task associated with **GEMINI-PROBE-20260320-5** so I can begin the analysis. Would you like me to execute a standard diagnostic or are you looking for a specific data retrieval?",
                ],
                null,
                null,
                null,
                null,
                true,
                null,
                [1],
                'en',
              ]],
            ]),
          ],
        ]),
      ].join('\n'),
      pageUrl: 'https://gemini.google.com/app',
      capturedAt: '2026-03-20T08:11:56.406Z',
      sourceSessionKey: 'gemini-primary-view',
    });

    expect(response.signals).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'assistantMayBeReady',
          conversationId: 'ad4a3694cb8a16d7',
          content:
            "I'm ready for the probe. Please provide the specific query, data set, or task associated with **GEMINI-PROBE-20260320-5** so I can begin the analysis. Would you like me to execute a standard diagnostic or are you looking for a specific data retrieval?",
        }),
      ])
    );
    expect(JSON.stringify(response.signals)).not.toContain(
      "I'm ready for the probeI'm ready for the probe."
    );
  });
});
