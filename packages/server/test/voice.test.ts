/**
 * D74 朗读的服务端：profile 存储（Key 只在本机、不出接口）、三种接口的请求、返回内容的识别与建议、生成与缓存、发布时带上音频。
 * 所有网络请求都用假的 fetch。
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { clipKey, type Project } from '@joplo-app/core';
import { DEFAULT_STYLE, PRESETS, ProfileStore, VoiceCache, buildRequest, bundleVoice, fingerprint, resolveVoices, sniffAudio, suggestFromJson, synthesize, type FetchLike, type VoiceProfile } from '../src/voice.ts';

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

const openai = (): VoiceProfile => ({ ...PRESETS[0]!, id: 'openai', preset: 'openai' });

describe('音频识别与请求', () => {
  it('sniffAudio 按文件头识别；文本不是音频', () => {
    expect(sniffAudio(MP3)?.ext).toBe('mp3');
    expect(sniffAudio(WAV)?.ext).toBe('wav');
    expect(sniffAudio(Buffer.concat([Buffer.from('OggS'), Buffer.alloc(20)]))?.ext).toBe('ogg');
    expect(sniffAudio(Buffer.from([0xff, 0xfb, 0x90, 0x64, 0, 0, 0, 0, 0, 0, 0, 0]))?.ext).toBe('mp3');
    expect(sniffAudio(Buffer.from('{"error":"nope"}'))).toBeNull();
  });

  it('OpenAI 兼容：{Base URL}/audio/speech + Bearer；ElevenLabs：voice_id 在路径里 + xi-api-key；自定义 HTTP：模板按 JSON 转义', () => {
    const o = buildRequest({ ...openai(), baseUrl: 'https://llm.acme.internal/v1' }, 'sk-1', 'Hi "there"', 'nova');
    expect(o.url).toBe('https://llm.acme.internal/v1/audio/speech');
    expect((o.init.headers as Record<string, string>).authorization).toBe('Bearer sk-1');
    expect(JSON.parse(o.init.body as string)).toEqual({ model: 'gpt-4o-mini-tts', input: 'Hi "there"', voice: 'nova', response_format: 'mp3', instructions: DEFAULT_STYLE });
    // 说话风格：tts-1 系列不支持 instructions，不发；改风格会换声音指纹（旧音频不再用）
    expect(JSON.parse(buildRequest({ ...openai(), model: 'tts-1' }, 'k', 'x', 'nova').init.body as string).instructions).toBeUndefined();
    expect(fingerprint({ ...openai(), style: 'Calm.' }, 'nova')).not.toBe(fingerprint(openai(), 'nova'));
    const e = buildRequest({ ...PRESETS[1]!, id: 'elevenlabs' }, 'xi', 'Hi', 'abc/1');
    expect(e.url).toBe('https://api.elevenlabs.io/v1/text-to-speech/abc%2F1?output_format=mp3_44100_128');
    expect((e.init.headers as Record<string, string>)['xi-api-key']).toBe('xi');
    expect(JSON.parse(e.init.body as string)).toEqual({ text: 'Hi', model_id: 'eleven_multilingual_v2' });
    const h = buildRequest({ id: 'x', name: 'X', kind: 'http', baseUrl: 'https://tts.example/api', model: 'm', voice: 'v', response: 'audio', body: '{"q":"{{text}}","v":"{{voice}}"}', headers: { 'X-Token': '{{key}}' } }, 'k', 'a"b\n', 'v1');
    expect(JSON.parse(h.init.body as string)).toEqual({ q: 'a"b\n', v: 'v1' });
    expect((h.init.headers as Record<string, string>)['X-Token']).toBe('k');
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

  it('返回的是 JSON 里的 base64：报 NOT_AUDIO，并建议改成 json-base64 + 字段路径', async () => {
    const f: FetchLike = async () => jsonRes({ data: { audio: MP3.toString('base64') + 'A'.repeat(80) } });
    await expect(synthesize(openai(), 'k', 'hi', 'nova', { fetch: f })).rejects.toMatchObject({ code: 'NOT_AUDIO', hint: { response: 'json-base64', path: 'data.audio' } });
    const ok = await synthesize({ ...openai(), response: 'json-base64', path: 'data.audio' }, 'k', 'hi', 'nova', { fetch: f });
    expect(ok.ext).toBe('mp3');
  });

  it('JSON 里的音频链接：再下载一次', async () => {
    const calls: string[] = [];
    const f: FetchLike = async (u) => (calls.push(u), u.endsWith('/audio/speech') ? jsonRes({ result: [{ url: 'https://cdn.example/a.mp3' }] }) : audioRes(WAV));
    const a = await synthesize({ ...openai(), response: 'json-url', path: 'result.0.url' }, 'k', 'hi', 'nova', { fetch: f });
    expect(a.ext).toBe('wav');
    expect(calls).toEqual(['https://api.openai.com/v1/audio/speech', 'https://cdn.example/a.mp3']);
    expect(suggestFromJson({ result: [{ url: 'https://cdn.example/a.mp3' }] })).toEqual({ response: 'json-url', path: 'result.0.url' });
  });

  it('HTTP 错误：带状态码与正文摘要，Key 被抹掉', async () => {
    const f: FetchLike = async () => jsonRes({ error: 'invalid key sk-secret-123' }, 401);
    await expect(synthesize(openai(), 'sk-secret-123', 'hi', 'nova', { fetch: f })).rejects.toThrow(/HTTP 401.*••••/);
    await expect(synthesize(openai(), 'sk-secret-123', 'hi', 'nova', { fetch: f })).rejects.not.toThrow(/sk-secret-123/);
  });
});

describe('ProfileStore', () => {
  it('三家预设开箱就有；Key 只存在 0600 文件里，公开信息只有末 4 位；环境变量也算', () => {
    const store = new ProfileStore(home, { AIHUBMIX_API_KEY: 'env-key' });
    expect(store.list().map((p) => p.id)).toEqual(['openai', 'elevenlabs', 'aihubmix']);
    expect(store.keyOf(store.get('aihubmix')!)).toBe('env-key');
    expect(store.publicOf(store.get('aihubmix')!).key).toEqual({ saved: false, hint: null, env: 'AIHUBMIX_API_KEY', envSet: true });
    store.upsert('openai', { ...openai(), name: 'OpenAI' }, 'sk-abcd1234');
    const pub = store.publicOf(store.get('openai')!);
    expect(pub.key).toMatchObject({ saved: true, hint: '…1234' });
    expect(JSON.stringify(pub)).not.toContain('sk-abcd1234');
    expect(fs.statSync(store.file).mode & 0o777).toBe(0o600);
    // 不传 key = 不改；null = 删掉
    store.upsert('openai', { ...openai(), name: 'OpenAI', voice: 'echo' }, undefined);
    expect(store.get('openai')!.key).toBe('sk-abcd1234');
    store.upsert('openai', { ...openai(), name: 'OpenAI' }, null);
    expect(store.get('openai')!.key).toBeUndefined();
  });

  it('新建自定义：OpenAI 兼容 + 自定义 Base URL + JSON 返回；id 由名字生成；预设删除 = 恢复默认', () => {
    const store = new ProfileStore(home, {});
    const p = store.upsert(null, { name: 'Acme Gateway', kind: 'openai', baseUrl: 'https://llm.acme.internal/v1/', model: 'tts-1', voice: 'nova', response: 'json-base64', path: 'data.audio' }, 'k');
    expect(p).toMatchObject({ id: 'acme-gateway', baseUrl: 'https://llm.acme.internal/v1', response: 'json-base64', path: 'data.audio' });
    expect(store.find('acme gateway')?.id).toBe('acme-gateway');
    expect(() => store.upsert(null, { name: 'Bad', kind: 'openai', baseUrl: 'ftp://x', voice: 'n' }, null)).toThrow(/Base URL/);
    expect(() => store.upsert(null, { name: 'Bad', kind: 'openai', baseUrl: 'https://x', voice: 'n', response: 'json-base64' }, null)).toThrow(/field path/);
    expect(() => store.upsert(null, { name: 'H', kind: 'http', baseUrl: 'https://x', body: '{"q":1}' }, null)).toThrow(/\{\{text\}\}/);
    store.upsert('openai', { ...openai(), name: 'Mine', voice: 'echo' }, 'k');
    store.remove('openai');
    expect(store.get('openai')).toMatchObject({ name: 'OpenAI', voice: 'marin', style: DEFAULT_STYLE });
    // 预设带音色候选（ElevenLabs 是 voice_id + 名字）
    expect(store.publicOf(store.get('elevenlabs')!).voices.find((v) => v.id === 'JBFqnCBsd6RMkjVDRZzb')).toMatchObject({ name: 'George', gender: 'male' });
    store.remove('acme-gateway');
    expect(store.get('acme-gateway')).toBeNull();
  });

  it('resolveVoices：config.profile 优先于看板里选的；config 写了本机没有的名字时记 missing、不用任何供应商', () => {
    const store = new ProfileStore(home, {});
    const a = resolveVoices({ narrator: 'echo', roles: { leo: 'onyx' } }, 'openai', store);
    expect(a.source).toBe('board');
    expect(a.voices.narrator).toBe(fingerprint(store.get('openai')!, 'echo'));
    expect(a.voices.roles.leo).toBe(fingerprint(store.get('openai')!, 'onyx'));
    expect(resolveVoices({ profile: 'AiHubMix' }, 'openai', store)).toMatchObject({ source: 'config', narrator: 'marin' });
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
