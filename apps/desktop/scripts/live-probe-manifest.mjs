import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export function resolveLiveProbeManifestPath() {
  return (
    process.env.AMBERKEEPER_LIVE_PROBE_MANIFEST_PATH ??
    path.join(
      os.homedir(),
      'Library',
      'Application Support',
      'electron-chatgpt-capture',
      'provider-live-probe-server.json'
    )
  );
}

export function readLiveProbeManifest() {
  const manifestPath = resolveLiveProbeManifestPath();
  if (!fs.existsSync(manifestPath)) {
    throw new Error(`Live probe manifest not found: ${manifestPath}`);
  }

  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  return {
    manifestPath,
    manifest,
    baseUrl: manifest.baseUrl ?? `http://${manifest.host}:${manifest.port}`,
  };
}
