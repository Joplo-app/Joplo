/**
 * 看板直接发布到云端（D76）的 CLI 一侧。不变量：
 * 1. 没登录时 account 返回 signedIn: false 和登录命令（默认服务器 npx joplo login；其他服务器带 --server）；
 * 2. publish 非交互：没登录时报 AUTH_REQUIRED 并带同样的登录命令，不构建、不打开浏览器；
 * 3. 已登录：account 带邮箱与套餐；令牌不出现在任何返回值里。
 */
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { createServer } from 'node:http';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { cloudBridge, loginCommand } from '../src/cloud-bridge.ts';
import { writeCredentials } from '../src/cloud.ts';

const token = 'session-token-NEVER-SHOW';
let root: string, home: string, project: string, base: string, server: ReturnType<typeof createServer>;
const build = vi.fn(async () => { throw new Error('should not build'); });
const browser = vi.fn(async () => true);

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'joplo-bridge-')); home = join(root, 'home'); project = join(root, 'project');
  await mkdir(project); build.mockClear(); browser.mockClear();
  server = createServer((req, res) => {
    res.setHeader('Content-Type', 'application/json');
    if (req.url === '/api/v1/me') return res.end(JSON.stringify({ user: { id: 'u', email: 'lin@example.com', name: 'Lin' }, plan: 'free', limits: { maxUploadBytes: 1, maxTotalBytes: 1, maxFiles: 1, publishesPerHour: 1 }, credential: { kind: 'device' } }));
    res.statusCode = 404; res.end('{}');
  });
  await new Promise<void>(r => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
});
afterEach(async () => { server.closeAllConnections(); await new Promise<void>(r => server.close(() => r())); await rm(root, { recursive: true, force: true }); });

const bridge = (env: NodeJS.ProcessEnv) => cloudBridge({ version: '0.2.10', build: build as never, render: async () => async () => undefined, deps: { env: { JOPLO_HOME: home, ...env }, openBrowser: browser, sleep: async () => undefined, now: () => 0 } });

test('登录命令：默认服务器不带 --server；设置了 JOPLO_HOME 时带上它（否则登录写进 ~/.joplo，看板读不到）', () => {
  expect(loginCommand('https://cloud.joplo.app')).toBe('npx joplo login');
  expect(loginCommand('https://c.example')).toBe('npx joplo login --server https://c.example');
  expect(loginCommand('https://cloud.joplo.app', '/tmp/jh')).toBe('JOPLO_HOME=/tmp/jh npx joplo login');
  expect(loginCommand('https://cloud.joplo.app', "/tmp/a b'c")).toBe(`JOPLO_HOME='/tmp/a b'\\''c' npx joplo login`);
  expect(loginCommand('https://cloud.joplo.app', '  ')).toBe('npx joplo login');
});

test('没登录：account 给出登录命令；publish 报 AUTH_REQUIRED 带同样的命令，不构建、不开浏览器', async () => {
  const b = bridge({ JOPLO_CLOUD_URL: base });
  expect(await b.account()).toEqual({ signedIn: false, server: base, loginCommand: `JOPLO_HOME=${home} npx joplo login --server ${base}` });
  const lines: string[] = [];
  await expect(b.publish(project, {}, l => lines.push(l))).rejects.toMatchObject({ code: 'AUTH_REQUIRED', loginCommand: `JOPLO_HOME=${home} npx joplo login --server ${base}` });
  expect(build).not.toHaveBeenCalled();
  expect(browser).not.toHaveBeenCalled();
});

test('已登录：account 带邮箱和套餐，不带令牌', async () => {
  await writeCredentials(home, { server: base, accessToken: token, user: { id: 'u', email: 'lin@example.com' }, createdAt: new Date().toISOString() });
  const a = await bridge({ JOPLO_CLOUD_URL: base }).account();
  expect(a).toEqual({ signedIn: true, server: base, email: 'lin@example.com', plan: 'free' });
  expect(JSON.stringify(a)).not.toContain(token);
});

test('登录的是另一个服务器：signedIn: false，命令带 --server', async () => {
  await writeCredentials(home, { server: 'https://other.example', accessToken: token, user: { id: 'u', email: 'x@y.z' }, createdAt: new Date().toISOString() });
  const a = await bridge({ JOPLO_CLOUD_URL: base }).account();
  expect(a).toMatchObject({ signedIn: false, loginCommand: `JOPLO_HOME=${home} npx joplo login --server ${base}` });
  expect(JSON.stringify(a)).not.toContain(token);
});
