import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { createServer, type IncomingMessage } from 'node:http';
import { mkdtemp, mkdir, writeFile, readFile, rm, stat, readdir, cp, symlink } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { runCli } from '../src/cli.ts';
import { browserLoginUrl, openBrowser, writeCredentials, CloudClient, httpUrl } from '../src/cloud.ts';

const token = 'secret-access-token-NEVER-PRINT';
const user = { id: 'user-1', email: 'user@example.com', name: 'User' };
import * as fs from 'node:fs/promises';
vi.mock('node:fs/promises', async importOriginal => {
  const actual = await importOriginal<typeof import('node:fs/promises')>();
  return { ...actual, rename: vi.fn(actual.rename) };
});

let root: string, home: string, project: string, base: string;
let server: ReturnType<typeof createServer>;
type Call = { path: string; method: string; headers: IncomingMessage['headers']; body: any };
let calls: Call[], plan: 'free' | 'pro', deviceErrors: string[], fail: { path: string; status?: number; code?: string; disconnect?: number; details?: unknown; remaining?: number } | undefined;
let limits: { maxUploadBytes: number; maxTotalBytes: number; maxFiles: number; publishesPerHour: number | null };
let seedRuntime: boolean;
let putDelay = 0;
let truncatedPut = false;
const timers = new Set<ReturnType<typeof setTimeout>>();
let responses: Map<string, unknown>;
let putStatus: number, expires: number, clock: number, waits: number[], files: Record<string, string>, missingCount: number;
const browser = vi.fn(async (_url: string) => true);
const build = vi.fn(async ({ outDir }: { outDir?: string }) => {
  for (const [p, content] of Object.entries(files)) { await mkdir(join(outDir!, p, '..'), { recursive: true }); await writeFile(join(outDir!, p), content); }
  return { outDir: outDir!, files: Object.keys(files), diagnostics: [], routes: [], scenarios: [] };
});
const checkProject = vi.fn(async () => ({ name: 'Invite', diagnostics: [], summary: { error: 0, warning: 0, info: 0 }, verification: {} }));
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'joplo-cloud-test-')); home = join(root, 'home'); project = join(root, 'project');
  await mkdir(project); calls = []; plan = 'free'; deviceErrors = []; fail = undefined; putStatus = 200; expires = 600; clock = 0; waits = []; missingCount = 1;
  truncatedPut = false; putDelay = 0; responses = new Map(); seedRuntime = false; limits = { maxUploadBytes: 20 * 1024 * 1024, maxTotalBytes: 256 * 1024 * 1024, maxFiles: 2000, publishesPerHour: 30 };
  files = { 'index.html': '<html>demo</html>', 'assets/site.css': 'body{}' }; browser.mockClear(); build.mockClear(); checkProject.mockClear();
  server = createServer(async (req, res) => {
    if (req.method === 'PUT' && putDelay) {
      req.pause(); await new Promise<void>(r => { const timer = setTimeout(() => { timers.delete(timer); r(); }, putDelay); timers.add(timer); }); req.resume();
    }
    const chunks: Buffer[] = []; for await (const chunk of req) chunks.push(chunk);
    const raw = Buffer.concat(chunks).toString(); let body: any = raw; try { body = JSON.parse(raw); } catch { /* PUT */ }
    const path = req.url!; calls.push({ path, method: req.method!, headers: req.headers, body });
    res.setHeader('Content-Type', 'application/json');
    const send = (value: unknown) => res.end(JSON.stringify(value));
    if (responses.has(path)) { send(responses.get(path)); return; }
    if (fail && path === fail.path && fail.remaining !== 0) {
      if (fail.remaining !== undefined) fail.remaining--;
      if (fail.disconnect) { fail.disconnect--; req.socket.destroy(); return; }
      if (fail.status) { res.statusCode = fail.status; send({ code: fail.code, message: token, data: fail.details ?? { token } }); return; }
    }
    if (path === '/api/auth/device/code') { send({ device_code: 'device-secret', user_code: 'ABCD-EFGH', verification_uri: base + '/device', verification_uri_complete: base + '/device?user_code=ABCD-EFGH', interval: 1, expires_in: expires }); return; }
    if (path === '/api/auth/device/token') { const error = deviceErrors.shift(); if (error) { res.statusCode = 400; send({ error, error_description: token }); } else send({ access_token: token, token_type: 'Bearer', expires_in: 3600 }); return; }
    if (path === '/api/v1/me') { send({ user, plan, limits: { ...limits, ...(plan === 'pro' ? { maxUploadBytes: 100 * 1024 * 1024, publishesPerHour: null } : {}) }, access_token: token }); return; }
    if (path === '/api/v1/shares') {
      if (!body.title || !Array.isArray(body.files) || body.files.some((f: any) => !/^[a-f0-9]{64}$/.test(f.sha256))) { res.statusCode = 400; send({ code: 'BAD_REQUEST' }); return; }
      const totalBytes = body.files.reduce((n: number, f: any) => n + f.size, 0);
      const missing = [...new Map<string, any>(body.files.map((f: any) => [f.sha256, f])).values()].filter((f: any) => !seedRuntime || !f.path.startsWith('assets/')).slice(0, missingCount);
      const uploadBytes = missing.reduce((n: number, f: any) => n + f.size, 0);
      const maxUploadBytes = plan === 'free' ? limits.maxUploadBytes : 100 * 1024 * 1024;
      if (totalBytes > limits.maxTotalBytes || body.files.length > limits.maxFiles || uploadBytes > maxUploadBytes) {
        const kind = totalBytes > limits.maxTotalBytes || body.files.length > limits.maxFiles ? 'total' : 'upload';
        const largestFiles = [...(kind === 'total' ? body.files : missing)].sort((a, b) => b.size - a.size).slice(0, 5).map(({ path, size }) => ({ path, size }));
        res.statusCode = 413; send({ code: 'TOO_LARGE', message: token, data: { kind, maxBytes: kind === 'total' ? limits.maxTotalBytes : maxUploadBytes, actualBytes: kind === 'total' ? totalBytes : uploadBytes, largestFiles, token } }); return;
      }
      send({ shareId: 'Abc1234567', uploadId: 'upload-1', missing: missing.map((f: any) => ({ sha256: f.sha256, uploadUrl: base + '/blob/' + f.sha256, headers: { 'content-type': 'application/octet-stream', 'if-none-match': '*', 'x-amz-checksum-sha256': Buffer.from(f.sha256, 'hex').toString('base64') } })) }); return;
    }
    if (path.startsWith('/blob/')) {
      if (truncatedPut) { res.writeHead(400, { 'content-length': '100' }); res.flushHeaders(); const timer = setTimeout(() => { timers.delete(timer); res.destroy(); }, 30); timers.add(timer); return; }
      res.statusCode = putStatus; res.end(); return;
    }
    if (path === '/api/v1/shares/Abc1234567/finalize') { send({ shareId: 'Abc1234567', url: base + '/s/Abc1234567/', expiresAt: plan === 'free' ? '2026-11-05T12:00:00.000Z' : null, version: 1 }); return; }
    if (path === '/api/auth/sign-out') { if (req.headers.authorization !== `Bearer ${token}` || Object.keys(body).length) res.statusCode = 400; send({ success: res.statusCode === 200 }); return; }
    res.statusCode = 404; send({ code: 'NOT_FOUND' });
  });
  await new Promise<void>(r => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
});
afterEach(async () => { for (const timer of timers) clearTimeout(timer); timers.clear(); server.closeAllConnections(); await new Promise<void>(r => server.close(() => r())); await rm(root, { recursive: true, force: true }); vi.restoreAllMocks(); });
async function credentials(serverUrl = base) {
  await writeCredentials(home, { server: serverUrl, accessToken: token, user: { id: user.id, email: user.email }, createdAt: new Date().toISOString() });
}
async function cli(args: string[], options: { interactive?: boolean; ssh?: string; realBuild?: boolean; env?: NodeJS.ProcessEnv; sleep?: (ms: number) => Promise<unknown> } = {}) {
  let stdout = '', stderr = '';
  const code = await runCli(args, { stdout: s => stdout += s, stderr: s => stderr += s, cliVersion: '0.1.3',
    ...(options.realBuild ? {} : { loadServer: async () => ({ buildSite: build, startDev: async () => ({ url: 'http://localhost:4790', attached: true }) }) }),
    cloud: { env: { JOPLO_HOME: home, JOPLO_CLOUD_URL: base, SSH_CONNECTION: options.ssh, ...options.env }, interactive: options.interactive ?? false,
      openBrowser: browser, sleep: options.sleep ?? (async ms => { waits.push(ms); clock += ms; }), now: () => clock, ...(options.realBuild ? {} : { check: checkProject }) },
  });
  expect(stdout + stderr).not.toContain(token);
  for (const call of calls) {
    expect(JSON.stringify({ path: call.path, body: call.body, headers: { ...call.headers, authorization: undefined } })).not.toContain(token);
    if (call.headers.authorization) expect(call.headers.authorization).toBe(`Bearer ${token}`);
  }
  return { code, stdout, stderr, json: () => JSON.parse(stdout) };
}
test('缺凭证：share 非交互立即返回 AUTH_REQUIRED/3，不联网、不构建、不打开浏览器', async () => {
  const r = await cli(['share', project, '--format', 'json']); expect(r.code).toBe(3); expect(r.json()).toMatchObject({ ok: false, error: { code: 'AUTH_REQUIRED' }, diagnostics: [] });
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
  deviceErrors = [error]; const r = await cli(['login']); expect(r.code).toBe(1); expect(r.stdout).toMatch(/重新|拒绝/); await expect(stat(join(home, 'credentials.json'))).rejects.toThrow();
});
test('本地授权期限耗尽停止轮询', async () => { expires = 1; deviceErrors = ['authorization_pending']; const r = await cli(['login']); expect(r.code).toBe(1); expect(calls.filter(c => c.path.endsWith('/token')).length).toBeLessThanOrEqual(1); });
test.each(['{bad', '{}', '{"accessToken":"secret-access-token-NEVER-PRINT"}'])('损坏或缺字段凭证视为未登录并提示重登：%s', async data => {
  await mkdir(home); await writeFile(join(home, 'credentials.json'), data); const r = await cli(['whoami', '--format=json']); expect(r.code).toBe(3); expect(r.stderr).toContain('重新'); expect(calls).toEqual([]);
});
test('whoami 仅返回账号、套餐、限额；401 指向重新 login', async () => {
  await credentials(); let r = await cli(['whoami', '--format', 'json']); expect(r.code).toBe(0); expect(r.json().data).toEqual({ user, plan, limits });
  fail = { path: '/api/v1/me', status: 401, code: 'AUTH_EXPIRED' }; r = await cli(['whoami', '--format=json']); expect(r.json().error.code).toBe('AUTH_EXPIRED'); expect(r.stdout).toContain('login');
});
test('share 只上传 missing、保留签名 headers、412 成功、finalize 重试 uploadId 不变', async () => {
  await credentials(); putStatus = 412; fail = { path: '/api/v1/shares/Abc1234567/finalize', disconnect: 1 };
  const r = await cli(['share', project, '--format=json']); expect(r.code, r.stdout).toBe(0);
  expect(checkProject).toHaveBeenCalledBefore(build); const puts = calls.filter(c => c.method === 'PUT'); expect(puts).toHaveLength(1);
  const hash = createHash('sha256').update(files['assets/site.css']!).digest('hex'); expect(puts[0]!.path).toBe('/blob/' + hash);
  expect(puts[0]!.headers).toMatchObject({ 'content-type': 'application/octet-stream', 'if-none-match': '*', 'x-amz-checksum-sha256': Buffer.from(hash, 'hex').toString('base64') });
  expect(puts[0]!.headers.authorization).toBeUndefined(); expect(puts[0]!.headers['x-joplo-client']).toBeUndefined();
  expect(calls.filter(c => c.path.endsWith('/finalize')).map(c => c.body)).toEqual([{ uploadId: 'upload-1' }, { uploadId: 'upload-1' }]);
  expect(JSON.parse(await readFile(join(project, '.joplo/cloud.json'), 'utf8'))).toEqual({ server: base, shareId: r.json().data.shareId, url: r.json().data.url });
  expect(r.json().data.expiresAt).toBe('2026-11-05T12:00:00.000Z'); await expect(stat(build.mock.calls[0]![0].outDir!)).rejects.toThrow();
});
test.each([['free', false, true, false], ['pro', false, true, true], ['pro', true, true, false], ['pro', false, false, false]] as const)('replaceShareId plan=%s new=%s sameServer=%s', async (p, fresh, sameServer, replace) => {
  plan = p; await credentials(); await mkdir(join(project, '.joplo')); await writeFile(join(project, '.joplo/cloud.json'), JSON.stringify({ server: sameServer ? base : 'https://other.example', shareId: 'Old1234567', url: base + '/s/Old1234567/' }));
  const r = await cli(['share', project, '--title', 'Custom', ...(fresh ? ['--new'] : [])]); expect(r.code).toBe(0);
  expect(calls.find(c => c.path === '/api/v1/shares')!.body).toMatchObject({ title: 'Custom' }); expect(calls.find(c => c.path === '/api/v1/shares')!.body.replaceShareId).toBe(replace ? 'Old1234567' : undefined);
  if (p === 'free') expect(r.stdout).toContain('https://app.joplo.app/billing');
});
test('交互 share 自动登录后继续发布', async () => { expect((await cli(['share', project], { interactive: true })).code).toBe(0); expect(browser).toHaveBeenCalledOnce(); expect(calls.some(c => c.path.endsWith('/finalize'))).toBe(true); });
test('白名单外文件与不安全路径在上传前列出并拒绝', async () => {
  await credentials(); files = { ...files, 'assets/movie.mp4': 'video', 'assets/readme.txt': 'text', 'assets/a%20.png': 'png' };
  const r = await cli(['share', project, '--format=json']); expect(r.code).toBe(1); for (const name of ['movie.mp4', 'readme.txt', 'a%20.png']) expect(r.stdout).toContain(name); expect(calls).toEqual([]);
});
test.each([[401, 'AUTH_EXPIRED'], [403, 'PLAN_REQUIRED'], [413, 'TOO_LARGE'], [429, 'QUOTA_EXCEEDED'], [426, 'CLIENT_OUTDATED'], [503, 'NETWORK']] as const)('share %s %s 使用结果信封且不回显服务端正文', async (status, code) => {
  await credentials(); fail = { path: '/api/v1/shares', status, code, ...(code === 'TOO_LARGE' ? { details: { kind: 'upload', maxBytes: 5, actualBytes: 6, largestFiles: [{ path: 'assets/site.css', size: 6 }] } } : {}) }; const r = await cli(['share', project, '--format=json']); expect(r.code).toBe(1); expect(r.json().error.code).toBe(code);
  if (code === 'TOO_LARGE') expect(r.json().error.details).toMatchObject({ kind: 'upload', maxBytes: 5, actualBytes: 6, largestFiles: [{ path: 'assets/site.css', size: 6 }] });
  expect(calls.some(c => c.method === 'PUT')).toBe(false);
});
test('网络中断最多重试三次，失败后无 cloud.json', async () => {
  await credentials(); fail = { path: '/blob/' + createHash('sha256').update(files['assets/site.css']!).digest('hex'), disconnect: 20 };
  const r = await cli(['share', project, '--format=json']); expect(r.json().error.code).toBe('NETWORK'); expect(calls.filter(c => c.method === 'PUT')).toHaveLength(4); expect(waits).toEqual([1000, 2000, 4000]); await expect(stat(join(project, '.joplo/cloud.json'))).rejects.toThrow();
});
test('不同 server 的凭证不发送到覆盖地址', async () => { await credentials('https://other.example'); const r = await cli(['whoami', '--server', base, '--format=json']); expect(r.code).toBe(3); expect(calls).toEqual([]); });
test('本地 check/build/dev/skill 不发云端请求', async () => {
  const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('unexpected network'));
  await cli(['build', project]); await cli(['dev', project]); await cli(['skill', 'publish']); await cli(['check', project]); expect(calls).toEqual([]); expect(fetchSpy).not.toHaveBeenCalled();
});
test('真实 examples/invite 免费 share：预置共用运行时后成功，MIME 全部符合白名单', async () => {
  seedRuntime = true; await credentials(); await cp('examples/invite', project, { recursive: true }); await symlink(resolve('node_modules'), join(root, 'node_modules')); await writeFile(join(root, 'package.json'), '{"type":"module"}');
  missingCount = 9999; const r = await cli(['share', project, '--format=json'], { realBuild: true }); expect(r.code, r.stdout + r.stderr).toBe(0);
  const manifest = calls.find(c => c.path === '/api/v1/shares')!.body.files;
  const allowed = ['text/html; charset=utf-8', 'text/css; charset=utf-8', 'text/javascript; charset=utf-8', 'application/json', 'image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/svg+xml', 'font/woff2', 'font/woff', 'font/ttf'];
  for (const file of manifest) expect(allowed).toContain(file.contentType);
  expect(manifest.reduce((n: number, f: any) => n + f.size, 0)).toBeGreaterThan(limits.maxUploadBytes);
  expect(calls.filter(c => c.method === 'PUT')).toHaveLength(1);
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
  browser.mockResolvedValueOnce(false); const r = await cli(['login'], { interactive: true }); expect(r.code).toBe(0); expect(r.stderr).toContain('手动');
  const oldPath = process.env.PATH; process.env.PATH = '';
  try { expect(await openBrowser(base + '/device', 'linux')).toBe(false); } finally { process.env.PATH = oldPath; }
});
test.each(['/api/auth/device/code', '/api/v1/me'])('login 网络中断 %s 受控失败且不写凭证', async path => {
  fail = { path, disconnect: 1 }; const r = await cli(['login']); expect(r.code).toBe(1); expect(r.stdout).toContain('NETWORK'); await expect(stat(join(home, 'credentials.json'))).rejects.toThrow();
});
test('检查失败从不 build 或上传；build 有错误时从不上传', async () => {
  await credentials(); checkProject.mockResolvedValueOnce({ name: 'Invalid', diagnostics: [], summary: { error: 1, warning: 0, info: 0 }, verification: {} });
  expect((await cli(['share', project])).code).toBe(1); expect(build).not.toHaveBeenCalled(); expect(calls).toEqual([]);
  build.mockImplementationOnce(async ({ outDir }) => ({ outDir: outDir!, files: [], routes: [], scenarios: [], diagnostics: [{ severity: 'error', code: 'LOAD_FAILED', message: 'broken', source: 'schema' }] } as any));
  expect((await cli(['share', project])).code).toBe(1); expect(calls).toEqual([]);
});
test('missing 为空时不发 PUT；manifest 的 hash/size 和实际字节一致', async () => {
  await credentials(); missingCount = 0; const r = await cli(['share', project]); expect(r.code).toBe(0); expect(calls.filter(c => c.method === 'PUT')).toEqual([]);
  for (const f of calls.find(c => c.path === '/api/v1/shares')!.body.files) { expect(f.size).toBe(Buffer.byteLength(files[f.path]!)); expect(f.sha256).toBe(createHash('sha256').update(files[f.path]!).digest('hex')); }
});
test('PUT 网络中断后重试成功；原 headers 和字节保持一致', async () => {
  await credentials(); fail = { path: '/blob/' + createHash('sha256').update(files['assets/site.css']!).digest('hex'), disconnect: 1 };
  expect((await cli(['share', project])).code).toBe(0); const puts = calls.filter(c => c.method === 'PUT'); expect(puts).toHaveLength(2); expect(puts[0]!.body).toEqual(puts[1]!.body);
  for (const key of ['content-type', 'if-none-match', 'x-amz-checksum-sha256']) expect(puts[0]!.headers[key]).toBe(puts[1]!.headers[key]); expect(waits).toEqual([1000]);
});
test('finalize 重试耗尽时所有 uploadId 相同且保留旧 cloud.json', async () => {
  await credentials(); await mkdir(join(project, '.joplo')); const old = JSON.stringify({ server: base, shareId: 'Old1234567', url: base + '/s/Old1234567/' }); await writeFile(join(project, '.joplo/cloud.json'), old);
  fail = { path: '/api/v1/shares/Abc1234567/finalize', disconnect: 10 }; const r = await cli(['share', project, '--format=json']); expect(r.json().error.code).toBe('NETWORK');
  expect(calls.filter(c => c.path.endsWith('/finalize')).map(c => c.body)).toEqual(Array(4).fill({ uploadId: 'upload-1' })); expect(await readFile(join(project, '.joplo/cloud.json'), 'utf8')).toBe(old);
});
test('无效服务器 URL 不回显 URL 中的秘密，也不联网', async () => {
  const r = await cli(['whoami', '--server', 'https://user:' + token + '@example.com']); expect(r.code).toBe(2); expect(calls).toEqual([]);
});

test('logout 仅 bearer + 空对象调用 sign-out，成功后删除凭证', async () => {
  await credentials(); const r = await cli(['logout']); expect(r.code, r.stdout).toBe(0); expect(r.stdout).toContain('已退出登录');
  expect(calls).toHaveLength(1); expect(calls[0]).toMatchObject({ method: 'POST', path: '/api/auth/sign-out', body: {}, headers: { authorization: `Bearer ${token}`, 'x-joplo-client': 'joplo-cli/0.1.3' } });
  await expect(stat(join(home, 'credentials.json'))).rejects.toThrow();
});
test.each(['network', '401', '503'])('logout %s 失败仅警告，仍删除本地凭证', async failure => {
  await credentials(); fail = { path: '/api/auth/sign-out', ...(failure === 'network' ? { disconnect: 1 } : { status: Number(failure) }) };
  const r = await cli(['logout']); expect(r.code).toBe(0); expect(r.stderr).toContain('未能'); await expect(stat(join(home, 'credentials.json'))).rejects.toThrow();
});
test('logout 无凭证可重复执行，损坏凭证也可清除，不联网', async () => {
  expect((await cli(['logout'])).code).toBe(0); await mkdir(home); await writeFile(join(home, 'credentials.json'), '{broken');
  expect((await cli(['logout'])).code).toBe(0); expect(calls).toEqual([]); await expect(stat(join(home, 'credentials.json'))).rejects.toThrow();
});
test('logout 不向其他服务器发送令牌或删除它的凭证', async () => {
  await credentials('https://other.example'); const previous = await readFile(join(home, 'credentials.json'), 'utf8');
  const r = await cli(['logout']); expect(r.code).toBe(2); expect(r.stdout).not.toContain('已退出登录'); expect(calls).toEqual([]); expect(await readFile(join(home, 'credentials.json'), 'utf8')).toBe(previous);
});
test('本地只检查总量和文件数；总量大于新上传限额时仍请求创建', async () => {
  await credentials(); limits.maxUploadBytes = 7; missingCount = 1;
  const r = await cli(['share', project, '--format=json']); expect(r.code, r.stdout).toBe(0); expect(calls.some(c => c.path === '/api/v1/shares')).toBe(true);
});
test.each(['bytes', 'files'])('本地预检清单 %s 上限，TOO_LARGE kind=total，不创建分享', async dimension => {
  await credentials(); if (dimension === 'bytes') limits.maxTotalBytes = 22; else limits.maxFiles = 1;
  const r = await cli(['share', project, '--format=json']); expect(r.json().error).toMatchObject({ code: 'TOO_LARGE', details: { kind: 'total', maxBytes: limits.maxTotalBytes, actualBytes: 23, maxFiles: limits.maxFiles, actualFiles: 2 } });
  expect(r.json().error.message).toContain('清单总量'); expect(calls.map(c => c.path)).toEqual(['/api/v1/me']);
});
test('服务端按缺失对象总量拒绝，显示 upload 限额和缺失的大文件', async () => {
  await credentials(); limits.maxUploadBytes = 5;
  const r = await cli(['share', project, '--format=json']); expect(r.json().error).toMatchObject({ code: 'TOO_LARGE', details: { kind: 'upload', maxBytes: 5, actualBytes: 6, largestFiles: [{ path: 'assets/site.css', size: 6 }] } });
  expect(r.json().error.message).toContain('本次新增上传'); expect(calls.filter(c => c.method === 'PUT')).toHaveLength(0);
});
test.each(['upload', 'total'])('服务端 TOO_LARGE kind=%s 只透传安全字段，不覆盖成客户端清单值', async kind => {
  await credentials(); fail = { path: '/api/v1/shares', status: 413, code: 'TOO_LARGE', details: { kind, maxBytes: 10, actualBytes: 12, largestFiles: [{ path: 'assets/demo.png', size: 12, token }], token } };
  const r = await cli(['share', project, '--format=json']); expect(r.json().error.details).toEqual({ kind, maxBytes: 10, actualBytes: 12, largestFiles: [{ path: 'assets/demo.png', size: 12 }] });
  expect(r.json().error.message).toContain(kind === 'upload' ? '本次新增上传' : '清单总量');
});
test('whoami text 同时显示新上传量与清单总量，Pro 使用新 100 MiB 限额', async () => {
  plan = 'pro'; await credentials(); const r = await cli(['whoami']); expect(r.stdout).toContain('104857600'); expect(r.stdout).toContain('268435456'); expect(r.stdout).toContain('新增上传'); expect(r.stdout).toContain('清单总量');
});

test('PUT 的显式 headers 与创建响应完全相同，不补充或修改任何字段', async () => {
  await credentials(); const originalFetch = globalThis.fetch; const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(originalFetch);
  expect((await cli(['share', project])).code).toBe(0);
  const put = fetchSpy.mock.calls.find(([, init]) => init?.method === 'PUT')!;
  const hash = createHash('sha256').update(files['assets/site.css']!).digest('hex');
  expect(put[1]!.headers).toEqual({ 'content-type': 'application/octet-stream', 'if-none-match': '*', 'x-amz-checksum-sha256': Buffer.from(hash, 'hex').toString('base64') });
});
test('服务器回显令牌到 uploadId 时拒绝，不把它复制进 finalize 请求体', async () => {
  await credentials(); responses.set('/api/v1/shares', { shareId: 'Abc1234567', uploadId: token, missing: [] });
  const r = await cli(['share', project, '--format=json']); expect(r.json().error.code).toBe('INVALID_RESPONSE'); expect(calls.some(c => c.path.endsWith('/finalize'))).toBe(false);
});
test('服务器回显令牌到最终 URL 时拒绝，不写 cloud.json', async () => {
  await credentials(); responses.set('/api/v1/shares/Abc1234567/finalize', { shareId: 'Abc1234567', url: base + '/s/' + token, expiresAt: null, version: 1 });
  const r = await cli(['share', project, '--format=json']); expect(r.json().error.code).toBe('INVALID_RESPONSE'); await expect(stat(join(project, '.joplo/cloud.json'))).rejects.toThrow();
});
test('服务器要求上传未知 blob 时在任何 PUT 前失败', async () => {
  await credentials(); responses.set('/api/v1/shares', { shareId: 'Abc1234567', uploadId: 'upload-1', missing: [{ sha256: '0'.repeat(64), uploadUrl: base + '/blob/unknown', headers: {} }] });
  const r = await cli(['share', project, '--format=json']); expect(r.json().error.code).toBe('INVALID_RESPONSE'); expect(calls.some(c => c.method === 'PUT')).toBe(false);
});
test('服务器限额诊断缺字段时仍返回 TOO_LARGE，不能编造 upload 的实际值', async () => {
  await credentials(); fail = { path: '/api/v1/shares', status: 413, code: 'TOO_LARGE', details: { kind: 'upload', token } };
  const r = await cli(['share', project, '--format=json']); expect(r.json().error.code).toBe('TOO_LARGE'); expect(r.json().error.details).toBeUndefined();
});

test('R1 PUT 慢速消费 31 秒仍上传成功，不使用固定 30 秒总时限', async () => {
  await credentials(); files = { 'index.html': 'x'.repeat(1024 * 1024) }; putDelay = 31000;
  const r = await cli(['share', project, '--format=json'], { sleep: async () => { throw new Error('不应中止后重试'); } });
  expect(r.code, r.stdout).toBe(0); expect(calls.filter(c => c.method === 'PUT')).toHaveLength(1);
}, 45000);
test.each(['json', 'CI', 'JOPLO_NONINTERACTIVE'])('R2 %s 即使 TTY 也不自动登录、不提示、不打开浏览器', async mode => {
  const r = await cli(['share', project, ...(mode === 'json' ? ['--format=json'] : [])], { interactive: true, env: mode === 'json' ? {} : { [mode]: '1' } });
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
  expect(r.code).toBe(1); expect(r.stdout).toContain('AUTH_EXPIRED'); expect(clock).toBe(6000); expect(calls.filter(c => c.path.endsWith('/token')).length).toBeGreaterThan(1);
});
test.each(['network', '401'])('R4 获取 token 后 me %s 失败会尝试 sign-out，无本地凭证', async fault => {
  fail = { path: '/api/v1/me', ...(fault === 'network' ? { disconnect: 1 } : { status: 401 }) };
  const r = await cli(['login']); expect(r.code).toBe(1); expect(calls.at(-1)).toMatchObject({ path: '/api/auth/sign-out', body: {}, headers: { authorization: `Bearer ${token}` } }); await expect(stat(join(home, 'credentials.json'))).rejects.toThrow();
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
  const err = await cli(['share', project]); expect(err.stdout).not.toContain('\x1b');
});
test.each([[400, 'NETWORK', 'BAD_REQUEST', 1], [403, 'AUTH_REQUIRED', 'PLAN_REQUIRED', 1], [500, 'AUTH_REQUIRED', 'NETWORK', 4], [502, 'PLAN_REQUIRED', 'NETWORK', 4]] as const)('R6 HTTP %s 不采纳不匹配的 code=%s', async (status, code, expected, count) => {
  await credentials(); fail = { path: '/api/v1/shares/Abc1234567/finalize', status, code }; const r = await cli(['share', project, '--format=json']); expect(r.json().error.code).toBe(expected); expect(calls.filter(c => c.path.endsWith('/finalize'))).toHaveLength(count);
});
test.each([400, 401, 403, 413, 429])('R6 PUT %s 永不重试', async status => {
  await credentials(); putStatus = status; const r = await cli(['share', project]); expect(r.code).toBe(1); expect(calls.filter(c => c.method === 'PUT')).toHaveLength(1); expect(waits).toEqual([]);
});
test.each([['publishes', '每小时发布次数'], ['reserved_bytes', '每小时预留字节'], ['unknown', '云端额度']] as const)('R7 429 kind=%s 说明限制并显示 retryAt', async (kind, label) => {
  await credentials(); fail = { path: '/api/v1/shares', status: 429, details: { kind, retryAt: '2026-11-05T19:00:00.000Z', limit: 30, actual: 31, token } };
  const r = await cli(['share', project, '--format=json']); expect(r.json().error.message).toContain(label); expect(r.json().error.message).toContain('2026-11-05T19:00:00.000Z'); expect(r.json().error.details.retryAt).toBe('2026-11-05T19:00:00.000Z');
});
test('R8 logout 清理遗留 credentials.json.*.tmp，保留其他文件', async () => {
  await credentials(); await writeFile(join(home, 'credentials.json.crashed.tmp'), 'secret'); await writeFile(join(home, 'settings.json.tmp'), '{}');
  expect((await cli(['logout'])).code).toBe(0); expect(await readdir(home)).toEqual(['settings.json.tmp']);
});
test('R9 空 JOPLO_CLOUD_URL 等同未设置', () => {
  const client = new CloudClient(undefined, 'test', () => {}, () => {}, { env: { JOPLO_HOME: home, JOPLO_CLOUD_URL: '' } }); expect(client.server).toBe('https://app.joplo.app');
});
test('R10 文档记录新重试、配额语义和公开决策来源', async () => {
  const doc = await readFile('docs/cli.md', 'utf8'), decisions = await readFile('DECISIONS.md', 'utf8');
  expect(doc).toContain('网络错误和 5xx 最多重试 3 次'); expect(doc).toMatch(/QUOTA_EXCEEDED[^\n]*预留字节[^\n]*重试时间/); expect(doc).not.toMatch(/\b(?:20|100|256) MB\b/);
  expect(decisions.match(/- D57[^\n]*/)?.[0]).not.toMatch(/C9|C10|joplo-cloud/);
});
test('R11 读取已有 0644 凭证时收紧到 0600，并匹配规范化 --server', async () => {
  await credentials('https://app.joplo.app'); await fs.chmod(join(home, 'credentials.json'), 0o644);
  const client = new CloudClient('https://APP.joplo.app:443/', 'test', () => {}, () => {}, { env: { JOPLO_HOME: home } });
  expect((await client.credentials())?.server).toBe('https://app.joplo.app'); expect((await stat(join(home, 'credentials.json'))).mode & 0o777).toBe(0o600);
});

test('R6 已收到 PUT 400 后正文断流，也绝不重试', async () => {
  await credentials(); truncatedPut = true; const r = await cli(['share', project, '--format=json']);
  expect(r.json().error.code).toBe('BAD_REQUEST'); expect(calls.filter(c => c.method === 'PUT')).toHaveLength(1); expect(waits).toEqual([]);
});
test.each(['CI', 'JOPLO_NONINTERACTIVE'])('R2 显式 login 遇到 %s 也不启动授权、不输出提示', async mode => {
  const r = await cli(['login'], { interactive: true, env: { [mode]: '1' } }); expect(r.code).toBe(3); expect(r.stderr).toBe(''); expect(calls).toEqual([]); expect(browser).not.toHaveBeenCalled();
});
test('R4/R11 网络退避不能缩短服务器给出的长轮询间隔', async () => {
  responses.set('/api/auth/device/code', { device_code: 'device-secret', user_code: 'ABCD-EFGH', verification_uri: base + '/device', verification_uri_complete: base + '/device?user_code=ABCD-EFGH', interval: 60, expires_in: 600 });
  fail = { path: '/api/auth/device/token', status: 503, remaining: 1 };
  expect((await cli(['login'])).code).toBe(0); expect(waits).toEqual([60000, 120000]);
});
