/**
 * 看板直接发布到云端（D76）。不变量：
 * 1. 账号与发布接口都要本机令牌；发布还要 JSON 与本机 Origin；请求体只接受字符串数组形式的范围；
 * 2. 发布任务 running → done / failed，进度行按顺序记下；同一项目同时只有一个任务（再次 POST 返回进行中的那个，bridge 只被调用一次）；
 * 3. 失败带 code，需要登录时带 loginCommand；
 * 4. 没有注入 bridge（旧版 CLI 启动的看板）：account 返回 available: false，POST 返回 409。
 */
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createHub, type Hub } from '../src/dev.ts';
import type { CloudBridge, CloudPublishRequest } from '../src/cloud.ts';

const minimal = () => {
  const d = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'joplo-cloud-')));
  fs.writeFileSync(path.join(d, 'joplo.config.ts'), `import { config } from '@joplo-app/kit';\nexport default config({ name: 'Cloud' });\n`);
  return d;
};
function req(port: number, opts: { method?: string; path: string; headers?: Record<string, string>; body?: string }): Promise<{ status: number; body: any }> {
  return new Promise((resolve, reject) => {
    const r = http.request({ host: '127.0.0.1', port, method: opts.method ?? 'GET', path: opts.path, headers: { host: `127.0.0.1:${port}`, ...opts.headers } }, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        let body: any = text;
        try { body = JSON.parse(text); } catch { /* 文本 */ }
        resolve({ status: res.statusCode!, body });
      });
    });
    r.on('error', reject);
    if (opts.body !== undefined) r.write(opts.body);
    r.end();
  });
}

let hub: Hub | null = null;
afterEach(async () => {
  await hub?.close();
  hub = null;
});

async function start(cloud?: CloudBridge) {
  hub = await createHub({ port: 0, home: null, watch: false, log: () => undefined, ...(cloud ? { cloud } : {}) });
  const dir = minimal();
  const { id } = hub.addProject(dir);
  const t = { 'x-joplo-token': hub.token };
  const j = { ...t, 'content-type': 'application/json' };
  const until = async (fn: () => Promise<boolean>) => {
    for (let i = 0; i < 400; i++) { if (await fn()) return; await new Promise((r) => setTimeout(r, 10)); }
    throw new Error('等待超时');
  };
  return { port: hub.port, id, dir, t, j, until };
}

describe('发布到云端接口', () => {
  it('账号与发布都要令牌；发布要 JSON 和本机 Origin；范围只接受字符串数组', async () => {
    const calls: CloudPublishRequest[] = [];
    const { port, id, t, j } = await start({ account: async () => ({ signedIn: true, server: 'https://cloud.joplo.app', email: 'a@b.c', plan: 'free' }), publish: async (_d, r) => (calls.push(r), { shareId: 'Abc1234567', url: 'https://x/s/1', expiresAt: null, version: 1, plan: 'free' }) });
    expect((await req(port, { path: '/__joplo/cloud/account' })).status).toBe(403);
    const acct = await req(port, { path: '/__joplo/cloud/account', headers: t });
    expect(acct.body).toEqual({ available: true, account: { signedIn: true, server: 'https://cloud.joplo.app', email: 'a@b.c', plan: 'free' } });
    const url = `/__joplo/p/${id}/cloud/publish`;
    expect((await req(port, { method: 'POST', path: url, headers: { 'content-type': 'application/json' }, body: '{}' })).status).toBe(403);
    expect((await req(port, { method: 'POST', path: url, headers: { ...j, origin: 'http://evil.example' }, body: '{}' })).status).toBe(403);
    expect((await req(port, { method: 'POST', path: url, headers: t, body: '{}' })).status).toBe(415);
    expect((await req(port, { method: 'POST', path: url, headers: j, body: JSON.stringify({ scenarios: 'a.b.c' }) })).status).toBe(400);
    expect((await req(port, { method: 'POST', path: url, headers: j, body: JSON.stringify({ features: [1] }) })).status).toBe(400);
    expect(calls).toEqual([]);
    expect((await req(port, { path: url })).status).toBe(403);
  }, 60_000);

  it('任务 running → done，进度按顺序记下；进行中再 POST 返回同一个任务，只发布一次', async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const calls: { dir: string; r: CloudPublishRequest }[] = [];
    const { port, id, dir, j, t, until } = await start({
      account: async () => ({ signedIn: true, server: 's', email: 'e', plan: 'pro' }),
      publish: async (d, r, progress) => {
        calls.push({ dir: d, r });
        progress('Checking the project...');
        await gate;
        progress('Upload complete. Finalizing publication...');
        return { shareId: 'Abc1234567', url: 'https://x/s/Abc1234567', expiresAt: null, version: 2, plan: 'pro', scope: { key: 'f.a.main', scenarios: ['f.a.main'], features: ['f'], borrowed: [] } };
      },
    });
    const url = `/__joplo/p/${id}/cloud/publish`;
    const first = await req(port, { method: 'POST', path: url, headers: j, body: JSON.stringify({ scenarios: ['f.a.main'] }) });
    expect(first.status).toBe(202);
    expect(first.body.job).toMatchObject({ state: 'running', request: { scenarios: ['f.a.main'] } });
    const again = await req(port, { method: 'POST', path: url, headers: j, body: JSON.stringify({}) });
    expect(again.body.job.id).toBe(first.body.job.id);
    release();
    await until(async () => (await req(port, { path: url, headers: t })).body.job?.state === 'done');
    const done = (await req(port, { path: url, headers: t })).body.job;
    expect(done.lines).toEqual(['Checking the project...', 'Upload complete. Finalizing publication...']);
    expect(done.result).toMatchObject({ url: 'https://x/s/Abc1234567', version: 2, scope: { key: 'f.a.main' } });
    expect(calls).toEqual([{ dir, r: { scenarios: ['f.a.main'] } }]);
  }, 60_000);

  it('失败带 code 与 loginCommand；可以再发起新的任务', async () => {
    let n = 0;
    const { port, id, j, t, until } = await start({
      account: async () => ({ signedIn: false, server: 'https://c.example', loginCommand: 'npx joplo login --server https://c.example' }),
      publish: async () => {
        n++;
        throw Object.assign(new Error('Sharing requires a free Joplo account. Run npx joplo login'), { code: 'AUTH_REQUIRED', loginCommand: 'npx joplo login --server https://c.example' });
      },
    });
    const url = `/__joplo/p/${id}/cloud/publish`;
    await req(port, { method: 'POST', path: url, headers: j, body: '{}' });
    await until(async () => (await req(port, { path: url, headers: t })).body.job?.state === 'failed');
    expect((await req(port, { path: url, headers: t })).body.job.error).toEqual({ code: 'AUTH_REQUIRED', message: 'Sharing requires a free Joplo account. Run npx joplo login', loginCommand: 'npx joplo login --server https://c.example' });
    expect((await req(port, { method: 'POST', path: url, headers: j, body: '{}' })).status).toBe(202);
    await until(async () => n === 2);
  }, 60_000);

  it('没有 bridge（旧版 CLI 启动的看板）：account 不可用，POST 409', async () => {
    const { port, id, j, t } = await start();
    expect((await req(port, { path: '/__joplo/cloud/account', headers: t })).body).toEqual({ available: false });
    const r = await req(port, { method: 'POST', path: `/__joplo/p/${id}/cloud/publish`, headers: j, body: '{}' });
    expect(r.status).toBe(409);
    expect(r.body.error.message).toMatch(/joplo dev again/);
    expect((await req(port, { path: `/__joplo/p/${id}/cloud/publish`, headers: t })).body).toEqual({ available: false, job: null });
  }, 60_000);
});
