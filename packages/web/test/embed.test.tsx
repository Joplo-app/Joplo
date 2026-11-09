import '../../../scripts/test/render-fixtures.ts';
import { fixtureConfig as config } from '../../../scripts/test/fixtures.ts';
/**
 * 发布站嵌入模式（?embed=1，云端嵌入契约）。不变量：
 * 1. 不带 embed=1（含 embed=0 / 空值 / 大小写不同）时发布站行为不变：仍是原来的首页，没有嵌入外壳；
 * 2. 嵌入默认显示封面、不自动播放；只有 autoplay=1 才跳过封面；
 * 3. 在禁止网络、存储不可用（CSP sandbox + connect-src 'none'）时照常播放、切步、切换场景，不发任何请求；
 * 4. 没有看板、左栏、层级标签这类外壳；品牌一律显示。
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import * as ui from '@joplo-app/plugin-ui';
import { feature, flow, layer, option, page, shot } from '@joplo-app/kit';
import { jsx } from '@joplo-app/kit/jsx-runtime';
import { compile, type AuthoringProject, type Project } from '@joplo-app/core';
import { DemoController } from '../src/runtime/demo';
import { I18nProvider } from '../src/i18n/context';
import { dictionary } from '../src/i18n/dictionaries';
import { SiteApp } from '../src/site/SiteApp';
import { embedInitial, embedKey, embedProgress, embedScenarioItems, fullscreenAvailable, parseEmbedParams, standaloneUrl } from '../src/site/embed-model';

const h = (type: unknown, props: Record<string, unknown> | null, ...children: unknown[]) => jsx(type, { ...(props ?? {}), ...(children.length ? { children } : {}) });
const F = (file: string) => ({ file: `/p/${file}`, source: `/p/${file}:1:1` });

/** 两个功能（各自选定方案）、三个场景；第一个方案带两个层级。 */
function published(): Project {
  const home = page({ title: 'Home', layout: false }, h(ui.Group, { id: 'row' }, h(ui.Button, { id: 'go' }, 'Go'), h(ui.Button, { id: 'more' }, 'More')));
  const a = option({
    name: 'A', idea: 'i', state: { ui: {} },
    layers: { app: layer('App', h(ui.Stack, { id: 'app' }, h(ui.Button, { id: 'go' }, 'Go'), h(ui.Button, { id: 'more' }, 'More'))), data: layer('Data', h(ui.Text, { id: 'data' }, 'Data')) },
    scenarios: { main: flow('Main path', { start: '/' }).click('go', shot('data')).click('more'), other: flow('Other path', { start: '/' }).click('more') },
  });
  const b = option({ name: 'B', idea: 'i', state: { ui: {} }, scenarios: { only: flow('Second feature', { start: '/' }).click('go') } });
  const src: AuthoringProject = {
    root: '/p',
    config: { ...config({ name: 'Team "invite" <demo>', home: '/' }), ...F('joplo.config.ts') },
    layouts: {},
    routes: { '/': { ...home, ...F('routes/page.tsx') } },
    features: {
      f: { def: { ...feature({ name: 'Invite', goal: 'g', cases: {}, pick: 'a' }), ...F('features/f/feature.ts') }, options: { a: { ...a, ...F('features/f/options/a.tsx') } } },
      g: { def: { ...feature({ name: 'Audit', goal: 'g', cases: {}, pick: 'b' }), ...F('features/g/feature.ts') }, options: { b: { ...b, ...F('features/g/options/b.tsx') } } },
    },
  };
  const out = compile(src, 'publish');
  expect(out.project, JSON.stringify(out.diagnostics)).toBeTruthy();
  return out.project!;
}

const render = (search: string, project = published()) => renderToStaticMarkup(<I18nProvider explicit="en"><SiteApp data={{ project, home: null }} search={search} /></I18nProvider>);
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('参数', () => {
  it('只有 embed 恰好是 1 才进入嵌入模式', () => {
    for (const search of ['', '?', '?embed=0', '?embed=', '?embed=true', '?embed=1x', '?EMBED=1', '?embed', '#embed=1', null, undefined]) expect(parseEmbedParams(search), String(search)).toBeNull();
    expect(parseEmbedParams('?embed=1')).toEqual({ scenario: null, autoplay: false, review: false });
    expect(parseEmbedParams('embed=1&scenario=f.a.other&autoplay=1&x=y')).toEqual({ scenario: 'f.a.other', autoplay: true, review: false });
  });
  it('autoplay 只有 1 才自动播放；默认显示封面', () => {
    const p = published();
    for (const v of ['0', '', 'true', 'yes', '11', 'TRUE']) expect(embedInitial(p, parseEmbedParams(`?embed=1&autoplay=${v}`)!).covered, v).toBe(true);
    expect(embedInitial(p, parseEmbedParams('?embed=1')!)).toEqual({ scenarioId: 'f.a.main', covered: true });
    expect(embedInitial(p, parseEmbedParams('?embed=1&autoplay=1')!).covered).toBe(false);
  });
  it('scenario 写错时从默认场景开始，不报错', () => {
    const p = published();
    expect(embedInitial(p, parseEmbedParams('?embed=1&scenario=g.b.only')!).scenarioId).toBe('g.b.only');
    for (const bad of ['', 'nope', '%E0%A4%A', 'x'.repeat(5000), '../f.a.main']) expect(embedInitial(p, parseEmbedParams(`?embed=1&scenario=${bad}`)!).scenarioId, bad.slice(0, 20)).toBe('f.a.main');
  });
  it('场景切换菜单：多个功能时写“功能 · 场景”', () => {
    expect(embedScenarioItems(published(), 'f.a.other')).toEqual([
      { id: 'f.a.main', label: 'Invite · Main path', current: false },
      { id: 'f.a.other', label: 'Invite · Other path', current: true },
      { id: 'g.b.only', label: 'Audit · Second feature', current: false },
    ]);
  });
  it('进度与边界输入', () => {
    expect(embedProgress(1, 4)).toBe(0.25);
    for (const [p, t] of [[0, 0], [3, -1], [Number.NaN, 4], [2, Number.POSITIVE_INFINITY]]) expect(embedProgress(p!, t!)).toBe(0);
    expect(embedProgress(9, 4)).toBe(1);
  });
  it('“在新标签页打开”：同一个分享页，去掉 embed / scenario / autoplay，停在当前场景与步骤', () => {
    expect(standaloneUrl('https://joplo.app/s/Abc1234567/?embed=1&scenario=f.a.other&autoplay=1&x=1', { featureId: 'f', scenarioId: 'f.a.other', step: 2 })).toBe('https://joplo.app/s/Abc1234567/?x=1#/f/f?s=f.a.other&step=2');
    expect(standaloneUrl('https://joplo.app/s/Abc1234567/?embed=1#/old', null)).toBe('https://joplo.app/s/Abc1234567/');
    expect(standaloneUrl('file:///tmp/dist/index.html?embed=1', { featureId: 'f', scenarioId: 'f.a.main', step: 0 })).toBe('file:///tmp/dist/index.html#/f/f?s=f.a.main');
  });
  it('全屏可用性：嵌入方没给 allowfullscreen（fullscreenEnabled=false）时退回新标签页', () => {
    expect(fullscreenAvailable({ fullscreenEnabled: true, documentElement: { requestFullscreen: () => undefined } })).toBe(true);
    for (const doc of [undefined, {}, { fullscreenEnabled: false, documentElement: { requestFullscreen: () => undefined } }, { fullscreenEnabled: true, documentElement: {} }]) expect(fullscreenAvailable(doc)).toBe(false);
  });
  it('键盘：空格 播放 / 暂停，← → 切步（封面上不动作），F 全屏；输入框、画面里、修饰键、按钮上的空格不处理', () => {
    const el = (tag = 'DIV', inside: string | null = null) => ({ tagName: tag, closest: (s: string) => (inside && s.includes(inside) ? {} : null) });
    expect(embedKey({ key: ' ' }, el(), false)).toBe('toggle');
    expect(embedKey({ key: ' ' }, el(), true)).toBe('toggle');
    expect(embedKey({ key: ' ' }, el('BUTTON'), false)).toBeNull();
    expect(embedKey({ key: 'ArrowRight' }, el(), false)).toBe('next');
    expect(embedKey({ key: 'ArrowLeft' }, el(), false)).toBe('prev');
    expect(embedKey({ key: 'ArrowRight' }, el(), true)).toBeNull();
    expect(embedKey({ key: 'f' }, el(), true)).toBe('fullscreen');
    expect(embedKey({ key: 'F' }, el('BUTTON'), false)).toBe('fullscreen');
    expect(embedKey({ key: 'f', metaKey: true }, el(), false)).toBeNull();
    expect(embedKey({ key: 'ArrowRight', altKey: true }, el(), false)).toBeNull();
    expect(embedKey({ key: ' ' }, el('INPUT', 'input'), false)).toBeNull();
    expect(embedKey({ key: 'ArrowRight' }, el('DIV', '[data-joplo-stage]'), false)).toBeNull();
    expect(embedKey({ key: 'Enter' }, null, false)).toBeNull();
  });
});

describe('画面', () => {
  it('不带 embed=1 时仍是原来的发布站首页（没有嵌入外壳）', () => {
    vi.stubGlobal('location', { hash: '', search: '', href: 'https://joplo.app/s/Abc1234567/' });
    for (const search of ['', '?embed=0', '?embed=true']) {
      const html = render(search);
      expect(html).toContain('data-testid="site-home"');
      expect(html).toContain('data-testid="topbar"');
      expect(html).not.toContain('data-testid="embed');
    }
  });
  it('branding 关掉（Pro 分享，D83）时嵌入里也没有「Made with Joplo」；封面和播放中都去掉', () => {
    const off = (search: string) => renderToStaticMarkup(<I18nProvider explicit="en"><SiteApp data={{ project: published(), home: null }} search={search} branding={false} /></I18nProvider>);
    for (const search of ['?embed=1', '?embed=1&autoplay=1']) {
      const html = off(search);
      expect(html, search).toContain('data-testid="embed"');
      expect(html, search).not.toContain('data-testid="embed-brand"');
      expect(html, search).not.toContain('Made with Joplo');
    }
    expect(render('?embed=1&autoplay=1')).toContain('data-testid="embed-brand"');
  });
  it('嵌入默认显示封面：压暗画面 + 大播放按钮 + 标题 + 场景数 + 用 Joplo 制作；没有看板 / 左栏 / 层级标签', () => {
    const html = render('?embed=1');
    expect(html).toContain('data-testid="embed"');
    expect(html).toContain('data-testid="embed-cover"');
    expect(html).toContain('data-testid="embed-play"');
    expect(html).toContain('>Play demo<');
    expect(html).toContain('Team &quot;invite&quot; &lt;demo&gt;');
    expect(html).toContain('Interactive prototype · 3 scenarios');
    expect(html).toContain('data-testid="embed-brand"');
    expect(html).toContain('Made with Joplo');
    expect(html).toContain('data-testid="device-desktop"');
    // 封面下的画面不可聚焦、不可操作
    expect(html).toMatch(/<div[^>]*inert=""[^>]*data-testid="embed-stage"/);
    for (const shell of ['topbar', 'left-nav', 'layer-bar', 'scenario-nav', 'crumbs', 'controls', 'copy-link', 'embed-bar']) expect(html, shell).not.toContain(`data-testid="${shell}"`);
  });
  it('autoplay=1 跳过封面，直接是精简控制条（场景切换、全屏 / 新标签页、品牌）', () => {
    const html = render('?embed=1&autoplay=1&scenario=f.a.other');
    expect(html).not.toContain('data-testid="embed-cover"');
    expect(html).not.toMatch(/inert=""[^>]*data-testid="embed-stage"/);
    for (const id of ['embed-bar', 'embed-prev', 'embed-toggle', 'embed-next', 'embed-step', 'embed-progress', 'embed-scenarios', 'embed-fullscreen', 'embed-brand', 'subtitle']) expect(html, id).toContain(`data-testid="${id}"`);
    expect(html).toContain('Step 0 / 1');
    // 服务端没有 Fullscreen API：按钮是“在新标签页打开”
    expect(html).toContain('data-fallback="new-tab"');
    expect(html).toContain('href="https://joplo.app/"');
    expect(html).toContain('target="_blank"');
    for (const shell of ['topbar', 'left-nav', 'layer-bar']) expect(html, shell).not.toContain(`data-testid="${shell}"`);
  });
  it('diff initial state has no scenario curtain or narration control', () => {
    const html = render('?embed=1&review=1&diff=1&autoplay=1');
    expect(html).toContain('data-testid="embed-stage"');
    expect(html).not.toContain('data-testid="embed-voice"');
    expect(html).not.toContain('data-testid="curtain"');
    // The diff page drives both players; their own control bars would only shrink the stage.
    expect(html).not.toContain('data-testid="embed-bar"');
    expect(html).not.toContain('data-testid="embed-cover-footer"');
    expect(html).toContain('data-testid="subtitle"');
    expect(parseEmbedParams('?embed=1&diff=1')?.diff).toBe(true);
  });
  it('只有一个场景时没有场景切换；没有场景时显示空状态和品牌', () => {
    const p = published();
    const one = { ...p, features: { f: p.features.f! }, scenarios: { 'f.a.main': p.scenarios['f.a.main']! } } as Project;
    const html = render('?embed=1&autoplay=1', one);
    expect(html).not.toContain('data-testid="embed-scenarios"');
    expect(html).toContain('data-testid="embed-scenario-name"');
    const empty = render('?embed=1', { ...p, scenarios: {} } as Project);
    expect(empty).toContain('data-testid="embed-empty"');
    expect(empty).toContain('This demo has no scenario to play yet.');
    expect(empty).toContain('data-testid="embed-brand"');
    expect(empty).not.toContain('data-testid="embed-cover"');
  });
  it('十种语言都有嵌入文案（走现有词典）', () => {
    for (const locale of ['zh-CN', 'ja', 'ru'] as const) {
      const html = renderToStaticMarkup(<I18nProvider explicit={locale}><SiteApp data={{ project: published(), home: null }} search="?embed=1" /></I18nProvider>);
      expect(html).toContain(dictionary(locale).site.embedPlayDemo);
      expect(html).toContain(dictionary(locale).site.embedMadeWithJoplo);
    }
  });
});

describe('禁止网络与存储（CSP sandbox + connect-src none）', () => {
  it('播放、切步、切换场景都不发请求；localStorage 抛 SecurityError 也照常', async () => {
    const net = vi.fn(() => { throw new Error('connect-src none'); });
    vi.stubGlobal('fetch', net);
    vi.stubGlobal('XMLHttpRequest', vi.fn(function () { net(); }));
    vi.stubGlobal('WebSocket', vi.fn(function () { net(); }));
    vi.stubGlobal('EventSource', vi.fn(function () { net(); }));
    vi.stubGlobal('navigator', { languages: ['zh-CN'], sendBeacon: net });
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, get: () => { throw new DOMException('The document is sandboxed', 'SecurityError'); } });
    try {
      // 首帧（封面）能渲染，语言按浏览器匹配
      expect(renderToStaticMarkup(<I18nProvider><SiteApp data={{ project: published(), home: null }} search="?embed=1" /></I18nProvider>)).toContain(dictionary('zh-CN').site.embedPlayDemo);
      const project = published();
      const c = new DemoController(null);
      c.reducedMotion = true;
      c.setProject(project, 1, null);
      c.setScenario(embedInitial(project, parseEmbedParams('?embed=1')!).scenarioId!, 0, { quiet: true });
      await c.play();
      expect(c.getSnapshot().state).toMatchObject({ scenarioId: 'f.a.main', position: 2 });
      expect(c.getSnapshot().playing).toBe(false);
      c.prev();
      expect(c.getSnapshot().state!.position).toBe(1);
      c.setScenario('g.b.only', 0, { quiet: true });
      await c.next();
      expect(c.getSnapshot().state).toMatchObject({ scenarioId: 'g.b.only', position: 1 });
      expect(c.getSnapshot().playbackError).toBeNull();
      expect(net).not.toHaveBeenCalled();
    } finally {
      delete (globalThis as { localStorage?: unknown }).localStorage;
    }
  });
  it('嵌入入口的模块图不含创作侧与网络客户端（dev-client、board/）', () => {
    const root = resolve(import.meta.dirname, '../src');
    const seen = new Set<string>();
    const visit = (file: string) => {
      if (seen.has(file)) return;
      seen.add(file);
      const code = readFileSync(file, 'utf8');
      for (const m of code.matchAll(/^\s*import\s+(?!type\b)[^'"]*?['"]([^'"]+)['"]/gm)) {
        const spec = m[1]!;
        if (!spec.startsWith('.') && !spec.startsWith('@/')) continue;
        const base = spec.startsWith('@/') ? resolve(root, spec.slice(2)) : resolve(dirname(file), spec);
        const hit = ['', '.ts', '.tsx', '/index.ts'].map((x) => base + x).find((p) => { try { return readFileSync(p) && true; } catch { return false; } });
        if (hit && /\.(tsx?|css)$/.test(hit) && !hit.endsWith('.css')) visit(hit);
      }
    };
    visit(resolve(root, 'site/main.tsx'));
    const files = [...seen].map((f) => f.slice(root.length + 1));
    expect(files).toContain('site/EmbedApp.tsx');
    expect(files.filter((f) => f.startsWith('board/') || f === 'runtime/dev-client.ts')).toEqual([]);
  });
});

it('作者标记只给普通分享页，嵌入即使传入作者也不显示', () => {
  vi.stubGlobal('location', { hash: '#/', search: '', href: 'https://joplo.app/s/Abc1234567/' });
  const author={name:'Example author',url:'https://show.joplo.app/@example'};
  const page=(search: string)=>renderToStaticMarkup(<I18nProvider explicit="en"><SiteApp data={{project:published(),home:null}} search={search} author={author} /></I18nProvider>);
  expect(page('')).toContain('Example author · More works');
  expect(page('?embed=1')).not.toContain('author-link');
  expect(page('?embed=1&review=1')).not.toContain('author-link');
});
