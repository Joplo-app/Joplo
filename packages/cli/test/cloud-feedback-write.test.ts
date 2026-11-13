import { afterEach, beforeEach, expect, test } from 'vitest';
import { createServer } from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { runCli } from '../src/cli.ts';
import { writeCredentials } from '../src/cloud.ts';

const token = 'feedback-write-token', shareId = 'Abc1234567';
let root: string, home: string, base: string;
let calls: { method: string; path: string; body: any }[];
let server: ReturnType<typeof createServer>;
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'joplo-feedback-write-')); home = join(root, 'home'); calls = [];
  server = createServer(async (req, res) => {
    const chunks: Buffer[] = []; for await (const chunk of req) chunks.push(chunk);
    const body = JSON.parse(Buffer.concat(chunks).toString() || '{}'); calls.push({ method: req.method!, path: req.url!, body });
    res.setHeader('content-type', 'application/json');
    if (req.url?.endsWith('/comments')) return res.end(JSON.stringify({ id: 'c1' }));
    if (req.url?.endsWith('/decisions')) return res.end(JSON.stringify({ id: 'd1' }));
    if (req.url?.endsWith('/applied')) return res.end(JSON.stringify({ applied: body.decisionIds }));
    res.end(JSON.stringify({ success: true }));
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve)); base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  await writeCredentials(home, { server: base, accessToken: token, user: { id: 'u', email: 'u@example.com' }, createdAt: new Date().toISOString() });
});
afterEach(async () => { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); await rm(root, { recursive: true, force: true }); });
async function cli(args: string[]) {
  let stdout = '', stderr = '';
  const code = await runCli(args, { stdout: s => { stdout += s; }, stderr: s => { stderr += s; }, cloud: { env: { JOPLO_HOME: home, JOPLO_CLOUD_URL: base } } });
  expect(stdout + stderr).not.toContain(token);
  return { code, stdout, stderr, json: () => JSON.parse(stdout) };
}

test('Cloud comment sends the exact anchor and expectedVersion', async () => {
  const r = await cli(['feedback', 'comment', '--share', shareId, '--review-id', 'review-link', '--version', '3', '--work', 'f.a', '--scenario', 'f.a.main', '--position', '2', '--step-id', 'f.a.main#2', '--layer', 'main', '--element', 'save', '--body', 'Clarify this', '--format', 'json']);
  expect(r.code, r.stdout).toBe(0); expect(r.json().data).toEqual({ id: 'c1' });
  expect(calls[0]).toEqual({ method: 'POST', path: `/api/v1/shares/${shareId}/feedback/comments`, body: { shareId, reviewId: 'review-link', expectedVersion: 3, body: 'Clarify this', anchor: { version: 3, workId: 'f.a', scenario: 'f.a.main', step: 2, stepId: 'f.a.main#2', layer: 'main', element: { id: 'save', label: 'save' } } } });
});

test('Cloud decision requires expectedVersion and sends nullable standalone ownership explicitly', async () => {
  expect((await cli(['feedback', 'decide', '--share', shareId, '--kind', 'pick', '--target', 'demo', '--format', 'json'])).code).toBe(2); expect(calls).toEqual([]);
  const r = await cli(['feedback', 'decide', '--share', shareId, '--kind', 'pick', '--work', 'demo', '--target', 'demo', '--expected-version', '4', '--format', 'json']);
  expect(r.code, r.stdout).toBe(0);
  expect(calls[0]!.body).toEqual({ shareId, kind: 'pick', featureId: null, workId: 'demo', targetId: 'demo', note: null, expectedVersion: 4 });
});

test('resolution, retraction, and vote use their dedicated routes and do not conflate votes with approval', async () => {
  expect((await cli(['feedback', 'resolve', 'c1', '--share', shareId, '--format', 'json'])).code).toBe(0);
  expect((await cli(['feedback', 'resolve', 'c1', '--share', shareId, '--reopen', '--format', 'json'])).code).toBe(0);
  expect((await cli(['feedback', 'retract', 'd1', '--share', shareId, '--format', 'json'])).code).toBe(0);
  const vote = await cli(['feedback', 'vote', '--share', shareId, '--review-id', 'r1', '--feature', 'f', '--work', 'f.a', '--expected-version', '3', '--format', 'json']);
  expect(vote.code).toBe(0);
  expect(calls.map(call => [call.method, call.path])).toEqual([
    ['POST', `/api/v1/shares/${shareId}/feedback/comments/c1/resolution`], ['POST', `/api/v1/shares/${shareId}/feedback/comments/c1/resolution`],
    ['POST', `/api/v1/shares/${shareId}/feedback/decisions/d1/retract`], ['POST', `/api/v1/shares/${shareId}/feedback/votes`],
  ]);
  expect(calls[0]!.body.resolved).toBe(true); expect(calls[1]!.body.resolved).toBe(false);
});

test('feedback --applied can protect the version it wrote back', async () => {
  const r = await cli(['feedback', '--share', shareId, '--applied', 'd1', '--ref', 'abc', '--expected-version', '3', '--format', 'json']);
  expect(r.code).toBe(0); expect(calls[0]!.body).toEqual({ decisionIds: ['d1'], ref: 'abc', expectedVersion: 3 });
});

test('invalid anchors are refused locally before authentication or network', async () => {
  const r = await cli(['feedback', 'comment', '--share', shareId, '--review-id', 'r1', '--version', '3', '--work', 'f.a', '--scenario', 'f.a.main', '--position', '1', '--body', 'Missing step id', '--format', 'json']);
  expect(r.code).toBe(2); expect(r.json().error.code).toBe('USAGE'); expect(calls).toEqual([]);
});
