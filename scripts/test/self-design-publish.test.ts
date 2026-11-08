import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { diffProject } from '../../packages/core/test/fixtures/feature-diff.ts';
import { finalizeHtml, publishPayload } from '../../packages/server/src/build.ts';
import { CloudClient, object } from '../../packages/cli/src/cloud.ts';
import { assertCurrentMain, publishMainDesign, runPublishSelfDesign, safePublishError } from '../ci/publish-self-design.ts';

const SHARE = 'Abc1234567', HEAD = '1'.repeat(40), TOKEN = `jpk_${'fixture'.repeat(6)}`, GH_TOKEN = 'github-fixture-private-token';
type FileEntry = { path: string; sha256: string; size: number; contentType: string };
type Call = { method: string; path: string; body: Record<string, unknown>; authorization?: string };
let root: string, site: string, url: string, server: ReturnType<typeof createServer>, calls: Call[], uploads: Map<string, Buffer>;
let plan: string, version: number, wrongShare: boolean, reuse: boolean, foreignBlob: boolean;
let maxTotalBytes: number, maxFiles: number, failCreate: boolean, retryFinalize: boolean, onPut: (() => void) | undefined;
let stdout: string, stderr: string;
const publicHtml = () => finalizeHtml('<!doctype html><html><head></head><body><script type="module">globalThis.__JOPLO_ARTIFACT_EXECUTED__ = true;</script></body></html>', () => '', publishPayload(diffProject(), '/')).html;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'joplo-static-publisher-')); site = join(root, 'site'); await mkdir(site); await mkdir(join(site, 'assets'));
  await writeFile(join(site, 'index.html'), publicHtml()); await writeFile(join(site, 'assets/site.css'), 'body { color: #111 }');
  calls = []; uploads = new Map(); plan = 'pro'; version = 0; wrongShare = false; reuse = false; foreignBlob = false;
  maxTotalBytes = 10000000; maxFiles = 1000; failCreate = false; retryFinalize = false; onPut = undefined; stdout = ''; stderr = '';
  server = createServer(async (req, res) => {
    try {
      const chunks: Buffer[] = []; for await (const chunk of req) chunks.push(chunk);
      const bytes = Buffer.concat(chunks), path = req.url!;
      if (req.method === 'PUT') {
        const sha = path.slice('/blob/'.length); uploads.set(sha, bytes);
        calls.push({ method: 'PUT', path, body: {}, authorization: req.headers.authorization });
        onPut?.(); res.end(); return;
      }
      const body = bytes.length ? object(JSON.parse(bytes.toString())) : {};
      calls.push({ method: req.method!, path, body, authorization: req.headers.authorization });
      res.setHeader('Content-Type', 'application/json');
      const send = (data: unknown) => res.end(JSON.stringify(data));
      if (path === '/api/v1/me') return send({ user: { id: 'author', email: 'author@example.com', name: 'Author' }, plan, limits: { maxUploadBytes: 1, maxTotalBytes, maxFiles, publishesPerHour: 100 } });
      if (path === '/api/v1/shares') {
        if (failCreate) { res.statusCode = 429; return send({ code: 'QUOTA_EXCEEDED', message: TOKEN, data: { unknown: GH_TOKEN } }); }
        const files = body.files as FileEntry[];
        return send({ shareId: wrongShare ? 'Zyx9876543' : SHARE, uploadId: `upload-${version + 1}`, missing: foreignBlob ? [{ sha256: 'f'.repeat(64), uploadUrl: `${url}/blob/foreign`, headers: {} }] : reuse ? [] : [...new Map(files.map(file => [file.sha256, file])).values()].map(file => ({ sha256: file.sha256, uploadUrl: `${url}/blob/${file.sha256}`, headers: { 'content-type': 'application/octet-stream' } })) });
      }
      if (path === `/api/v1/shares/${SHARE}/finalize`) {
        if (retryFinalize) { retryFinalize = false; res.statusCode = 503; return send({ code: 'SERVICE_UNAVAILABLE', message: TOKEN }); }
        return send({ shareId: SHARE, url: `${url}/s/${SHARE}/`, version: ++version, expiresAt: null });
      }
      res.statusCode = 404; send({ code: 'NOT_FOUND' });
    } catch { res.statusCode = 500; res.end('{}'); }
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  url = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
});
afterEach(async () => {
  server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve()));
  await rm(root, { recursive: true, force: true }); vi.restoreAllMocks();
});
const env = () => ({ JOPLO_API_KEY: TOKEN, JOPLO_HOME: join(root, 'home'), JOPLO_CLOUD_URL: url, GH_TOKEN });
const client = () => new CloudClient(undefined, '0.2.12', text => { stderr += text; }, () => {}, { env: env(), interactive: false, sleep: async () => {} });
const publish = (assertCurrent?: () => Promise<void>) => publishMainDesign(client(), site, { shareId: SHARE, title: 'Joplo design', assertCurrent });
const finalizeCalls = () => calls.filter(call => call.path.endsWith('/finalize'));
const github = vi.fn<typeof fetch>(async () => new Response(JSON.stringify({ ref: 'refs/heads/main', object: { type: 'commit', sha: HEAD } }), { headers: { 'content-type': 'application/json' } }));
async function cli(extraEnv: NodeJS.ProcessEnv = {}, fetchGitHub: typeof fetch = github) {
  return runPublishSelfDesign(['--site', site, '--share-id', SHARE, '--repo', 'Joplo-app/Joplo', '--head', HEAD], { env: { ...env(), ...extraEnv }, stdout: s => { stdout += s; }, stderr: s => { stderr += s; }, fetchGitHub });
}

it('uploads actual bytes and repeatedly updates the same fixed share without loading artifact scripts', async () => {
  const assertCurrent = vi.fn(async () => {});
  const first = await publish(assertCurrent); expect(first).toMatchObject({ shareId: SHARE, version: 1 });
  expect(assertCurrent).toHaveBeenCalledTimes(2);
  const create = calls.find(call => call.path === '/api/v1/shares')!.body;
  expect(create.replaceShareId).toBe(SHARE); expect(create).not.toHaveProperty('review'); expect(create).not.toHaveProperty('pr');
  expect(uploads.size).toBe(2);
  for (const [sha, bytes] of uploads) expect(createHash('sha256').update(bytes).digest('hex')).toBe(sha);
  expect(calls.filter(call => call.method === 'PUT').every(call => !call.authorization)).toBe(true);
  expect(Reflect.get(globalThis, '__JOPLO_ARTIFACT_EXECUTED__')).toBeUndefined();
  reuse = true; const second = await publish(); expect(second).toMatchObject({ shareId: SHARE, version: 2, url: first.url });
  expect(calls.filter(call => call.path === '/api/v1/shares').every(call => call.body.replaceShareId === SHARE)).toBe(true);
  expect(finalizeCalls()).toHaveLength(2);
});

it.each(['dev', 'review'])('rejects %s IR before authentication or upload', async mode => {
  const project = { ...diffProject(), mode };
  await writeFile(join(site, 'index.html'), `<script type="application/json" id="joplo-ir">${JSON.stringify({ project })}</script>`);
  await expect(publish()).rejects.toMatchObject({ code: 'INVALID_SCHEMA' }); expect(calls).toEqual([]);
});
it('rejects private authoring metadata inside otherwise public IR', async () => {
  const project = diffProject(); project.scenes['/']!.root.note = 'private author note';
  await writeFile(join(site, 'index.html'), `<script type="application/json" id="joplo-ir">${JSON.stringify({ project })}</script>`);
  await expect(publish()).rejects.toMatchObject({ code: 'INVALID_SCHEMA' }); expect(calls).toEqual([]);
});
it.each(['review/manifest.json', 'assets/review.json', 'joplo.config.ts', 'nested/index.html', 'assets/unsafe?.js'])('rejects private or unsafe artifact file %s before requests', async name => {
  await mkdir(join(site, name, '..'), { recursive: true }); await writeFile(join(site, name), `throw new Error('${TOKEN}');`);
  await expect(publish()).rejects.toBeInstanceOf(Error); expect(calls).toEqual([]);
});
it('rejects a nested symlink and a symlinked artifact root', async () => {
  await symlink(join(site, 'index.html'), join(site, 'assets/link.js'));
  await expect(publish()).rejects.toMatchObject({ code: 'EXPORT_FAILED' }); expect(calls).toEqual([]);
  const link = join(root, 'linked'); await symlink(site, link);
  await expect(publishMainDesign(client(), link, { shareId: SHARE, title: 'Design' })).rejects.toMatchObject({ code: 'INVALID_SCHEMA' });
});
it.each([
  '<html><body>No Joplo IR</body></html>',
  `${publicHtml()}<script type="application/json" id="review-manifest">{"private":true}</script>`,
  `<script type="application/json" id="joplo-ir">${JSON.stringify({ project: diffProject(), review: {} })}</script>`,
  `<script type="application/json" id="joplo-ir">${JSON.stringify({ project: diffProject(), home: { private: true } })}</script>`,
  `${publicHtml()}${publicHtml()}`,
  `${publicHtml()}<script id='joplo-ir' type='application/json'>${JSON.stringify({ project: diffProject() })}</script>`,
  `${publicHtml()}<script id=joplo-ir type=application/json>${JSON.stringify({ project: diffProject() })}</script>`,
])('rejects malformed, duplicate or private JSON envelope %#', async html => {
  await writeFile(join(site, 'index.html'), html); await expect(publish()).rejects.toMatchObject({ code: 'INVALID_SCHEMA' }); expect(calls).toEqual([]);
});

it('requires a fixed share ID and refuses a server-created replacement ID', async () => {
  await expect(publishMainDesign(client(), site, { shareId: '', title: 'Design' })).rejects.toMatchObject({ code: 'USAGE' });
  expect(calls).toEqual([]); wrongShare = true;
  await expect(publish()).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  expect(uploads.size).toBe(0); expect(finalizeCalls()).toEqual([]);
});
it('requires Pro instead of falling back to a new free share', async () => {
  plan = 'free'; await expect(publish()).rejects.toMatchObject({ code: 'PLAN_REQUIRED' });
  expect(calls.map(call => call.path)).toEqual(['/api/v1/me']);
});
it.each(['total', 'files'])('checks %s limits before create and leaves deduplicated upload quota to Cloud', async kind => {
  if (kind === 'total') maxTotalBytes = 1; else maxFiles = 1;
  await expect(publish()).rejects.toMatchObject({ code: 'TOO_LARGE' });
  expect(calls.map(call => call.path)).toEqual(['/api/v1/me']);
});
it('preserves Cloud quota rejection without retrying into a new share', async () => {
  failCreate = true; await expect(publish()).rejects.toMatchObject({ code: 'QUOTA_EXCEEDED' });
  expect(calls.filter(call => call.path === '/api/v1/shares')).toHaveLength(1); expect(finalizeCalls()).toEqual([]);
});
it('rejects a foreign blob request before sending any PUT', async () => {
  foreignBlob = true; await expect(publish()).rejects.toMatchObject({ code: 'INVALID_RESPONSE' }); expect(uploads.size).toBe(0);
});
it('checks current main before any cloud request', async () => {
  await expect(publish(async () => { throw Error(GH_TOKEN); })).rejects.toMatchObject({ code: 'REVISION_CONFLICT' }); expect(calls).toEqual([]);
});
it('checks main again after actual uploads and refuses to finalize a stale head', async () => {
  let stale = false; onPut = () => { stale = true; };
  await expect(publish(async () => { if (stale) throw Error(GH_TOKEN); })).rejects.toMatchObject({ code: 'REVISION_CONFLICT' });
  expect(uploads.size).toBe(2); expect(finalizeCalls()).toEqual([]);
});
it('rechecks current main on a finalize retry too', async () => {
  retryFinalize = true; let checked = 0;
  await expect(publish(async () => { if (++checked === 3) throw Error('main moved'); })).rejects.toMatchObject({ code: 'REVISION_CONFLICT' });
  expect(checked).toBe(3); expect(finalizeCalls()).toHaveLength(1);
});

describe('trusted CLI boundary', () => {
  it('writes only a validated link/version/head to GitHub output and summary', async () => {
    const output = join(root, 'output'), summary = join(root, 'summary'); github.mockClear();
    expect(await cli({ GITHUB_OUTPUT: output, GITHUB_STEP_SUMMARY: summary })).toBe(0);
    expect(JSON.parse(stdout)).toEqual({ shareId: SHARE, url: `${url}/s/${SHARE}/`, version: 1, head: HEAD });
    const written = await readFile(output, 'utf8') + await readFile(summary, 'utf8');
    expect(written).toContain(`share_id=${SHARE}`); expect(written).toContain('version=1');
    expect(stdout + stderr + written).not.toContain(TOKEN); expect(stdout + stderr + written).not.toContain(GH_TOKEN);
    expect(github).toHaveBeenCalledTimes(2);
    expect(github.mock.calls[0]![0]).toBe('https://api.github.com/repos/Joplo-app/Joplo/git/ref/heads/main');
    expect(github.mock.calls[0]![1]).toMatchObject({ redirect: 'error', headers: { Authorization: `Bearer ${GH_TOKEN}` } });
  });
  it('requires explicit automation credentials and never falls back to local sessions', async () => {
    expect(await cli({ JOPLO_API_KEY: '' })).toBe(2); expect(calls).toEqual([]);
  });
  it('never prints remote error bodies or secret-bearing paths', async () => {
    failCreate = true; expect(await cli()).toBe(1);
    expect(stderr).toContain('QUOTA_EXCEEDED'); expect(stderr + stdout).not.toContain(TOKEN); expect(stderr + stdout).not.toContain(GH_TOKEN);
    calls = []; stderr = ''; await writeFile(join(site, `${GH_TOKEN}.json`), '{}');
    expect(await cli()).toBe(1); expect(stderr).not.toContain(GH_TOKEN); expect(calls).toEqual([]);
    expect(safePublishError(new Error(TOKEN)).message).not.toContain(TOKEN);
  });
  it('fails closed on GitHub metadata/network errors without leaking the token', async () => {
    expect(await cli({}, async () => { throw Error(GH_TOKEN); })).toBe(1);
    expect(calls).toEqual([]); expect(stderr).toContain('REVISION_CONFLICT'); expect(stderr).not.toContain(GH_TOKEN);
  });
  it('validates the exact main ref and expected SHA', async () => {
    await expect(assertCurrentMain('Joplo-app/Joplo', HEAD, GH_TOKEN, async () => new Response(JSON.stringify({ ref: 'refs/heads/main', object: { type: 'commit', sha: '2'.repeat(40) } })))).rejects.toMatchObject({ code: 'REVISION_CONFLICT' });
    const fetcher = vi.fn<typeof fetch>();
    await expect(assertCurrentMain('../escape', HEAD, GH_TOKEN, fetcher)).rejects.toMatchObject({ code: 'USAGE' }); expect(fetcher).not.toHaveBeenCalled();
  });
});
