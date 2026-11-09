import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clipKey, voiceFingerprint, VoiceIndex, type Project, type Step } from '@joplo-app/core';
import { ProfileStore, VoiceCache, bundleVoice, fingerprint } from '../src/voice.ts';
import { Narrator } from '../../web/src/runtime/voice.ts';
import { siteVoiceLookup } from '../../web/src/i18n/content.ts';
import { dictionary } from '../../web/src/i18n/dictionaries.ts';
import { stepCaption } from '../../web/src/i18n/step-caption.ts';
import { locales } from '../../web/src/i18n/locale.ts';

const MP3 = (seed = '') => Buffer.concat([Buffer.from('ID3'), Buffer.from(seed), Buffer.alloc(48, 1)]);
let home: string, proj: string, out: string;
const dirs: string[] = [];
const tmp = (p: string) => { const d = fs.mkdtempSync(path.join(os.tmpdir(), p)); dirs.push(d); return d; };
beforeEach(() => { home = tmp('joplo-rf-home-'); proj = tmp('joplo-rf-proj-'); out = tmp('joplo-rf-out-'); });
afterEach(() => { vi.unstubAllGlobals(); for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true }); });

const seed = (cache: VoiceCache, fp: string, stepId: string, text: string, locale: string) => {
  const bytes = MP3(`${fp}${text}`);
  cache.adopt(clipKey(fp, text), `${crypto.createHash('sha256').update(bytes).digest('hex')}.mp3`, bytes, { stepId, fp, text, locale });
};

function project(i18n = false): Project {
  const step = (id: string, caption: string) => ({ id, kind: 'system', action: { type: 'event', name: caption }, caption, effects: [], ruleIds: [], shots: [], directorLayer: null, traces: [], forks: [], marks: [] });
  return {
    schemaVersion: 2, name: 'T', mode: 'publish', routes: {}, features: {},
    ...(i18n ? { i18n: { default: 'zh-CN', locales: ['zh-CN', 'en'], messages: { en: { 一: 'One', 二: 'Two' } } } } : {}),
    scenarios: { 'f.a.s': { id: 'f.a.s', optionId: 'f.a', name: 'S', description: '', mock: { label: 'm', outcome: 'success', auto: true }, initial: { sceneId: 'x', ui: {}, data: {}, inputs: {} }, steps: [step('f.a.s#1', '一'), step('f.a.s#2', '二')] } },
    options: { 'f.a': { id: 'f.a', featureId: 'f', layers: {} } },
    scenes: {},
  } as unknown as Project;
}

/** 用真实缓存、打包、索引解析与播放器验证实际发布内容。 */
const playable = (index: NonNullable<ReturnType<typeof bundleVoice>['index']>, locale: string | null, text: string, role: string | null = null) => {
  expect(VoiceIndex.safeParse(index).success).toBe(true);
  const n = new Narrator();
  n.lookup = siteVoiceLookup(index, locale);
  expect(n.hasClip(text, role)).toBe(true);
  const fp = voiceFingerprint(n.lookup!, role, text)!;
  const url = index.clips[clipKey(fp, text)];
  const played: string[] = [];
  vi.stubGlobal('Audio', class {
    constructor(src: string) { played.push(src); }
    addEventListener() {}
    play() { return Promise.resolve(); }
    pause() {}
    removeAttribute() {}
  });
  n.enabled = true;
  const narration = n.speak(text, role, 1);
  expect(narration?.source).toBe('clip');
  expect(played).toEqual([url]);
  narration?.cancel();
  return url;
};

describe('自动字幕发布：先验证内容，再选择声音', () => {
  function setup(auto: NonNullable<Step['captionAuto']>) {
    const p = project();
    const st = p.scenarios['f.a.s']!.steps[0]!;
    p.scenarios['f.a.s']!.steps = [st];
    st.captionAuto = auto;
    st.caption = stepCaption(st, dictionary('en'));
    const store = new ProfileStore(home, {}), cache = new VoiceCache(proj);
    const oldFp = fingerprint(store.get('openai')!, store.get('openai')!.voice);
    const cloudFp = fingerprint(store.get('cloud')!, 'narrator-warm-f');
    return { p, st, store, cache, oldFp, cloudFp, fallback: { narrator: oldFp, roles: {}, clips: {} } };
  }

  it('旧 cloud 文本不能挤掉当前有效的旧分享片段，也不能复制进站点', () => {
    const { p, st, store, cache, oldFp, cloudFp, fallback } = setup({ kind: 'click', label: 'Go' });
    const text = st.caption, stale = 'Click “Private label”';
    seed(cache, oldFp, st.id, text, 'en');
    seed(cache, cloudFp, st.id, stale, 'en');
    const r = bundleVoice(proj, p, out, store, undefined, fallback, 'cloud');
    expect(r.report).toMatchObject({ clips: 1, missing: 0 });
    expect(Object.keys(r.index!.clips)).toEqual([clipKey(oldFp, text)]);
    playable(r.index!, null, text);
    const files = fs.readdirSync(path.join(out, 'voice'));
    expect(files).toEqual([cache.clipOf(clipKey(oldFp, text))]);
    expect(fs.readFileSync(path.join(out, 'voice', files[0]!)).includes(Buffer.from(stale))).toBe(false);
  });

  it.each([
    [{ kind: 'click', label: 'Go' }, { kind: 'click', label: 'Private label' }],
    [{ kind: 'type', label: 'Field', value: 'Public' }, { kind: 'type', label: 'Field', value: 'Private value' }],
    [{ kind: 'select', label: 'Field', value: 'Public' }, { kind: 'select', label: 'Field', value: 'Private value' }],
    [{ kind: 'press', label: '', keys: 'Enter' }, { kind: 'press', label: '', keys: 'Delete' }],
    [{ kind: 'uncheck', label: 'Flag' }, { kind: 'check', label: 'Flag' }],
    [{ kind: 'drag', label: 'Tile', value: 'Public' }, { kind: 'drag', label: 'Tile', value: 'Private value' }],
    [{ kind: 'hover', label: 'Public' }, { kind: 'hover', label: 'Private label' }],
    [{ kind: 'scroll', label: 'List', value: 'Public' }, { kind: 'scroll', label: 'List', value: 'Private value' }],
  ] as [NonNullable<Step['captionAuto']>, NonNullable<Step['captionAuto']>][])('自动字幕从 %j 修改后，只有旧缓存应计 missing', (current, previous) => {
    const { p, st, store, cache, cloudFp, fallback } = setup(current);
    seed(cache, cloudFp, st.id, stepCaption({ ...st, captionAuto: previous }, dictionary('en')), 'en');
    const r = bundleVoice(proj, p, out, store, undefined, fallback, 'cloud');
    expect(r.report).toMatchObject({ clips: 0, missing: 1 });
    expect(r.index).toBeNull();
    expect(fs.existsSync(path.join(out, 'voice'))).toBe(false);
  });

  it('未知语言或文本与缓存键不匹配的记录不能证明有效', () => {
    const { p, st, store, cache, cloudFp, fallback } = setup({ kind: 'click', label: 'Go' });
    seed(cache, cloudFp, st.id, st.caption, 'unknown');
    seed(cache, cloudFp, st.id, 'Click “Private label”', 'en');
    const idx = cache.read();
    idx.clips[clipKey(cloudFp, 'Click “Private label”')]!.text = st.caption;
    cache.write(idx);
    const r = bundleVoice(proj, p, out, store, undefined, fallback, 'cloud');
    expect(r.report).toMatchObject({ clips: 0, missing: 1 });
    expect(fs.existsSync(path.join(out, 'voice'))).toBe(false);
  });

  it('十种界面语言保留当前文字的混合声音，后续更新仍可播放', () => {
    const { p, st, store, cache, oldFp, cloudFp, fallback } = setup({ kind: 'click', label: 'Go' });
    for (const [i, locale] of locales.entries()) {
      const text = stepCaption(st, dictionary(locale));
      seed(cache, oldFp, st.id, text, locale);
      // 两种声音同时有效时选本机 cloud；其他语言仍沿用旧声音。
      if (i % 2) seed(cache, cloudFp, st.id, text, locale);
    }
    const r = bundleVoice(proj, p, out, store, undefined, fallback, 'cloud');
    expect(r.report).toMatchObject({ clips: 10, missing: 0 });
    for (const [i, locale] of locales.entries()) {
      const text = stepCaption(st, dictionary(locale));
      playable(r.index!, null, text);
      expect(voiceFingerprint(siteVoiceLookup(r.index, null)!, null, text)).toBe(i % 2 ? cloudFp : oldFp);
    }
    const again = bundleVoice(proj, p, tmp('joplo-auto-again-'), store, undefined, r.index!, null);
    expect(again.report).toMatchObject({ clips: 10, missing: 0 });
    for (const locale of locales) playable(again.index!, null, stepCaption(st, dictionary(locale)));
  });

  it.each(['drag', 'hover', 'scroll'] as const)('插件手势 %s 的十种字幕与朗读缓存共用当前文字', kind => {
    const { p, st, store, cache, cloudFp, fallback } = setup({ kind, label: 'Target', value: 'Destination' });
    for (const locale of locales) seed(cache, cloudFp, st.id, stepCaption(st, dictionary(locale)), locale);
    const r = bundleVoice(proj, p, out, store, undefined, fallback, 'cloud');
    expect(r.report).toMatchObject({ clips: 10, missing: 0 });
    for (const locale of locales) playable(r.index!, null, stepCaption(st, dictionary(locale)));
  });

  it('作者内容语言先翻译自动字幕参数，再验证缓存；缺失按语言统计', () => {
    const { p, st, store, cache, oldFp, cloudFp, fallback } = setup({ kind: 'type', label: 'Field', value: 'Public' });
    p.i18n = { default: 'en', locales: ['en', 'zh-CN'], messages: { 'zh-CN': { Field: '字段', Public: '公开' } } };
    seed(cache, oldFp, st.id, st.caption, 'en');
    const translated = { ...st, captionAuto: { kind: 'type' as const, label: '字段', value: '公开' } };
    const text = stepCaption(translated, dictionary('zh-CN'));
    seed(cache, cloudFp, st.id, text, 'zh-CN');
    seed(cache, cloudFp, st.id, '在「字段」中输入“旧值”', 'zh-CN');
    const r = bundleVoice(proj, p, out, store, undefined, fallback, 'cloud');
    expect(r.report).toMatchObject({ clips: 2, missing: 0, locales: { en: { missing: 0 }, 'zh-CN': { missing: 0 } } });
    playable(r.index!, 'en', st.caption);
    playable(r.index!, 'zh-CN', text);
    expect(r.index!.clips[clipKey(cloudFp, '在「字段」中输入“旧值”')]).toBeUndefined();
    const idx = cache.read();
    delete idx.clips[clipKey(cloudFp, text)]; cache.write(idx);
    const missing = bundleVoice(proj, p, tmp('joplo-auto-missing-'), store, undefined, fallback, 'cloud');
    expect(missing.report).toMatchObject({ clips: 1, missing: 1, locales: { en: { missing: 0 }, 'zh-CN': { missing: 1 } } });
  });
});
