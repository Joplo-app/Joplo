import { installFixturePlugins } from '../../../scripts/test/fixtures.ts';
/**
 * 看板里的导出组件（D66）：状态接口、安装接口只接受本机看板的已授权请求（不变量 ④）、进度推送、装好后继续导出；
 * 托管运行时与项目里已有的 playwright 都能导出（不变量 ⑤）；安装不改项目文件（不变量 ①）。
 */
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createHub, type Hub } from '../src/dev.ts';
import { runtimePaths } from '../src/export-runtime.ts';
import { fakeProjectPlaywright, fakeRunner, installFakeLaunch, projectSnapshot, type RunCall } from './runtime-fixtures.ts';

const tmp = (p: string) => fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), p)));
const EXAMPLE = path.resolve(import.meta.dirname, '../../../examples/invite');
const SCENARIO = 'invite.a-modal.success';
/** 示例项目的副本，带 package.json 与 lockfile（检查它们不被改动）。 */
const minimal = () => {
  const d = tmp('joplo-setup-proj-');
  fs.cpSync(EXAMPLE, d, { recursive: true, filter: (s) => !/[/\\](\.joplo|dist|node_modules|exports)([/\\]|$)/.test(s.slice(EXAMPLE.length)) });
  installFixturePlugins(d);
  fs.writeFileSync(path.join(d, 'package.json'), '{"name":"setup-demo","devDependencies":{"joplo":"0.2.6"}}\n');
  fs.writeFileSync(path.join(d, 'package-lock.json'), '{"lockfileVersion":3}\n');
  return d;
};

function req(port: number, o: { method?: string; path: string; headers?: Record<string, string>; body?: string }): Promise<{ status: number; body: any }> {
  return new Promise((resolve, reject) => {
    const r = http.request({ host: '127.0.0.1', port, method: o.method ?? 'GET', path: o.path, headers: { host: `127.0.0.1:${port}`, ...o.headers } }, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const raw = Buffer.concat(chunks);
        let body: any = raw;
        if (/json/.test(String(res.headers['content-type']))) body = JSON.parse(raw.toString('utf8'));
        else if (/event-stream/.test(String(res.headers['content-type']))) body = raw.toString('utf8').split('\n\n').filter((x) => x.startsWith('data: ')).map((x) => JSON.parse(x.slice(6)));
        resolve({ status: res.statusCode!, body });
      });
    });
    r.on('error', reject);
    if (o.body !== undefined) r.write(o.body);
    r.end();
  });
}
const until = async (fn: () => Promise<boolean>, ms = 20000) => {
  const t = Date.now();
  while (!(await fn())) {
    if (Date.now() - t > ms) throw new Error('等待超时');
    await new Promise((r) => setTimeout(r, 30));
  }
};

describe('看板：导出组件的安装', () => {
  let hub: Hub;
  let home: string;
  let dir: string;
  let id: string;
  const calls: RunCall[] = [];
  let open: () => void = () => undefined;
  const gate = new Promise<void>((r) => (open = r));
  const fake = installFakeLaunch();

  beforeAll(async () => {
    home = tmp('joplo-setup-home-');
    dir = minimal();
    hub = await createHub({ port: 0, log: () => undefined, watch: false, home, exportDeps: { install: { run: fakeRunner(calls, { gate }), verify: async () => undefined } } });
    const r = hub.addProject(dir);
    id = r.id;
    await r.slot!.ready;
  }, 60_000);
  afterAll(async () => {
    open();
    await hub?.close();
    fs.rmSync(dir, { recursive: true, force: true });
    fs.rmSync(home, { recursive: true, force: true });
  });

  const install = (headers: Record<string, string>, body = '{}') => req(hub.port, { method: 'POST', path: '/__joplo/export-runtime/install', headers, body });

  it('状态：没装时 ready=false，带下载大小与安装命令；图片导出 503 EXPORT_COMPONENT_MISSING', async () => {
    const r = await req(hub.port, { path: `/__joplo/p/${id}/export/runtime` });
    expect(r.status).toBe(200);
    expect(r.body.runtime).toMatchObject({ ready: false, source: null, command: 'npx joplo setup export' });
    expect(r.body.runtime.downloadMB).toBeGreaterThan(0);
    expect(r.body.install).toBeNull();
    const img = await req(hub.port, { method: 'POST', path: `/__joplo/p/${id}/export/image`, headers: { 'content-type': 'application/json', 'x-joplo-token': hub.token }, body: JSON.stringify({ scenarioId: SCENARIO, position: 0 }) });
    expect(img.status).toBe(503);
    expect(img.body.error.code).toBe('EXPORT_COMPONENT_MISSING');
  });

  it('不变量 ④：没令牌、令牌不对、别的源、非 JSON、别的 Host 都被拒绝，且不会开始下载', async () => {
    expect((await install({ 'content-type': 'application/json' })).status).toBe(403);
    expect((await install({ 'content-type': 'application/json', 'x-joplo-token': 'wrong' })).status).toBe(403);
    expect((await install({ 'content-type': 'application/json', 'x-joplo-token': hub.token, origin: 'https://evil.example' })).status).toBe(403);
    expect((await install({ 'content-type': 'text/plain', 'x-joplo-token': hub.token })).status).toBe(415);
    expect((await install({ 'content-type': 'application/json', 'x-joplo-token': hub.token, host: 'evil.example' })).status).toBe(403);
    expect((await req(hub.port, { method: 'PUT', path: '/__joplo/export-runtime/install', headers: { 'content-type': 'application/json', 'x-joplo-token': hub.token }, body: '{}' })).status).toBe(404);
    // 进度流也要令牌
    expect((await req(hub.port, { path: '/__joplo/export-runtime/install/events' })).status).toBe(403);
    await new Promise((r) => setTimeout(r, 50));
    expect(calls).toHaveLength(0);
    expect((await req(hub.port, { path: '/__joplo/export-runtime/install' })).body.job).toBeNull();
  });

  it('本机看板的请求：202 开始安装，重复请求接上同一个任务；SSE 推送进度直到完成；装好后能导出；项目文件不变', async () => {
    const before = projectSnapshot(dir);
    const ok = { 'content-type': 'application/json', 'x-joplo-token': hub.token, origin: `http://127.0.0.1:${hub.port}` };
    const a = await install(ok);
    expect(a.status).toBe(202);
    expect(a.body.job).toMatchObject({ status: 'running' });
    const b = await install(ok);
    expect(b.body.job.id).toBe(a.body.job.id);
    await until(async () => calls.length === 2); // npm 已结束，浏览器下载在 gate 上等待
    const sse = req(hub.port, { path: '/__joplo/export-runtime/install/events', headers: { 'x-joplo-token': hub.token } });
    await new Promise((r) => setTimeout(r, 80));
    open();
    const events = (await sse).body as { status: string; phase: string; percent: number; totalMB: number | null }[];
    expect(events[0]!.status).toBe('running');
    expect(events.some((e) => e.phase === 'browser' && e.totalMB === 95.3)).toBe(true);
    expect(events.at(-1)).toMatchObject({ status: 'done', phase: 'done', percent: 100 });
    // 只启动一次安装；命令都在 JOPLO_HOME 的运行时目录里执行
    expect(calls.map((c) => c.cmd)).toEqual(['npm', process.execPath]);
    for (const c of calls) expect(c.cwd).toBe(runtimePaths(home).dir);
    expect(projectSnapshot(dir)).toBe(before);
    expect((await req(hub.port, { path: `/__joplo/p/${id}/export/runtime` })).body.runtime).toMatchObject({ ready: true, source: 'managed' });
  });

  it('不变量 ⑤：托管运行时装好后，图片导出由它完成（看板继续导出）', async () => {
    // 替身安装写的入口没有 launch：换成会记录来源的替身
    fs.writeFileSync(runtimePaths(home).entry, `export const chromium = { launch: async (o) => globalThis.__joploFakeLaunch('managed', o) };\n`);
    const img = await req(hub.port, { method: 'POST', path: `/__joplo/p/${id}/export/image`, headers: { 'content-type': 'application/json', 'x-joplo-token': hub.token }, body: JSON.stringify({ scenarioId: SCENARIO, position: 0 }) });
    expect(img.status).toBe(200);
    expect(String(img.body)).toBe('png:managed');
    expect(fake.tags.at(-1)).toBe('managed');
  });
});

describe('看板：老项目里已有 playwright', () => {
  it('不变量 ⑤：没有托管运行时也能用项目里的 playwright 导出；状态显示 source=project', async () => {
    const fake = installFakeLaunch();
    const home = tmp('joplo-setup-home2-');
    const dir = minimal();
    fakeProjectPlaywright(dir);
    const hub = await createHub({ port: 0, log: () => undefined, watch: false, home });
    try {
      const r = hub.addProject(dir);
      await r.slot!.ready;
      expect((await req(hub.port, { path: `/__joplo/p/${r.id}/export/runtime` })).body.runtime).toMatchObject({ ready: true, source: 'project' });
      const img = await req(hub.port, { method: 'POST', path: `/__joplo/p/${r.id}/export/image`, headers: { 'content-type': 'application/json', 'x-joplo-token': hub.token }, body: JSON.stringify({ scenarioId: SCENARIO, position: 0 }) });
      expect(img.status).toBe(200);
      expect(String(img.body)).toBe('png:project');
      expect(fake.tags).toEqual(['project']);
    } finally {
      await hub.close();
      fs.rmSync(dir, { recursive: true, force: true });
      fs.rmSync(home, { recursive: true, force: true });
    }
  }, 60_000);
});
