/**
 * D74 朗读的服务端：profile 存储（Key 只在本机、不出接口）、官方 OpenAI / ElevenLabs 的请求、返回内容的识别、生成与缓存、发布时带上音频。
 * Joplo Cloud 朗读与旧 profile（D85）见 voice-cloud.test.ts。所有网络请求都用假的 fetch。
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { clipKey, type Project } from '@joplo-app/core';
import { DEFAULT_STYLE, PRESETS, ProfileStore, VoiceCache, buildRequest, bundleVoice, fingerprint, resolveVoices, sniffAudio, synthesize, type FetchLike, type VoiceProfile } from '../src/voice.ts';
import { VoiceHub, tildify } from '../src/voice-http.ts';

const MP3 = Buffer.concat([Buffer.from('ID3'), Buffer.alloc(64, 1)]);
const WAV = Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WAVE'), Buffer.alloc(32)]);
const audioRes = (b = MP3) => new Response(b, { status: 200, headers: { 'content-type': 'audio/mpeg' } });
const jsonRes = (v: unknown, status = 200) => new Response(JSON.stringify(v), { status, headers: { 'content-type': 'application/json' } });

let home: string;
let proj: string;
beforeEach(() => {
  home = fs.mkdtempSync(path.join(os.tmpdir(), 'joplo-voice-home-'));
  proj = fs.mkdtempSync(path.join(os.tmpdir(), 'joplo-voice-proj-'));
});
afterEach(() => {
  fs.rmSync(home, { recursive: true, force: true });
  fs.rmSync(proj, { recursive: true, force: true });
});

const preset = (id: string): VoiceProfile => ({ ...PRESETS.find((p) => p.id === id)!, id, preset: id as VoiceProfile['preset'] });
const openai = () => preset('openai');

describe('音频识别与请求', () => {
  it('sniffAudio 按文件头识别；文本不是音频', () => {
    expect(sniffAudio(MP3)?.ext).toBe('mp3');
    expect(sniffAudio(WAV)?.ext).toBe('wav');
    expect(sniffAudio(Buffer.concat([Buffer.from('OggS'), Buffer.alloc(20)]))?.ext).toBe('ogg');
    expect(sniffAudio(Buffer.from([0xff, 0xfb, 0x90, 0x64, 0, 0, 0, 0, 0, 0, 0, 0]))?.ext).toBe('mp3');
    expect(sniffAudio(Buffer.from('{"error":"nope"}'))).toBeNull();
  });

  it('OpenAI：官方 /audio/speech + Bearer；ElevenLabs：voice_id 在路径里 + xi-api-key；地址固定（profile 里的地址不生效）', () => {
    const o = buildRequest({ ...openai(), baseUrl: 'https://llm.acme.internal/v1' }, 'sk-1', 'Hi "there"', 'nova');
    expect(o.url).toBe('https://api.openai.com/v1/audio/speech');
    expect((o.init.headers as Record<string, string>).authorization).toBe('Bearer sk-1');
    expect(JSON.parse(o.init.body as string)).toEqual({ model: 'gpt-4o-mini-tts', input: 'Hi "there"', voice: 'nova', response_format: 'mp3', instructions: DEFAULT_STYLE });
    // 说话风格：tts-1 系列不支持 instructions，不发；改风格会换声音指纹（旧音频不再用）
    expect(JSON.parse(buildRequest({ ...openai(), model: 'tts-1' }, 'k', 'x', 'nova').init.body as string).instructions).toBeUndefined();
    expect(fingerprint({ ...openai(), style: 'Calm.' }, 'nova')).not.toBe(fingerprint(openai(), 'nova'));
    const e = buildRequest(preset('elevenlabs'), 'xi', 'Hi', 'abc/1');
    expect(e.url).toBe('https://api.elevenlabs.io/v1/text-to-speech/abc%2F1?output_format=mp3_44100_128');
    expect((e.init.headers as Record<string, string>)['xi-api-key']).toBe('xi');
    expect(JSON.parse(e.init.body as string)).toEqual({ text: 'Hi', model_id: 'eleven_multilingual_v2' });
    // 自定义 HTTP 与 cloud 不走这里
    expect(() => buildRequest({ id: 'x', name: 'X', kind: 'http', baseUrl: 'https://tts.example/api', model: 'm', voice: 'v', response: 'audio' }, 'k', 'a', 'v')).toThrow(/no longer supported/);
  });

  it('缺 Key 时 openai / elevenlabs 拒绝发请求', () => {
    expect(() => buildRequest(openai(), null, 'x', 'nova')).toThrow(/No API key/);
  });
});

describe('synthesize：返回内容', () => {
  it('音频文件：直接返回', async () => {
    const a = await synthesize(openai(), 'k', 'hi', 'nova', { fetch: async () => audioRes() });
    expect(a.ext).toBe('mp3');
    expect(a.bytes.length).toBe(MP3.length);
  });

  it('返回的不是音频（例如 JSON）：报 NOT_AUDIO', async () => {
    await expect(synthesize(openai(), 'k', 'hi', 'nova', { fetch: async () => jsonRes({ data: { audio: 'x' } }) })).rejects.toMatchObject({ code: 'NOT_AUDIO' });
  });

  it('HTTP 错误：带状态码与正文摘要，Key 被抹掉', async () => {
    const f: FetchLike = async () => jsonRes({ error: 'invalid key sk-secret-123' }, 401);
    await expect(synthesize(openai(), 'sk-secret-123', 'hi', 'nova', { fetch: f })).rejects.toThrow(/HTTP 401.*••••/);
    await expect(synthesize(openai(), 'sk-secret-123', 'hi', 'nova', { fetch: f })).rejects.not.toThrow(/sk-secret-123/);
  });
});

describe('ProfileStore', () => {
  it('预设开箱就有；Key 只存在 0600 文件里，公开信息只有末 4 位；环境变量也算', () => {
    const store = new ProfileStore(home, { OPENAI_API_KEY: 'env-key' });
    expect(store.list().map((p) => p.id)).toEqual(['cloud', 'openai', 'elevenlabs']);
    expect(store.keyOf(store.get('openai')!)).toBe('env-key');
    expect(store.publicOf(store.get('openai')!).key).toEqual({ saved: false, hint: null, env: 'OPENAI_API_KEY', envSet: true });
    store.upsert('openai', { voice: 'marin' }, 'sk-abcd1234');
    const pub = store.publicOf(store.get('openai')!);
    expect(pub.key).toMatchObject({ saved: true, hint: '…1234' });
    expect(JSON.stringify(pub)).not.toContain('sk-abcd1234');
    expect(fs.statSync(store.file).mode & 0o777).toBe(0o600);
    // 不传 key = 不改；null = 删掉
    store.upsert('openai', { voice: 'echo' }, undefined);
    expect(store.get('openai')!.key).toBe('sk-abcd1234');
    store.upsert('openai', {}, null);
    expect(store.get('openai')!.key).toBeUndefined();
    // 预设删除 = 恢复默认
    store.remove('openai');
    expect(store.get('openai')).toMatchObject({ name: 'OpenAI', voice: 'marin', style: DEFAULT_STYLE });
    // 预设带音色候选（ElevenLabs 是 voice_id + 名字）
    expect(store.publicOf(store.get('elevenlabs')!).voices.find((v) => v.id === 'JBFqnCBsd6RMkjVDRZzb')).toMatchObject({ name: 'George', gender: 'male' });
  });

  it('resolveVoices：config.profile 优先于看板里选的；config 写了本机没有的名字时记 missing、不用任何供应商', () => {
    const store = new ProfileStore(home, {});
    const a = resolveVoices({ narrator: 'echo', roles: { leo: 'onyx' } }, 'openai', store);
    expect(a.source).toBe('board');
    expect(a.voices.narrator).toBe(fingerprint(store.get('openai')!, 'echo'));
    expect(a.voices.roles.leo).toBe(fingerprint(store.get('openai')!, 'onyx'));
    expect(resolveVoices({ profile: 'ElevenLabs' }, 'openai', store)).toMatchObject({ source: 'config', narrator: 'JBFqnCBsd6RMkjVDRZzb' });
    expect(resolveVoices({ profile: 'Nope' }, 'openai', store)).toMatchObject({ profile: null, missing: 'Nope', voices: { narrator: null } });
    expect(resolveVoices(undefined, null, store).profile).toBeNull();
  });
});

function project(): Project {
  const step = (id: string, caption: string, extra: Record<string, unknown> = {}) => ({ id, kind: 'system', action: { type: 'event', name: caption }, caption, effects: [], ruleIds: [], shots: [], directorLayer: null, traces: [], forks: [], marks: [], ...extra });
  return {
    schemaVersion: 2,
    name: 'T',
    mode: 'publish',
    scenarios: { 'f.a.s': { id: 'f.a.s', optionId: 'f.a', name: 'S', steps: [step('f.a.s#1', 'One'), step('f.a.s#2', 'Two', { say: 'Two, said fully' }), step('f.a.s#3', 'Three')] } },
    options: { 'f.a': { id: 'f.a', featureId: 'f', layers: {} } },
    scenes: {},
  } as unknown as Project;
}

describe('生成、缓存与发布', () => {
  it('generate：已有的跳过，失败记原因；bundleVoice 只带当前声音、当前步骤的音频，并数出缺的步骤', async () => {
    const store = new ProfileStore(home, {});
    store.upsert('openai', { ...openai() }, 'k');
    const cache = new VoiceCache(proj);
    cache.select('openai');
    const resolved = resolveVoices(undefined, 'openai', store);
    let n = 0;
    const f: FetchLike = async (_u, init) => (n++, JSON.parse(init!.body as string).input === 'Three' ? jsonRes({ error: 'rate limited' }, 429) : audioRes());
    const progress: number[] = [];
    const segs = [{ stepId: 'f.a.s#1', text: 'One', role: null }, { stepId: 'f.a.s#2', text: 'Two, said fully', role: null }, { stepId: 'f.a.s#3', text: 'Three', role: null }];
    const r1 = await cache.generate(segs, 'en', resolved, store, { fetch: f, onProgress: (d) => progress.push(d) });
    expect(r1).toMatchObject({ total: 3, generated: 2, skipped: 0 });
    expect(r1.failed).toEqual([{ stepId: 'f.a.s#3', message: expect.stringContaining('HTTP 429') }]);
    expect(progress.at(-1)).toBe(3);
    const cur = cache.current(resolved.voices);
    expect(Object.keys(cur.clips)).toEqual([clipKey(resolved.voices.narrator!, 'One'), clipKey(resolved.voices.narrator!, 'Two, said fully')]);
    expect(Object.values(cur.failures)).toEqual([{ stepId: 'f.a.s#3', message: expect.stringContaining('429') }]);
    // 再来一次：已有的两段不再请求
    n = 0;
    const r2 = await cache.generate(segs, 'en', resolved, store, { fetch: async () => audioRes() });
    expect(r2).toMatchObject({ generated: 1, skipped: 2 });

    const out = fs.mkdtempSync(path.join(os.tmpdir(), 'joplo-voice-out-'));
    try {
      const b = bundleVoice(proj, project(), out, store);
      expect(b.report).toMatchObject({ clips: 3, missing: 0, profile: 'OpenAI' });
      expect(Object.values(b.index!.clips).every((p) => p.startsWith('voice/') && fs.existsSync(path.join(out, p)))).toBe(true);
      expect(b.index!.narrator).toBe(resolved.voices.narrator);
      // 换了音色：旧音频不带，所有步骤都算缺
      const b2 = bundleVoice(proj, project(), out, store, { narrator: 'echo' });
      expect(b2.index).toBeNull();
      expect(b2.report).toMatchObject({ clips: 0, missing: 3 });
      // Key 不进产物
      for (const file of fs.readdirSync(out, { recursive: true }) as string[]) if (fs.statSync(path.join(out, file)).isFile()) expect(fs.readFileSync(path.join(out, file)).includes('"k"')).toBe(false);
    } finally {
      fs.rmSync(out, { recursive: true, force: true });
    }
  });

  it('边放边生成：两段同时生成，索引里两段都在（不互相覆盖）；已有的直接返回', async () => {
    const store = new ProfileStore(home, {});
    store.upsert('openai', { ...openai() }, 'k');
    const cache = new VoiceCache(proj);
    const resolved = resolveVoices(undefined, 'openai', store);
    const slow: FetchLike = (_u, init) => new Promise((r) => setTimeout(() => r(audioRes(Buffer.concat([MP3, Buffer.from(JSON.parse(init!.body as string).input)]))), 20));
    const [a, b] = await Promise.all([
      cache.generateOne({ stepId: 'f.a.s#1', text: 'One', role: null }, 'en', resolved, store, { fetch: slow }),
      cache.generateOne({ stepId: 'f.a.s#2', text: 'Two', role: null }, 'en', resolved, store, { fetch: slow }),
    ]);
    expect(a.generated && b.generated).toBe(true);
    expect(Object.keys(cache.current(resolved.voices).clips).sort()).toEqual([a.key, b.key].sort());
    const again = await cache.generateOne({ stepId: 'f.a.s#1', text: ' One ', role: null }, 'en', resolved, store, { fetch: async () => { throw new Error('should not fetch'); } });
    expect(again).toEqual({ key: a.key, file: a.file, generated: false });
  });

  it('批量生成与边放边生成同时要同一段：只请求一次；两边拿到同一个文件', async () => {
    const store = new ProfileStore(home, {});
    store.upsert('openai', { ...openai() }, 'k');
    const cache = new VoiceCache(proj);
    const resolved = resolveVoices(undefined, 'openai', store);
    let calls = 0;
    const slow: FetchLike = () => (calls++, new Promise((r) => setTimeout(() => r(audioRes()), 20)));
    const inflight = new Map();
    const seg = { stepId: 'f.a.s#1', text: 'One', role: null };
    const [batch, one] = await Promise.all([
      cache.generate([seg], 'en', resolved, store, { fetch: slow, inflight }),
      cache.generateOne(seg, 'en', resolved, store, { fetch: slow, inflight }),
    ]);
    expect(calls).toBe(1);
    expect(batch.failed).toEqual([]);
    expect(one.file).toBe(cache.current(resolved.voices).clips[one.key]);
    expect(inflight.size).toBe(0);
  });

  it('同一段已经有音频后，晚到的失败不再记进 failures', async () => {
    const store = new ProfileStore(home, {});
    store.upsert('openai', { ...openai() }, 'k');
    const cache = new VoiceCache(proj);
    const resolved = resolveVoices(undefined, 'openai', store);
    const seg = { stepId: 'f.a.s#1', text: 'One', role: null };
    // 两个各自独立的请求（例如两个 dev 进程）：快的成功，慢的失败
    const ok = cache.generateOne(seg, 'en', resolved, store, { fetch: async () => audioRes() });
    const bad = cache.generateOne(seg, 'en', resolved, store, { fetch: () => new Promise((_r, j) => setTimeout(() => j(new Error('timeout')), 20)) }).catch(() => null);
    const [a] = await Promise.all([ok, bad]);
    const raw = JSON.parse(fs.readFileSync(path.join(proj, '.joplo', 'voice', 'index.json'), 'utf8'));
    expect(raw.clips[a.key]).toBeTruthy();
    expect(raw.failures).toEqual({});
  });

  it('没有选用供应商：不带任何音频', () => {
    const store = new ProfileStore(home, {});
    const out = fs.mkdtempSync(path.join(os.tmpdir(), 'joplo-voice-out-'));
    try {
      expect(bundleVoice(proj, project(), out, store)).toEqual({ index: null, report: { clips: 0, bytes: 0, missing: 0, profile: null } });
      expect(fs.existsSync(path.join(out, 'voice'))).toBe(false);
    } finally {
      fs.rmSync(out, { recursive: true, force: true });
    }
  });
});

describe('VoiceHub：profile 改动', () => {
  const ctxOf = (body: unknown) => {
    const sent: { status: number; body: unknown }[] = [];
    return { sent, ctx: { guardWrite: () => true, jsonBody: async () => ({ ok: true as const, body }), send: (status: number, b: unknown) => void sent.push({ status, body: b }) } };
  };

  it('保存、删除 profile 后通知看板（看板据此重新取声音状态）；列表接口带上存储文件', async () => {
    let changed = 0;
    const hub = new VoiceHub(home, { emit: () => undefined, profilesChanged: () => changed++, env: {} });
    const g = ctxOf(undefined);
    await hub.handleGlobal('profiles', { method: 'GET' } as never, g.ctx);
    expect(g.sent[0]!.body).toMatchObject({ file: path.join(home, 'voice', 'profiles.json') });
    expect(tildify('/Users/a/.joplo/voice/profiles.json', '/Users/a')).toBe('~/.joplo/voice/profiles.json');
    expect(tildify('/tmp/joplo-home/voice/profiles.json', '/Users/a')).toBe('/tmp/joplo-home/voice/profiles.json');
    expect(tildify('/Users/ab/x', '/Users/a')).toBe('/Users/ab/x');

    const put = ctxOf({ key: 'sk-new-key' });
    await hub.handleGlobal('profiles/openai', { method: 'PUT' } as never, put.ctx);
    expect(put.sent[0]!.status).toBe(200);
    expect(changed).toBe(1);

    // 不能再新建自定义接口（D85）
    const bad = ctxOf({ profile: { name: 'Mine', kind: 'openai', baseUrl: 'https://x.test/v1', voice: 'alloy' }, key: 'k' });
    await hub.handleGlobal('profiles/new', { method: 'PUT' } as never, bad.ctx);
    expect(bad.sent[0]!.status).toBe(400);
    expect(changed).toBe(1);

    const id = (put.sent[0]!.body as { profile: { id: string } }).profile.id;
    const del = ctxOf(undefined);
    await hub.handleGlobal(`profiles/${id}`, { method: 'DELETE' } as never, del.ctx);
    expect(del.sent[0]!.status).toBe(200);
    expect(changed).toBe(2);
  });
});

describe('VoiceHub：状态的先后', () => {
  it('每份声音状态带递增的 rev：先读的旧状态 rev 更小（看板据此丢掉晚到的旧状态）', async () => {
    const hub = new VoiceHub(home, { emit: () => undefined, env: {} });
    const a = await hub.state('p', proj, null);
    const b = await hub.state('p', proj, null);
    expect(b.rev).toBeGreaterThan(a.rev);
    // 新的 VoiceHub（dev 重启）也不会比之前的小
    const c = await new VoiceHub(home, { emit: () => undefined, env: {} }).state('p', proj, null);
    expect(c.rev).toBeGreaterThan(b.rev);
  });
});

