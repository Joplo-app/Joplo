/**
 * startDev（createDev）：编译、热更新、错误定位、安全校验、选中写入、端口占用。都在临时副本上运行，随机端口。
 */
import fs from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDev, isJsonContentType, type InternalDevHandle } from '../src/dev.ts';
import { resolveSelection } from '../src/selection.ts';

const EXAMPLE = path.resolve(import.meta.dirname, '../../../examples/invite');
const copy = () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'joplo-dev-'));
  fs.cpSync(EXAMPLE, d, { recursive: true });
  return fs.realpathSync(d);
};
const until = async (fn: () => boolean, ms = 15000) => {
  const t = Date.now();
  while (!fn()) {
    if (Date.now() - t > ms) throw new Error('等待超时');
    await new Promise((r) => setTimeout(r, 50));
  }
};

function req(h: InternalDevHandle, opts: { method?: string; path: string; headers?: Record<string, string>; body?: string }): Promise<{ status: number; body: any }> {
  return new Promise((resolve, reject) => {
    const r = http.request({ host: '127.0.0.1', port: h.port, method: opts.method ?? 'GET', path: opts.path, headers: { host: `127.0.0.1:${h.port}`, ...opts.headers } }, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => {
        let body: any = data;
        try {
          body = JSON.parse(data);
        } catch {}
        resolve({ status: res.statusCode!, body });
      });
    });
    r.on('error', reject);
    if (opts.body !== undefined) r.write(opts.body);
    r.end();
  });
}

const put = (h: InternalDevHandle, selection: unknown, headers: Record<string, string> = {}) =>
  req(h, { method: 'PUT', path: '/__joplo/selection', headers: { 'content-type': 'application/json', 'x-joplo-token': h.token, ...headers }, body: JSON.stringify({ selection }) });

const selFile = (dir: string) => JSON.parse(fs.readFileSync(path.join(dir, '.joplo/selection.json'), 'utf8'));

describe('startDev', () => {
  let dir: string;
  let h: InternalDevHandle;
  beforeAll(async () => {
    dir = copy();
    h = await createDev({ projectDir: dir, port: 0, log: () => undefined });
  }, 60_000);
  afterAll(async () => {
    await h?.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('只监听 127.0.0.1，初次编译成功，IR 带相对源位置', async () => {
    expect(h.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/$/);
    const p = h.payload();
    expect(p.ok).toBe(true);
    expect(p.home).toBe('/members');
    expect(Object.keys(p.project!.scenes)).toContain('invite.a-modal@/members');
    expect(p.project!.scenarios['invite.a-modal.success']!.steps[0]!.source).toMatch(/^features\/invite\/options\/a-modal\.tsx:\d+:\d+$/);
    const r = await req(h, { path: '/__joplo/ir' });
    expect(r.status).toBe(200);
    expect(r.body.version).toBe(p.version);
  });

  it('校验 Host（防 DNS 重绑定），页面与接口都适用', async () => {
    expect((await req(h, { path: '/__joplo/ir', headers: { host: 'evil.example:80' } })).status).toBe(403);
    expect((await req(h, { path: '/', headers: { host: 'evil.example' } })).status).toBe(403);
    expect((await req(h, { path: '/', headers: { host: `localhost:${h.port}` } })).status).toBe(200);
  });

  it('看板页面注入本地令牌', async () => {
    const r = await req(h, { path: '/' });
    expect(r.body).toContain(`content="${h.token}"`);
  });

  it('写接口：缺令牌 401、错误 Origin 403、错误 Content-Type 415、坏 JSON 400', async () => {
    const good = { optionId: 'invite.a-modal', scenarioId: 'invite.a-modal.success', position: 0, sceneId: 'invite.a-modal@/members', nodeId: 'btn_invite' };
    expect((await put(h, good, { 'x-joplo-token': 'nope' })).status).toBe(401);
    expect((await put(h, good, { origin: 'http://evil.example' })).status).toBe(403);
    expect((await put(h, good, { 'content-type': 'text/plain' })).status).toBe(415);
    const bad = await req(h, { method: 'PUT', path: '/__joplo/selection', headers: { 'content-type': 'application/json', 'x-joplo-token': h.token }, body: '{nope' });
    expect(bad.status).toBe(400);
    expect((await put(h, { ...good, extra: 1 })).status).toBe(400);
    expect(isJsonContentType('application/json; charset=utf-8')).toBe(true);
    expect(isJsonContentType('application/json; boundary=x')).toBe(false);
  });

  it('选中：服务端计算 at/label/route；取消写 null；被拒绝（409）时写 null，不保留旧选中', async () => {
    const ok = await put(h, { optionId: 'invite.a-modal', scenarioId: 'invite.a-modal.success', position: 1, sceneId: 'invite.a-modal@/members', nodeId: 'sel_role' }, { origin: `http://127.0.0.1:${h.port}` });
    expect(ok.status).toBe(200);
    expect(selFile(dir)).toMatchObject({ nodeId: 'sel_role', label: '权限', route: '/members', stepId: 'invite.a-modal.success#1', featureId: 'invite' });
    expect(selFile(dir).at).toMatch(/^features\/invite\/options\/a-modal\.tsx:\d+:\d+$/);

    // 位置 0 时弹窗未打开，但画面仍是同一个：元素在画面里即可选中；画面不符则拒绝
    const rejected = await put(h, { optionId: 'invite.a-modal', scenarioId: 'invite.a-modal.success', position: 1, sceneId: 'invite.b-batch@/members', nodeId: 'btn_batch' });
    expect(rejected.status).toBe(409);
    expect(rejected.body.current).toBeNull();
    expect(selFile(dir)).toBeNull();

    await put(h, { optionId: 'invite.a-modal', scenarioId: null, position: 0, sceneId: '@/members', nodeId: 'btn_invite' });
    expect(selFile(dir)).toMatchObject({ scenarioId: null, sceneId: '@/members', nodeId: 'btn_invite' });
    expect((await put(h, null)).status).toBe(200);
    expect(selFile(dir)).toBeNull();
  });

  it('热更新：改文件 → 重新编译、版本递增；语法错误给出 文件:行:列 并保留上一次成功的 IR；修好恢复', async () => {
    const file = path.join(dir, 'features/invite/options/a-modal.tsx');
    const good = fs.readFileSync(file, 'utf8');
    const v0 = h.payload().version;
    fs.writeFileSync(file, good.replace('发送邀请</Button>', '立即发送</Button>'));
    await until(() => h.payload().version > v0 && JSON.stringify(h.payload().project).includes('立即发送'));
    expect(h.payload().ok).toBe(true);

    const v1 = h.payload().version;
    const lines = good.split('\n');
    const ln = lines.findIndex((l) => l.includes('id="btn_send"'));
    lines[ln] = lines[ln]!.replace('<Button', '<Button ={');
    fs.writeFileSync(file, lines.join('\n'));
    // 只等版本号会被上一次改动残留的重新编译抢先满足（并发时约 1/7 失败）：同时等这次的语法错误出现在结果里
    await until(() => h.payload().version > v1 && !h.payload().ok && h.payload().diagnostics.some((x) => x.severity === 'error' && x.at?.startsWith('features/invite/options/a-modal.tsx:')));
    const bad = h.payload();
    expect(bad.ok).toBe(false);
    expect(bad.project).not.toBeNull();
    const d = bad.diagnostics.find((x) => x.severity === 'error')!;
    expect(d.at).toMatch(new RegExp(`^features/invite/options/a-modal\\.tsx:${ln + 1}:\\d+$`));

    const v2 = h.payload().version;
    fs.writeFileSync(file, good);
    await until(() => h.payload().version > v2 && h.payload().ok);
    // .joplo/ 下的变化不触发重新编译。先等版本号稳定：同一次写入在高负载下可能产生两个文件事件，
    // 迟到的那次重新编译不能算到 .joplo/ 头上
    let last = -1;
    while (h.payload().version !== last) {
      last = h.payload().version;
      await new Promise((r) => setTimeout(r, 300));
    }
    const v3 = h.payload().version;
    fs.writeFileSync(path.join(dir, '.joplo/selection.json'), 'null\n');
    await new Promise((r) => setTimeout(r, 400));
    expect(h.payload().version).toBe(v3);
  }, 60_000);

  it('端口被占用时直接报错，不换端口', async () => {
    const blocker = net.createServer();
    await new Promise<void>((r) => blocker.listen(0, '127.0.0.1', () => r()));
    const port = (blocker.address() as net.AddressInfo).port;
    try {
      await expect(createDev({ projectDir: dir, port, log: () => undefined })).rejects.toThrow(/端口 \d+ 已被占用/);
    } finally {
      blocker.close();
    }
  }, 30_000);
});

describe('startDev 边界输入', () => {
  it('不是 Joplo 项目的目录：服务照常启动，看板显示 NOT_A_PROJECT', async () => {
    const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'joplo-empty-'));
    const h = await createDev({ projectDir: empty, port: 0, log: () => undefined });
    try {
      const p = h.payload();
      expect(p.ok).toBe(false);
      expect(p.project).toBeNull();
      expect(p.diagnostics[0]!.code).toBe('NOT_A_PROJECT');
      // 没有 IR 时选中被拒绝并写 null
      const r = await put(h, { optionId: null, scenarioId: null, position: 0, sceneId: '@/', nodeId: 'x' });
      expect(r.status).toBe(409);
    } finally {
      await h.close();
      fs.rmSync(empty, { recursive: true, force: true });
    }
  }, 30_000);

  it('只有配置、没有路径/功能的空项目也能编译', async () => {
    const d = fs.mkdtempSync(path.join(os.tmpdir(), 'joplo-min-'));
    fs.writeFileSync(path.join(d, 'joplo.config.ts'), "import { config } from '@tokenroll/joplo-kit';\nexport default config({ name: '空项目' });\n");
    const h = await createDev({ projectDir: d, port: 0, log: () => undefined });
    try {
      expect(h.payload()).toMatchObject({ ok: true, home: null });
      expect(h.payload().project!.name).toBe('空项目');
    } finally {
      await h.close();
      fs.rmSync(d, { recursive: true, force: true });
    }
  }, 30_000);
});

describe('resolveSelection', () => {
  let h: InternalDevHandle;
  let dir: string;
  beforeAll(async () => {
    dir = copy();
    h = await createDev({ projectDir: dir, port: 0, watch: false, log: () => undefined });
  }, 60_000);
  afterAll(async () => {
    await h?.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('只选中步骤：at 为步骤的源位置', () => {
    const r = resolveSelection(h.payload().project!, { optionId: 'invite.a-modal', scenarioId: 'invite.a-modal.success', position: 2, sceneId: 'invite.a-modal@/members', nodeId: null, stepId: 'invite.a-modal.success#2' });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.selection.stepId).toBe('invite.a-modal.success#2');
      expect(r.selection.at).toMatch(/a-modal\.tsx:\d+:\d+$/);
      expect(r.selection.label).toContain('li.lei@example.com');
    }
  });

  it('越界、场景与方案不符、元素不存在、既无元素也无步骤：都拒绝', () => {
    const p = h.payload().project!;
    const base = { optionId: 'invite.a-modal', scenarioId: 'invite.a-modal.success', position: 0, sceneId: 'invite.a-modal@/members', nodeId: 'btn_invite' };
    expect(resolveSelection(p, { ...base, position: 99 }).ok).toBe(false);
    expect(resolveSelection(p, { ...base, optionId: 'invite.b-batch' }).ok).toBe(false);
    expect(resolveSelection(p, { ...base, nodeId: 'nope' }).ok).toBe(false);
    expect(resolveSelection(p, { ...base, nodeId: null }).ok).toBe(false);
    expect(resolveSelection(p, { ...base, scenarioId: null, position: 1 }).ok).toBe(false);
  });
});
