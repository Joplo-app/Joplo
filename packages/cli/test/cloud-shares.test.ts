import { afterEach, beforeEach, expect, test } from 'vitest';
import { createServer, type IncomingMessage } from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { runCli } from '../src/cli.ts';
import { writeCredentials } from '../src/cloud.ts';

const token = 'share-management-token';
const id = 'Abc1234567';
const share = { shareId: id, title: 'Team invite', status: 'live', version: 3, visibility: 'private', passwordProtected: true, publishedAt: '2026-11-13T10:00:00.000Z', expiresAt: null, url: 'https://joplo.app/s/Abc1234567/' };
let root: string, home: string, base: string;
let calls: { method: string; path: string; headers: IncomingMessage['headers'] }[];
let server: ReturnType<typeof createServer>;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'joplo-shares-cli-')); home = join(root, 'home'); calls = [];
  server = createServer((req, res) => {
    calls.push({ method: req.method!, path: req.url!, headers: req.headers });
    res.setHeader('content-type', 'application/json');
    if (req.url === '/api/v1/shares' && req.method === 'GET') return res.end(JSON.stringify([share]));
    if (req.url === `/api/v1/shares/${id}` && req.method === 'GET') return res.end(JSON.stringify(share));
    if (req.url === `/api/v1/shares/${id}` && req.method === 'DELETE') return res.end(JSON.stringify({ success: true }));
    res.statusCode = 404; res.end(JSON.stringify({ code: 'NOT_FOUND' }));
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  await writeCredentials(home, { server: base, accessToken: token, user: { id: 'u1', email: 'u@example.com' }, createdAt: new Date().toISOString() });
});
afterEach(async () => { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); await rm(root, { recursive: true, force: true }); });

async function cli(args: string[], opts: { interactive?: boolean; ask?: (question: string) => Promise<boolean> } = {}) {
  let stdout = '', stderr = '';
  const code = await runCli(args, { stdout: s => { stdout += s; }, stderr: s => { stderr += s; }, interactive: opts.interactive, ask: opts.ask, cloud: { env: { JOPLO_HOME: home, JOPLO_CLOUD_URL: base } } });
  expect(stdout + stderr).not.toContain(token);
  return { code, stdout, stderr, json: () => JSON.parse(stdout) };
}

test('share list reads owned shares with shares:read credentials and emits structured data', async () => {
  const r = await cli(['share', 'list', '--format', 'json']);
  expect(r.code, r.stdout).toBe(0);
  expect(r.json().data.shares).toEqual([share]);
  expect(calls).toEqual([expect.objectContaining({ method: 'GET', path: '/api/v1/shares' })]);
});

test('share show and embed expose existing metadata and the same embed snippets', async () => {
  for (const command of ['show', 'embed']) {
    const r = await cli(['share', command, id, '--format', 'json']);
    expect(r.code, r.stdout).toBe(0);
    expect(r.json().data).toMatchObject({ shareId: id, version: 3, visibility: 'private', passwordProtected: true });
    expect(r.json().data.embed).toMatchObject({ badge: 'https://joplo.app/s/Abc1234567/badge.svg', preview: 'https://joplo.app/s/Abc1234567/preview.png' });
    expect(r.json().data.embed.iframe).toContain('?embed=1');
  }
});

test('share delete defaults to safe non-interactive refusal and never sends a request', async () => {
  const r = await cli(['share', 'delete', id, '--format', 'json']);
  expect(r.code).toBe(2); expect(r.json().error.code).toBe('USAGE'); expect(calls).toEqual([]);
});

test('share delete requires an affirmative interactive answer', async () => {
  const r = await cli(['share', 'delete', id], { interactive: true, ask: async () => false });
  expect(r.code).toBe(2); expect(r.stdout).toContain('cancelled'); expect(calls).toEqual([]);
});

test('share delete --yes sends exactly one authenticated DELETE', async () => {
  const r = await cli(['share', 'delete', id, '--yes', '--format', 'json']);
  expect(r.code, r.stdout).toBe(0); expect(r.json().data).toEqual({ shareId: id, deleted: true });
  expect(calls).toHaveLength(1);
  expect(calls[0]).toMatchObject({ method: 'DELETE', path: `/api/v1/shares/${id}` });
  expect(calls[0]!.headers.authorization).toBe(`Bearer ${token}`);
});
