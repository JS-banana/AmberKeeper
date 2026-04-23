import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const SCRIPT_FILE = fileURLToPath(import.meta.url);
const SCRIPT_DIR = path.dirname(SCRIPT_FILE);
const DESKTOP_ROOT = path.resolve(SCRIPT_DIR, '..');
const REPO_ROOT = path.resolve(DESKTOP_ROOT, '..', '..');
const DEFAULT_ELECTRON_BUILDER_CONFIG_PATH = path.join(DESKTOP_ROOT, 'electron-builder.yml');

export const FORBIDDEN_RUNTIME_ARTIFACT_RULES = [
  { id: 'capture-db', pattern: /capture-lab\.db\b/i },
  { id: 'live-probe-manifest', pattern: /provider-live-probe-server\.json\b/i },
  { id: 'electron-cookies', pattern: /(^|[/\\\s:'"-])cookies($|[/\\\s])/i },
  { id: 'electron-local-storage', pattern: /local storage/i },
  { id: 'electron-session-storage', pattern: /session storage/i },
  { id: 'electron-indexeddb', pattern: /indexeddb/i },
  { id: 'electron-partitions', pattern: /(^|[/\\\s:'"-])partitions($|[/\\\s])/i },
  { id: 'legacy-appdata-root', pattern: /electron-chatgpt-capture/i },
];

export function findForbiddenRuntimeArtifactMatches(candidates) {
  return candidates.flatMap((candidate) =>
    FORBIDDEN_RUNTIME_ARTIFACT_RULES.filter((rule) => rule.pattern.test(candidate)).map((rule) => ({
      ruleId: rule.id,
      value: candidate,
    }))
  );
}

export function findForbiddenConfigMatches(configText) {
  return configText
    .split(/\r?\n/)
    .flatMap((line, index) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) {
        return [];
      }

      return FORBIDDEN_RUNTIME_ARTIFACT_RULES.filter((rule) => rule.pattern.test(trimmed)).map((rule) => ({
        ruleId: rule.id,
        lineNumber: index + 1,
        line: trimmed,
      }));
    });
}

export function listTrackedFiles(repoRoot = REPO_ROOT) {
  const result = spawnSync('git', ['ls-files'], {
    cwd: repoRoot,
    encoding: 'utf-8',
    windowsHide: true,
  });

  if (result.status !== 0) {
    const stderr = (result.stderr || '').trim();
    throw new Error(stderr || `git_ls_files_failed:${repoRoot}`);
  }

  return (result.stdout || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

export function auditTrackedFiles(repoRoot = REPO_ROOT) {
  const trackedFiles = listTrackedFiles(repoRoot);
  const matches = findForbiddenRuntimeArtifactMatches(trackedFiles);
  return {
    repoRoot,
    checkedCount: trackedFiles.length,
    matches,
  };
}

export function auditElectronBuilderConfig(configPath = DEFAULT_ELECTRON_BUILDER_CONFIG_PATH) {
  const configText = fs.readFileSync(configPath, 'utf8');
  return {
    configPath,
    matches: findForbiddenConfigMatches(configText),
  };
}

function assertNoMatches(label, matches, formatter) {
  if (matches.length === 0) {
    console.log(`[release-hygiene] ${label}: ok`);
    return;
  }

  const details = matches.map(formatter).join('\n');
  throw new Error(`[release-hygiene] ${label}: found forbidden runtime data indicators\n${details}`);
}

export function runReleaseHygieneAudit() {
  const trackedFileResult = auditTrackedFiles();
  assertNoMatches('tracked-files', trackedFileResult.matches, (match) => `- [${match.ruleId}] ${match.value}`);
  console.log(`[release-hygiene] tracked-files checked: ${trackedFileResult.checkedCount}`);

  const configResult = auditElectronBuilderConfig();
  assertNoMatches(
    'electron-builder-config',
    configResult.matches,
    (match) => `- [${match.ruleId}] line ${match.lineNumber}: ${match.line}`
  );
}

export function runRepoAudit() {
  runReleaseHygieneAudit();
}

function printUsage() {
  console.log(`Usage:
  node scripts/release-hygiene-audit.mjs release
  node scripts/release-hygiene-audit.mjs repo    # compatibility alias for the same audit`);
}

export function main(argv = process.argv.slice(2)) {
  const [command = 'release'] = argv;

  switch (command) {
    case 'repo':
      runReleaseHygieneAudit();
      return;
    case 'release':
      runReleaseHygieneAudit();
      return;
    case 'help':
    case '--help':
    case '-h':
      printUsage();
      return;
    default:
      printUsage();
      throw new Error(`unknown_release_hygiene_command:${command}`);
  }
}

if (path.resolve(process.argv[1] || '') === SCRIPT_FILE) {
  try {
    main();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(message);
    process.exitCode = 1;
  }
}
