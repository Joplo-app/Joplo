/**
 * 看板设置（D51）：<JOPLO_HOME>/settings.json 的规范化、读写，以及 GET / PUT /__joplo/settings（带令牌）。
 * JOPLO_HOME 指向临时目录。
 */
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createHub, type Hub } from '../src/dev.ts';
import { normalizeSettings, readSettings, writeSettings } from '../src/home.ts';

const tmp = () => fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'joplo-settings-')));
function req(port: number, method: string, p: string, headers: Record<string, string> = {}, body?: string): Promise<{ status: number; body: any }> {
  return new Promise((resolve, reject) => {
    const r = http.request({ host: '127.0.0.1', port, method, path: p, headers: { host: `127.0.0.1:${port}`, ...headers } }, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode!, body: JSON.parse(Buffer.concat(chunks).toString('utf8') || 'null') }));
    });
    r.on('error', reject);
    if (body !== undefined) r.write(body);
    r.end();
  });
}

describe('settings.json', () => {
  it('规范化：只留合法的主题名与项目 id；null 表示恢复为项目默认；未知字段丢弃', () => {
    expect(normalizeSettings({ theme: 'nord', junk: 1, projects: { 'p-1a2b3c': { theme: 'dracula' }, 'p-2': { theme: null }, 'bad id!': { theme: 'x' }, p3: { theme: '1bad' } } })).toEqual({
      version: 1,
      theme: 'nord',
      projects: { 'p-1a2b3c': { theme: 'dracula' }, 'p-2': { theme: null } },
    });
    expect(normalizeSettings(null)).toEqual({ version: 1 });
    expect(normalizeSettings({ theme: '../../etc' })).toEqual({ version: 1 });
  });
  it('外观（D55）：font / stroke 只留合法值，null = 跟随主题；未知字体、未知线条丢弃；项目条目只留合法字段', () => {
    expect(normalizeSettings({ theme: 'nord', font: 'serif', stroke: 'clean' })).toEqual({ version: 1, theme: 'nord', font: 'serif', stroke: 'clean' });
    expect(normalizeSettings({ font: null, stroke: null })).toEqual({ version: 1, font: null, stroke: null });
    expect(normalizeSettings({ font: 'comic-sans', stroke: 'zigzag' })).toEqual({ version: 1 });
    expect(normalizeSettings({ font: 3, stroke: {} })).toEqual({ version: 1 });
    expect(
      normalizeSettings({
        projects: {
          p1: { font: 'kai' },
          p2: { theme: null, font: null, stroke: null },
          p3: { font: 'nope', stroke: 'nope' },
          p4: { theme: 'kraft', font: 'nope', stroke: 'rough' },
          p5: {},
          p6: null,
        },
      }),
    ).toEqual({ version: 1, projects: { p1: { font: 'kai' }, p2: { theme: null, font: null, stroke: null }, p4: { theme: 'kraft', stroke: 'rough' } } });
  });
  it('边界输入：数组、字符串、数字、projects 是数组或 null 都按空设置处理，不抛错', () => {
    for (const v of [[], 'x', 42, true, undefined, { projects: [] }, { projects: null }, { projects: 'x' }]) expect(normalizeSettings(v)).toEqual({ version: 1 });
  });
  it('旧版 settings.json（只有 theme）照常读取', () => {
    const home = tmp();
    fs.writeFileSync(path.join(home, 'settings.json'), JSON.stringify({ version: 1, theme: 'nord', projects: { 'p-1': { theme: 'dracula' }, 'p-2': { theme: null } } }));
    expect(readSettings(home)).toEqual({ version: 1, theme: 'nord', projects: { 'p-1': { theme: 'dracula' }, 'p-2': { theme: null } } });
  });
  it('读写：原子写入；文件不存在或损坏时返回空设置', () => {
    const home = tmp();
    expect(readSettings(home)).toEqual({ version: 1 });
    writeSettings(home, { theme: 'kraft' });
    expect(readSettings(home)).toEqual({ version: 1, theme: 'kraft' });
    fs.writeFileSync(path.join(home, 'settings.json'), '{oops');
    expect(readSettings(home)).toEqual({ version: 1 });
  });
});

describe('GET / PUT /__joplo/settings', () => {
  let hub: Hub;
  const home = tmp();
  beforeAll(async () => {
    hub = await createHub({ port: 0, log: () => undefined, watch: false, home });
  });
  afterAll(async () => {
    await hub?.close();
  });
  it('读取；写入要令牌；写入后落到 <JOPLO_HOME>/settings.json', async () => {
    expect((await req(hub.port, 'GET', '/__joplo/settings')).body).toEqual({ settings: { version: 1 } });
    const body = JSON.stringify({ settings: { theme: 'nord', projects: { 'demo-abc123': { theme: null } } } });
    expect((await req(hub.port, 'PUT', '/__joplo/settings', { 'content-type': 'application/json' }, body)).status).toBe(403);
    const ok = await req(hub.port, 'PUT', '/__joplo/settings', { 'content-type': 'application/json', 'x-joplo-token': hub.token }, body);
    expect(ok.status).toBe(200);
    expect(ok.body.settings).toEqual({ version: 1, theme: 'nord', projects: { 'demo-abc123': { theme: null } } });
    expect(JSON.parse(fs.readFileSync(path.join(home, 'settings.json'), 'utf8')).theme).toBe('nord');
    expect((await req(hub.port, 'GET', '/__joplo/settings')).body.settings.theme).toBe('nord');
  });
  it('外观（D55）：PUT 写入 font / stroke → settings.json → GET 读回；非法值在服务端丢弃', async () => {
    const body = JSON.stringify({ settings: { theme: 'nord', font: 'hand', stroke: 'bogus', projects: { 'demo-abc123': { font: 'serif', stroke: 'clean' } } } });
    const ok = await req(hub.port, 'PUT', '/__joplo/settings', { 'content-type': 'application/json', 'x-joplo-token': hub.token }, body);
    expect(ok.status).toBe(200);
    expect(ok.body.settings).toEqual({ version: 1, theme: 'nord', font: 'hand', projects: { 'demo-abc123': { font: 'serif', stroke: 'clean' } } });
    const file = JSON.parse(fs.readFileSync(path.join(home, 'settings.json'), 'utf8'));
    expect(file.font).toBe('hand');
    expect(file.stroke).toBeUndefined();
    expect(file.projects['demo-abc123']).toEqual({ font: 'serif', stroke: 'clean' });
    expect((await req(hub.port, 'GET', '/__joplo/settings')).body.settings).toEqual(ok.body.settings);
  });
});
