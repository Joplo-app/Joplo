/**
 * 作者内容多语言（D84）在网页里的不变量：
 * 1. 发布站 / 嵌入的内容语言 = 界面语言（项目有）或默认语言（退回时显示一行说明）；?lang= 是这次打开的显式界面语言。
 * 2. 所有地方都用换过语言的 IR（项目名、功能名、舞台、字幕）；自动字幕在内容语言与界面语言不同时用内容语言。
 * 3. 语言菜单列出全部 10 种界面语言，有作者内容的打 ✓；没有 i18n 的项目不变。
 * 4. 看板菜单：已译 / 总数与过期条数；按项目记住选择。导出请求体带 contentLocale。
 * 5. 朗读的声音指纹按内容语言选（发布站 voiceIndex.locales，看板 byLocale），没有时用默认声音。
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import * as ui from '@joplo-app/kit/ui';
import { config, feature, flow, option, page } from '@joplo-app/kit';
import { jsx } from '@joplo-app/kit/jsx-runtime';
import { compile, type AuthoringProject, type Project } from '@joplo-app/core';
import { I18nProvider } from '../src/i18n/context';
import { resolveLocale } from '../src/i18n/locale';
import { boardVoiceLookup, contentMenuRows, langParam, siteContent, siteVoiceLookup, viewProject } from '../src/i18n/content';
import { languageItems } from '../src/player/LanguageMenu';
import { renderProject } from '../src/RenderApp';
import { SiteApp } from '../src/site/SiteApp';
import { exportImage, generateVoice, requestClip, startVideo } from '../src/runtime/dev-client';

const h = (type: unknown, props: Record<string, unknown> | null, ...children: unknown[]) => jsx(type, { ...(props ?? {}), ...(children.length ? { children } : {}) });
const F = (file: string) => ({ file: `/p/${file}`, source: `/p/${file}:1:1` });

function build(mode: 'publish' | 'dev', locales?: string[], tables: Record<string, Record<string, string>> = {}): Project {
  const home = page({ title: '首页', layout: false }, h(ui.Stack, { id: 'root' }, h(ui.Button, { id: 'invite' }, '邀请成员'), h(ui.Text, { id: 'hello' }, '你好')));
  const a = option({ name: '方案', idea: '想法', state: { ui: {} }, scenarios: { main: flow('发出邀请', { start: '/' }).click('invite').click('invite', '管理员发出邀请') } });
  const src: AuthoringProject = {
    root: '/p',
    config: { ...config({ name: '团队邀请', home: '/', ...(locales ? { locales } : {}) }), ...F('joplo.config.ts') },
    layouts: {},
    routes: { '/': { ...home, ...F('routes/page.tsx') } },
    features: { f: { def: { ...feature({ name: '邀请', goal: '把同事拉进空间', cases: {}, pick: 'a' }), ...F('features/f/feature.ts') }, options: { a: { ...a, ...F('features/f/options/a.tsx') } } } },
    ...(Object.keys(tables).length ? { locales: tables, localeFiles: Object.fromEntries(Object.keys(tables).map((l) => [l, `locales/${l}.json`])) } : {}),
  };
  const out = compile(src, mode);
  expect(out.project, JSON.stringify(out.diagnostics)).toBeTruthy();
  return out.project!;
}

const JA = { 团队邀请: 'チーム招待', 邀请: '招待', 邀请成员: 'メンバーを招待', 你好: 'こんにちは', 管理员发出邀请: '管理者が招待を送る', 发出邀请: '招待を送る', 把同事拉进空间: '同僚をスペースに招く', 方案: '案', 想法: 'アイデア', 首页: 'ホーム' };
const site = (uiLocale: string, project = build('publish', ['zh-CN', 'ja'], { ja: JA }), search = '') =>
  renderToStaticMarkup(<I18nProvider explicit={uiLocale}><SiteApp data={{ project, home: null }} search={search} /></I18nProvider>);

afterEach(() => vi.unstubAllGlobals());

describe('内容语言的解析与退回', () => {
  it('界面语言在项目里就用它，不在就退回默认语言', () => {
    const p = build('publish', ['zh-CN', 'ja'], { ja: JA });
    expect(siteContent(p, 'ja')).toEqual({ locales: ['zh-CN', 'ja'], default: 'zh-CN', locale: 'ja', fallback: false });
    expect(siteContent(p, 'pt-BR')).toMatchObject({ locale: 'zh-CN', fallback: true });
    expect(siteContent(p, 'zh-CN')).toMatchObject({ locale: 'zh-CN', fallback: false });
    expect(siteContent(build('publish'), 'ja')).toBeNull();
  });

  it('?lang= 按 D57 规则匹配，优先于记住的语言与浏览器语言', () => {
    expect(langParam('?lang=ja-JP')).toBe('ja');
    expect(langParam('?lang=zh-Hant')).toBe('zh-TW');
    expect(langParam('?lang=xx')).toBeUndefined();
    expect(langParam('')).toBeUndefined();
    expect(resolveLocale({ explicit: langParam('?embed=1&lang=ja'), saved: 'en', languages: ['fr'] })).toBe('ja');
  });
});

describe('发布站与嵌入', () => {
  it('日语观众：项目名、功能、舞台都是日语，没有退回说明', () => {
    const html = site('ja', undefined, '?embed=1');
    expect(html).toContain('チーム招待');
    expect(html).not.toContain('团队邀请');
    expect(html).not.toContain('data-testid="content-fallback"');
  });

  it('葡萄牙语观众：内容退回中文，显示一行说明；首页同样', () => {
    const embed = site('pt-BR', undefined, '?embed=1');
    expect(embed).toContain('团队邀请');
    expect(embed).toContain('data-testid="content-fallback"');
    expect(embed).toContain('Português (Brasil)');
    vi.stubGlobal('location', { hash: '', search: '', hostname: 'example.com', href: 'https://example.com/' });
    const home = site('pt-BR');
    expect(home).toContain('data-testid="content-fallback"');
  });

  it('没有 i18n 的项目：输出与原来一致，没有说明', () => {
    vi.stubGlobal('location', { hash: '', search: '', hostname: 'example.com', href: 'https://example.com/' });
    const p = build('publish');
    expect(site('pt-BR', p)).not.toContain('content-fallback');
    expect(viewProject(p, 'ja', 'en')).toBe(p);
  });

  it('语言菜单列出 10 种语言：✓ 只表示当前语言，有作者内容的带“原文 / 译文”标签', () => {
    const tags = { source: 'SRC', translated: 'TR' };
    const items = languageItems('pt-BR', () => undefined, { locales: ['zh-CN', 'ja'], default: 'zh-CN' }, tags);
    expect(items).toHaveLength(10);
    expect(items.filter((i) => i.hint).map((i) => i.lang)).toEqual(['zh-CN', 'ja']);
    expect(renderToStaticMarkup(<>{items.find((i) => i.lang === 'zh-CN')!.hint}</>)).toContain('SRC');
    expect(renderToStaticMarkup(<>{items.find((i) => i.lang === 'ja')!.hint}</>)).toContain('TR');
    expect(items.filter((i) => i.checked).map((i) => i.lang)).toEqual(['pt-BR']);
    expect(languageItems('en', () => undefined, null, tags).some((i) => i.hint || i.description)).toBe(false);
    // 看板：第二行是翻译进度，过期条数写在标签前
    const board = languageItems('zh-CN', () => undefined, { locales: ['zh-CN', 'ja'], default: 'zh-CN', details: { ja: { description: '3/5', stale: '1 old' } } }, tags);
    const ja = board.find((i) => i.lang === 'ja')!;
    expect(ja.description).toBe('3/5');
    expect(renderToStaticMarkup(<>{ja.hint}</>)).toContain('1 old');
  });

  it('自动字幕跟着内容语言（内容与界面语言不同时）', () => {
    const p = build('publish', ['zh-CN', 'ja'], { ja: JA });
    const step = (q: Project) => q.scenarios['f.a.main']!.steps[0]!;
    expect(step(p).captionAuto).toBeDefined();
    const pt = viewProject(p, 'zh-CN', 'pt-BR');
    expect(step(pt).captionAuto).toBeUndefined();
    expect(step(pt).caption).toContain('邀请成员');
    expect(step(pt).caption).not.toContain('Clicar');
    const ja = viewProject(p, 'ja', 'ja');
    expect(step(ja).captionAuto?.label).toBe('メンバーを招待');
    expect(ja.scenarios['f.a.main']!.steps[1]!.caption).toBe('管理者が招待を送る');
  });
});

describe('看板', () => {
  it('菜单：默认语言是原文；其他语言给已译 / 总数和过期条数', () => {
    const p = build('dev', ['zh-CN', 'ja'], { ja: { 团队邀请: 'チーム招待', 邀请成员们: '古い' } });
    const rows = contentMenuRows(p);
    expect(rows[0]).toMatchObject({ locale: 'zh-CN', isDefault: true });
    expect(rows[1]).toMatchObject({ locale: 'ja', isDefault: false, translated: 1 });
    expect(rows[1]!.total).toBeGreaterThan(5);
    expect(rows[1]!.stale).toBe(1);
  });


  it('截图 content= 参数：项目有这种语言才换', () => {
    const p = build('dev', ['zh-CN', 'ja'], { ja: JA });
    expect(renderProject(p, 'ja', 'zh-CN').name).toBe('チーム招待');
    expect(renderProject(p, 'ko', 'zh-CN')).toBe(p);
    expect(renderProject(p, null, 'zh-CN')).toBe(p);
  });

  it('导出与生成声音的请求体带 contentLocale；没有时不带', async () => {
    vi.stubGlobal('document', { querySelector: () => ({ content: 't' }) });
    const fetch = vi.fn()
      .mockResolvedValueOnce(new Response('png', { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ job: { id: 'j' } }), { status: 202 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ url: '/u', key: 'k' }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ summary: {}, state: {} }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ url: '/u', key: 'k' }), { status: 200 }));
    vi.stubGlobal('fetch', fetch);
    await exportImage('p', { scenarioId: 's', position: 1, theme: 'sketch', locale: 'zh-CN', contentLocale: 'ja' });
    await startVideo('p', { scenarioId: 's', theme: 'sketch', locale: 'zh-CN', contentLocale: 'ja' });
    await requestClip('p', 'zh-CN', { stepId: 'x', text: 't', role: null }, 'ja');
    await generateVoice('p', 'zh-CN', [], 'ja');
    await requestClip('p', 'zh-CN', { stepId: 'x', text: 't', role: null }, null);
    const bodies = fetch.mock.calls.map((c) => JSON.parse(c[1].body));
    expect(bodies[0].contentLocale).toBe('ja');
    expect(bodies[1].contentLocale).toBe('ja');
    expect(bodies[2].contentLocale).toBe('ja');
    expect(bodies[3].contentLocale).toBe('ja');
    expect('contentLocale' in bodies[4]).toBe(false);
  });
});

describe('朗读的声音按内容语言选', () => {
  const index = { narrator: 'fp-zh', roles: { lin: 'fp-lin' }, clips: { c1: 'voice/a.mp3' }, locales: { ja: { narrator: 'fp-ja', roles: {} } } };
  it('发布站：这种语言有单独的声音就用它，否则用默认声音', () => {
    expect(siteVoiceLookup(index, 'ja')).toEqual({ narrator: 'fp-ja', roles: {}, clips: index.clips });
    expect(siteVoiceLookup(index, 'en')).toEqual({ narrator: 'fp-zh', roles: { lin: 'fp-lin' }, clips: index.clips });
    expect(siteVoiceLookup(index, null)).toEqual({ narrator: 'fp-zh', roles: { lin: 'fp-lin' }, clips: index.clips });
    expect(siteVoiceLookup(null, 'ja')).toBeNull();
  });
  it('看板：用 VoiceState.byLocale 的指纹', () => {
    const state = { voices: { narrator: 'fp-zh', roles: {} }, clips: {}, byLocale: { ja: { narrator: 'Sarah', roles: {}, voices: { narrator: 'fp-ja', roles: {} } } } };
    expect(boardVoiceLookup(state, 'ja')?.narrator).toBe('fp-ja');
    expect(boardVoiceLookup(state, 'en')?.narrator).toBe('fp-zh');
    expect(boardVoiceLookup({ voices: state.voices, clips: {} }, 'ja')?.narrator).toBe('fp-zh');
  });
});
