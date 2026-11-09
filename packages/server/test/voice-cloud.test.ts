/**
 * D85 托管朗读与“只留官方声音来源”的服务端。不变量：
 * 1. 声音来源只有 cloud（第一）、openai、elevenlabs；不再有 aihubmix 预设、自定义 Base URL 与 http 类型，不读 AIHUBMIX_API_KEY；
 * 2. 本机已有的旧 profile（自建的 OpenAI 兼容、http、原来的 aihubmix）列为“不再支持”：不能再生成，但声音指纹不变，
 *    已生成的音频照常播放、照常随 build / share 带上；
 * 3. cloud 合成不用 Key，经 bridge.speech 发 { text, voice, locale, project }；每段用响应头的剩余字数更新（不在本地估算）；
 * 4. 项目没选过声音来源、config 也没写时：已登录默认 cloud，没登录默认浏览器朗读；选过“浏览器朗读”就一直是浏览器朗读；
 * 5. 字数按 Array.from(文字) 计，只算缺音频的段，同一段只算一次；
 * 6. 402 时停止生成：已生成的保留，之后不再发新的请求；剩下的步骤由网页用浏览器朗读；
 * 7. 多语言（D84）：cloud 用 recommended[语言]（音色在推荐里就不换，否则同性别优先），config.voice.locales 仍然优先；
 * 8. 云端连不上、没登录、旧云端没有 /api/v1/voice（404）都不报错：音色退回内置的 6 个，看板退回浏览器朗读。
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_STYLE, clipKey, type Project } from '@joplo-app/core';
import { CLOUD_VOICE_IDS, PRESETS, ProfileStore, VoiceCache, VoiceError, bundleVoice, estimateVoice, fingerprint, resolveVoices, type CloudCatalog } from '../src/voice.ts';
import { VoiceHub } from '../src/voice-http.ts';
import type { CloudSpeechRequest, CloudVoiceBridge, CloudVoiceStatus } from '../src/cloud.ts';
import { generateProjectVoice } from '../src/voice-run.ts';

const MP3 = (seed = '') => Buffer.concat([Buffer.from('ID3'), Buffer.from(seed), Buffer.alloc(48, 1)]);
let home: string, proj: string, out: string;
beforeEach(() => {
  home = fs.mkdtempSync(path.join(os.tmpdir(), 'joplo-vc-home-'));
  proj = fs.mkdtempSync(path.join(os.tmpdir(), 'joplo-vc-proj-'));
  out = fs.mkdtempSync(path.join(os.tmpdir(), 'joplo-vc-out-'));
});
afterEach(() => { for (const d of [home, proj, out]) fs.rmSync(d, { recursive: true, force: true }); });

/** 旧版 voice.ts 的指纹算法（迁移前），用来确认旧音频的键没有变。 */
const oldFingerprint = (p: { kind: string; baseUrl: string; model: string; response: string; path?: string; body?: string; style?: string }, voice: string) =>
  crypto.createHash('sha256').update(JSON.stringify([p.kind, p.baseUrl, p.model, voice, p.response, p.path ?? '', p.body ?? '', p.kind === 'openai' && p.style?.trim() && !/^tts-1/i.test(p.model) ? p.style.trim() : ''])).digest('hex').slice(0, 16);

const writeProfiles = (profiles: unknown[]) => {
  fs.mkdirSync(path.join(home, 'voice'), { recursive: true });
  fs.writeFileSync(path.join(home, 'voice', 'profiles.json'), JSON.stringify({ version: 1, profiles }));
};

const catalog: CloudCatalog = {
  model: 'joplo-tts-1',
  defaultVoice: 'narrator-warm-f',
  voices: CLOUD_VOICE_IDS.map((id) => ({ id, gender: /-m$/.test(id) ? 'male' : 'female', labels: { en: `Label ${id}`, 'zh-CN': `音色 ${id}` }, samples: { en: `https://cdn.example/${id}.en.mp3` } })),
  recommended: { ja: ['bright-f', 'deep-m'], en: ['narrator-warm-f', 'narrator-calm-m'] },
};
const quota = (total: number) => ({ plan: 'free', period: 'trial' as const, allowanceChars: 5000, usedChars: 5000 - total, remainingChars: total, resetsAt: null, packs: [], totalRemainingChars: total });

function fakeBridge(opts: { signedIn?: boolean; voice?: 'ok' | 'none'; speech?: (req: CloudSpeechRequest, n: number) => Promise<{ audio: Uint8Array; remaining: number | null; charged?: number }> } = {}) {
  const calls: CloudSpeechRequest[] = [];
  let statusCalls = 0;
  const bridge: CloudVoiceBridge = {
    async status(): Promise<CloudVoiceStatus> {
      statusCalls++;
      if (opts.signedIn === false) return { signedIn: false, server: 'https://cloud.example', loginCommand: 'npx joplo login --server https://cloud.example' };
      return { signedIn: true, server: 'https://cloud.example', voice: opts.voice === 'none' ? null : { ...catalog, quota: quota(3200) } };
    },
    async speech(req) {
      calls.push(req);
      const r = opts.speech ? await opts.speech(req, calls.length) : { audio: MP3(req.text), remaining: 3200 - Array.from(req.text).length };
      return { audio: r.audio, contentType: 'audio/mpeg', charged: r.charged ?? Array.from(req.text).length, remaining: r.remaining, cache: 'miss', sha256: null };
    },
  };
  return { bridge, calls, statusCalls: () => statusCalls };
}

const quotaError = (needed: number, remaining: number) => Object.assign(new Error('Not enough narration characters'), { code: 'TTS_QUOTA_EXCEEDED', data: { neededChars: needed, remainingChars: remaining, usagePath: '/usage' } });

function project(name = 'Team space'): Project {
  const step = (id: string, caption: string) => ({ id, kind: 'system', action: { type: 'event', name: caption }, caption, effects: [], ruleIds: [], shots: [], directorLayer: null, traces: [], forks: [], marks: [] });
  return {
    schemaVersion: 2, name, mode: 'publish', routes: {}, features: {},
    scenarios: { 'f.a.s': { id: 'f.a.s', optionId: 'f.a', name: 'S', description: '', mock: { label: 'm', outcome: 'success', auto: true }, initial: { sceneId: 'x', ui: {}, data: {}, inputs: {} }, steps: [step('f.a.s#1', 'One'), step('f.a.s#2', 'Two'), step('f.a.s#3', 'Three'), step('f.a.s#4', 'Four')] } },
    options: { 'f.a': { id: 'f.a', featureId: 'f', layers: {} } },
    scenes: {},
  } as unknown as Project;
}
const segs = ['One', 'Two', 'Three', 'Four'].map((text, i) => ({ stepId: `f.a.s#${i + 1}`, text, role: null }));

describe('只留官方的声音来源', () => {
  it('预设只有 cloud（第一）、openai、elevenlabs；不读 AIHUBMIX_API_KEY；cloud 不要 Key', () => {
    const store = new ProfileStore(home, { AIHUBMIX_API_KEY: 'k', OPENAI_API_KEY: 'sk-1' });
    expect(PRESETS.map((p) => p.id)).toEqual(['cloud', 'openai', 'elevenlabs']);
    expect(store.list().map((p) => p.id)).toEqual(['cloud', 'openai', 'elevenlabs']);
    expect(store.list().some((p) => p.unsupported)).toBe(false);
    expect(store.keyOf(store.get('openai')!)).toBe('sk-1');
    expect(store.get('cloud')).toMatchObject({ kind: 'cloud', name: 'Joplo Cloud', voice: 'narrator-warm-f' });
    expect(store.publicOf(store.get('cloud')!).voices.map((v) => v.id)).toEqual([...CLOUD_VOICE_IDS]);
  });

  it('不能新建自定义 profile；OpenAI / ElevenLabs 的接口地址固定（提交的 Base URL 被忽略，旧的覆盖也不生效）', () => {
    const store = new ProfileStore(home, {});
    expect(() => store.upsert(null, { name: 'Mine', kind: 'openai', baseUrl: 'https://proxy.example/v1', voice: 'nova' }, 'k')).toThrow(VoiceError);
    expect(() => store.upsert(null, { name: 'H', kind: 'http', baseUrl: 'https://x', body: '{"q":"{{text}}"}' }, null)).toThrow(/no longer supported/i);
    const saved = store.upsert('openai', { baseUrl: 'https://proxy.example/v1', voice: 'cedar' }, 'sk-2');
    expect(saved).toMatchObject({ baseUrl: 'https://api.openai.com/v1', voice: 'cedar' });
    expect(store.get('openai')).toMatchObject({ baseUrl: 'https://api.openai.com/v1', voice: 'cedar', key: 'sk-2' });
    // 只换 Key（看板「管理密钥」）：其他字段不变
    store.upsert('openai', undefined, 'sk-3');
    expect(store.get('openai')).toMatchObject({ voice: 'cedar', key: 'sk-3' });
    store.upsert('elevenlabs', {}, 'xi');
    expect(store.get('elevenlabs')!.baseUrl).toBe('https://api.elevenlabs.io/v1');
  });
});

describe('旧 profile：标为不再支持，但已生成的音频照常', () => {
  const legacy = [
    { id: 'acme', name: 'Acme Gateway', kind: 'openai', baseUrl: 'https://llm.acme.internal/v1', model: 'tts-1', voice: 'nova', response: 'audio', key: 'sk-legacy-secret-1' },
    { id: 'my-http', name: 'My HTTP', kind: 'http', baseUrl: 'https://tts.example/api', model: '', voice: 'v', response: 'json-base64', path: 'data.audio', body: '{"q":"{{text}}"}' },
    { id: 'aihubmix', name: 'AiHubMix', kind: 'openai', baseUrl: 'https://aihubmix.com/v1', model: 'gpt-4o-mini-tts', voice: 'cedar', response: 'audio', style: DEFAULT_STYLE, key: 'k2' },
  ];

  it('列在预设之后、标 unsupported；指纹与迁移前一致', () => {
    writeProfiles(legacy);
    const store = new ProfileStore(home, {});
    const list = store.list();
    expect(list.map((p) => [p.id, !!p.unsupported])).toEqual([['cloud', false], ['openai', false], ['elevenlabs', false], ['acme', true], ['my-http', true], ['aihubmix', true]]);
    for (const l of legacy) expect(fingerprint(store.get(l.id)!, l.voice)).toBe(oldFingerprint(l, l.voice));
    expect(store.publicOf(store.get('acme')!)).toMatchObject({ unsupported: true, removable: true });
    expect(JSON.stringify(store.publicOf(store.get('acme')!))).not.toContain('sk-legacy-secret-1');
  });

  it('只用环境变量、从没存过的 aihubmix 被项目选着：仍然找得到（不再支持），指纹不变', () => {
    const store = new ProfileStore(home, { AIHUBMIX_API_KEY: 'k' });
    const p = store.get('aihubmix');
    expect(p).toMatchObject({ unsupported: true, name: 'AiHubMix' });
    expect(store.list().some((x) => x.id === 'aihubmix')).toBe(false);
    expect(store.find('AiHubMix')?.id).toBe('aihubmix');
    expect(fingerprint(p!, 'marin')).toBe(oldFingerprint({ kind: 'openai', baseUrl: 'https://aihubmix.com/v1', model: 'gpt-4o-mini-tts', response: 'audio', style: DEFAULT_STYLE }, 'marin'));
    expect(store.keyOf(p!)).toBeNull();
  });

  it('不能再生成（UNSUPPORTED，不发请求）；已生成的音频照常打包', async () => {
    writeProfiles(legacy);
    const store = new ProfileStore(home, {});
    const cache = new VoiceCache(proj);
    cache.select('acme');
    const resolved = resolveVoices(undefined, cache.selection(), store);
    expect(resolved.profile?.unsupported).toBe(true);
    // 手工放一段“以前生成的”音频
    const fp = resolved.voices.narrator!;
    const bytes = MP3('old');
    const file = `${crypto.createHash('sha256').update(bytes).digest('hex')}.mp3`;
    expect(cache.adopt(clipKey(fp, 'One'), file, bytes, { stepId: 'f.a.s#1', fp, text: 'One', locale: 'en' })).toBe(true);
    let fetched = 0;
    await expect(cache.generateOne(segs[1]!, 'en', resolved, store, { fetch: async () => (fetched++, new Response(MP3())) })).rejects.toMatchObject({ code: 'UNSUPPORTED' });
    const summary = await cache.generate(segs, 'en', resolved, store, { fetch: async () => (fetched++, new Response(MP3())) });
    expect(summary).toMatchObject({ unsupported: true, generated: 0 });
    expect(fetched).toBe(0);
    const b = bundleVoice(proj, project(), out, store);
    expect(b.report).toMatchObject({ clips: 1, missing: 3, profile: 'Acme Gateway' });
    expect(fs.existsSync(path.join(out, 'voice', file))).toBe(true);
  });
});

describe('Joplo Cloud 朗读的合成', () => {
  it('不要 Key：经 bridge.speech 发 text / voice / locale / project；写进缓存，剩余字数来自响应', async () => {
    const store = new ProfileStore(home, {});
    const cache = new VoiceCache(proj);
    const resolved = resolveVoices(undefined, 'cloud', store);
    const { bridge, calls } = fakeBridge({ speech: async (req) => ({ audio: MP3(req.text), remaining: 1234 }) });
    const remaining: (number | null)[] = [];
    const r = await cache.generateOne(segs[0]!, 'ja', resolved, store, { cloud: bridge, project: 'Team space', speechLocale: 'ja', onCloud: (x) => remaining.push(x.remaining) });
    expect(r.generated).toBe(true);
    expect(calls).toEqual([{ text: 'One', voice: 'narrator-warm-f', locale: 'ja', project: 'Team space' }]);
    expect(remaining).toEqual([1234]);
    expect(cache.current(resolved.voices).clips[r.key]).toBe(r.file);
    // 不知道内容语言（项目没写 locales）时不带 locale，让云端按文字判断
    await cache.generateOne(segs[1]!, 'en', resolved, store, { cloud: bridge, project: 'Team space' });
    expect(calls[1]).toEqual({ text: 'Two', voice: 'narrator-warm-f', project: 'Team space' });
  });

  it('没有 bridge（旧 CLI 启动的看板）：报错，不崩', async () => {
    const store = new ProfileStore(home, {});
    const cache = new VoiceCache(proj);
    await expect(cache.generateOne(segs[0]!, 'en', resolveVoices(undefined, 'cloud', store), store, {})).rejects.toMatchObject({ code: 'CLOUD_UNAVAILABLE' });
  });

  it('402：停止生成，已生成的保留，之后不再发请求；摘要带需要多少 / 还剩多少', async () => {
    const store = new ProfileStore(home, {});
    const cache = new VoiceCache(proj);
    const resolved = resolveVoices(undefined, 'cloud', store);
    // 第一段慢一点：402 先到，第一段完成后也不再取新的段
    const { bridge, calls } = fakeBridge({ speech: async (req, n) => { if (n === 1) { await new Promise((r) => setTimeout(r, 20)); return { audio: MP3(req.text), remaining: 2 }; } throw quotaError(3, 2); } });
    const summary = await cache.generate(segs, 'en', resolved, store, { cloud: bridge, project: 'P' });
    expect(calls.length).toBe(2); // 两个并发的请求之后不再发新的
    expect(summary).toMatchObject({ total: 4, generated: 1, quota: { neededChars: 3, remainingChars: 2 } });
    expect(summary.stopped).toBe(2);
    expect(Object.keys(cache.current(resolved.voices).clips)).toHaveLength(1);
    // 额度不够不是哪一步的错：不记进 failures
    expect(cache.current(resolved.voices).failures).toEqual({});
  });

  it('503 / 网络错误：记进 failures（下次重试），不扣字数也不停止其他段', async () => {
    const store = new ProfileStore(home, {});
    const cache = new VoiceCache(proj);
    const resolved = resolveVoices(undefined, 'cloud', store);
    const { bridge, calls } = fakeBridge({ speech: async (req) => { if (req.text === 'Two') throw Object.assign(new Error('Narration is temporarily unavailable'), { code: 'TTS_UNAVAILABLE' }); return { audio: MP3(req.text), remaining: 10 }; } });
    const summary = await cache.generate(segs, 'en', resolved, store, { cloud: bridge });
    expect(calls.length).toBe(4);
    expect(summary).toMatchObject({ generated: 3, failed: [{ stepId: 'f.a.s#2' }] });
    expect(summary.quota).toBeUndefined();
  });
});

describe('默认声音来源', () => {
  it('没选过：已登录用 cloud（source: default），没登录用浏览器朗读；选过浏览器朗读就一直是浏览器朗读；config 优先', () => {
    const store = new ProfileStore(home, {});
    const cache = new VoiceCache(proj);
    expect(cache.selection()).toBeUndefined();
    expect(resolveVoices(undefined, cache.selection(), store, null, 'cloud')).toMatchObject({ source: 'default', profile: { id: 'cloud' }, narrator: 'narrator-warm-f' });
    expect(resolveVoices(undefined, cache.selection(), store, null, null).profile).toBeNull();
    cache.select(null);
    expect(cache.selection()).toBeNull();
    expect(resolveVoices(undefined, cache.selection(), store, null, 'cloud').profile).toBeNull();
    expect(resolveVoices({ profile: 'openai' }, cache.selection(), store, null, 'cloud')).toMatchObject({ source: 'config', profile: { id: 'openai' } });
    cache.select('elevenlabs');
    expect(resolveVoices(undefined, cache.selection(), store, null, 'cloud')).toMatchObject({ source: 'board', profile: { id: 'elevenlabs' } });
  });

  it('旧版写下的 index.json（profileId: null、没有 chosen）算“没选过”；写过音频也不改变这一点', () => {
    fs.mkdirSync(path.join(proj, '.joplo', 'voice'), { recursive: true });
    fs.writeFileSync(path.join(proj, '.joplo', 'voice', 'index.json'), JSON.stringify({ version: 1, profileId: null, clips: {}, failures: {} }));
    const cache = new VoiceCache(proj);
    expect(cache.selection()).toBeUndefined();
    cache.write(cache.read());
    expect(cache.selection()).toBeUndefined();
    fs.writeFileSync(path.join(proj, '.joplo', 'voice', 'index.json'), JSON.stringify({ version: 1, profileId: 'openai', clips: {}, failures: {} }));
    expect(new VoiceCache(proj).selection()).toBe('openai');
  });

  it('VoiceHub：已登录时没选过的项目默认 cloud；没登录时浏览器朗读并给登录命令；云端连不上 / 旧云端时不报错', async () => {
    const signedIn = new VoiceHub(home, { emit: () => undefined, env: {}, cloud: fakeBridge().bridge });
    const a = await signedIn.state('p', proj, project());
    expect(a).toMatchObject({ source: 'default', profile: { id: 'cloud' }, cloud: { signedIn: true, available: true, quota: { totalRemainingChars: 3200 }, usageUrl: 'https://cloud.example/usage' } });
    const signedOut = new VoiceHub(home, { emit: () => undefined, env: {}, cloud: fakeBridge({ signedIn: false }).bridge });
    expect(await signedOut.state('p', proj, project())).toMatchObject({ profile: null, cloud: { signedIn: false, loginCommand: 'npx joplo login --server https://cloud.example' } });
    const old = new VoiceHub(home, { emit: () => undefined, env: {}, cloud: fakeBridge({ voice: 'none' }).bridge });
    const s = await old.state('p', proj, project());
    expect(s.cloud).toMatchObject({ signedIn: true, available: false, quota: null });
    // 音色退回内置的 6 个（英文标签）
    expect(s.profile?.voices.map((v) => v.id)).toEqual([...CLOUD_VOICE_IDS]);
    const broken: CloudVoiceBridge = { status: async () => { throw new Error('ECONNREFUSED'); }, speech: async () => { throw new Error('no'); } };
    const hub = new VoiceHub(home, { emit: () => undefined, env: {}, cloud: broken });
    expect((await hub.state('p', proj, project())).cloud).toMatchObject({ available: false });
    // 没有 bridge（旧 CLI）：cloud 为 null，没选过时用浏览器朗读
    expect(await new VoiceHub(home, { emit: () => undefined, env: {} }).state('p', proj, project())).toMatchObject({ cloud: null, profile: null });
  });

  it('VoiceHub 缓存云端状态：短时间内多次取状态只问一次云端', async () => {
    const f = fakeBridge();
    const hub = new VoiceHub(home, { emit: () => undefined, env: {}, cloud: f.bridge });
    await hub.state('p', proj, project());
    await hub.state('p', proj, project());
    expect(f.statusCalls()).toBe(1);
  });
});

describe('字数估算与剩余字数', () => {
  it('只算缺音频的段、同一段只算一次，按 Array.from 计字（emoji 与中文都算 1 个）', async () => {
    const store = new ProfileStore(home, {});
    const cache = new VoiceCache(proj);
    const resolved = resolveVoices(undefined, 'cloud', store);
    const list = [{ stepId: 's1', text: '你好 👋', role: null }, { stepId: 's2', text: '你好  👋 ', role: null }, { stepId: 's3', text: 'Hello', role: null }, { stepId: 's4', text: '   ', role: null }];
    expect(estimateVoice(list, resolved, cache)).toEqual({ steps: 2, chars: 4 + 5 });
    await cache.generateOne(list[2]!, 'en', resolved, store, { cloud: fakeBridge().bridge });
    expect(estimateVoice(list, resolved, cache)).toEqual({ steps: 1, chars: 4 });
    expect(estimateVoice(list, resolveVoices(undefined, null, store), cache)).toEqual({ steps: 0, chars: 0 });
  });

  it('VoiceHub 生成：每段用响应头的剩余字数更新状态；402 后状态里标出额度不够', async () => {
    let left = 100;
    const f = fakeBridge({ speech: async (req, n) => { if (n > 2) throw quotaError(5, 1); left -= 7; return { audio: MP3(req.text), remaining: left }; } });
    const states: { remaining: number | null | undefined; exhausted: unknown }[] = [];
    const hub = new VoiceHub(home, { emit: (_id, s) => states.push({ remaining: s.cloud?.quota?.totalRemainingChars, exhausted: s.cloud?.exhausted }), env: {}, cloud: f.bridge });
    const sent: { status: number; body: unknown }[] = [];
    const ctx = { guardWrite: () => true, jsonBody: async () => ({ ok: true as const, body: { locale: 'en', segments: segs } }), send: (status: number, body: unknown) => void sent.push({ status, body }) };
    await hub.handleProject('p', proj, project(), 'generate', { method: 'POST' } as never, {} as never, ctx);
    const body = sent[0]!.body as { summary: { generated: number; quota?: unknown }; state: { cloud: { quota: { totalRemainingChars: number }; exhausted: unknown } } };
    expect(body.summary).toMatchObject({ generated: 2, quota: { neededChars: 5, remainingChars: 1 } });
    // 剩余以云端最后一次给的数字为准（402 里的 remainingChars）
    expect(body.state.cloud.quota.totalRemainingChars).toBe(1);
    expect(body.state.cloud.exhausted).toMatchObject({ neededChars: 5, remainingChars: 1 });
    // 推送里的剩余字数只来自云端（3200 → 响应头的 93 / 86 → 402 的 1），不是本地按字数减出来的
    const seen = states.map((s) => s.remaining);
    expect(seen).toContain(86);
    expect(seen.every((n) => [3200, 93, 86, 1].includes(n as number))).toBe(true);
    expect(seen.at(-1)).toBe(1);
    // 边放边生成：Joplo Cloud 朗读不在播放时现场生成（P1-6），不再问云端
    const before = f.calls.length;
    const clip: { status: number; body: unknown }[] = [];
    await hub.handleProject('p', proj, project(), 'clip', { method: 'POST' } as never, {} as never, { ...ctx, jsonBody: async () => ({ ok: true as const, body: { locale: 'en', segment: segs[3] } }), send: (status: number, b: unknown) => void clip.push({ status, body: b }) });
    expect(clip[0]).toMatchObject({ status: 409, body: { error: { code: 'CLOUD_GENERATE_ONLY' } } });
    expect(f.calls.length).toBe(before);
  });
});

describe('多语言下 cloud 的推荐音色（D84）', () => {
  it('非默认语言用 recommended[语言]：音色在推荐里就不换，否则同性别优先；config.voice.locales 优先；默认语言不换', () => {
    const store = new ProfileStore(home, {}, { catalog: () => catalog });
    const cfg = { roles: { leo: 'friendly-m' }, locales: { en: { narrator: 'clear-f' } } };
    const ja = resolveVoices(cfg, 'cloud', store, 'ja');
    expect(ja.narrator).toBe('bright-f');
    expect(ja.roles.leo).toBe('deep-m');
    expect(resolveVoices({ narrator: 'deep-m' }, 'cloud', store, 'ja').narrator).toBe('deep-m');
    expect(resolveVoices(cfg, 'cloud', store, 'en').narrator).toBe('clear-f');
    expect(resolveVoices(cfg, 'cloud', store, null).narrator).toBe('narrator-warm-f');
    // 没有这种语言的推荐：不换
    expect(resolveVoices(cfg, 'cloud', store, 'ko').narrator).toBe('narrator-warm-f');
  });

  it('云端给过的音色表存在本机：之后连不上（或 build 时）选的音色不变，打包找得到音频', () => {
    new ProfileStore(home, {}, { catalog: () => catalog }).rememberCloudCatalog(catalog);
    const offline = new ProfileStore(home, {});
    expect(resolveVoices(undefined, 'cloud', offline, 'ja').narrator).toBe('bright-f');
    expect(offline.publicOf(offline.get('cloud')!).voices[0]).toMatchObject({ labels: { 'zh-CN': '音色 narrator-warm-f' } });
  });
});

describe('多语言项目：cloud 请求带内容语言（D84）', () => {
  /** 源文件中文，译文英文、日文；选定方案 f.a。 */
  function i18nProject(): Project {
    const p = project('Team space');
    return { ...p, features: { f: { id: 'f', name: 'F', pick: 'f.a' } }, i18n: { default: 'zh-CN', locales: ['zh-CN', 'en', 'ja'], messages: { en: { One: 'One (en)' }, ja: { One: 'ワン' } } } } as unknown as Project;
  }

  it('看板生成：项目写了 locales 时带当前内容语言（没传时是默认语言），非默认语言用推荐音色', async () => {
    const f = fakeBridge();
    const hub = new VoiceHub(home, { emit: () => undefined, env: {}, cloud: f.bridge });
    const run = (body: unknown) => hub.handleProject('p', proj, i18nProject(), 'generate', { method: 'POST' } as never, {} as never, { guardWrite: () => true, jsonBody: async () => ({ ok: true as const, body }), send: () => undefined });
    await run({ locale: 'en', contentLocale: 'ja', segments: [{ stepId: 'f.a.s#1', text: 'ワン', role: null }] });
    expect(f.calls.at(-1)).toEqual({ text: 'ワン', voice: 'bright-f', locale: 'ja', project: 'Team space' });
    await run({ locale: 'en', segments: [{ stepId: 'f.a.s#1', text: '一', role: null }] });
    expect(f.calls.at(-1)).toEqual({ text: '一', voice: 'narrator-warm-f', locale: 'zh-CN', project: 'Team space' });
  });

  it('joplo voice（generateProjectVoice）：每种内容语言各生成一遍，带 locale 与 project；--dry-run 只估算；--locale 只做一种', async () => {
    const f = fakeBridge();
    const dry = await generateProjectVoice({ projectDir: proj, project: i18nProject(), home, cloud: f.bridge, dryRun: true });
    expect(f.calls).toHaveLength(0);
    expect(dry.locales.map((l) => [l.locale, l.missing])).toEqual([['zh-CN', 4], ['en', 4], ['ja', 4]]);
    expect(dry.total.chars).toBe(3 * ('One'.length + 'Two'.length + 'Three'.length + 'Four'.length) + ('One (en)'.length - 'One'.length) + ('ワン'.length - 'One'.length));
    const only = await generateProjectVoice({ projectDir: proj, project: i18nProject(), home, cloud: f.bridge, locales: ['ja'] });
    expect(only.total.generated).toBe(4);
    expect(new Set(f.calls.map((c) => c.locale))).toEqual(new Set(['ja']));
    expect(f.calls.every((c) => c.project === 'Team space' && c.voice === 'bright-f')).toBe(true);
    expect(f.calls.map((c) => c.text)).toContain('ワン');
    await expect(generateProjectVoice({ projectDir: proj, project: i18nProject(), home, cloud: f.bridge, locales: ['fr'] })).rejects.toMatchObject({ code: 'INVALID' });
  });

  it('joplo voice：没登录也没选来源 → INVALID（给登录命令）；402 → exhausted，已生成的保留', async () => {
    await expect(generateProjectVoice({ projectDir: proj, project: project(), home, cloud: fakeBridge({ signedIn: false }).bridge })).rejects.toThrow(/npx joplo login/);
    const f = fakeBridge({ speech: async (req, n) => { if (n === 1) { await new Promise((r) => setTimeout(r, 10)); return { audio: MP3(req.text), remaining: 3 }; } throw quotaError(5, 3); } });
    const r = await generateProjectVoice({ projectDir: proj, project: { ...project(), features: { f: { id: 'f', name: 'F', pick: 'f.a' } } } as unknown as Project, home, cloud: f.bridge });
    expect(r.exhausted).toMatchObject({ neededChars: 5, remainingChars: 3, remainingSteps: 3 });
    expect(r.total.generated).toBe(1);
    expect(r.quota?.totalRemainingChars).toBe(3);
  });
});
