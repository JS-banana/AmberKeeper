import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type {
  ProviderLiveProbeRequest,
  ProviderLiveProbeResult,
  ProviderPageEvalRequest,
  ProviderPageEvalResult,
} from '@amberkeeper/shared-types';

export interface ProviderLiveProbeServerManifest {
  baseUrl: string;
  host: string;
  port: number;
  startedAt: string;
}

export interface ProviderLiveProbeServerController {
  start: () => Promise<ProviderLiveProbeServerManifest>;
  stop: () => Promise<void>;
}

export function createProviderLiveProbeServer(options: {
  manifestPath: string;
  runProbe: (request: ProviderLiveProbeRequest) => Promise<ProviderLiveProbeResult>;
  evaluatePage?: (request: ProviderPageEvalRequest) => Promise<ProviderPageEvalResult>;
  host?: string;
  port?: number;
  onLog?: (message: string) => void;
}): ProviderLiveProbeServerController {
  const host = options.host ?? '127.0.0.1';
  const requestedPort = options.port ?? 0;
  let server: Server | null = null;
  let manifest: ProviderLiveProbeServerManifest | null = null;

  return {
    async start(): Promise<ProviderLiveProbeServerManifest> {
      if (server && manifest) {
        return manifest;
      }

      await mkdir(path.dirname(options.manifestPath), { recursive: true });

      server = createServer(async (request, response) => {
        try {
          await handleRequest(request, response, {
            runProbe: options.runProbe,
            evaluatePage: options.evaluatePage,
          });
        } catch (error) {
          response.writeHead(500, { 'content-type': 'application/json; charset=utf-8' });
          response.end(
            JSON.stringify({
              ok: false,
              error: error instanceof Error ? error.message : String(error),
            })
          );
        }
      });

      await new Promise<void>((resolve, reject) => {
        const currentServer = server;
        currentServer?.once('error', reject);
        currentServer?.listen(requestedPort, host, () => resolve());
      });

      const currentServer = server;
      const address = currentServer?.address();
      if (!address || typeof address === 'string') {
        throw new Error('Provider live probe server did not expose a TCP address.');
      }

      manifest = {
        baseUrl: `http://${host}:${address.port}`,
        host,
        port: address.port,
        startedAt: new Date().toISOString(),
      };
      await writeFile(options.manifestPath, JSON.stringify(manifest, null, 2), 'utf8');
      options.onLog?.(`Provider live probe server listening on ${manifest.baseUrl}`);
      return manifest;
    },
    async stop(): Promise<void> {
      await rm(options.manifestPath, { force: true }).catch(() => undefined);
      manifest = null;
      if (!server) {
        return;
      }

      const currentServer = server;
      server = null;
      await new Promise<void>((resolve, reject) => {
        currentServer.close((error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
      });
    },
  };
}

async function handleRequest(
  request: IncomingMessage,
  response: ServerResponse,
  input: {
    runProbe: (request: ProviderLiveProbeRequest) => Promise<ProviderLiveProbeResult>;
    evaluatePage?: (request: ProviderPageEvalRequest) => Promise<ProviderPageEvalResult>;
  }
): Promise<void> {
  if (request.method === 'GET' && request.url === '/health') {
    response.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
    response.end(JSON.stringify({ ok: true }));
    return;
  }

  if (request.method === 'POST' && (request.url === '/live-probe' || request.url === '/probe')) {
    const payload = (await readJsonBody(request)) as ProviderLiveProbeRequest;
    const result = await input.runProbe(payload);
    response.writeHead(result.ok ? 200 : 422, { 'content-type': 'application/json; charset=utf-8' });
    response.end(JSON.stringify({ ok: result.ok, result }, null, 2));
    return;
  }

  if (request.method === 'POST' && request.url === '/page-eval') {
    if (!input.evaluatePage) {
      response.writeHead(404, { 'content-type': 'application/json; charset=utf-8' });
      response.end(JSON.stringify({ ok: false, error: 'page-eval-disabled' }));
      return;
    }

    const payload = (await readJsonBody(request)) as ProviderPageEvalRequest;
    const result = await input.evaluatePage(payload);
    response.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
    response.end(JSON.stringify({ ok: true, result }, null, 2));
    return;
  }

  response.writeHead(404, { 'content-type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify({ ok: false, error: 'Not found' }));
}

async function readJsonBody(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  const raw = Buffer.concat(chunks).toString('utf8').trim();
  if (!raw) {
    return {};
  }

  return JSON.parse(raw);
}
