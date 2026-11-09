import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { createServer, type IncomingMessage } from 'node:http';
import { mkdtemp, mkdir, writeFile, readFile, rm, stat, readdir, cp, symlink } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { runCli } from '../src/cli.ts';
import { browserLoginUrl, openBrowser, writeCredentials, CloudClient, httpUrl } from '../src/cloud.ts';

const token = 'secret-access-token-NEVER-PRINT';
const oldToken = 'previous-access-token-NEVER-PRINT';
const user = { id: 'user-1', email: 'user@example.com', name: 'User' };
import * as fs from 'node:fs/promises';
vi.mock('node:fs/promises', async importOriginal => {
  const actual = await importOriginal<typeof import('node:fs/promises')>();
  return { ...actual, rename: vi.fn(actual.rename), rm: vi.fn(actual.rm), chmod: vi.fn(actual.chmod) };
});

let root: string, home: string, project: string, base: string;
let server: ReturnType<typeof createServer>, previousServer: ReturnType<typeof createServer>;
let previousBase: string, previousCalls: Call[], previousStatus: number;
let raceUploads: boolean, firstUploadFailure: number | undefined;
let raceFailureHash: string;
type Call = { path: string; method: string; headers: IncomingMessage['headers']; body: any };
let finalizeStorage: { usedBytes: number; quotaBytes: number; shareBytes: number } | undefined;
let calls: Call[], plan: 'free' | 'pro', deviceErrors: string[], fail: { path: string; status?: number; code?: string; disconnect?: number; details?: unknown; remaining?: number; retryAfter?: string; xRetryAfter?: string; until?: number } | undefined;
let limits: { maxUploadBytes: number; maxTotalBytes: number; maxFiles: number; publishesPerHour: number | null };
let seedRuntime: boolean;
let revokedAfterReplacement = false;
let putDelay = 0;
let putBarrier: Array<() => void> | undefined;
let putHold = 0, activePuts = 0, maxActivePuts = 0, stalledPut = false;
const confirm = vi.fn(async (_question: string) => true);
let truncatedPut = false;
const timers = new Set<ReturnType<typeof setTimeout>>();
let responses: Map<string, unknown>;
let putStatus: number, expires: number, clock: number, waits: number[], files: Record<string, string>, missingCount: number;
const browser = vi.fn(async (_url: string) => true);
const build = vi.fn(async ({ outDir }: { outDir?: string }) => {
  for (const [p, content] of Object.entries(files)) { await mkdir(join(outDir!, p, '..'), { recursive: true }); await writeFile(join(outDir!, p), content); }
  return { outDir: outDir!, files: Object.keys(files), diagnostics: [], routes: [], scenarios: [] };
});
let renderStep: ((opts: any) => Promise<unknown>) | undefined;
const checkProject = vi.fn(async () => ({ name: 'Invite', diagnostics: [], summary: { error: 0, warning: 0, info: 0 }, verification: {} }));
beforeEach(async () => {
  finalizeStorage = undefined;
  root = await mkdtemp(join(tmpdir(), 'joplo-cloud-test-')); home = join(root, 'home'); project = join(root, 'project');
  await mkdir(project); calls = []; plan = 'free'; deviceErrors = []; fail = undefined; putStatus = 200; expires = 600; clock = 0; waits = []; missingCount = 1;
  raceUploads = false; firstUploadFailure = undefined; previousCalls = []; previousStatus = 200;
  revokedAfterReplacement = false; putHold = 0; activePuts = 0; maxActivePuts = 0; stalledPut = false; confirm.mockClear();
  truncatedPut = false; putDelay = 0; putBarrier = undefined; responses = new Map(); seedRuntime = false; limits = { maxUploadBytes: 20 * 1024 * 1024, maxTotalBytes: 256 * 1024 * 1024, maxFiles: 2000, publishesPerHour: 30 };
  files = { 'index.html': '<html>demo</html>', 'assets/site.css': 'body{}' }; renderStep = undefined; browser.mockClear(); build.mockClear(); checkProject.mockClear();
  server = createServer(async (req, res) => {
    if (req.method === 'PUT') {
      activePuts++; maxActivePuts = Math.max(maxActivePuts, activePuts); res.once('close', () => activePuts--);
      if (putHold) await new Promise<void>(r => { const timer = setTimeout(() => { timers.delete(timer); r(); }, putHold); timers.add(timer); });
    }
    if (req.method === 'PUT' && putDelay) {
      req.pause(); await new Promise<void>(r => { const timer = setTimeout(() => { timers.delete(timer); r(); }, putDelay); timers.add(timer); }); req.resume();
    }
    const chunks: Buffer[] = []; for await (const chunk of req) chunks.push(chunk);
    const raw = Buffer.concat(chunks).toString(); let body: any = raw; try { body = JSON.parse(raw); } catch { /* PUT */ }
    const path = req.url!; calls.push({ path, method: req.method!, headers: req.headers, body });
    // Coordinate by completed request bodies, not a timer: a fast 403 can abort
    // sibling bodies on a busy runner before their delayed handlers read them.
    if (req.method === 'PUT' && putBarrier) await new Promise<void>(release => {
      putBarrier!.push(release);
      if (putBarrier!.length === 4) for (const ready of putBarrier!) ready();
    });
    res.setHeader('Content-Type', 'application/json');
    const send = (value: unknown) => res.end(JSON.stringify(value));
    if (responses.has(path)) { send(responses.get(path)); return; }
    if (fail && path === fail.path && fail.remaining !== 0 && (fail.until === undefined || clock < fail.until)) {
      if (fail.remaining !== undefined) fail.remaining--;
      if (fail.disconnect) { fail.disconnect--; req.socket.destroy(); return; }
      if (fail.status) { res.statusCode = fail.status; if (fail.retryAfter) res.setHeader('Retry-After', fail.retryAfter); if (fail.xRetryAfter) res.setHeader('X-Retry-After', fail.xRetryAfter); send({ code: fail.code, message: token, data: fail.details ?? { token } }); return; }
    }
    if (path === '/api/auth/device/code') { send({ device_code: 'device-secret', user_code: 'ABCD-EFGH', verification_uri: base + '/device', verification_uri_complete: base + '/device?user_code=ABCD-EFGH', interval: 1, expires_in: expires }); return; }
    if (path === '/api/auth/device/token') { const error = deviceErrors.shift(); if (error) { res.statusCode = 400; send({ error, error_description: token }); } else send({ access_token: token, token_type: 'Bearer', expires_in: 3600 }); return; }
    if (path === '/api/v1/me') { send({ user, plan, limits: { ...limits, ...(plan === 'pro' ? { maxUploadBytes: 100 * 1024 * 1024, publishesPerHour: 120 } : {}) }, access_token: token }); return; }
    if (path === '/api/v1/shares') {
      if (!body.title || !Array.isArray(body.files) || body.files.some((f: any) => !/^[a-f0-9]{64}$/.test(f.sha256))) { res.statusCode = 400; send({ code: 'BAD_REQUEST' }); return; }
      const totalBytes = body.files.reduce((n: number, f: any) => n + f.size, 0);
      const missing = [...new Map<string, any>(body.files.map((f: any) => [f.sha256, f])).values()].filter((f: any) => !seedRuntime || !f.path.startsWith('assets/')).slice(0, missingCount);
      const uploadBytes = missing.reduce((n: number, f: any) => n + f.size, 0);
      const maxUploadBytes = plan === 'free' ? limits.maxUploadBytes : 100 * 1024 * 1024;
      if (totalBytes > limits.maxTotalBytes || body.files.length > limits.maxFiles || uploadBytes > maxUploadBytes) {
        const kind = totalBytes > limits.maxTotalBytes ? 'total' : body.files.length > limits.maxFiles ? 'files' : 'upload';
        const largestFiles = [...(kind !== 'upload' ? body.files : missing)].sort((a, b) => b.size - a.size).slice(0, 5).map(({ path, size }) => ({ path, size }));
        res.statusCode = 413; send({ code: 'TOO_LARGE', message: token, data: { kind, maxBytes: kind !== 'upload' ? limits.maxTotalBytes : maxUploadBytes, actualBytes: kind !== 'upload' ? totalBytes : uploadBytes, largestFiles, ...(kind === 'files' ? { maxFiles: limits.maxFiles, actualFiles: body.files.length } : {}), token } }); return;
      }
      send({ shareId: 'Abc1234567', uploadId: 'upload-1', missing: missing.map((f: any) => ({ sha256: f.sha256, uploadUrl: base + '/blob/' + f.sha256, headers: { 'content-type': 'application/octet-stream', 'content-length': String(f.size), 'if-none-match': '*', 'x-amz-checksum-sha256': Buffer.from(f.sha256, 'hex').toString('base64') } })) }); return;
    }
    if (path.startsWith('/blob/')) {
      if (raceUploads) {
        if (path.endsWith(raceFailureHash)) { const timer = setTimeout(() => { timers.delete(timer); firstUploadFailure = calls.filter(c => c.method === 'PUT').length; res.statusCode = 403; res.end(); }, 100); timers.add(timer); }
        else { res.statusCode = 503; res.setHeader('Retry-After', '30'); send({ code: 'SERVICE_UNAVAILABLE' }); }
        return;
      }
      if (stalledPut) return;
      if (truncatedPut) { res.writeHead(400, { 'content-length': '100' }); res.flushHeaders(); const timer = setTimeout(() => { timers.delete(timer); res.destroy(); }, 30); timers.add(timer); return; }
      res.statusCode = putStatus; res.end(); return;
    }
    if (path === '/api/v1/shares/Abc1234567/finalize') { send({ shareId: 'Abc1234567', url: base + '/s/Abc1234567/', expiresAt: plan === 'free' ? '2026-11-05T12:00:00.000Z' : null, version: 1, ...(finalizeStorage ? { storage: finalizeStorage } : {}) }); return; }
    if (path === '/api/auth/sign-out') {
      if (req.headers.authorization === `Bearer ${oldToken}`) revokedAfterReplacement = JSON.parse(await readFile(join(home, 'credentials.json'), 'utf8')).accessToken === token;
      if (![`Bearer ${token}`, `Bearer ${oldToken}`].includes(req.headers.authorization ?? '') || Object.keys(body).length) res.statusCode = 400; send({ success: res.statusCode === 200 }); return; }
    res.statusCode = 404; send({ code: 'NOT_FOUND' });
  });
  await new Promise<void>(r => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  previousServer = createServer(async (req, res) => {
    const chunks: Buffer[] = []; for await (const chunk of req) chunks.push(chunk);
    previousCalls.push({ path: req.url!, method: req.method!, headers: req.headers, body: JSON.parse(Buffer.concat(chunks).toString() || '{}') });
    revokedAfterReplacement = JSON.parse(await readFile(join(home, 'credentials.json'), 'utf8')).server === base;
    res.setHeader('Content-Type', 'application/json'); res.statusCode = previousStatus; res.end(JSON.stringify({ success: previousStatus === 200 }));
  });
  await new Promise<void>(r => previousServer.listen(0, '127.0.0.1', r));
  previousBase = `http://127.0.0.1:${(previousServer.address() as { port: number }).port}`;
});
afterEach(async () => { for (const release of putBarrier ?? []) release(); for (const timer of timers) clearTimeout(timer); timers.clear(); server.closeAllConnections(); await new Promise<void>(r => server.close(() => r())); previousServer.closeAllConnections(); await new Promise<void>(r => previousServer.close(() => r())); await rm(root, { recursive: true, force: true }); vi.restoreAllMocks(); });
async function credentials(serverUrl = base, accessToken = token) {
  await writeCredentials(home, { server: serverUrl, accessToken, user: { id: user.id, email: user.email }, createdAt: new Date().toISOString() });
}
async function cli(args: string[], options: { interactive?: boolean; ssh?: string; realBuild?: boolean; env?: NodeJS.ProcessEnv; sleep?: (ms: number, signal?: AbortSignal) => Promise<unknown> } = {}) {
  let stdout = '', stderr = '';
  const code = await runCli(args, { stdout: s => stdout += s, stderr: s => stderr += s, cliVersion: '0.1.3',
    ...(options.realBuild ? {} : { loadServer: async () => ({ buildSite: build, startDev: async () => ({ url: 'http://localhost:4790', attached: true }), ...(renderStep ? { renderStep } : {}) }) }),
    cloud: { env: { JOPLO_HOME: home, JOPLO_CLOUD_URL: base, SSH_CONNECTION: options.ssh, ...options.env }, interactive: options.interactive ?? false,
      openBrowser: browser, confirm, sleep: options.sleep ?? (async ms => { waits.push(ms); clock += ms; }), now: () => clock, ...(options.realBuild ? {} : { check: checkProject }) },
  });
  expect(stdout + stderr).not.toContain(token); expect(stdout + stderr).not.toContain(oldToken);
  expect(process.listenerCount('SIGINT')).toBe(0);
  for (const call of calls) {
    expect(JSON.stringify({ path: call.path, body: call.body, headers: { ...call.headers, authorization: undefined } })).not.toContain(token);
    if (call.headers.authorization) expect([`Bearer ${token}`, `Bearer ${oldToken}`]).toContain(call.headers.authorization);
  }
  return { code, stdout, stderr, json: () => JSON.parse(stdout) };
}
test('缺凭证：share 非交互立即返回 AUTH_REQUIRED/3，不联网、不构建、不打开浏览器', async () => {
  const r = await cli(['share', '--private', '--no-review',  project, '--format', 'json']); expect(r.code).toBe(3); expect(r.json()).toMatchObject({ ok: false, error: { code: 'AUTH_REQUIRED' }, diagnostics: [] });
  expect(r.stdout).toContain('npx joplo login'); expect(calls).toEqual([]); expect(build).not.toHaveBeenCalled(); expect(browser).not.toHaveBeenCalled(); expect(waits).toEqual([]);
});
test('设备授权 pending/slow_down；原子 0600 凭证；user 从 me 获取；所有 API 有版本头', async () => {
  deviceErrors = ['authorization_pending', 'slow_down'];
  const r = await cli(['login'], { interactive: true }); expect(r.code, r.stdout).toBe(0);
  expect(waits).toEqual([1000, 1000, 6000]); expect(browser).toHaveBeenCalledWith(base + '/device?user_code=ABCD-EFGH'); expect(r.stderr + r.stdout).toContain('ABCD-EFGH');
  const saved = JSON.parse(await readFile(join(home, 'credentials.json'), 'utf8'));
  expect(saved).toMatchObject({ server: base, accessToken: token, user: { id: user.id, email: user.email } }); expect(Object.keys(saved).sort()).toEqual(['accessToken', 'createdAt', 'server', 'user']);
  expect((await stat(join(home, 'credentials.json'))).mode & 0o777).toBe(0o600); expect(await readdir(home)).toEqual(['credentials.json']);
  for (const call of calls) expect(call.headers['x-joplo-client']).toBe('joplo-cli/0.1.3');
  expect(calls.find(c => c.path.endsWith('/token'))!.body).toEqual({ device_code: 'device-secret', client_id: 'joplo-cli', grant_type: 'urn:ietf:params:oauth:grant-type:device_code' });
});
test.each(['noninteractive', 'ssh', 'no-browser'])('login %s 从不打开浏览器，也不读取 stdin', async mode => {
  const r = await cli(['login', ...(mode === 'no-browser' ? ['--no-browser'] : [])], { interactive: mode !== 'noninteractive', ssh: mode === 'ssh' ? 'host' : undefined });
  expect(r.code).toBe(0); expect(browser).not.toHaveBeenCalled();
});
test.each(['expired_token', 'access_denied', 'invalid_grant'])('login %s 受控失败，无凭证', async error => {
  deviceErrors = [error]; const r = await cli(['login']); expect(r.code).toBe(error === 'access_denied' ? 1 : 3); expect(r.stdout).toMatch(/again|denied/); await expect(stat(join(home, 'credentials.json'))).rejects.toThrow();
});
test('本地授权期限耗尽停止轮询', async () => { expires = 1; deviceErrors = ['authorization_pending']; const r = await cli(['login']); expect(r.code).toBe(3); expect(calls.filter(c => c.path.endsWith('/token')).length).toBeLessThanOrEqual(1); });
test.each(['{bad', '{}', '{"accessToken":"secret-access-token-NEVER-PRINT"}'])('损坏或缺字段凭证视为未登录并提示重登：%s', async data => {
  await mkdir(home); await writeFile(join(home, 'credentials.json'), data); const r = await cli(['whoami', '--format=json']); expect(r.code).toBe(3); expect(r.stderr).toContain('again'); expect(calls).toEqual([]);
});
test('whoami 仅返回账号、套餐、限额；401 指向重新 login', async () => {
  await credentials(); let r = await cli(['whoami', '--format', 'json']); expect(r.code).toBe(0); expect(r.json().data).toEqual({ user, plan, limits });
  fail = { path: '/api/v1/me', status: 401, code: 'AUTH_EXPIRED' }; r = await cli(['whoami', '--format=json']); expect(r.json().error.code).toBe('AUTH_EXPIRED'); expect(r.stdout).toContain('login');
});
test('share 只上传 missing、保留签名 headers、412 成功、finalize 重试 uploadId 不变', async () => {
  await credentials(); putStatus = 412; fail = { path: '/api/v1/shares/Abc1234567/finalize', disconnect: 1 };
  const r = await cli(['share', '--private', '--no-review',  project, '--format=json']); expect(r.code, r.stdout).toBe(0);
  expect(checkProject).toHaveBeenCalledBefore(build); const puts = calls.filter(c => c.method === 'PUT'); expect(puts).toHaveLength(1);
  const hash = createHash('sha256').update(files['assets/site.css']!).digest('hex'); expect(puts[0]!.path).toBe('/blob/' + hash);
  expect(puts[0]!.headers).toMatchObject({ 'content-type': 'application/octet-stream', 'content-length': '6', 'if-none-match': '*', 'x-amz-checksum-sha256': Buffer.from(hash, 'hex').toString('base64') });
  expect(puts[0]!.headers.authorization).toBeUndefined(); expect(puts[0]!.headers['x-joplo-client']).toBeUndefined();
  expect(calls.filter(c => c.path.endsWith('/finalize')).map(c => c.body)).toEqual([{ uploadId: 'upload-1' }, { uploadId: 'upload-1' }]);
  expect(JSON.parse(await readFile(join(project, '.joplo/cloud.json'), 'utf8'))).toEqual({ server: base, shareId: r.json().data.shareId, url: r.json().data.url, passwordProtected: false });
  expect(r.json().data.expiresAt).toBe('2026-11-05T12:00:00.000Z'); await expect(stat(build.mock.calls[0]![0].outDir!)).rejects.toThrow();
});
test.each([['free', false, true, true], ['free', true, true, false], ['pro', false, true, true], ['pro', true, true, false], ['pro', false, false, false]] as const)('replaceShareId plan=%s new=%s sameServer=%s（C27：免费账号也更新同一个链接）', async (p, fresh, sameServer, replace) => {
  plan = p; await credentials(); await mkdir(join(project, '.joplo')); await writeFile(join(project, '.joplo/cloud.json'), JSON.stringify({ server: sameServer ? base : 'https://other.example', shareId: 'Old1234567', url: base + '/s/Old1234567/' }));
  const r = await cli(['share', '--private', '--no-review',  project, '--title', 'Custom', ...(fresh ? ['--new'] : [])]); expect(r.code).toBe(0);
  expect(calls.find(c => c.path === '/api/v1/shares')!.body).toMatchObject({ title: 'Custom' }); expect(calls.find(c => c.path === '/api/v1/shares')!.body.replaceShareId).toBe(replace ? 'Old1234567' : undefined);
  // C27：免费分享不再过期，发布后不再提示“7 天后过期 · 升级”
  expect(r.stdout).not.toContain('Free shares expire');
});
test.each([['pro', true], ['free', true]] as const)('share --update <链接>：没有 cloud.json 也能更新指定分享（D84；C27 起免费账号也原地更新） plan=%s', async (p, replace) => {
  plan = p; await credentials();
  const r = await cli(['share', '--private', '--no-review',  project, '--update', base + '/s/Old1234567/', '--format=json']); expect(r.code, r.stdout).toBe(0);
  expect(calls.find(c => c.path === '/api/v1/shares')!.body.replaceShareId).toBe(replace ? 'Old1234567' : undefined);
  // 发布后写下记录，之后在这台电脑上照常 share 就会更新它
  expect(JSON.parse(await readFile(join(project, '.joplo/cloud.json'), 'utf8')).shareId).toBe(r.json().data.shareId);
});
test.each([[['--update', 'not a link']], [['--update', 'https://joplo.app/x/abc']], [['--update', 'https://joplo.app/s/Old1234567/', '--new']]] as const)('share --update 写错时报 USAGE，不发请求 %j', async (args) => {
  await credentials();
  const r = await cli(['share', '--private', '--no-review',  project, ...args, '--format=json']); expect(r.code).toBe(2); expect(r.json().error.code).toBe('USAGE'); expect(calls.filter(c => c.path.startsWith('/api/'))).toEqual([]);
});
test('交互 share 自动登录后继续发布', async () => { expect((await cli(['share', '--private', '--no-review',  project], { interactive: true })).code).toBe(0); expect(browser).toHaveBeenCalledOnce(); expect(calls.some(c => c.path.endsWith('/finalize'))).toBe(true); });
test('白名单外文件与不安全路径在上传前列出并拒绝', async () => {
  await credentials(); files = { ...files, 'assets/movie.mov': 'video', 'assets/readme.bin': 'binary', 'assets/a%20.png': 'png' };
  const r = await cli(['share', '--private', '--no-review',  project, '--format=json']); expect(r.code).toBe(1); for (const name of ['movie.mov', 'readme.bin', 'a%20.png']) expect(r.stdout).toContain(name); expect(calls).toEqual([]);
});
test.each([[401, 'AUTH_EXPIRED'], [403, 'PLAN_REQUIRED'], [413, 'TOO_LARGE'], [429, 'QUOTA_EXCEEDED'], [426, 'CLIENT_OUTDATED'], [503, 'NETWORK']] as const)('share %s %s 使用结果信封且不回显服务端正文', async (status, code) => {
  await credentials(); fail = { path: '/api/v1/shares', status, code, ...(code === 'TOO_LARGE' ? { details: { kind: 'upload', maxBytes: 5, actualBytes: 6, largestFiles: [{ path: 'assets/site.css', size: 6 }] } } : {}) }; const r = await cli(['share', '--private', '--no-review',  project, '--format=json']); expect(r.code).toBe(code === 'AUTH_EXPIRED' ? 3 : 1); expect(r.json().error.code).toBe(code);
  if (code === 'TOO_LARGE') expect(r.json().error.details).toMatchObject({ kind: 'upload', maxBytes: 5, actualBytes: 6, largestFiles: [{ path: 'assets/site.css', size: 6 }] });
  expect(calls.some(c => c.method === 'PUT')).toBe(false);
});
test('C27 发布后输出账号用量（文本与 JSON）；旧服务器没有 storage 时不输出', async () => {
  await credentials(); finalizeStorage = { usedBytes: Math.round(47.2 * 1024 * 1024), quotaBytes: 100 * 1024 * 1024, shareBytes: Math.round(9.1 * 1024 * 1024) };
  const r = await cli(['share', '--private', '--no-review',  project]); expect(r.code).toBe(0);
  expect(r.stdout).toContain('Storage: 47.2 MB of 100 MB used (this share: 9.1 MB)');
  const j = await cli(['share', '--private', '--no-review',  project, '--format=json']); expect(j.json().data.storage).toEqual(finalizeStorage);
  finalizeStorage = undefined; const old = await cli(['share', '--private', '--no-review',  project]); expect(old.code).toBe(0); expect(old.stdout).not.toContain('Storage:');
});
test.each([
  [{ kind: 'storage', usedBytes: Math.round(95.9 * 1024 * 1024), quotaBytes: 100 * 1024 * 1024, shareBytes: Math.round(12.4 * 1024 * 1024), replacedBytes: 0, managePath: '/shares', upgradePath: '/settings/billing' }, 'This share needs 12.4 MB, but only 4.1 MB of your 100 MB is left'],
  [{ kind: 'storage', usedBytes: 100 * 1024 * 1024, quotaBytes: 100 * 1024 * 1024, shareBytes: 70 * 1024 * 1024, replacedBytes: 60 * 1024 * 1024, managePath: '/shares', upgradePath: '/settings/billing' }, 'This update adds 10 MB (60 MB → 70 MB), but only 0 MB of your 100 MB is left'],
  [{ kind: 'storage', usedBytes: 6 * 1024 * 1024 * 1024, quotaBytes: 5 * 1024 * 1024 * 1024, shareBytes: 2 * 1024 * 1024, replacedBytes: 0, managePath: '/shares', upgradePath: '/settings/billing' }, 'only 0 MB of your 5 GB is left (6 GB used)'],
] as const)('C27 STORAGE_FULL → QUOTA_EXCEEDED(kind storage)，退出码 6，不上传，链接用当前 server：%#', async (details, text) => {
  await credentials(); fail = { path: '/api/v1/shares', status: 413, code: 'STORAGE_FULL', details };
  const r = await cli(['share', '--private', '--no-review',  project, '--format=json']); expect(r.code).toBe(6);
  const e = r.json().error; expect(e.code).toBe('QUOTA_EXCEEDED');
  expect(e.details).toEqual({ kind: 'storage', usedBytes: details.usedBytes, quotaBytes: details.quotaBytes, shareBytes: details.shareBytes, replacedBytes: details.replacedBytes, manageUrl: base + '/shares', upgradeUrl: base + '/settings/billing' });
  expect(e.message).toContain(text); expect(e.message).toContain('Nothing was uploaded. Existing links keep working');
  expect(calls.some(c => c.method === 'PUT')).toBe(false); expect(r.stdout).not.toContain(token);
  const t = await cli(['share', '--private', '--no-review',  project]); expect(t.code).toBe(6); expect(t.stdout).toMatch(/^QUOTA_EXCEEDED {2}/m); expect(t.stdout).toContain(text); expect(t.stdout).toContain(base + '/shares');
});
test('C27 STORAGE_FULL 带不完整的 data 时仍是 QUOTA_EXCEEDED(kind storage)，退出码 6', async () => {
  await credentials(); fail = { path: '/api/v1/shares/Abc1234567/finalize', status: 413, code: 'STORAGE_FULL', details: { kind: 'storage' } };
  const r = await cli(['share', '--private', '--no-review',  project, '--format=json']); expect(r.code).toBe(6);
  expect(r.json().error).toMatchObject({ code: 'QUOTA_EXCEEDED', details: { kind: 'storage', manageUrl: base + '/shares', upgradeUrl: base + '/settings/billing' } });
});
test('网络中断最多重试三次，失败后无 cloud.json', async () => {
  await credentials(); fail = { path: '/blob/' + createHash('sha256').update(files['assets/site.css']!).digest('hex'), disconnect: 20 };
  const r = await cli(['share', '--private', '--no-review',  project, '--format=json']); expect(r.json().error.code).toBe('NETWORK'); expect(calls.filter(c => c.method === 'PUT')).toHaveLength(4); expect(waits).toEqual([1000, 2000, 4000]); await expect(stat(join(project, '.joplo/cloud.json'))).rejects.toThrow();
});
test('不同 server 的凭证不发送到覆盖地址', async () => { await credentials('https://other.example'); const r = await cli(['whoami', '--server', base, '--format=json']); expect(r.code).toBe(3); expect(calls).toEqual([]); });
test('本地 check/build/dev/skill 不发云端请求', async () => {
  const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('unexpected network'));
  await cli(['build', project]); await cli(['dev', project]); await cli(['skill', 'publish']); await cli(['check', project]); expect(calls).toEqual([]); expect(fetchSpy).not.toHaveBeenCalled();
});
test('真实 examples/invite 免费 share：预置共用运行时后成功，MIME 全部符合白名单', async () => {
  limits.maxUploadBytes = 1_250_000; // Synthetic limit: inline plugin runtimes count as new HTML; shared assets still exceed the upload allowance.
  seedRuntime = true; await credentials(); await cp('examples/invite', project, { recursive: true, filter: s => !s.includes('node_modules') }); await symlink(resolve('node_modules'), join(root, 'node_modules')); await writeFile(join(root, 'package.json'), '{"type":"module"}');
  missingCount = 9999; const r = await cli(['share', '--private', '--no-review',  project, '--format=json'], { realBuild: true }); expect(r.code, r.stdout + r.stderr).toBe(0);
  const manifest = calls.find(c => c.path === '/api/v1/shares')!.body.files;
  const allowed = ['text/html; charset=utf-8', 'text/css; charset=utf-8', 'text/javascript; charset=utf-8', 'text/plain; charset=utf-8', 'application/json', 'image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/svg+xml', 'font/woff2', 'font/woff', 'font/ttf'];
  for (const file of manifest) expect(allowed).toContain(file.contentType);
  expect(manifest.reduce((n: number, f: any) => n + f.size, 0)).toBeGreaterThan(limits.maxUploadBytes);
  expect(manifest.filter((f: any) => f.path.endsWith('.txt')).map((f: any) => f.path).sort()).toEqual(['fonts/OFL-MarkerGothic.txt', 'fonts/OFL.txt']);
  expect(calls.filter(c => c.method === 'PUT')).toHaveLength(manifest.filter((f: any) => !f.path.startsWith('assets/')).length);
  expect(r.json().data.expiresAt).not.toBeNull();
}, 120000);

test('原子写凭证：rename 前原文件保持完整，临时文件为 0600；失败时保留原文件并清理临时文件', async () => {
  await credentials(); const file = join(home, 'credentials.json'); const previous = await readFile(file, 'utf8'); const inode = (await stat(file)).ino;
  const realRename = (await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises')).rename;
  const rename = vi.mocked(fs.rename).mockClear().mockImplementation(async (from, to) => {
    expect(to).toBe(file); expect(await readFile(file, 'utf8')).toBe(previous);
    expect((await stat(from)).mode & 0o777).toBe(0o600);
    expect(JSON.parse(await readFile(from, 'utf8')).accessToken).toBe(token);
    return realRename(from, to);
  });
  await credentials(); expect(rename).toHaveBeenCalledOnce(); expect((await stat(file)).ino).not.toBe(inode);
  const saved = await readFile(file, 'utf8'); rename.mockRejectedValueOnce(new Error('rename failed'));
  await expect(credentials()).rejects.toThrow('rename failed'); expect(await readFile(file, 'utf8')).toBe(saved); expect(await readdir(home)).toEqual(['credentials.json']); rename.mockImplementation(realRename);
});
test('方案 A URL 集中选择；打开命令不可用时提示手动登录，仍可完成', async () => {
  expect(browserLoginUrl({ verification_uri: base + '/device', verification_uri_complete: base + '/device?user_code=ABCD' })).toBe(base + '/device?user_code=ABCD');
  browser.mockResolvedValueOnce(false); const r = await cli(['login'], { interactive: true }); expect(r.code).toBe(0); expect(r.stderr).toContain('manually');
  const oldPath = process.env.PATH; process.env.PATH = '';
  try { expect(await openBrowser(base + '/device', 'linux')).toBe(false); } finally { process.env.PATH = oldPath; }
});
test.each(['/api/auth/device/code', '/api/v1/me'])('login 网络中断 %s 受控失败且不写凭证', async path => {
  fail = { path, disconnect: 1 }; const r = await cli(['login']); expect(r.code).toBe(1); expect(r.stdout).toContain('NETWORK'); await expect(stat(join(home, 'credentials.json'))).rejects.toThrow();
});
test('检查失败从不 build 或上传；build 有错误时从不上传', async () => {
  await credentials(); checkProject.mockResolvedValueOnce({ name: 'Invalid', diagnostics: [], summary: { error: 1, warning: 0, info: 0 }, verification: {} });
  expect((await cli(['share', '--private', '--no-review',  project])).code).toBe(1); expect(build).not.toHaveBeenCalled(); expect(calls).toEqual([]);
  build.mockImplementationOnce(async ({ outDir }) => ({ outDir: outDir!, files: [], routes: [], scenarios: [], diagnostics: [{ severity: 'error', code: 'LOAD_FAILED', message: 'broken', source: 'schema' }] } as any));
  expect((await cli(['share', '--private', '--no-review',  project])).code).toBe(1); expect(calls).toEqual([]);
});
test('missing 为空时不发 PUT；manifest 的 hash/size 和实际字节一致', async () => {
  await credentials(); missingCount = 0; const r = await cli(['share', '--private', '--no-review',  project]); expect(r.code).toBe(0); expect(calls.filter(c => c.method === 'PUT')).toEqual([]);
  for (const f of calls.find(c => c.path === '/api/v1/shares')!.body.files) { expect(f.size).toBe(Buffer.byteLength(files[f.path]!)); expect(f.sha256).toBe(createHash('sha256').update(files[f.path]!).digest('hex')); }
});
test('PUT 网络中断后重试成功；原 headers 和字节保持一致', async () => {
  await credentials(); fail = { path: '/blob/' + createHash('sha256').update(files['assets/site.css']!).digest('hex'), disconnect: 1 };
  expect((await cli(['share', '--private', '--no-review',  project])).code).toBe(0); const puts = calls.filter(c => c.method === 'PUT'); expect(puts).toHaveLength(2); expect(puts[0]!.body).toEqual(puts[1]!.body);
  for (const key of ['content-type', 'if-none-match', 'x-amz-checksum-sha256']) expect(puts[0]!.headers[key]).toBe(puts[1]!.headers[key]); expect(waits).toEqual([1000]);
});
test('finalize 重试耗尽时所有 uploadId 相同且保留旧 cloud.json', async () => {
  await credentials(); await mkdir(join(project, '.joplo')); const old = JSON.stringify({ server: base, shareId: 'Old1234567', url: base + '/s/Old1234567/' }); await writeFile(join(project, '.joplo/cloud.json'), old);
  fail = { path: '/api/v1/shares/Abc1234567/finalize', disconnect: 10 }; const r = await cli(['share', '--private', '--no-review',  project, '--format=json']); expect(r.json().error.code).toBe('NETWORK');
  expect(calls.filter(c => c.path.endsWith('/finalize')).map(c => c.body)).toEqual(Array(4).fill({ uploadId: 'upload-1' })); expect(await readFile(join(project, '.joplo/cloud.json'), 'utf8')).toBe(old);
});
test('无效服务器 URL 不回显 URL 中的秘密，也不联网', async () => {
  const r = await cli(['whoami', '--server', 'https://user:' + token + '@example.com']); expect(r.code).toBe(2); expect(calls).toEqual([]);
});

test('logout 仅 bearer + 空对象调用 sign-out，成功后删除凭证', async () => {
  await credentials(); const r = await cli(['logout']); expect(r.code, r.stdout).toBe(0); expect(r.stdout).toContain('Signed out');
  expect(calls).toHaveLength(1); expect(calls[0]).toMatchObject({ method: 'POST', path: '/api/auth/sign-out', body: {}, headers: { authorization: `Bearer ${token}`, 'x-joplo-client': 'joplo-cli/0.1.3' } });
  await expect(stat(join(home, 'credentials.json'))).rejects.toThrow();
});
test.each(['network', '401', '503'])('logout %s 失败仅警告，仍删除本地凭证', async failure => {
  await credentials(); fail = { path: '/api/auth/sign-out', ...(failure === 'network' ? { disconnect: 1 } : { status: Number(failure) }) };
  const r = await cli(['logout']); expect(r.code).toBe(0); expect(r.stderr).toContain('Could not'); await expect(stat(join(home, 'credentials.json'))).rejects.toThrow();
});
test('logout 无凭证可重复执行，损坏凭证也可清除，不联网', async () => {
  expect((await cli(['logout'])).code).toBe(0); await mkdir(home); await writeFile(join(home, 'credentials.json'), '{broken');
  expect((await cli(['logout'])).code).toBe(0); expect(calls).toEqual([]); await expect(stat(join(home, 'credentials.json'))).rejects.toThrow();
});
test('logout 不向其他服务器发送令牌或删除它的凭证', async () => {
  await credentials('https://other.example'); const previous = await readFile(join(home, 'credentials.json'), 'utf8');
  const r = await cli(['logout']); expect(r.code).toBe(2); expect(r.stdout).not.toContain('Signed out'); expect(calls).toEqual([]); expect(await readFile(join(home, 'credentials.json'), 'utf8')).toBe(previous);
});
test('本地只检查总量和文件数；总量大于新上传限额时仍请求创建', async () => {
  await credentials(); limits.maxUploadBytes = 7; missingCount = 1;
  const r = await cli(['share', '--private', '--no-review',  project, '--format=json']); expect(r.code, r.stdout).toBe(0); expect(calls.some(c => c.path === '/api/v1/shares')).toBe(true);
});
test.each(['bytes', 'files'])('本地预检清单 %s 上限，TOO_LARGE kind=total，不创建分享', async dimension => {
  await credentials(); if (dimension === 'bytes') limits.maxTotalBytes = 22; else limits.maxFiles = 1;
  const r = await cli(['share', '--private', '--no-review',  project, '--format=json']); expect(r.json().error).toMatchObject({ code: 'TOO_LARGE', details: { kind: dimension === 'files' ? 'files' : 'total', maxBytes: limits.maxTotalBytes, actualBytes: 23, maxFiles: limits.maxFiles, actualFiles: 2 } });
  expect(r.json().error.message).toContain(dimension === 'files' ? 'File count' : 'Manifest total'); expect(calls.map(c => c.path)).toEqual(['/api/v1/me']);
});
test('服务端按缺失对象总量拒绝，显示 upload 限额和缺失的大文件', async () => {
  await credentials(); limits.maxUploadBytes = 5;
  const r = await cli(['share', '--private', '--no-review',  project, '--format=json']); expect(r.json().error).toMatchObject({ code: 'TOO_LARGE', details: { kind: 'upload', maxBytes: 5, actualBytes: 6, largestFiles: [{ path: 'assets/site.css', size: 6 }] } });
  expect(r.json().error.message).toContain('New upload'); expect(calls.filter(c => c.method === 'PUT')).toHaveLength(0);
});
test.each(['upload', 'total'])('服务端 TOO_LARGE kind=%s 只透传安全字段，不覆盖成客户端清单值', async kind => {
  await credentials(); fail = { path: '/api/v1/shares', status: 413, code: 'TOO_LARGE', details: { kind, maxBytes: 10, actualBytes: 12, largestFiles: [{ path: 'assets/demo.png', size: 12, token }], token } };
  const r = await cli(['share', '--private', '--no-review',  project, '--format=json']); expect(r.json().error.details).toEqual({ kind, maxBytes: 10, actualBytes: 12, largestFiles: [{ path: 'assets/demo.png', size: 12 }] });
  expect(r.json().error.message).toContain(kind === 'upload' ? 'New upload' : 'Manifest total');
});
test('whoami text 同时显示新上传量与清单总量，Pro 使用新 100 MiB 限额', async () => {
  plan = 'pro'; await credentials(); const r = await cli(['whoami']); expect(r.stdout).toContain('104857600'); expect(r.stdout).toContain('268435456'); expect(r.stdout).toContain('New upload'); expect(r.stdout).toContain('Manifest total');
});

test('PUT 的显式 headers 与创建响应完全相同，不补充或修改任何字段', async () => {
  await credentials(); const originalFetch = globalThis.fetch; const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(originalFetch);
  expect((await cli(['share', '--private', '--no-review',  project])).code).toBe(0);
  const put = fetchSpy.mock.calls.find(([, init]) => init?.method === 'PUT')!;
  const hash = createHash('sha256').update(files['assets/site.css']!).digest('hex');
  expect(put[1]!.headers).toEqual({ 'content-type': 'application/octet-stream', 'content-length': '6', 'if-none-match': '*', 'x-amz-checksum-sha256': Buffer.from(hash, 'hex').toString('base64') });
});
test('服务器回显令牌到 uploadId 时拒绝，不把它复制进 finalize 请求体', async () => {
  await credentials(); responses.set('/api/v1/shares', { shareId: 'Abc1234567', uploadId: token, missing: [] });
  const r = await cli(['share', '--private', '--no-review',  project, '--format=json']); expect(r.json().error.code).toBe('INVALID_RESPONSE'); expect(calls.some(c => c.path.endsWith('/finalize'))).toBe(false);
});
test('服务器回显令牌到最终 URL 时拒绝，不写 cloud.json', async () => {
  await credentials(); responses.set('/api/v1/shares/Abc1234567/finalize', { shareId: 'Abc1234567', url: base + '/s/' + token, expiresAt: null, version: 1 });
  const r = await cli(['share', '--private', '--no-review',  project, '--format=json']); expect(r.json().error.code).toBe('INVALID_RESPONSE'); await expect(stat(join(project, '.joplo/cloud.json'))).rejects.toThrow();
});
test('服务器要求上传未知 blob 时在任何 PUT 前失败', async () => {
  await credentials(); responses.set('/api/v1/shares', { shareId: 'Abc1234567', uploadId: 'upload-1', missing: [{ sha256: '0'.repeat(64), uploadUrl: base + '/blob/unknown', headers: {} }] });
  const r = await cli(['share', '--private', '--no-review',  project, '--format=json']); expect(r.json().error.code).toBe('INVALID_RESPONSE'); expect(calls.some(c => c.method === 'PUT')).toBe(false);
});
test('服务器限额诊断缺字段时仍返回 TOO_LARGE，不能编造 upload 的实际值', async () => {
  await credentials(); fail = { path: '/api/v1/shares', status: 413, code: 'TOO_LARGE', details: { kind: 'upload', token } };
  const r = await cli(['share', '--private', '--no-review',  project, '--format=json']); expect(r.json().error.code).toBe('TOO_LARGE'); expect(r.json().error.details).toBeUndefined();
});

test('R1 PUT 慢速消费 31 秒仍上传成功，不使用固定 30 秒总时限', async () => {
  await credentials(); files = { 'index.html': 'x'.repeat(1024 * 1024) }; putDelay = 31000;
  const r = await cli(['share', '--private', '--no-review',  project, '--format=json'], { sleep: async () => { throw new Error('不应中止后重试'); } });
  expect(r.code, r.stdout).toBe(0); expect(calls.filter(c => c.method === 'PUT')).toHaveLength(1);
}, 45000);
test.each(['json', 'CI', 'JOPLO_NONINTERACTIVE'])('R2 %s 即使 TTY 也不自动登录、不提示、不打开浏览器', async mode => {
  const r = await cli(['share', '--private', '--no-review',  project, ...(mode === 'json' ? ['--format=json'] : [])], { interactive: true, env: mode === 'json' ? {} : { [mode]: '1' } });
  expect(r.code).toBe(3); expect(r.stdout).toContain('AUTH_REQUIRED'); expect(r.stderr).toBe(''); expect(calls).toEqual([]); expect(browser).not.toHaveBeenCalled();
});
test.each([undefined, 0, -2, 0.1])('R4/R11 轮询 interval=%s 默认 5 秒、最小 1 秒', async interval => {
  responses.set('/api/auth/device/code', { device_code: 'device-secret', user_code: 'ABCD-EFGH', verification_uri: base + '/device', verification_uri_complete: base + '/device?user_code=ABCD-EFGH', interval, expires_in: 600 });
  expect((await cli(['login'])).code).toBe(0); expect(waits).toEqual([interval === undefined ? 5000 : 1000]);
});
test.each(['network', '500', '503', '429'])('R4 token 轮询 %s 临时故障退避后恢复', async fault => {
  fail = { path: '/api/auth/device/token', remaining: 1, ...(fault === 'network' ? { disconnect: 1 } : { status: Number(fault) }) };
  const r = await cli(['login']); expect(r.code).toBe(0); expect(waits[1]).toBeGreaterThan(waits[0]!); expect(calls.filter(c => c.path.endsWith('/token'))).toHaveLength(2);
});
test('R4 持续 503 轮询到 expires_in 截止，不无限等待', async () => {
  expires = 6; fail = { path: '/api/auth/device/token', status: 503 }; const r = await cli(['login']);
  expect(r.code).toBe(3); expect(r.stdout).toContain('AUTH_EXPIRED'); expect(clock).toBe(6000); expect(calls.filter(c => c.path.endsWith('/token')).length).toBeGreaterThan(1);
});
test.each(['network', '401'])('R4 获取 token 后 me %s 失败会尝试 sign-out，无本地凭证', async fault => {
  fail = { path: '/api/v1/me', ...(fault === 'network' ? { disconnect: 1 } : { status: 401 }) };
  const r = await cli(['login']); expect(r.code).toBe(fault === '401' ? 3 : 1); expect(calls.at(-1)).toMatchObject({ path: '/api/auth/sign-out', body: {}, headers: { authorization: `Bearer ${token}` } }); await expect(stat(join(home, 'credentials.json'))).rejects.toThrow();
});
test('R5 URL 规范化，不原样输出控制符；user_code 注入被拒绝', async () => {
  expect(httpUrl(base + '/device?x=\n\x1b[2J')).not.toMatch(/[\n\x1b]/);
  responses.set('/api/auth/device/code', { device_code: 'secret', user_code: 'ABCD\n\x1b[2J', verification_uri: base + '/device', verification_uri_complete: base + '/device?x=\n\x1b[2J', interval: 1, expires_in: 60 });
  const r = await cli(['login'], { interactive: true }); expect(r.code).toBe(1); expect(r.stdout + r.stderr).not.toContain('\x1b'); expect(browser).not.toHaveBeenCalled();
});
test('R5 账号和远端文件名的终端控制字符被移除', async () => {
  await credentials(); responses.set('/api/v1/me', { user: { ...user, email: 'a\n\x1b[2J@example.com' }, plan, limits });
  const r = await cli(['whoami']); expect(r.stdout).not.toContain('a\n'); expect(r.stdout).not.toContain('\x1b');
  responses.clear(); fail = { path: '/api/v1/shares', status: 413, details: { kind: 'upload', maxBytes: 1, actualBytes: 2, largestFiles: [{ path: 'a\n\x1b[2J.png', size: 2 }] } };
  const err = await cli(['share', '--private', '--no-review',  project]); expect(err.stdout).not.toContain('\x1b');
});
test.each([[400, 'NETWORK', 'BAD_REQUEST', 1], [403, 'AUTH_REQUIRED', 'FORBIDDEN', 1], [500, 'AUTH_REQUIRED', 'NETWORK', 4], [502, 'PLAN_REQUIRED', 'NETWORK', 4]] as const)('R6 HTTP %s 不采纳不匹配的 code=%s', async (status, code, expected, count) => {
  await credentials(); fail = { path: '/api/v1/shares/Abc1234567/finalize', status, code }; const r = await cli(['share', '--private', '--no-review',  project, '--format=json']); expect(r.json().error.code).toBe(expected); expect(calls.filter(c => c.path.endsWith('/finalize'))).toHaveLength(count);
});
test.each([400, 401, 403, 413, 429])('R6 PUT %s 永不重试', async status => {
  await credentials(); putStatus = status; const r = await cli(['share', '--private', '--no-review',  project]); expect(r.code).toBe(1); expect(calls.filter(c => c.method === 'PUT')).toHaveLength(1); expect(waits).toEqual([]);
});
test.each([['publishes', 'Hourly publications'], ['reserved_bytes', 'Hourly reserved bytes'], ['unknown', 'Cloud quota']] as const)('R7 429 kind=%s 说明限制并显示 retryAt', async (kind, label) => {
  await credentials(); fail = { path: '/api/v1/shares', status: 429, details: { kind, retryAt: '2026-11-05T19:00:00.000Z', limit: 30, actual: 31, token } };
  const r = await cli(['share', '--private', '--no-review',  project, '--format=json']); expect(r.json().error.message).toContain(label); expect(r.json().error.message).toContain('2026-11-05T19:00:00.000Z'); expect(r.json().error.details.retryAt).toBe('2026-11-05T19:00:00.000Z');
});
test('R8 logout 清理遗留 credentials.json.*.tmp，保留其他文件', async () => {
  await credentials(); await writeFile(join(home, 'credentials.json.crashed.tmp'), 'secret'); await writeFile(join(home, 'settings.json.tmp'), '{}');
  expect((await cli(['logout'])).code).toBe(0); expect(await readdir(home)).toEqual(['settings.json.tmp']);
});
test('R9 空 JOPLO_CLOUD_URL 等同未设置', () => {
  const client = new CloudClient(undefined, 'test', () => {}, () => {}, { env: { JOPLO_HOME: home, JOPLO_CLOUD_URL: '' } }); expect(client.server).toBe('https://cloud.joplo.app');
});
test('R10 文档记录新重试、配额语义和公开决策来源', async () => {
  const doc = await readFile('docs/cli.md', 'utf8'), decisions = await readFile('DECISIONS.md', 'utf8');
  expect(doc).toContain('网络错误和 5xx 最多重试 3 次'); expect(doc).toMatch(/QUOTA_EXCEEDED[^\n]*预留字节[^\n]*重试时间/); expect(doc).not.toMatch(/\b(?:20|100|256) MB\b/);
  expect(decisions.match(/- D58[^\n]*/)?.[0]).not.toMatch(/C9|C10|joplo-cloud/);
});
test('R11 读取已有 0644 凭证时收紧到 0600，并匹配规范化 --server', async () => {
  await credentials('https://cloud.joplo.app'); await fs.chmod(join(home, 'credentials.json'), 0o644);
  const client = new CloudClient('https://CLOUD.joplo.app:443/', 'test', () => {}, () => {}, { env: { JOPLO_HOME: home } });
  expect((await client.credentials())?.server).toBe('https://cloud.joplo.app'); expect((await stat(join(home, 'credentials.json'))).mode & 0o777).toBe(0o600);
});

test('R6 已收到 PUT 400 后正文断流，也绝不重试', async () => {
  await credentials(); truncatedPut = true; const r = await cli(['share', '--private', '--no-review',  project, '--format=json']);
  expect(r.json().error.code).toBe('BAD_REQUEST'); expect(calls.filter(c => c.method === 'PUT')).toHaveLength(1); expect(waits).toEqual([]);
});
test.each(['CI', 'JOPLO_NONINTERACTIVE'])('B7 显式 login 遇到 %s 仍设备授权但不打开浏览器', async mode => {
  const r = await cli(['login'], { interactive: true, env: { [mode]: '1' } }); expect(r.code).toBe(0); expect(r.stderr).toContain('ABCD-EFGH'); expect(browser).not.toHaveBeenCalled();
});
test('F2 协议间隔 60 秒不被错误退避上限截断', async () => {
  responses.set('/api/auth/device/code', { device_code: 'device-secret', user_code: 'ABCD-EFGH', verification_uri: base + '/device', verification_uri_complete: base + '/device?user_code=ABCD-EFGH', interval: 60, expires_in: 600 });
  fail = { path: '/api/auth/device/token', status: 503, remaining: 1 };
  expect((await cli(['login'])).code).toBe(0); expect(waits).toEqual([60000, 60000]);
});

test('A1 服务端 files 变体保留统一字节字段与文件数，文案区分文件数超限', async () => {
  await credentials(); fail = { path: '/api/v1/shares', status: 413, code: 'TOO_LARGE', details: { kind: 'files', maxBytes: 268435456, actualBytes: 23, maxFiles: 1, actualFiles: 2, largestFiles: [{ path: 'index.html', size: 17 }] } };
  const r = await cli(['share', '--private', '--no-review',  project, '--format=json']); expect(r.json().error.details).toEqual(fail.details); expect(r.json().error.message).toContain('File count'); expect(r.json().error.message).toContain('index.html');
  expect(await readFile('docs/cli.md', 'utf8')).toContain('`files`'); expect((await cli(['skill', 'publish'])).stdout).toContain('upload / total / files');
});
test.each([['FORBIDDEN', 'ACCOUNT_UNAVAILABLE'], ['OTHER', 'FORBIDDEN'], ['PLAN_REQUIRED', 'PLAN_REQUIRED']] as const)('A2 403 code=%s 区分账号不可用、普通禁止、付费限制', async (code, expected) => {
  await credentials(); fail = { path: '/api/v1/shares', status: 403, code }; const r = await cli(['share', '--private', '--no-review',  project, '--format=json']); expect(r.json().error.code).toBe(expected);
  if (code !== 'PLAN_REQUIRED') expect(r.stdout).not.toContain('billing'); if (code === 'FORBIDDEN') expect(r.stdout).toContain('This account cannot publish shares right now. Sign in on the website to check its status');
});
test('A3 409 表示正在发布或准备失败，提示重新 share 且不重试', async () => {
  await credentials(); fail = { path: '/api/v1/shares', status: 409, code: 'CONFLICT' }; const r = await cli(['share', '--private', '--no-review',  project]); expect(r.stdout).toContain('Another publication is in progress or upload preparation failed. Run joplo share again later'); expect(calls.filter(c => c.path === '/api/v1/shares')).toHaveLength(1);
});
test.each(['create', 'finalize', 'put'])('A4 %s 的 503 SERVICE_UNAVAILABLE 按 Retry-After 重试', async phase => {
  await credentials(); const path = phase === 'create' ? '/api/v1/shares' : phase === 'finalize' ? '/api/v1/shares/Abc1234567/finalize' : '/blob/' + createHash('sha256').update(files['assets/site.css']!).digest('hex');
  fail = { path, status: 503, code: 'SERVICE_UNAVAILABLE', retryAfter: '45', remaining: 1 };
  const r = await cli(['share', '--private', '--no-review',  project]); expect(r.code, r.stdout).toBe(0); expect(waits).toEqual([30000]); expect(calls.filter(c => c.path === path)).toHaveLength(2);
});
test('A4 create 的明确未提交响应最多重试三次，其余网络失败不重放 create', async () => {
  await credentials(); fail = { path: '/api/v1/shares', status: 503, code: 'SERVICE_UNAVAILABLE', retryAfter: '2' }; const r = await cli(['share', '--private', '--no-review',  project]); expect(r.code).toBe(1); expect(waits).toEqual([2000, 2000, 2000]); expect(calls.filter(c => c.path === fail!.path)).toHaveLength(4);
  calls = []; waits = []; fail = { path: '/api/v1/shares', disconnect: 1 }; expect((await cli(['share', '--private', '--no-review',  project])).code).toBe(1); expect(calls.filter(c => c.path === fail!.path)).toHaveLength(1);
});
test('A5 Pro 发布频率为数字 120；文档不把 null 解释为不限', async () => {
  await credentials(); plan = 'pro'; const r = await cli(['whoami', '--format=json']); expect(r.json().data.limits.publishesPerHour).toBe(120); expect(await readFile('docs/cli.md', 'utf8')).not.toContain('null` 表示不限');
});
test('B1 设备端点持续 503，第 320 秒恢复后仍在 600 秒内登录成功', async () => {
  fail = { path: '/api/auth/device/token', status: 503, until: 320000 }; const r = await cli(['login']); expect(r.code, r.stdout).toBe(0); expect(clock).toBeGreaterThanOrEqual(320000); expect(clock).toBeLessThan(600000); expect(Math.max(...waits)).toBeLessThanOrEqual(30000);
});
test('B1 设备 429 优先使用 Retry-After，并封顶 30 秒', async () => {
  fail = { path: '/api/auth/device/token', status: 429, retryAfter: '8', remaining: 1 }; expect((await cli(['login'])).code).toBe(0); expect(waits).toEqual([1000, 8000]);
});
test('B2 同服务器重新登录先写新凭证再撤销旧 token', async () => {
  await credentials(base, oldToken); const r = await cli(['login']); expect(r.code).toBe(0); expect(calls.at(-1)).toMatchObject({ path: '/api/auth/sign-out', headers: { authorization: `Bearer ${oldToken}` } }); expect(JSON.parse(await readFile(join(home, 'credentials.json'), 'utf8')).accessToken).toBe(token); expect(confirm).not.toHaveBeenCalled(); expect(revokedAfterReplacement).toBe(true);
});
test.each(['login', 'share'])('B2 %s 交互切换服务器必须确认，拒绝时保留凭证且不联网', async command => {
  await credentials('https://other.example', oldToken); confirm.mockResolvedValueOnce(false);
  const r = await cli([command, ...(command === 'share' ? [project, '--private', '--no-review'] : [])], { interactive: true }); expect(r.code).not.toBe(0); expect(confirm).toHaveBeenCalledWith('Replace the login for https://other.example. Continue?'); expect(calls).toEqual([]); expect(JSON.parse(await readFile(join(home, 'credentials.json'), 'utf8')).accessToken).toBe(oldToken);
});
test.each(['login', 'share'])('F1 %s 非交互切换服务器引导用户确认登录，不提示 logout', async command => {
  await credentials('https://other.example', oldToken); const r = await cli([command, ...(command === 'share' ? [project, '--private', '--no-review'] : [])]); expect(r.code).toBe(command === 'share' ? 3 : 2); expect(r.stdout).toContain('joplo login --server ' + base); expect(r.stdout).not.toContain('logout'); expect(calls).toEqual([]); expect(confirm).not.toHaveBeenCalled();
});
test('B3 0600 不 chmod；宽权限 chmod EROFS 只警告仍可 whoami/share', async () => {
  await credentials(); const chmod = vi.mocked(fs.chmod).mockClear(); expect((await cli(['whoami'])).code).toBe(0); expect(chmod).not.toHaveBeenCalled();
  await fs.chmod(join(home, 'credentials.json'), 0o644); chmod.mockRejectedValueOnce(Object.assign(new Error('read only'), { code: 'EROFS' }));
  const r = await cli(['whoami']); expect(r.code).toBe(0); expect(r.stderr).toContain('permissions');
  chmod.mockRejectedValueOnce(Object.assign(new Error('read only'), { code: 'EROFS' })); expect((await cli(['share', '--private', '--no-review',  project])).code).toBe(0);
});
test('B4 finalize 成功后 cloud.json 写入失败仍输出链接和成功信封', async () => {
  await credentials(); const rename = vi.mocked(fs.rename); rename.mockRejectedValueOnce(Object.assign(new Error('read only'), { code: 'EROFS' }));
  const r = await cli(['share', '--private', '--no-review',  project, '--format=json']); expect(r.code).toBe(0); expect(r.json().ok).toBe(true); expect(r.json().data.url).toContain('/s/Abc1234567/'); expect(r.stderr).toContain('Could not save the share record');
});
test('B5 PUT 最多四路并发；B11 显式携带 content-length 且完成后无 SIGINT 监听器', async () => {
  await credentials(); for (let i = 0; i < 9; i++) files[`assets/${i}.css`] = 'body' + i; missingCount = 99; putHold = 35;
  expect((await cli(['share', '--private', '--no-review',  project])).code).toBe(0); expect(maxActivePuts).toBe(4); for (const put of calls.filter(c => c.method === 'PUT')) expect(Number(put.headers['content-length'])).toBe(Buffer.byteLength(put.body));
});
test('B5 预签名 PUT 403 提示链接已过期且不重试', async () => {
  await credentials(); putStatus = 403; const r = await cli(['share', '--private', '--no-review',  project]); expect(r.stdout).toContain('The upload URL has expired. Run joplo share again'); expect(calls.filter(c => c.method === 'PUT')).toHaveLength(1);
});
test('B6 device/code 429 是 RATE_LIMITED 而非分享配额错误', async () => {
  fail = { path: '/api/auth/device/code', status: 429 }; const r = await cli(['login']); expect(r.stdout).toContain('RATE_LIMITED'); expect(r.stdout).toContain('Too many login requests. Try again later'); expect(r.stdout).not.toContain('QUOTA_EXCEEDED');
});
test('B7 login --format json 在非 TTY 仍显示验证码并轮询，JSON 不含 token', async () => {
  const r = await cli(['login', '--format=json']); expect(r.code).toBe(0); expect(r.json()).toMatchObject({ ok: true, data: { user: { id: user.id, email: user.email } } }); expect(r.stderr).toContain('ABCD-EFGH'); expect(browser).not.toHaveBeenCalled();
});
test('B8 AUTH_EXPIRED 统一退出 3', async () => {
  await credentials(); fail = { path: '/api/v1/me', status: 401 }; const r = await cli(['whoami', '--format=json']); expect(r.code).toBe(3); expect(r.json().error.code).toBe('AUTH_EXPIRED');
});
test('B9 新建 JOPLO_HOME 目录权限为 0700', async () => {
  await credentials(); expect((await stat(home)).mode & 0o777).toBe(0o700);
});
test('B10 PLAN_REQUIRED 的 billing 使用当前 server', async () => {
  await credentials();
  fail = { path: '/api/v1/shares', status: 403, code: 'PLAN_REQUIRED' }; const e = await cli(['share', '--private', '--no-review',  project]); expect(e.stdout).toContain(base + '/settings/billing'); expect(e.stdout).not.toContain('https://cloud.joplo.app/');
});
test('B11 卡住的上传最终被实际 AbortSignal 中止，清理 SIGINT 监听器', async () => {
  await credentials(); stalledPut = true; const original = AbortSignal.timeout; const timeouts: number[] = [];
  // 加速真实 AbortSignal 时钟；R1 已覆盖真实超过 30 秒的慢速成功路径。
  vi.spyOn(AbortSignal, 'timeout').mockImplementation(ms => { timeouts.push(ms); return original(ms > 30000 ? 50 : ms); });
  const r = await cli(['share', '--private', '--no-review',  project, '--format=json']); expect(r.json().error.code).toBe('NETWORK'); expect(timeouts.some(ms => ms > 30000)).toBe(true); expect(calls.filter(c => c.method === 'PUT')).toHaveLength(4);
});

test('B2 确认跨服务器后才开始设备授权并替换凭证', async () => {
  await credentials(previousBase, oldToken);
  confirm.mockImplementationOnce(async question => { expect(question).toContain(previousBase); expect(calls).toEqual([]); return true; });
  const r = await cli(['login'], { interactive: true }); expect(r.code).toBe(0); expect(confirm).toHaveBeenCalledOnce(); expect(JSON.parse(await readFile(join(home, 'credentials.json'), 'utf8'))).toMatchObject({ server: base, accessToken: token });
});
test('B2 旧会话撤销失败只警告，新凭证仍有效', async () => {
  await credentials(base, oldToken); fail = { path: '/api/auth/sign-out', status: 503 };
  const r = await cli(['login']); expect(r.code).toBe(0); expect(r.stderr).toContain('old session'); expect(JSON.parse(await readFile(join(home, 'credentials.json'), 'utf8')).accessToken).toBe(token);
});
test('B5/B11 并发失败等待在途任务结束，停止启动新对象且移除 SIGINT 监听器', async () => {
  await credentials(); for (let i = 0; i < 9; i++) files[`assets/${i}.css`] = 'body' + i; missingCount = 99; putBarrier = []; putStatus = 403;
  expect((await cli(['share', '--private', '--no-review',  project])).code).toBe(1); expect(maxActivePuts).toBe(4); expect(calls.filter(c => c.method === 'PUT')).toHaveLength(4); await vi.waitFor(() => expect(activePuts).toBe(0));
});
test('A4 Retry-After 支持 HTTP 日期，不按指数退避覆盖它', async () => {
  await credentials(); fail = { path: '/api/v1/shares', status: 503, code: 'SERVICE_UNAVAILABLE', retryAfter: new Date(10000).toUTCString(), remaining: 1 };
  expect((await cli(['share', '--private', '--no-review',  project])).code).toBe(0); expect(waits).toEqual([10000]);
});
test('A5 兼容旧 me 的 null，但不把它显示为不限', async () => {
  await credentials(); responses.set('/api/v1/me', { user, plan, limits: { ...limits, publishesPerHour: null } });
  const r = await cli(['whoami']); expect(r.code).toBe(0); expect(r.stdout).toContain('Not provided by the server'); expect(r.stdout).not.toContain('Unlimited');
});

test('B2 旧 sign-out 未确认 success 时警告，但新登录保持成功', async () => {
  await credentials(base, oldToken); responses.set('/api/auth/sign-out', { success: false });
  const r = await cli(['login']); expect(r.code).toBe(0); expect(r.stderr).toContain('old session'); expect(JSON.parse(await readFile(join(home, 'credentials.json'), 'utf8')).accessToken).toBe(token);
});

test('F1 跨服务器非交互 share 返回带目标登录命令及 credentialServer 的 AUTH_REQUIRED', async () => {
  await credentials(previousBase, oldToken); const before = await readFile(join(home, 'credentials.json'), 'utf8');
  const r = await cli(['share', '--private', '--no-review',  project, '--format=json']); expect(r.code).toBe(3);
  expect(r.json().error).toMatchObject({ code: 'AUTH_REQUIRED', details: { fix: `npx joplo login --server ${base}`, credentialServer: previousBase } });
  expect(r.stdout).not.toContain('logout'); expect(calls).toEqual([]); expect(previousCalls).toEqual([]); expect(await readFile(join(home, 'credentials.json'), 'utf8')).toBe(before);
  expect((await cli(['skill', 'publish'])).stdout).toContain('Do not run');
});
test('F2 slow_down 增加的协议间隔超过 30 秒仍完整等待', async () => {
  responses.set('/api/auth/device/code', { device_code: 'device-secret', user_code: 'ABCD-EFGH', verification_uri: base + '/device', verification_uri_complete: base + '/device?user_code=ABCD-EFGH', interval: 30, expires_in: 600 });
  deviceErrors = ['slow_down']; expect((await cli(['login'])).code).toBe(0); expect(waits).toEqual([30000, 35000]);
});
test('F3 一路 403 中止其他 503 的 30 秒等待，2 秒内返回且不再 PUT', async () => {
  await credentials(); files = { 'index.html': 'index', 'a.css': 'a', 'b.css': 'b', 'c.css': 'c', 'd.css': 'd' }; missingCount = 99; raceUploads = true; raceFailureHash = createHash('sha256').update('a').digest('hex');
  const { setTimeout: delay } = await import('node:timers/promises'); const stop = new AbortController(); const sleeps: number[] = [];
  const start = performance.now(); let expired = false; const timer = setTimeout(() => { expired = true; stop.abort(); }, 1800);
  const r = await cli(['share', '--private', '--no-review',  project, '--format=json'], { sleep: async (ms, signal) => { sleeps.push(ms); await delay(ms, undefined, { signal: signal ? AbortSignal.any([signal, stop.signal]) : stop.signal }); } }).finally(() => clearTimeout(timer));
  expect(expired).toBe(false); expect(performance.now() - start).toBeLessThan(2000); expect(r.json().error.code).toBe('UPLOAD_EXPIRED'); expect(sleeps).toContain(30000);
  expect(calls.filter(c => c.method === 'PUT')).toHaveLength(firstUploadFailure!); expect(calls.filter(c => c.method === 'PUT')).toHaveLength(4);
}, 5000);
test('F4 确认替换时 AbortError 转成 USAGE Login cancelled', async () => {
  await credentials(previousBase, oldToken); confirm.mockRejectedValueOnce(new DOMException('cancelled', 'AbortError'));
  const r = await cli(['login'], { interactive: true }); expect(r.code).toBe(2); expect(r.stdout).toContain('USAGE'); expect(r.stdout).toContain('Login cancelled'); expect(calls).toEqual([]);
});
test.each([200, 503])('F5 跨服务器登录后只向旧服务器撤销旧令牌（status=%s）', async status => {
  await credentials(previousBase, oldToken); previousStatus = status;
  const r = await cli(['login'], { interactive: true }); expect(r.code).toBe(0); expect(revokedAfterReplacement).toBe(true);
  expect(previousCalls).toHaveLength(1); expect(previousCalls[0]).toMatchObject({ path: '/api/auth/sign-out', method: 'POST', body: {}, headers: { authorization: `Bearer ${oldToken}` } });
  for (const call of calls) expect(call.headers.authorization).not.toBe(`Bearer ${oldToken}`);
  if (status === 503) expect(r.stderr).toContain('old session');
});
test.each([[undefined, '9', 9000], ['3', '9', 3000]] as const)('F6 设备 429 Retry-After=%s X-Retry-After=%s 前者优先', async (retryAfter, xRetryAfter, expected) => {
  fail = { path: '/api/auth/device/token', status: 429, remaining: 1, retryAfter, xRetryAfter }; expect((await cli(['login'])).code).toBe(0); expect(waits).toEqual([1000, expected]);
});
test('F7 Pro --new 成功但记录写入失败时清除旧 cloud.json，仍返回新链接', async () => {
  await credentials(); plan = 'pro'; await mkdir(join(project, '.joplo')); await writeFile(join(project, '.joplo/cloud.json'), JSON.stringify({ server: base, shareId: 'Old1234567', url: base + '/s/Old1234567/' }));
  vi.mocked(fs.rename).mockRejectedValueOnce(Object.assign(new Error('read only'), { code: 'EROFS' }));
  const r = await cli(['share', '--private', '--no-review',  project, '--new', '--format=json']); expect(r.code).toBe(0); expect(r.json().data.shareId).toBe('Abc1234567'); expect(r.stderr).toContain('Could not save the share record. The next publication will not update this link'); await expect(stat(join(project, '.joplo/cloud.json'))).rejects.toThrow();
  expect(calls.find(c => c.path === '/api/v1/shares')!.body.replaceShareId).toBeUndefined();
});
test('F7 删除旧 cloud.json 也失败时仅警告，仍返回成功', async () => {
  await credentials(); plan = 'pro'; const record = join(project, '.joplo/cloud.json'); await mkdir(join(project, '.joplo')); await writeFile(record, '{}');
  vi.mocked(fs.rename).mockRejectedValueOnce(new Error('write failed')); const original = (await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises')).rm;
  vi.mocked(fs.rm).mockImplementation(async (path, options) => { if (path === record) throw Object.assign(new Error('cannot remove'), { code: 'EACCES' }); return original(path, options); });
  try { const r = await cli(['share', '--private', '--no-review',  project, '--new']); expect(r.code).toBe(0); expect(r.stderr).toContain('old share record'); expect(r.stderr).toContain('Could not save the share record. The next publication will not update this link'); }
  finally { vi.mocked(fs.rm).mockImplementation(original); }
});
test('F8 新登录凭证写入失败保留旧凭证，只撤销新 token，退出 1', async () => {
  await credentials(base, oldToken); const before = await readFile(join(home, 'credentials.json'), 'utf8'); vi.mocked(fs.rename).mockRejectedValueOnce(Object.assign(new Error('read only'), { code: 'EROFS' }));
  const r = await cli(['login']); expect(r.code).toBe(1); expect(await readFile(join(home, 'credentials.json'), 'utf8')).toBe(before);
  const revokes = calls.filter(c => c.path === '/api/auth/sign-out'); expect(revokes).toHaveLength(1); expect(revokes[0]!.headers.authorization).toBe(`Bearer ${token}`); expect(await readdir(home)).toEqual(['credentials.json']);
});
test('F8 create 503 NETWORK 即使有 Retry-After 也不重放', async () => {
  await credentials(); fail = { path: '/api/v1/shares', status: 503, code: 'NETWORK', retryAfter: '1' };
  const r = await cli(['share', '--private', '--no-review',  project]); expect(r.code).toBe(1); expect(calls.filter(c => c.path === fail!.path)).toHaveLength(1); expect(waits).toEqual([]);
});

// ---------------------------------------------------------------- 嵌入（预览图 + data.embed）
const irHtml = (project: unknown) => `<html><head><script type="application/json" id="joplo-ir">${JSON.stringify({ project, home: null })}</script></head><body></body></html>`;
const irProject = { features: { f: { id: 'f', optionIds: ['f.a'], pick: 'f.a' } }, options: { 'f.a': { id: 'f.a' } }, scenarios: { 'f.a.main': { id: 'f.a.main', optionId: 'f.a' }, 'f.a.other': { id: 'f.a.other', optionId: 'f.a' } } };
/** 1200×630 的最小 PNG 头（签名 + IHDR）。 */
const png = (w = 1200, h = 630) => { const b = Buffer.alloc(33); Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(b); b.writeUInt32BE(13, 8); b.write('IHDR', 12, 'ascii'); b.writeUInt32BE(w, 16); b.writeUInt32BE(h, 20); return b; };
const manifestOf = () => calls.find(c => c.path === '/api/v1/shares')!.body.files as { path: string; size: number; contentType: string; sha256: string }[];
test('E1 share --format json 的 data.embed 与契约逐字一致；文本输出在链接后打印徽章和更多嵌入方式', async () => {
  await credentials();
  let r = await cli(['share', '--private', '--no-review',  project, '--format=json', '--title', 'Say "hi" <now> [x]']); expect(r.code, r.stdout).toBe(0);
  const page = `${base}/s/Abc1234567/`;
  expect(r.json().data.embed).toEqual({
    iframe: `<iframe src="${page}?embed=1" title="Say &quot;hi&quot; &lt;now&gt; [x] · Joplo 演示" style="width:100%;aspect-ratio:16/10;border:0" allow="fullscreen *" allowfullscreen loading="lazy"></iframe>`,
    markdown: `[![Joplo 演示 · Say "hi" <now> \\[x\\]](${page}badge.svg)](${page})`,
    badge: `${page}badge.svg`, preview: `${page}preview.png`,
  });
  expect(Object.keys(r.json().data).sort()).toEqual(['embed', 'expiresAt', 'passwordProtected', 'shareId', 'url', 'version']);
  r = await cli(['share', '--private', '--no-review',  project]); expect(r.code).toBe(0);
  const lines = r.stdout.trim().split('\n');
  expect(lines[0]).toBe(`Published ${page}`);
  expect(lines).toContain(`Add to README: [![Joplo 演示 · Invite](${page}badge.svg)](${page})`);
  expect(lines.at(-1)).toBe(`More embed options: ${base}/shares/Abc1234567`);
});
test('E1 没有 renderStep（旧 server）或项目没有场景时跳过预览图，只在 stderr 提示一行', async () => {
  await credentials();
  let r = await cli(['share', '--private', '--no-review',  project, '--format=json']); expect(r.code).toBe(0);
  expect(manifestOf().map(f => f.path)).not.toContain('_joplo/preview.png');
  expect(r.stderr.split('\n').filter(l => l.startsWith('Skipped the preview image'))).toHaveLength(1);
  renderStep = vi.fn(async () => { throw new Error('should not render without scenarios'); });
  files['index.html'] = irHtml({ features: {}, options: {}, scenarios: {} });
  r = await cli(['share', '--private', '--no-review',  project, '--format=json']); expect(r.code).toBe(0); expect(renderStep).not.toHaveBeenCalled();
  expect(r.stderr).toMatch(/Skipped the preview image \(no scenario/);
});
test('E1 没有 Playwright / 渲染失败 / 尺寸不对时 share 照常成功，清单里没有 _joplo/preview.png', async () => {
  await credentials(); files['index.html'] = irHtml(irProject);
  const failures: ((opts: any) => Promise<unknown>)[] = [
    async () => { const { JoploError } = await import('@joplo-app/core'); throw new JoploError('EXPORT_COMPONENT_MISSING', 'Exporting images and video needs the Joplo export component\nsecond line'); },
    async () => { const { JoploError } = await import('@joplo-app/core'); throw new JoploError('RENDER_FAILED', 'Screenshots need Chromium, but it failed to start\nsecond line'); },
    async (opts) => { await writeFile(opts.out, 'partial'); throw new Error('browser crashed'); },
    async (opts) => { await writeFile(opts.out, png(800, 600)); return { path: opts.out }; },
    async (opts) => { await writeFile(opts.out, 'not a png'); return { path: opts.out }; },
    async () => ({ path: 'nowhere' }),
  ];
  for (const failure of failures) {
    calls = []; renderStep = vi.fn(failure);
    const r = await cli(['share', '--private', '--no-review',  project, '--format=json']); expect(r.code, r.stdout).toBe(0);
    expect(manifestOf().map(f => f.path)).toEqual(['assets/site.css', 'index.html']);
    const notes = r.stderr.split('\n').filter(l => l.startsWith('Skipped the preview image'));
    expect(notes).toHaveLength(1);
    expect(r.json().data.embed.preview).toBe(`${base}/s/Abc1234567/preview.png`);
  }
});
test('E1 没有导出组件（D66）：share 照常成功，提示一行安装命令；不下载、不改项目的 package.json / lockfile / node_modules', async () => {
  await credentials(); files['index.html'] = irHtml(irProject);
  const pkg = '{"name":"demo","devDependencies":{"joplo":"0.2.6"}}\n';
  await writeFile(join(project, 'package.json'), pkg); await writeFile(join(project, 'package-lock.json'), '{}\n');
  await mkdir(join(project, 'node_modules/joplo'), { recursive: true }); await writeFile(join(project, 'node_modules/joplo/package.json'), '{}');
  const install = vi.fn(async () => { throw new Error('share must not install the export component'); });
  const { JoploError } = await import('@joplo-app/core');
  renderStep = vi.fn(async () => { throw new JoploError('EXPORT_COMPONENT_MISSING', 'Exporting images and video needs the Joplo export component'); });
  let stdout = '', stderr = '';
  const code = await runCli(['share', '--private', '--no-review',  project, '--format=json'], { stdout: s => stdout += s, stderr: s => stderr += s, cliVersion: '0.1.3',
    loadServer: async () => ({ buildSite: build, renderStep, installExportRuntime: install }),
    cloud: { env: { JOPLO_HOME: home, JOPLO_CLOUD_URL: base }, interactive: false, openBrowser: browser, confirm, sleep: async () => undefined, now: () => clock, check: checkProject } });
  expect(code, stdout).toBe(0);
  expect(install).not.toHaveBeenCalled();
  expect(stderr.split('\n').filter(l => l.startsWith('Skipped the preview image'))).toEqual(['Skipped the preview image (the export component is not installed; to add preview images run: npx joplo setup export). The share page will use a generic image.']);
  expect(manifestOf().map(f => f.path)).not.toContain('_joplo/preview.png');
  expect(await readFile(join(project, 'package.json'), 'utf8')).toBe(pkg);
  expect(await readFile(join(project, 'package-lock.json'), 'utf8')).toBe('{}\n');
  expect(await readdir(join(project, 'node_modules'))).toEqual(['joplo']);
});
test('E1 有渲染能力时上传默认场景第一步的 1200×630 预览图，计入新上传字节和清单总量', async () => {
  await credentials(); files['index.html'] = irHtml(irProject); missingCount = 99;
  const image = Buffer.concat([png(), Buffer.alloc(500, 7)]);
  renderStep = vi.fn(async (opts: any) => { await writeFile(opts.out, image); return { path: opts.out }; });
  const r = await cli(['share', '--private', '--no-review',  project, '--format=json']); expect(r.code, r.stdout + r.stderr).toBe(0);
  expect(renderStep).toHaveBeenCalledOnce();
  const opts = vi.mocked(renderStep).mock.calls[0]![0];
  expect(opts).toMatchObject({ projectDir: resolve(project), scenarioId: 'f.a.main', viewport: { width: 1200, height: 630 } });
  expect(opts.stepId).toBeUndefined();
  const entry = manifestOf().find(f => f.path === '_joplo/preview.png')!;
  expect(entry).toEqual({ path: '_joplo/preview.png', size: image.length, contentType: 'image/png', sha256: createHash('sha256').update(image).digest('hex') });
  const put = calls.find(c => c.method === 'PUT' && c.path === `/blob/${entry.sha256}`)!; expect(Buffer.byteLength(put.body, 'latin1')).toBeGreaterThan(0);
  expect(r.stderr).toMatch(new RegExp(`Built 3 files \\(${manifestOf().reduce((n, f) => n + f.size, 0)} bytes\\)`));
  expect(r.stderr).not.toContain('Skipped the preview image');
  // 本地清单总量预检也包含预览图
  limits.maxTotalBytes = manifestOf().reduce((n, f) => n + f.size, 0) - 1; calls = [];
  const tooLarge = await cli(['share', '--private', '--no-review',  project, '--format=json']); expect(tooLarge.json().error.code).toBe('TOO_LARGE'); expect(calls.some(c => c.path === '/api/v1/shares')).toBe(false);
});

test('CLIENT_OUTDATED：项目里装了 joplo 时提示在项目里把两个依赖升到同一版本（npx joplo@latest 会被项目版本顶替）；不在项目里才建议 npx joplo@latest', async () => {
  const { clientOutdatedMessage } = await import('../src/cloud.ts');
  const outside = await mkdtemp(join(tmpdir(), 'joplo-outdated-'));
  try {
    expect(clientOutdatedMessage(outside, {})).toContain('npx joplo@latest share');
    const project = join(outside, 'app'); await mkdir(join(project, 'node_modules/joplo'), { recursive: true });
    await writeFile(join(project, 'node_modules/joplo/package.json'), '{"name":"joplo","version":"0.2.4"}');
    await mkdir(join(project, 'src'), { recursive: true });
    for (const cwd of [project, join(project, 'src')]) {
      const msg = clientOutdatedMessage(cwd, {});
      expect(msg).toContain('npm i -D joplo@latest @joplo-app/kit@latest');
      expect(msg).toContain('then npx joplo share');
      expect(msg).not.toContain('npx joplo@latest');
    }
    await writeFile(join(project, 'pnpm-lock.yaml'), '');
    expect(clientOutdatedMessage(project, {})).toContain('pnpm add -D joplo@latest @joplo-app/kit@latest');
    expect(clientOutdatedMessage(project, { npm_config_user_agent: 'npm/11 node/24' })).toContain('npm i -D joplo@latest');
  } finally { await rm(outside, { recursive: true, force: true }); }
});
