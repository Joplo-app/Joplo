/**
 * D84 作者内容多语言的朗读：按内容语言选音色、按语言打包与统计缺口、从上一次发布的分享沿用音频。
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { clipKey, type Project } from '@joplo-app/core';
import { PRESETS, ProfileStore, VoiceCache, autoVoiceFor, bundleVoice, resolveVoices, reuseSharedVoice, type VoiceProfile } from '../src/voice.ts';

const MP3 = (seed: string) => Buffer.concat([Buffer.from('ID3'), Buffer.from(seed), Buffer.alloc(32, 1)]);
let home: string, proj: string, out: string;
beforeEach(() => {
  home = fs.mkdtempSync(path.join(os.tmpdir(), 'joplo-vi-home-'));
  proj = fs.mkdtempSync(path.join(os.tmpdir(), 'joplo-vi-proj-'));
  out = fs.mkdtempSync(path.join(os.tmpdir(), 'joplo-vi-out-'));
});
afterEach(() => { for (const d of [home, proj, out]) fs.rmSync(d, { recursive: true, force: true }); });

const openai = (): VoiceProfile => ({ ...PRESETS.find((p) => p.id === 'openai')!, id: 'openai', preset: 'openai' });
const eleven = (): VoiceProfile => ({ ...PRESETS.find((p) => p.id === 'elevenlabs')!, id: 'elevenlabs', preset: 'elevenlabs' });

/** 两步：中文原文 + 英文译文。 */
function project(): Project {
  const step = (id: string, caption: string) => ({ id, kind: 'system', action: { type: 'event', name: caption }, caption, effects: [], ruleIds: [], shots: [], directorLayer: null, forks: [], marks: [] });
  return {
    schemaVersion: 2, name: 'T', mode: 'publish',
    i18n: { default: 'zh-CN', locales: ['zh-CN', 'en'], messages: { en: { 一: 'One', 二: 'Two' } } },
    routes: {}, features: {},
    scenarios: { 'f.a.s': { id: 'f.a.s', optionId: 'f.a', name: 'S', description: '', mock: { label: 'm', outcome: 'success', auto: true }, initial: { sceneId: 'x', ui: {}, data: {}, inputs: {} }, steps: [step('f.a.s#1', '一'), step('f.a.s#2', '二')] } },
    options: { 'f.a': { id: 'f.a', featureId: 'f', layers: {} } },
    scenes: {},
  } as unknown as Project;
}

describe('按内容语言选音色', () => {
  it('有口音的预设换成同语言的音色（同性别优先）；多语言音色不变；config.voice.locales 优先', () => {
    expect(autoVoiceFor(eleven(), 'JBFqnCBsd6RMkjVDRZzb', 'zh-CN')).toBe('JBFqnCBsd6RMkjVDRZzb'); // 没有中文音色：不换
    expect(autoVoiceFor(eleven(), 'XB0fDUnXU5powFXDhCwa', 'en')).toBe('EXAVITQu4vr4xnSDxMaL'); // 瑞典口音女声 → 推荐的英文女声
    expect(autoVoiceFor(openai(), 'marin', 'ja')).toBe('marin');
    const store = new ProfileStore(home, {});
    store.upsert('elevenlabs', eleven(), 'k');
    const cfg = { narrator: 'XB0fDUnXU5powFXDhCwa', locales: { ja: { narrator: 'custom-ja' } } };
    expect(resolveVoices(cfg, 'elevenlabs', store, 'en').narrator).toBe('EXAVITQu4vr4xnSDxMaL');
    expect(resolveVoices(cfg, 'elevenlabs', store, 'ja').narrator).toBe('custom-ja');
    expect(resolveVoices(cfg, 'elevenlabs', store).narrator).toBe('XB0fDUnXU5powFXDhCwa');
  });
});

describe('默认语言', () => {
  it('源文件的语言不自动换音色：作者选的音色和已生成的音频不失效', async () => {
    const { voiceLocaleOf } = await import('../src/voice.ts');
    const p = project();
    expect(voiceLocaleOf(p, 'zh-CN')).toBeNull();
    expect(voiceLocaleOf(p, 'en')).toBe('en');
    expect(voiceLocaleOf({}, 'en')).toBeNull();
    const store = new ProfileStore(home, {});
    store.upsert('elevenlabs', eleven(), 'k');
    const cfg = { narrator: 'XB0fDUnXU5powFXDhCwa' };
    expect(resolveVoices(cfg, 'elevenlabs', store, voiceLocaleOf(p, 'zh-CN')).narrator).toBe('XB0fDUnXU5powFXDhCwa');
  });
});

describe('打包与沿用', () => {
  const seed = (cache: VoiceCache, fp: string, stepId: string, text: string, locale: string) => {
    const b = MP3(text);
    const file = `${crypto.createHash('sha256').update(b).digest('hex')}.mp3`;
    expect(cache.adopt(clipKey(fp, text), file, b, { stepId, fp, text, locale })).toBe(true);
    return file;
  };

  it('每种语言按译文算片段键，分别统计缺口', () => {
    const store = new ProfileStore(home, {});
    store.upsert('openai', openai(), 'k');
    const cache = new VoiceCache(proj);
    cache.select('openai');
    const fp = resolveVoices(undefined, 'openai', store, 'zh-CN').voices.narrator!;
    seed(cache, fp, 'f.a.s#1', '一', 'zh-CN');
    seed(cache, fp, 'f.a.s#2', '二', 'zh-CN');
    seed(cache, fp, 'f.a.s#1', 'One', 'en');
    const b = bundleVoice(proj, project(), out, store);
    expect(b.report).toMatchObject({ clips: 3, missing: 1, locales: { 'zh-CN': { missing: 0 }, en: { missing: 1 } } });
    expect(b.index!.clips[clipKey(fp, 'One')]).toMatch(/^voice\//);
    expect(b.index!.locales).toBeUndefined(); // OpenAI 多语言音色：各语言指纹相同，不用另记
  });

  it('文件名必须是内容的 sha256 才收下', () => {
    expect(new VoiceCache(proj).adopt('k', `${'0'.repeat(64)}.mp3`, MP3('x'), { stepId: 's', fp: 'f', text: 't', locale: 'en' })).toBe(false);
  });

  it('换一台电脑（没有供应商、没有本地音频）：从上一次的分享沿用，按分享里的指纹打包', async () => {
    // 原来那台电脑：生成两种语言的音频并打包
    const store = new ProfileStore(home, {});
    store.upsert('openai', openai(), 'k');
    const old = new VoiceCache(proj);
    old.select('openai');
    const fp = resolveVoices(undefined, 'openai', store, 'zh-CN').voices.narrator!;
    for (const [id, t, l] of [['f.a.s#1', '一', 'zh-CN'], ['f.a.s#2', '二', 'zh-CN'], ['f.a.s#1', 'One', 'en'], ['f.a.s#2', 'Two', 'en']] as const) seed(old, fp, id, t, l);
    const published = bundleVoice(proj, project(), out, store).index!;
    // 新电脑：空目录、没有 profile
    const fresh = fs.mkdtempSync(path.join(os.tmpdir(), 'joplo-vi-fresh-'));
    const out2 = fs.mkdtempSync(path.join(os.tmpdir(), 'joplo-vi-out2-'));
    try {
      const empty = new ProfileStore(fs.mkdtempSync(path.join(os.tmpdir(), 'joplo-vi-h2-')), {});
      const fetched: string[] = [];
      const shared = { index: published, fetch: async (f: string) => (fetched.push(f), fs.readFileSync(path.join(out, f))) };
      expect(await reuseSharedVoice(fresh, project(), shared, empty)).toBe(4);
      expect(fetched).toHaveLength(4);
      const b = bundleVoice(fresh, project(), out2, empty, undefined, published);
      expect(b.report).toMatchObject({ clips: 4, missing: 0, profile: 'the published share' });
      expect(b.index!.narrator).toBe(fp);
      // 再来一次：本机已有，不再下载
      expect(await reuseSharedVoice(fresh, project(), shared, empty)).toBe(0);
    } finally {
      fs.rmSync(fresh, { recursive: true, force: true });
      fs.rmSync(out2, { recursive: true, force: true });
    }
  });
});
