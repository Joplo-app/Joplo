/**
 * PR #36 评审修复（D85）。不变量：
 * - P0-1 默认来源的改变绝不能让已经发布过的音频在 update 时丢失：没选过来源（source: default）且有上一次分享时，按分享里的声音指纹沿用并打包；
 * - P1-2 旧版把 OpenAI / ElevenLabs 预设改成别的地址（代理）、请求头或返回格式的：当作不再支持的旧 profile，按原字段算指纹，
 *   绝不把原本给代理的 Key 发到官方地址；删掉它才恢复官方预设；
 * - P1-3 本机文件里 id 恰好是 cloud、但不是 Joplo Cloud 的旧 profile：改名保留为旧 profile（指纹不变），不当作 Joplo Cloud 的覆盖；
 * - P1-4 云端连不上 / 旧云端 404：仍用 cloud 指纹找已有音频（离线也能播），但不生成；cloud 的 NOT_FOUND 停下且不记失败；
 * - P1-5 cloud 在某种语言下自动选的音色，第一次生成时记进项目 index.json，之后推荐列表变了或换了电脑也不变；
 * - P1-6 Joplo Cloud 朗读不在播放时现场生成：边放边生成的接口对 cloud 不请求云端。
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_STYLE, clipKey, type Project } from '@joplo-app/core';
import { ProfileStore, VoiceCache, bundleVoice, fingerprint, resolveVoices, reuseSharedVoice, type CloudCatalog } from '../src/voice.ts';
import { VoiceHub } from '../src/voice-http.ts';
import type { CloudSpeechRequest, CloudVoiceBridge, CloudVoiceStatus } from '../src/cloud.ts';

const MP3 = (seed = '') => Buffer.concat([Buffer.from('ID3'), Buffer.from(seed), Buffer.alloc(48, 1)]);
let home: string, proj: string, out: string;
const dirs: string[] = [];
const tmp = (p: string) => { const d = fs.mkdtempSync(path.join(os.tmpdir(), p)); dirs.push(d); return d; };
beforeEach(() => { home = tmp('joplo-rf-home-'); proj = tmp('joplo-rf-proj-'); out = tmp('joplo-rf-out-'); });
afterEach(() => { for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true }); });

const oldFingerprint = (p: { kind: string; baseUrl: string; model: string; response: string; path?: string; body?: string; style?: string }, voice: string) =>
  crypto.createHash('sha256').update(JSON.stringify([p.kind, p.baseUrl, p.model, voice, p.response, p.path ?? '', p.body ?? '', p.kind === 'openai' && p.style?.trim() && !/^tts-1/i.test(p.model) ? p.style.trim() : ''])).digest('hex').slice(0, 16);
const writeProfiles = (h: string, profiles: unknown[]) => {
  fs.mkdirSync(path.join(h, 'voice'), { recursive: true });
  fs.writeFileSync(path.join(h, 'voice', 'profiles.json'), JSON.stringify({ version: 1, profiles }));
};
const seed = (cache: VoiceCache, fp: string, stepId: string, text: string, locale: string) => {
  const bytes = MP3(`${fp}${text}`);
  cache.adopt(clipKey(fp, text), `${crypto.createHash('sha256').update(bytes).digest('hex')}.mp3`, bytes, { stepId, fp, text, locale });
};

function project(i18n = false): Project {
  const step = (id: string, caption: string) => ({ id, kind: 'system', action: { type: 'event', name: caption }, caption, effects: [], ruleIds: [], shots: [], directorLayer: null, forks: [], marks: [] });
  return {
    schemaVersion: 3, name: 'T', mode: 'publish', routes: {}, features: {},
    ...(i18n ? { i18n: { default: 'zh-CN', locales: ['zh-CN', 'en'], messages: { en: { 一: 'One', 二: 'Two' } } } } : {}),
    scenarios: { 'f.a.s': { id: 'f.a.s', workId: 'f.a', name: 'S', description: '', mock: { label: 'm', outcome: 'success', auto: true }, initial: { sceneId: 'x', ui: {}, data: {}, inputs: {} }, steps: [step('f.a.s#1', '一'), step('f.a.s#2', '二')] } },
    works: { 'f.a': { id: 'f.a', featureId: 'f', layers: {} } },
    scenes: {},
  } as unknown as Project;
}

const catalog = (rec: Record<string, string[]>): CloudCatalog => ({
  model: 'm', defaultVoice: 'narrator-warm-f', recommended: rec,
  voices: ['narrator-warm-f', 'narrator-calm-m', 'bright-f', 'friendly-m', 'clear-f', 'deep-m'].map((id) => ({ id, gender: id.endsWith('-m') ? 'male' : 'female', labels: { en: id }, samples: {} })),
});
const quota = { plan: 'free', period: 'trial' as const, allowanceChars: 5000, usedChars: 0, remainingChars: 5000, resetsAt: null, packs: [], totalRemainingChars: 5000 };
function bridge(voice: 'ok' | 'none' | 'throw' = 'ok', rec: Record<string, string[]> = {}) {
  const calls: CloudSpeechRequest[] = [];
  const b: CloudVoiceBridge = {
    async status(): Promise<CloudVoiceStatus> {
      if (voice === 'throw') throw new Error('ECONNREFUSED');
      return { signedIn: true, server: 'https://cloud.example', voice: voice === 'none' ? null : { ...catalog(rec), quota } };
    },
    async speech(req) { calls.push(req); return { audio: MP3(req.text), contentType: 'audio/mpeg', charged: 1, remaining: 4000, cache: 'miss', sha256: null }; },
  };
  return { b, calls };
}
const ctx = (body: unknown, sent: { status: number; body: unknown }[]) => ({ guardWrite: () => true, jsonBody: async () => ({ ok: true as const, body }), send: (status: number, b: unknown) => void sent.push({ status, body: b }) });

describe('P0-1 share --update：默认来源不丢已发布的音频', () => {
  it('新电脑、已登录（默认 cloud）：按上一次分享的指纹沿用全部音频并打包', async () => {
    // 原来那台电脑：用 OpenAI 生成并发布
    const store = new ProfileStore(home, {});
    store.upsert('openai', {}, 'k');
    const old = new VoiceCache(proj);
    old.select('openai');
    const fp = resolveVoices(undefined, 'openai', store).voices.narrator!;
    for (const [id, t] of [['f.a.s#1', '一'], ['f.a.s#2', '二']] as const) seed(old, fp, id, t, 'zh-CN');
    const published = bundleVoice(proj, project(), out, store).index!;
    // 新电脑：没有 .joplo/voice，没有 profile，但已登录
    const fresh = tmp('joplo-rf-fresh-'), out2 = tmp('joplo-rf-out2-'), h2 = tmp('joplo-rf-h2-');
    const empty = new ProfileStore(h2, {});
    const shared = { index: published, fetch: async (f: string) => fs.readFileSync(path.join(out, f)) };
    expect(await reuseSharedVoice(fresh, project(), shared, empty, undefined, 'cloud')).toBe(2);
    const b = bundleVoice(fresh, project(), out2, empty, undefined, published, 'cloud');
    expect(b.report).toMatchObject({ clips: 2, missing: 0 });
    expect(b.index!.narrator).toBe(fp);
    // 旧 index.json（profileId: null）也一样
    fs.writeFileSync(path.join(fresh, '.joplo', 'voice', 'index.json'), JSON.stringify({ ...JSON.parse(fs.readFileSync(path.join(fresh, '.joplo', 'voice', 'index.json'), 'utf8')), profileId: null, chosen: undefined }));
    expect(bundleVoice(fresh, project(), tmp('joplo-rf-out3-'), empty, undefined, published, 'cloud').report).toMatchObject({ clips: 2, missing: 0 });
  });

  it('多语言：每种语言按分享里的指纹沿用', async () => {
    const store = new ProfileStore(home, {});
    store.upsert('openai', {}, 'k');
    const old = new VoiceCache(proj);
    old.select('openai');
    const fp = resolveVoices(undefined, 'openai', store).voices.narrator!;
    for (const [id, t, l] of [['f.a.s#1', '一', 'zh-CN'], ['f.a.s#2', '二', 'zh-CN'], ['f.a.s#1', 'One', 'en'], ['f.a.s#2', 'Two', 'en']] as const) seed(old, fp, id, t, l);
    const published = bundleVoice(proj, project(true), out, store).index!;
    const fresh = tmp('joplo-rf-fresh-');
    const empty = new ProfileStore(tmp('joplo-rf-h2-'), {});
    expect(await reuseSharedVoice(fresh, project(true), { index: published, fetch: async (f) => fs.readFileSync(path.join(out, f)) }, empty, undefined, 'cloud')).toBe(4);
    expect(bundleVoice(fresh, project(true), tmp('joplo-rf-out2-'), empty, undefined, published, 'cloud').report).toMatchObject({ clips: 4, missing: 0 });
  });
});

describe('P1-2 旧版改过地址的 OpenAI / ElevenLabs 预设', () => {
  const proxied = { id: 'openai', name: 'OpenAI', kind: 'openai', preset: 'openai', baseUrl: 'https://proxy.example/v1', model: 'gpt-4o-mini-tts', voice: 'nova', response: 'audio', style: DEFAULT_STYLE, key: 'sk-proxy-SECRET' };

  it('当作不再支持的旧 profile：指纹按原来的地址算，Key 不给出去，不能再生成，旧音频照常打包', async () => {
    writeProfiles(home, [proxied]);
    const store = new ProfileStore(home, { OPENAI_API_KEY: 'sk-env' });
    const p = store.get('openai')!;
    expect(p).toMatchObject({ unsupported: true, baseUrl: 'https://proxy.example/v1' });
    expect(store.keyOf(p)).toBeNull();
    expect(fingerprint(p, 'nova')).toBe(oldFingerprint(proxied, 'nova'));
    expect(store.list().filter((x) => x.id === 'openai')).toHaveLength(1);
    const cache = new VoiceCache(proj);
    cache.select('openai');
    const r = resolveVoices(undefined, cache.selection(), store);
    seed(cache, r.voices.narrator!, 'f.a.s#1', '一', 'zh-CN');
    const sent: string[] = [];
    await expect(cache.generateOne({ stepId: 'f.a.s#2', text: '二', role: null }, 'zh-CN', r, store, { fetch: async (u, i) => (sent.push(`${u} ${JSON.stringify(i?.headers)}`), new Response(MP3())) })).rejects.toMatchObject({ code: 'UNSUPPORTED' });
    expect(sent).toEqual([]);
    expect(bundleVoice(proj, project(), out, store).report).toMatchObject({ clips: 1 });
    // 改不了（要先删掉旧的）；删掉后恢复官方预设，Key 也一起去掉
    expect(() => store.upsert('openai', {}, 'sk-new')).toThrow(/no longer supported/i);
    store.remove('openai');
    expect(store.get('openai')).toMatchObject({ baseUrl: 'https://api.openai.com/v1' });
    expect(store.get('openai')!.unsupported).toBeUndefined();
    expect(store.keyOf(store.get('openai')!)).toBe('sk-env');
  });

  it('改过请求头或返回格式的也一样；只改了音色和 Key 的照常是官方预设', () => {
    writeProfiles(home, [
      { id: 'elevenlabs', name: 'ElevenLabs', kind: 'elevenlabs', preset: 'elevenlabs', baseUrl: 'https://api.elevenlabs.io/v1', model: 'eleven_multilingual_v2', voice: 'x', response: 'audio', headers: { 'X-Proxy': '{{key}}' }, key: 'xi' },
      { ...proxied, baseUrl: 'https://api.openai.com/v1/', voice: 'cedar', key: 'sk-real' },
    ]);
    const store = new ProfileStore(home, {});
    expect(store.get('elevenlabs')).toMatchObject({ unsupported: true });
    expect(store.get('openai')).toMatchObject({ voice: 'cedar', key: 'sk-real' });
    expect(store.get('openai')!.unsupported).toBeUndefined();
  });
});

describe('P1-3 本机旧 profile 的 id 恰好是 cloud', () => {
  it('改名保留为旧 profile（指纹不变），不当作 Joplo Cloud 的覆盖；之后改 Joplo Cloud 的音色也不会把它删掉', () => {
    const legacy = { id: 'cloud', name: 'My Cloud TTS', kind: 'http', baseUrl: 'https://tts.example/api', model: '', voice: 'v1', response: 'audio', body: '{"q":"{{text}}"}', key: 'k' };
    writeProfiles(home, [legacy]);
    const store = new ProfileStore(home, {});
    expect(store.get('cloud')).toMatchObject({ kind: 'cloud', name: 'Joplo Cloud', voice: 'narrator-warm-f' });
    const old = store.list().find((p) => p.name === 'My Cloud TTS')!;
    expect(old).toMatchObject({ unsupported: true, kind: 'http' });
    expect(old.id).not.toBe('cloud');
    expect(fingerprint(old, 'v1')).toBe(oldFingerprint(legacy, 'v1'));
    expect(store.find('My Cloud TTS')?.id).toBe(old.id);
    store.upsert('cloud', { voice: 'deep-m' }, undefined);
    expect(new ProfileStore(home, {}).list().find((p) => p.name === 'My Cloud TTS')).toBeTruthy();
  });
});

describe('P1-4 云端连不上 / 旧云端 404', () => {
  for (const mode of ['none', 'throw'] as const) {
    it(`${mode === 'none' ? '旧云端（没有 /api/v1/voice）' : '连不上'}：仍用 cloud 指纹找已有音频，但生成不请求云端`, async () => {
      const { b, calls } = bridge(mode);
      const hub = new VoiceHub(home, { emit: () => undefined, env: {}, cloud: b });
      const st = await hub.state('p', proj, project());
      expect(st).toMatchObject({ source: 'default', profile: { id: 'cloud' }, cloud: { available: false } });
      expect(st.voices.narrator).toBeTruthy();
      const sent: { status: number; body: unknown }[] = [];
      await hub.handleProject('p', proj, project(), 'generate', { method: 'POST' } as never, {} as never, ctx({ locale: 'en', segments: [{ stepId: 'f.a.s#1', text: '一', role: null }] }, sent));
      expect(calls).toHaveLength(0);
      expect((sent[0]!.body as { summary: { error?: { code: string }; failed: unknown[] } }).summary).toMatchObject({ error: { code: 'TTS_UNAVAILABLE' }, failed: [] });
    });
  }

  it('cloud 合成收到 NOT_FOUND（旧云端）：停下，不记成步骤失败', async () => {
    const store = new ProfileStore(home, {});
    const cache = new VoiceCache(proj);
    const r = resolveVoices(undefined, 'cloud', store);
    let n = 0;
    const b: CloudVoiceBridge = { status: async () => ({ signedIn: true, server: 's', voice: null }), speech: async () => { n++; throw Object.assign(new Error('no narration here'), { code: 'NOT_FOUND' }); } };
    const s = await cache.generate([{ stepId: 'a', text: 'One', role: null }, { stepId: 'b', text: 'Two', role: null }, { stepId: 'c', text: 'Three', role: null }], 'en', r, store, { cloud: b });
    expect(s.failed).toEqual([]);
    expect(s.error).toMatchObject({ code: 'NOT_FOUND' });
    expect(n).toBeLessThanOrEqual(2);
    expect(cache.current(r.voices).failures).toEqual({});
  });
});

describe('P1-5 cloud 自动选的音色记进项目', () => {
  it('第一次生成时记下；推荐列表变了、换了电脑（没有 cloud-voices.json）也不变，打包找得到音频', async () => {
    const live = { rec: { en: ['bright-f'] } as Record<string, string[]> };
    const store = new ProfileStore(home, {}, { catalog: () => catalog(live.rec) });
    const cache = new VoiceCache(proj);
    cache.select('cloud');
    const r = resolveVoices(undefined, cache.selection(), store, 'en', null, cache.pins());
    expect(r.narrator).toBe('bright-f');
    await cache.generateOne({ stepId: 'f.a.s#1', text: 'One', role: null }, 'en', r, store, { cloud: bridge().b });
    expect(cache.pins()).toEqual({ en: { 'narrator-warm-f': 'bright-f' } });
    // 云端改了推荐
    live.rec = { en: ['clear-f'] };
    expect(resolveVoices(undefined, cache.selection(), store, 'en', null, cache.pins()).narrator).toBe('bright-f');
    // 另一台电脑：没有音色表缓存（内置的，没有推荐）
    const other = new ProfileStore(tmp('joplo-rf-h3-'), {});
    expect(resolveVoices(undefined, 'cloud', other, 'en', null, cache.pins()).narrator).toBe('bright-f');
    expect(bundleVoice(proj, project(true), out, other).report.clips).toBe(1);
    // 没生成过的语言仍按推荐挑；config 指定的照常优先
    expect(resolveVoices(undefined, 'cloud', store, 'ja', null, cache.pins()).narrator).toBe('narrator-warm-f');
    expect(resolveVoices({ locales: { en: { narrator: 'deep-m' } } }, 'cloud', store, 'en', null, cache.pins()).narrator).toBe('deep-m');
  });
});

describe('P1-6 Joplo Cloud 朗读不在播放时现场生成', () => {
  it('边放边生成的接口对 cloud 不请求云端；OpenAI 照常', async () => {
    const { b, calls } = bridge();
    const hub = new VoiceHub(home, { emit: () => undefined, env: {}, cloud: b });
    const sent: { status: number; body: unknown }[] = [];
    await hub.handleProject('p', proj, project(), 'clip', { method: 'POST' } as never, {} as never, ctx({ locale: 'en', segment: { stepId: 'f.a.s#1', text: '一', role: null } }, sent));
    expect(calls).toHaveLength(0);
    expect(sent[0]).toMatchObject({ status: 409, body: { error: { code: 'CLOUD_GENERATE_ONLY' } } });
    // 点“生成缺少的音频”才请求
    await hub.handleProject('p', proj, project(), 'generate', { method: 'POST' } as never, {} as never, ctx({ locale: 'en', segments: [{ stepId: 'f.a.s#1', text: '一', role: null }] }, sent));
    expect(calls).toHaveLength(1);
  });
});
