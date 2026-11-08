import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createServer } from 'node:http';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { runCli } from '../src/cli.ts';
import { diffProject } from '../../core/test/fixtures/feature-diff.ts';
import { buildFeatureDiff } from '../../server/src/feature-diff.ts';
import { jsonForHtml } from '../../server/src/build.ts';
const BASE = '1'.repeat(40), CANDIDATE = '3'.repeat(40), HEAD = '2'.repeat(40), TOKEN = 'jpk_' + 'fixture'.repeat(6);
let root: string, url: string, srv: ReturnType<typeof createServer>, calls: { path: string; body: any; auth?: string }[];
let failure: string | undefined, missingForeign: boolean;
let errorCode: string, errorStatus: number;
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'joplo-diff-cli-')); calls = []; failure = undefined; missingForeign = false; errorCode = 'CONFLICT'; errorStatus = 409;
  srv = createServer(async (req, res) => {
    const chunks: Buffer[] = []; for await (const chunk of req) chunks.push(chunk);
    const text = Buffer.concat(chunks).toString(); let body: any; try { body = JSON.parse(text); } catch { body = text; }
    calls.push({ path: req.url!, body, auth: req.headers.authorization }); res.setHeader('Content-Type', 'application/json');
    const send = (x: unknown) => res.end(JSON.stringify(x));
    if (req.url === failure) { res.statusCode = errorStatus; send({ defined: true, code: errorCode, status: errorStatus, message: TOKEN }); return; }
    if (req.url === '/api/v1/pr-comparisons/prepare') { send({ comparisonId: 'comparison-fixture', generation: 2, baseSha: BASE, headSha: HEAD }); return; }
    if (req.url === '/api/v1/me') { send({ user: { id: 'fixture', email: 'test@example.com', name: 'Fixture' }, plan: 'pro', limits: { maxUploadBytes: 10000000, maxTotalBytes: 10000000, maxFiles: 2000, publishesPerHour: 100 } }); return; }
    if (req.url === '/api/v1/shares') {
      send({ shareId: 'Abc1234567', uploadId: 'fixture-upload', missing: missingForeign ? [{ sha256: 'f'.repeat(64), uploadUrl: url + '/blob', headers: {} }] : [...new Map<string, any>(body.files.map((f: any) => [f.sha256, f])).values()].map((f: any) => ({ sha256: f.sha256, uploadUrl: `${url}/blob/${f.sha256}`, headers: {} })) }); return;
    }
    if (req.url?.startsWith('/blob/')) { send({}); return; }
    if (req.url === '/api/v1/shares/Abc1234567/finalize') { send({ shareId: 'Abc1234567', version: 1, expiresAt: null, url: url + '/s/Abc1234567', pr: { comment: 'updated' } }); return; }
    res.statusCode = 404; send({ code: 'NOT_FOUND' });
  });
  await new Promise<void>(r => srv.listen(0, '127.0.0.1', r)); url = `http://127.0.0.1:${(srv.address() as { port: number }).port}`;
});
afterEach(async () => { srv.closeAllConnections(); await new Promise<void>(r => srv.close(() => r())); await rm(root, { recursive: true, force: true }); });
const loadServer = vi.fn(async () => { throw new Error('Publish must never load a project or server'); });
async function cli(args: string[]) {
  let out = '', err = '';
  const code = await runCli(args, { loadServer, stdout: s => out += s, stderr: s => err += s, cloud: { env: { JOPLO_HOME: join(root, 'home'), JOPLO_API_KEY: TOKEN, JOPLO_CLOUD_URL: url }, interactive: false } });
  return { code, out, err };
}
async function prepare() {
  const r = await cli(['diff', 'prepare', '--pr', '12', '--repo', 'example/demo', '--sha', HEAD, '--base-sha', CANDIDATE, '--out', join(root, 'receipt.json'), '--format', 'json']);
  expect(r.code, r.err + r.out).toBe(0); return r;
}
async function bundle() {
  for (const side of ['before', 'after']) {
    await mkdir(join(root, side));
    await writeFile(join(root, side, 'index.html'), `<meta name="joplo-feature-diff-player" content="1"><script type="application/json" id="joplo-ir">${jsonForHtml({ project: diffProject() })}</script>`);
  }
  await buildFeatureDiff({ beforeDir: join(root, 'before'), afterDir: join(root, 'after'), outDir: join(root, 'bundle'), baseSha: BASE, headSha: HEAD });
}
const publish = (extra: string[] = []) => cli(['diff', 'publish', join(root, 'bundle'), '--prepared', join(root, 'receipt.json'), '--pr', '12', '--repo', 'example/demo', '--sha', HEAD, '--format', 'json', ...extra]);
it('prepare persists returned pinned baseline and never saves the API key', async () => {
  const r = await prepare();
  const receipt = await readFile(join(root, 'receipt.json'), 'utf8');
  expect(JSON.parse(receipt).prepared.baseSha).toBe(BASE);
  expect(receipt + r.out + r.err).not.toContain(TOKEN);
  expect(calls[0]!.body).toEqual({ provider: 'github', repo: 'example/demo', number: 12, baseSha: CANDIDATE, headSha: HEAD });
});
it('publishes unchanged real builds with exact CONTRACT v1 envelope and no project execution', async () => {
  await prepare(); await bundle(); loadServer.mockClear(); const r = await publish(); expect(r.code, r.err + r.out).toBe(0); expect(loadServer).not.toHaveBeenCalled();
  const request = calls.find(c => c.path === '/api/v1/shares')!.body;
  expect(request.comparison).toEqual({ comparisonId: 'comparison-fixture', generation: 2, baseSha: BASE, headSha: HEAD, manifestPath: 'feature-diff.json', manifestSha256: createHash('sha256').update(await readFile(join(root, 'bundle/feature-diff.json'))).digest('hex'), summary: { added: [], modified: [], removed: [] } });
  expect(request).not.toHaveProperty('review'); expect(request).not.toHaveProperty('replaceShareId');
  expect(request.pr).toMatchObject({ provider: 'github', repo: 'example/demo', number: 12, headSha: HEAD });
  expect(calls.filter(c => c.path.startsWith('/blob/')).every(c => !c.auth)).toBe(true);
  expect(calls.at(-1)!.path).toContain('/finalize'); expect(r.out + r.err).not.toContain(TOKEN);
});
it('rejects mismatched head and a tampered manifest before any upload', async () => {
  await prepare(); await bundle(); calls = [];
  expect((await publish(['--sha', '4'.repeat(40)])).code).not.toBe(0); expect(calls).toEqual([]);
  const path = join(root, 'bundle/feature-diff.json'); const m = JSON.parse(await readFile(path, 'utf8')); m.summary.added = ['Fabricated']; await writeFile(path, JSON.stringify(m));
  expect((await publish()).code).not.toBe(0); expect(calls).toEqual([]);
});
it('does not downgrade comparison failures to an ordinary share or finalize stale generations', async () => {
  await prepare(); await bundle(); failure = '/api/v1/shares'; const r = await publish(); expect(r.code).not.toBe(0);
  expect(calls.filter(c => c.path === '/api/v1/shares')).toHaveLength(1); expect(calls.some(c => c.path.includes('/finalize'))).toBe(false);
});
it('validates every requested blob before sending the first PUT', async () => {
  await prepare(); await bundle(); missingForeign = true; expect((await publish()).code).not.toBe(0);
  expect(calls.some(c => c.path.startsWith('/blob'))).toBe(false);
});

it.each([['PR_APP_MISSING', 409, 'GitHub App'], ['PR_CLOSED', 409, 'Stop'], ['PR_STALE_HEAD', 409, 'pinned baseline'], ['PR_STALE_GENERATION', 409, 'newer prepare'], ['PR_MISMATCH', 400, 'parameters'], ['PR_UNAVAILABLE', 503, 'Retry later']] as const)('preserves Cloud %s and provides trusted recovery text', async (code, status, hint) => {
  failure = '/api/v1/pr-comparisons/prepare'; errorCode = code; errorStatus = status;
  const r = await cli(['diff', 'prepare', '--pr', '12', '--repo', 'Example/Demo', '--sha', HEAD, '--base-sha', BASE, '--out', join(root, 'receipt.json'), '--format', 'json']);
  expect(r.code).toBe(1); expect(JSON.parse(r.out).error).toMatchObject({ code });
  expect(r.out).toContain(hint); expect(r.out + r.err).not.toContain(TOKEN); expect(calls).toHaveLength(1);
  expect(calls[0]!.body.repo).toBe('example/demo');
});
