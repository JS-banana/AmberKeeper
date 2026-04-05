import { readLiveProbeManifest } from './live-probe-manifest.mjs';

const [, , providerId, kind, ...rest] = process.argv;

if (!providerId || !kind) {
  console.error('Usage: node scripts/provider-live-probe.mjs <providerId> <new-message|history-click> [promptText] [--history-index=N] [--timeout-ms=N] [--reset-to-home]');
  process.exit(1);
}

const payload = {
  providerId,
  kind,
};

for (const arg of rest) {
  if (arg.startsWith('--history-index=')) {
    payload.historyItemIndex = Number(arg.slice('--history-index='.length));
    continue;
  }

  if (arg.startsWith('--timeout-ms=')) {
    payload.timeoutMs = Number(arg.slice('--timeout-ms='.length));
    continue;
  }

  if (arg === '--reset-to-home') {
    payload.resetToHome = true;
    continue;
  }

  if (!arg.startsWith('--') && kind === 'new-message' && payload.promptText === undefined) {
    payload.promptText = arg;
  }
}

const { baseUrl } = readLiveProbeManifest();
const response = await fetch(`${baseUrl}/live-probe`, {
  method: 'POST',
  headers: {
    'content-type': 'application/json',
  },
  body: JSON.stringify(payload),
});
const json = await response.json();
console.log(JSON.stringify(json, null, 2));
if (!response.ok || json.ok === false || (json.result?.verdict && json.result.verdict !== 'passed')) {
  process.exit(1);
}
