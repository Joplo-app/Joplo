/**
 * 一个进程、多个项目（D39）：注册表、server.json、再次 joplo dev 只注册不另起进程、新接口的 Host/Origin/令牌、
 * 删除记录不删文件、按项目的编译与选中、导出（图片 / 视频，注入假的 Playwright）。
 * JOPLO_HOME 一律指向临时目录。
 */
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { JoploError } from '@joplo-app/core';
import { createHub, startDev, type Hub } from '../src/dev.ts';
import { Registry, projectIdOf, readServerInfo, serverInfoFile, writeServerInfo } from '../src/home.ts';
import { loadPlaywright } from '../src/render.ts';

const EXAMPLE = path.resolve(import.meta.dirname, '../../../examples/invite');
const tmp = (p: string) => fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), p)));
const copy = () => {
  const d = tmp('joplo-hub-');
  fs.cpSync(EXAMPLE, d, { recursive: true, filter: (s) => !/[/\\](\.joplo|dist|node_modules|exports)([/\\]|$)/.test(s.slice(EXAMPLE.length)) });
  return d;
};
const minimal = (name: string) => {
  const d = tmp('joplo-min-');
  fs.writeFileSync(path.join(d, 'joplo.config.ts'), `import { config } from '@joplo-app/kit';\nexport default config({ name: ${JSON.stringify(name)} });\n`);
  return d;
};

function req(port: number, opts: { method?: string; path: string; headers?: Record<string, string>; body?: string }): Promise<{ status: number; body: any; headers: http.IncomingHttpHeaders }> {
  return new Promise((resolve, reject) => {
    const r = http.request({ host: '127.0.0.1', port, method: opts.method ?? 'GET', path: opts.path, headers: { host: `127.0.0.1:${port}`, ...opts.headers } }, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const raw = Buffer.concat(chunks);
        let body: any = raw;
        if (/json|event-stream/.test(String(res.headers['content-type']))) {
          const text = raw.toString('utf8');
          try {
            body = JSON.parse(text);
          } catch {
            body = text;
          }
        }
        resolve({ status: res.statusCode!, body, headers: res.headers });
      });
    });
    r.on('error', reject);
    if (opts.body !== undefined) r.write(opts.body);
    r.end();
  });
}
const json = (token: string, extra: Record<string, string> = {}) => ({ 'content-type': 'application/json', 'x-joplo-token': token, ...extra });
const until = async (fn: () => boolean | Promise<boolean>, ms = 20000) => {
  const t = Date.now();
  while (!(await fn())) {
    if (Date.now() - t > ms) throw new Error('等待超时');
    await new Promise((r) => setTimeout(r, 50));
  }
};

describe('注册表与 server.json', () => {
  it('projects.json 原子写入、按最近打开排序；删除只改记录', () => {
    const home = tmp('joplo-home-');
    const r = new Registry(home);
    const a = minimal('甲');
    const b = minimal('乙');
    r.touch(a, '甲');
    r.touch(b, '乙');
    expect(r.list().map((x) => x.name)).toEqual(['乙', '甲']);
    r.touch(a);
    expect(r.list().map((x) => x.name)).toEqual(['甲', '乙']);
    expect(fs.readdirSync(home).filter((f) => f.endsWith('.tmp'))).toEqual([]);
    expect(r.remove(a)).toBe(true);
    expect(r.list().map((x) => x.dir)).toEqual([b]);
    expect(fs.existsSync(path.join(a, 'joplo.config.ts'))).toBe(true);
    // 损坏的文件视为空列表，不抛错
    fs.writeFileSync(r.file, '{nope');
    expect(r.list()).toEqual([]);
  });

  it('server.json 权限 0600', () => {
    const home = tmp('joplo-home-');
    writeServerInfo(home, { port: 1234, pid: process.pid, token: 't' });
    expect(fs.statSync(serverInfoFile(home)).mode & 0o777).toBe(0o600);
    expect(readServerInfo(home)).toEqual({ port: 1234, pid: process.pid, token: 't' });
  });
});

describe('一个进程，多个项目', () => {
  const home = tmp('joplo-home-');
  let a: string;
  let b: string;
  let first: Awaited<ReturnType<typeof startDev>>;
  let port: number;
  let token: string;
  beforeAll(async () => {
    a = copy();
    b = minimal('第二个项目');
    first = await startDev({ projectDir: a, port: 0, home, log: () => undefined });
    const info = readServerInfo(home)!;
    port = info.port;
    token = info.token;
  }, 60_000);
  afterAll(async () => {
    await first?.close();
    for (const d of [a, b]) fs.rmSync(d, { recursive: true, force: true });
  });

  it('连续两次 joplo dev：第二次只注册到已运行的看板（同一端口、同一进程），两个项目都在首页', async () => {
    expect(first.attached).toBe(false);
    expect(readServerInfo(home)!.pid).toBe(process.pid);
    const second = await startDev({ projectDir: b, port: 0, home, log: () => undefined });
    expect(second.attached).toBe(true);
    expect(new URL(second.url).port).toBe(String(port));
    expect(second.url).toContain(`#/${projectIdOf(b)}`);
    const list = (await req(port, { path: '/__joplo/projects' })).body.projects;
    expect(list.map((p: { dir: string }) => p.dir).sort()).toEqual([a, b].sort());
    // 注册表里两个都在，最近打开的在前
    expect(new Registry(home).list().map((r) => r.dir)).toEqual([b, a]);
    await second.close(); // attached 的 close 不影响运行中的看板
    expect((await req(port, { path: '/__joplo/ping' })).body).toMatchObject({ joplo: true, pid: process.pid });
  }, 60_000);

  it('注册接口：没有或错误令牌 403、错误 Origin 403、错误 Content-Type 415、目录不存在 404', async () => {
    const body = JSON.stringify({ dir: b });
    expect((await req(port, { method: 'POST', path: '/__joplo/projects', headers: { 'content-type': 'application/json' }, body })).status).toBe(403);
    expect((await req(port, { method: 'POST', path: '/__joplo/projects', headers: json('nope'), body })).status).toBe(403);
    expect((await req(port, { method: 'POST', path: '/__joplo/projects', headers: json(token, { origin: 'http://evil.example' }), body })).status).toBe(403);
    expect((await req(port, { method: 'POST', path: '/__joplo/projects', headers: { ...json(token), 'content-type': 'text/plain' }, body })).status).toBe(415);
    expect((await req(port, { method: 'POST', path: '/__joplo/projects', headers: json(token), body: JSON.stringify({ dir: '/nope/never' }) })).status).toBe(404);
    expect((await req(port, { method: 'POST', path: '/__joplo/projects', headers: json(token), body: JSON.stringify({ dir: 'relative' }) })).status).toBe(400);
    expect((await req(port, { path: '/__joplo/projects', headers: { host: 'evil.example' } })).status).toBe(403);
  });

  it('按项目编译与选中：第二个项目的 IR 独立；selection 写入各自的 .joplo/', async () => {
    const idA = projectIdOf(a);
    const idB = projectIdOf(b);
    const irB = (await req(port, { path: `/__joplo/p/${idB}/ir` })).body;
    expect(irB).toMatchObject({ projectId: idB, ok: true });
    expect(irB.project.name).toBe('第二个项目');
    const irA = (await req(port, { path: `/__joplo/p/${idA}/ir` })).body;
    expect(Object.keys(irA.project.scenarios)).toContain('invite.a-modal.success');
    const sel = { optionId: 'invite.a-modal', scenarioId: 'invite.a-modal.success', position: 0, sceneId: 'invite.a-modal@/members', nodeId: 'btn_invite' };
    const put = await req(port, { method: 'PUT', path: `/__joplo/p/${idA}/selection`, headers: json(token), body: JSON.stringify({ selection: sel }) });
    expect(put.status).toBe(200);
    expect(JSON.parse(fs.readFileSync(path.join(a, '.joplo/selection.json'), 'utf8')).nodeId).toBe('btn_invite');
    expect(fs.existsSync(path.join(b, '.joplo/selection.json'))).toBe(false);
    expect((await req(port, { path: '/__joplo/p/nope-000000/ir' })).status).toBe(404);
  });

  it('删除记录：需要令牌；只删 projects.json 里的记录，不删项目文件', async () => {
    const idB = projectIdOf(b);
    expect((await req(port, { method: 'DELETE', path: `/__joplo/projects/${idB}` })).status).toBe(403);
    const before = fs.readdirSync(b).sort();
    const r = await req(port, { method: 'DELETE', path: `/__joplo/projects/${idB}`, headers: { 'x-joplo-token': token, origin: `http://127.0.0.1:${port}` } });
    expect(r.status).toBe(200);
    expect(new Registry(home).list().map((x) => x.dir)).toEqual([a]);
    expect(fs.readdirSync(b).sort()).toEqual(before);
    expect((await req(port, { path: `/__joplo/p/${idB}/ir` })).status).toBe(404);
  });

  it('目录被移走的项目在列表里标为 missing', async () => {
    const gone = minimal('会被删除');
    const reg = await req(port, { method: 'POST', path: '/__joplo/projects', headers: json(token), body: JSON.stringify({ dir: gone }) });
    expect(reg.status).toBe(200);
    await until(async () => (await req(port, { path: '/__joplo/projects' })).body.projects.find((p: { dir: string }) => p.dir === gone)?.status === 'ok');
    fs.rmSync(gone, { recursive: true, force: true });
    const row = (await req(port, { path: '/__joplo/projects' })).body.projects.find((p: { dir: string }) => p.dir === gone);
    expect(row.status).toBe('missing');
  });

  it('打开编辑器：只接受项目内的源文件；直接访问 /__open-in-editor 被拒绝', async () => {
    const id = projectIdOf(a);
    expect((await req(port, { path: '/__open-in-editor?file=/etc/passwd' })).status).toBe(403);
    expect((await req(port, { method: 'POST', path: `/__joplo/p/${id}/open`, headers: json(token), body: JSON.stringify({ at: '../../etc/passwd:1:1' }) })).status).toBe(400);
    expect((await req(port, { method: 'POST', path: `/__joplo/p/${id}/open`, headers: json('nope'), body: JSON.stringify({ at: 'joplo.config.ts:1:1' }) })).status).toBe(403);
  });
});

describe('启动边界', () => {
  it('server.json 指向已退出的进程：清掉并正常启动', async () => {
    const home = tmp('joplo-home-');
    writeServerInfo(home, { port: 1, pid: 2 ** 22 + 12345, token: 'stale' });
    const d = minimal('新');
    const h = await startDev({ projectDir: d, port: 0, home, log: () => undefined });
    try {
      expect(h.attached).toBe(false);
      expect(readServerInfo(home)!.pid).toBe(process.pid);
    } finally {
      await h.close();
    }
    expect(readServerInfo(home)).toBeNull();
  }, 60_000);
});

describe('导出', () => {
  let hub: Hub;
  let dir: string;
  let id: string;
  let release: () => void = () => undefined;
  const calls: { url: string; out: string }[] = [];
  const missingPw = () => loadPlaywright(async () => {
    throw Object.assign(new Error("Cannot find package 'playwright'"), { code: 'ERR_MODULE_NOT_FOUND' });
  });
  beforeAll(async () => {
    dir = copy();
    hub = await createHub({
      port: 0,
      log: () => undefined,
      watch: false,
      exportDeps: {
        loadPlaywright: missingPw,
        recordVideo: async ({ url, out, total, progress }) => {
          calls.push({ url, out });
          if (url.includes('fail')) throw new JoploError('RENDER_FAILED', 'x');
          for (let i = 1; i <= total; i++) progress(i);
          await new Promise<void>((r) => (release = r));
          fs.writeFileSync(out, 'webm');
        },
      },
    });
    const r = hub.addProject(dir);
    id = r.id;
    await r.slot!.ready;
  }, 60_000);
  afterAll(async () => {
    release();
    await hub?.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('图片：没有 Playwright 时 503，错误里带安装命令；参数不对 400；没令牌 403', async () => {
    const body = JSON.stringify({ scenarioId: 'invite.a-modal.success', position: 1 });
    expect((await req(hub.port, { method: 'POST', path: `/__joplo/p/${id}/export/image`, headers: { 'content-type': 'application/json' }, body })).status).toBe(403);
    expect((await req(hub.port, { method: 'POST', path: `/__joplo/p/${id}/export/image`, headers: json(hub.token), body: JSON.stringify({ scenarioId: 'nope' }) })).status).toBe(400);
    expect((await req(hub.port, { method: 'POST', path: `/__joplo/p/${id}/export/image`, headers: json(hub.token), body: JSON.stringify({ scenarioId: 'invite.a-modal.success', position: 99 }) })).status).toBe(400);
    const r = await req(hub.port, { method: 'POST', path: `/__joplo/p/${id}/export/image`, headers: json(hub.token), body });
    expect(r.status).toBe(503);
    expect(r.body.error.message).toContain('npx playwright install chromium');
  });

  it('视频：202 → SSE 进度 → 写入 <项目>/exports/*.webm；同一项目同时只有一个任务（409）', async () => {
    const body = JSON.stringify({ scenarioId: 'invite.a-modal.success' });
    const r = await req(hub.port, { method: 'POST', path: `/__joplo/p/${id}/export/video`, headers: json(hub.token), body });
    expect(r.status).toBe(202);
    expect(calls[0]!.url).toContain(`project=${id}`);
    expect(calls[0]!.url).toContain('record=1');
    expect((await req(hub.port, { method: 'POST', path: `/__joplo/p/${id}/export/video`, headers: json(hub.token), body })).status).toBe(409);
    await until(async () => (await req(hub.port, { path: `/__joplo/p/${id}/export/video` })).body.job?.step === 5);
    // SSE：没令牌 403；有令牌时先收到当前状态，完成后收到 done 并关闭
    expect((await req(hub.port, { path: `/__joplo/p/${id}/export/video/events` })).status).toBe(403);
    const sse = req(hub.port, { path: `/__joplo/p/${id}/export/video/events`, headers: { 'x-joplo-token': hub.token } });
    await new Promise((r) => setTimeout(r, 100));
    release();
    const events = String((await sse).body)
      .split('\n\n')
      .filter((x) => x.startsWith('data: '))
      .map((x) => JSON.parse(x.slice(6)));
    expect(events[0].status).toBe('running');
    const last = events.at(-1);
    expect(last).toMatchObject({ status: 'done', percent: 100 });
    expect(last.file).toMatch(/^exports\/invite\.a-modal\.success-\d{8}-\d{6}\.webm$/);
    expect(fs.readFileSync(path.join(dir, last.file), 'utf8')).toBe('webm');
    // 完成后可以再导出
    expect((await req(hub.port, { method: 'POST', path: `/__joplo/p/${id}/export/video`, headers: json(hub.token), body })).status).toBe(202);
    release();
  });

  it('外观（D55）：导出视频的请求体带 font / stroke 时透传到渲染路由；非法值不透传', async () => {
    release();
    await until(async () => (await req(hub.port, { path: `/__joplo/p/${id}/export/video` })).body.job?.status !== 'running');
    const n = calls.length;
    const r = await req(hub.port, { method: 'POST', path: `/__joplo/p/${id}/export/video`, headers: json(hub.token), body: JSON.stringify({ scenarioId: 'invite.a-modal.success', theme: 'nord', font: 'serif', stroke: 'clean' }) });
    expect(r.status).toBe(202);
    const url = new URL(calls[n]!.url);
    expect(url.searchParams.get('theme')).toBe('nord');
    expect(url.searchParams.get('font')).toBe('serif');
    expect(url.searchParams.get('stroke')).toBe('clean');
    release();
    await until(async () => (await req(hub.port, { path: `/__joplo/p/${id}/export/video` })).body.job?.status !== 'running');
    await req(hub.port, { method: 'POST', path: `/__joplo/p/${id}/export/video`, headers: json(hub.token), body: JSON.stringify({ scenarioId: 'invite.a-modal.success', font: 'wingdings', stroke: 7 }) });
    const bad = new URL(calls[n + 1]!.url);
    expect(bad.searchParams.has('font')).toBe(false);
    expect(bad.searchParams.has('stroke')).toBe(false);
    release();
  });

  it('视频：没有 Chromium 时任务失败，错误里带 npx playwright install chromium', async () => {
    const h2 = await createHub({ port: 0, log: () => undefined, watch: false, exportDeps: { loadPlaywright: missingPw } });
    try {
      const r = h2.addProject(dir);
      await r.slot!.ready;
      const res = await req(h2.port, { method: 'POST', path: `/__joplo/p/${r.id}/export/video`, headers: json(h2.token), body: JSON.stringify({ scenarioId: 'invite.a-modal.success' }) });
      expect(res.status).toBe(202);
      await until(async () => (await req(h2.port, { path: `/__joplo/p/${r.id}/export/video` })).body.job?.status === 'error');
      const job = (await req(h2.port, { path: `/__joplo/p/${r.id}/export/video` })).body.job;
      expect(job.error).toContain('npx playwright install chromium');
    } finally {
      await h2.close();
    }
  }, 60_000);
});
