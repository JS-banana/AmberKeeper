import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, test } from 'vitest';

type RuntimeArtifactMatch = {
  ruleId: string;
  value: string;
};

type ConfigMatch = {
  ruleId: string;
  lineNumber: number;
  line: string;
};

type ReleaseHygieneAuditModule = {
  findForbiddenConfigMatches: (configText: string) => ConfigMatch[];
  findForbiddenRuntimeArtifactMatches: (candidates: string[]) => RuntimeArtifactMatch[];
};

const {
  findForbiddenConfigMatches,
  findForbiddenRuntimeArtifactMatches,
} = (await import('../scripts/release-hygiene-audit.mjs')) as ReleaseHygieneAuditModule;

describe('findForbiddenRuntimeArtifactMatches', () => {
  test('ignores normal source and build paths', () => {
    expect(
      findForbiddenRuntimeArtifactMatches([
        'apps/desktop/electron-builder.yml',
        'apps/desktop/out/main/index.js',
        'apps/desktop/build/icons/icon.png',
      ])
    ).toEqual([]);
  });

  test('flags runtime artifact paths that would contaminate a release', () => {
    const matches = findForbiddenRuntimeArtifactMatches([
      'capture-lab.db',
      'dist/mac/AmberKeeper.app/Contents/Resources/Cookies',
      'dist/mac/AmberKeeper.app/Contents/Resources/Partitions/default',
      'dist/mac/AmberKeeper.app/Contents/Resources/Local Storage/leveldb',
      'dist/mac/AmberKeeper.app/Contents/Resources/IndexedDB/file.indexeddb.leveldb',
      'Library/Application Support/electron-chatgpt-capture/provider-live-probe-server.json',
    ]);

    expect(matches.map((match) => match.ruleId)).toEqual(
      expect.arrayContaining([
        'capture-db',
        'electron-cookies',
        'legacy-appdata-root',
        'live-probe-manifest',
      ])
    );
  });
});

describe('findForbiddenConfigMatches', () => {
  test('passes the current electron-builder config because it does not reference runtime data', () => {
    const config = fs.readFileSync(path.join(process.cwd(), 'electron-builder.yml'), 'utf8');
    expect(findForbiddenConfigMatches(config)).toEqual([]);
  });

  test('flags packaging config entries that point at runtime data', () => {
    const config = `
extraResources:
  - from: ../../Library/Application Support/electron-chatgpt-capture/Cookies
    to: Cookies
`;

    const matches = findForbiddenConfigMatches(config);
    expect(matches.map((match) => match.ruleId)).toEqual(
      expect.arrayContaining(['legacy-appdata-root', 'electron-cookies'])
    );
  });
});
