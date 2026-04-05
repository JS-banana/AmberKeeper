import fs from 'node:fs';
import path from 'node:path';
import { readLiveProbeManifest } from './live-probe-manifest.mjs';

const [, , providerId, scriptPath, ...rest] = process.argv;

if (!providerId || !scriptPath) {
  console.error('Usage: node scripts/provider-page-eval.mjs <providerId> <script-path> [--no-activate]');
  process.exit(1);
}

const activate = !rest.includes('--no-activate');
const script = fs.readFileSync(path.resolve(scriptPath), 'utf8');
const { baseUrl } = readLiveProbeManifest();
const response = await fetch(`${baseUrl}/page-eval`, {
  method: 'POST',
  headers: {
    'content-type': 'application/json',
  },
  body: JSON.stringify({
    providerId,
    script,
    activate,
  }),
});
const json = await response.json();
console.log(JSON.stringify(json, null, 2));
if (!response.ok || json.ok === false) {
  process.exit(1);
}
