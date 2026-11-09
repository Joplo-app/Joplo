import '../../../scripts/test/render-fixtures.ts';
import { fixtureConfig as config } from '../../../scripts/test/fixtures.ts';
/**
 * 发布站评审模式（?embed=1&review=1，云端契约 8.2）。不变量：
 * 1. 不是评审模式（没有 review=1）时：不注册 message 监听、不发任何 postMessage；
 * 2. 只处理 event.source === window.parent 且字段校验通过的消息，其余一律忽略；
 * 3. joplo:position 每次场景、步骤、层级变化各发一次，不重复；
 * 4. 可选元素的 id 是 IR 元素 Id（作者写的 id），编译器生成的 `_` 开头 id 与文本节点不算。
 */
import { describe, expect, it, vi } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import * as ui from '@joplo-app/plugin-ui';
import { feature, flow, layer, option, page, shot } from '@joplo-app/kit';
import { jsx } from '@joplo-app/kit/jsx-runtime';
import { compile, type AuthoringProject, type Project } from '@joplo-app/core';
import { authorElement, createReviewBridge, elementLabel, parseReviewMessage, reviewScenarios, type BridgeWindow } from '../src/site/review-bridge';
import { embedInitial, parseEmbedParams, standaloneUrl } from '../src/site/embed-model';
import { renderToStaticMarkup } from 'react-dom/server';
import { I18nProvider } from '../src/i18n/context';
import { SiteApp } from '../src/site/SiteApp';

const h = (type: unknown, props: Record<string, unknown> | null, ...children: unknown[]) => jsx(type, { ...(props ?? {}), ...(children.length ? { children } : {}) });
const F = (file: string) => ({ file: `/p/${file}`, source: `/p/${file}:1:1` });

/** 两个功能；f 有两个方案（a 选定、b 未选定），g 没有选定方案。dev 编译 = 含所有方案（与评审版同样的方案集合）。 */
function project(): Project {
  const home = page({ title: 'Home', layout: false }, h(ui.Group, { id: 'row' }, h(ui.Button, { id: 'go' }, 'Go'), h(ui.Button, { id: 'more' }, 'More')));
  const a = option({
    name: 'A', idea: 'i', state: { ui: {} },
    layers: { app: layer('App', h(ui.Stack, { id: 'app' }, h(ui.Button, { id: 'go' }, 'Go'), h(ui.Button, { id: 'more' }, 'More'))), data: layer('Data', h(ui.Text, { id: 'data' }, 'Data')) },
    scenarios: { main: flow('Main path', { start: '/' }).click('go', shot('data')).click('more'), other: flow('Other path', { start: '/' }).click('more') },
  });
  const b = option({ name: 'B', idea: 'i', state: { ui: {} }, scenarios: { solo: flow('B path', { start: '/' }).click('go') } });
  const c = option({ name: 'C', idea: 'i', state: { ui: {} }, scenarios: { only: flow('Second feature', { start: '/' }).click('go').click('more') } });
  const src: AuthoringProject = {
    root: '/p',
    config: { ...config({ name: 'Demo', home: '/' }), ...F('joplo.config.ts') },
    layouts: {},
    routes: { '/': { ...home, ...F('routes/page.tsx') } },
    features: {
      f: { def: { ...feature({ name: 'Invite', goal: 'g', cases: {}, pick: 'a' }), ...F('features/f/feature.ts') }, options: { a: { ...a, ...F('features/f/options/a.tsx') }, b: { ...b, ...F('features/f/options/b.tsx') } } },
      g: { def: { ...feature({ name: 'Audit', goal: 'g', cases: {} }), ...F('features/g/feature.ts') }, options: { c: { ...c, ...F('features/g/options/c.tsx') } } },
    },
  };
  const out = compile(src, 'dev');
  expect(out.project, JSON.stringify(out.diagnostics)).toBeTruthy();
  return out.project!;
}

/** 测试替身：window 与 parent。 */
function fakeWindow(opts: { framed?: boolean } = {}) {
  const listeners = new Set<(e: { source: unknown; data: unknown }) => void>();
  const parent = { postMessage: vi.fn() };
  const win = {
    parent: undefined as unknown,
    addEventListener: vi.fn((type: string, fn: (e: { source: unknown; data: unknown }) => void) => { if (type === 'message') listeners.add(fn); }),
    removeEventListener: vi.fn((type: string, fn: (e: { source: unknown; data: unknown }) => void) => { if (type === 'message') listeners.delete(fn); }),
  };
  win.parent = opts.framed === false ? win : parent;
  const send = (data: unknown, source: unknown = parent) => { for (const fn of [...listeners]) fn({ source, data }); };
  return { win: win as unknown as BridgeWindow, parent, raw: win, send, listeners };
}

describe('参数', () => {
  it('review 只有恰好是 1、且在 embed=1 下才开启', () => {
    expect(parseEmbedParams('?embed=1')).toEqual({ scenario: null, autoplay: false, review: false });
    expect(parseEmbedParams('?embed=1&review=1')!.review).toBe(true);
    for (const v of ['0', '', 'true', 'yes', '11']) expect(parseEmbedParams(`?embed=1&review=${v}`)!.review, v).toBe(false);
    expect(parseEmbedParams('?review=1')).toBeNull();
  });
  it('评审模式的 scenario 参数可以指向任何方案的场景；普通嵌入仍只认选定方案', () => {
    const p = project();
    expect(embedInitial(p, parseEmbedParams('?embed=1&review=1&scenario=f.b.solo')!).scenarioId).toBe('f.b.solo');
    expect(embedInitial(p, parseEmbedParams('?embed=1&scenario=f.b.solo')!).scenarioId).toBe('f.a.main');
    expect(embedInitial(p, parseEmbedParams('?embed=1&review=1&scenario=__proto__')!).scenarioId).toBe('f.a.main');
  });
});

describe('ready 场景列表', () => {
  it('所有场景：按功能顺序 → 方案顺序 → 场景顺序；steps 是步骤数', () => {
    expect(reviewScenarios(project())).toEqual([
      { id: 'f.a.main', optionId: 'f.a', steps: 2 },
      { id: 'f.a.other', optionId: 'f.a', steps: 1 },
      { id: 'f.b.solo', optionId: 'f.b', steps: 1 },
      { id: 'g.c.only', optionId: 'g.c', steps: 2 },
    ]);
  });
});

describe('入站校验', () => {
  const p = project();
  it('合法的 goto 与 pick', () => {
    expect(parseReviewMessage({ type: 'joplo:goto', protocol: 1, scenario: 'f.b.solo', step: 1, highlight: 'go' }, p)).toEqual({ type: 'goto', scenario: 'f.b.solo', step: 1, highlight: 'go' });
    expect(parseReviewMessage({ type: 'joplo:goto', protocol: 1, scenario: 'f.a.main', step: 0, highlight: null, extra: 'ignored' }, p)).toEqual({ type: 'goto', scenario: 'f.a.main', step: 0, highlight: null });
    // 步骤超过步数时夹到步数
    expect(parseReviewMessage({ type: 'joplo:goto', protocol: 1, scenario: 'f.a.main', step: 99, highlight: null }, p)).toMatchObject({ step: 2 });
    expect(parseReviewMessage({ type: 'joplo:pick', protocol: 1, active: true }, p)).toEqual({ type: 'pick', active: true });
    expect(parseReviewMessage({ type: 'joplo:pick', protocol: 1, active: false }, p)).toEqual({ type: 'pick', active: false });
  });
  it.each([
    ['不是对象', 'joplo:goto'],
    ['null', null],
    ['数组', [{ type: 'joplo:pick', protocol: 1, active: true }]],
    ['protocol 缺失', { type: 'joplo:pick', active: true }],
    ['protocol 不是 1', { type: 'joplo:pick', protocol: 2, active: true }],
    ['protocol 是字符串', { type: 'joplo:pick', protocol: '1', active: true }],
    ['未知 type', { type: 'joplo:position', protocol: 1, scenario: 'f.a.main', step: 0 }],
    ['pick active 不是布尔', { type: 'joplo:pick', protocol: 1, active: 'true' }],
    ['goto 场景不存在', { type: 'joplo:goto', protocol: 1, scenario: 'nope', step: 0, highlight: null }],
    ['goto 场景是原型链键', { type: 'joplo:goto', protocol: 1, scenario: '__proto__', step: 0, highlight: null }],
    ['goto step 为负', { type: 'joplo:goto', protocol: 1, scenario: 'f.a.main', step: -1, highlight: null }],
    ['goto step 是小数', { type: 'joplo:goto', protocol: 1, scenario: 'f.a.main', step: 1.5, highlight: null }],
    ['goto step 是字符串', { type: 'joplo:goto', protocol: 1, scenario: 'f.a.main', step: '1', highlight: null }],
    ['goto step 是 NaN', { type: 'joplo:goto', protocol: 1, scenario: 'f.a.main', step: Number.NaN, highlight: null }],
    ['highlight 是编译器生成的 id', { type: 'joplo:goto', protocol: 1, scenario: 'f.a.main', step: 0, highlight: '_root_0' }],
    ['highlight 是选择器注入', { type: 'joplo:goto', protocol: 1, scenario: 'f.a.main', step: 0, highlight: 'go"],[data-jid' }],
    ['highlight 过长', { type: 'joplo:goto', protocol: 1, scenario: 'f.a.main', step: 0, highlight: `a${'x'.repeat(64)}` }],
    ['highlight 是数字', { type: 'joplo:goto', protocol: 1, scenario: 'f.a.main', step: 0, highlight: 3 }],
  ])('%s → 忽略', (_name, data) => {
    expect(parseReviewMessage(data, p)).toBeNull();
  });
  it('highlight 缺省视为 null', () => {
    expect(parseReviewMessage({ type: 'joplo:goto', protocol: 1, scenario: 'f.a.main', step: 0 }, p)).toMatchObject({ highlight: null });
  });
});

describe('桥', () => {
  it('不是评审模式：不注册监听、不发消息（不变量 3）', () => {
    const w = fakeWindow();
    const onGoto = vi.fn(), onPick = vi.fn();
    const b = createReviewBridge({ enabled: false, win: w.win, project: project(), onGoto, onPick });
    expect(b).toBeNull();
    expect(w.raw.addEventListener).not.toHaveBeenCalled();
    expect(w.parent.postMessage).not.toHaveBeenCalled();
  });
  it('不在 iframe 里（parent === window）：同样什么都不做', () => {
    const w = fakeWindow({ framed: false });
    expect(createReviewBridge({ enabled: true, win: w.win, project: project(), onGoto: vi.fn(), onPick: vi.fn() })).toBeNull();
    expect(w.raw.addEventListener).not.toHaveBeenCalled();
  });
  it('ready、position 去重、pick-result；全部带 protocol 1，targetOrigin 为 *', () => {
    const w = fakeWindow();
    const p = project();
    const b = createReviewBridge({ enabled: true, win: w.win, project: p, onGoto: vi.fn(), onPick: vi.fn() })!;
    b.ready();
    b.position({ scenario: 'f.a.main', step: 0, stepId: null, layer: 'app' });
    b.position({ scenario: 'f.a.main', step: 0, stepId: null, layer: 'app' });
    b.position({ scenario: 'f.a.main', step: 1, stepId: 'f.a.main#1', layer: 'app' });
    b.position({ scenario: 'f.a.main', step: 1, stepId: 'f.a.main#1', layer: 'data' });
    b.position({ scenario: 'f.a.main', step: 1, stepId: 'f.a.main#1', layer: 'data' });
    b.position({ scenario: 'f.b.solo', step: 1, stepId: 'f.b.solo#1', layer: null });
    b.pickResult({ id: 'go', label: 'Go' });
    b.pickResult(null);
    const sent = w.parent.postMessage.mock.calls;
    expect(sent.every((c) => c[1] === '*')).toBe(true);
    expect(sent.map((c) => c[0])).toEqual([
      { type: 'joplo:ready', protocol: 1, scenarios: reviewScenarios(p) },
      { type: 'joplo:position', protocol: 1, scenario: 'f.a.main', step: 0, stepId: null, layer: 'app' },
      { type: 'joplo:position', protocol: 1, scenario: 'f.a.main', step: 1, stepId: 'f.a.main#1', layer: 'app' },
      { type: 'joplo:position', protocol: 1, scenario: 'f.a.main', step: 1, stepId: 'f.a.main#1', layer: 'data' },
      { type: 'joplo:position', protocol: 1, scenario: 'f.b.solo', step: 1, stepId: 'f.b.solo#1', layer: null },
      { type: 'joplo:pick-result', protocol: 1, element: { id: 'go', label: 'Go' } },
      { type: 'joplo:pick-result', protocol: 1, element: null },
    ]);
  });
  it('ordinary review goto keeps its existing position deduplication', () => {
    const w = fakeWindow();
    const b = createReviewBridge({ enabled: true, win: w.win, project: project(), onGoto: vi.fn(), onPick: vi.fn() })!;
    const pos = { scenario: 'f.a.main', step: 1, stepId: 'f.a.main#1', layer: null };
    b.position(pos);
    w.send({ type: 'joplo:goto', protocol: 1, scenario: pos.scenario, step: pos.step });
    b.position(pos);
    expect(w.parent.postMessage).toHaveBeenCalledTimes(1);
  });
  it('diff goto invalidates deduplication but only an observed renderer position acknowledges it', () => {
    const w = fakeWindow();
    const onGoto = vi.fn();
    const b = createReviewBridge({ enabled: true, acknowledgeGoto: true, win: w.win, project: project(), onGoto, onPick: vi.fn() })!;
    const pos = { scenario: 'f.a.main', step: 1, stepId: 'f.a.main#1', layer: 'app' };
    b.position(pos); b.position(pos);
    expect(w.parent.postMessage).toHaveBeenCalledTimes(1);
    w.send({ type: 'joplo:goto', protocol: 1, scenario: pos.scenario, step: pos.step });
    expect(onGoto).toHaveBeenCalledOnce();
    expect(w.parent.postMessage).toHaveBeenCalledTimes(1); // Command receipt alone is not completion.
    b.position(pos); b.position(pos);
    expect(w.parent.postMessage).toHaveBeenCalledTimes(2);
    w.send({ type: 'joplo:goto', protocol: 1, scenario: 'missing', step: 0 });
    b.position(pos);
    expect(w.parent.postMessage).toHaveBeenCalledTimes(2); // Invalid commands do not invalidate a good observation.
  });
  it('只处理来自 window.parent 的合法消息；dispose 后不再处理', () => {
    const w = fakeWindow();
    const onGoto = vi.fn(), onPick = vi.fn();
    const b = createReviewBridge({ enabled: true, win: w.win, project: project(), onGoto, onPick })!;
    const goto = { type: 'joplo:goto', protocol: 1, scenario: 'f.b.solo', step: 1, highlight: 'go' };
    w.send(goto, {}); // 其他窗口
    w.send(goto, null);
    w.send(goto, w.raw); // 自己
    w.send({ ...goto, protocol: 2 });
    expect(onGoto).not.toHaveBeenCalled();
    w.send(goto);
    expect(onGoto).toHaveBeenCalledExactlyOnceWith({ scenario: 'f.b.solo', step: 1, highlight: 'go' });
    w.send({ type: 'joplo:pick', protocol: 1, active: true }, {});
    expect(onPick).not.toHaveBeenCalled();
    w.send({ type: 'joplo:pick', protocol: 1, active: true });
    expect(onPick).toHaveBeenCalledExactlyOnceWith(true);
    b.dispose();
    expect(w.listeners.size).toBe(0);
    w.send(goto);
    expect(onGoto).toHaveBeenCalledOnce();
    // dispose 之后不再发消息
    b.position({ scenario: 'f.a.main', step: 2, stepId: 'f.a.main#2', layer: null });
    expect(w.parent.postMessage).not.toHaveBeenCalled();
  });
  it('处理函数抛错不影响后续消息', () => {
    const w = fakeWindow();
    const onGoto = vi.fn(() => { throw new Error('boom'); });
    createReviewBridge({ enabled: true, win: w.win, project: project(), onGoto, onPick: vi.fn() });
    const goto = { type: 'joplo:goto', protocol: 1, scenario: 'f.a.main', step: 0, highlight: null };
    expect(() => w.send(goto)).not.toThrow();
    w.send(goto);
    expect(onGoto).toHaveBeenCalledTimes(2);
  });
});

describe('可选元素', () => {
  type El = { dataset: Record<string, string>; parentElement: El | null };
  const el = (jid: string | null, parent: El | null, jtype = 'Button'): El => ({ dataset: jid === null ? {} : { jid, jtype }, parentElement: parent });
  const root = el(null, null);
  const inside = (_r: El, x: El | null) => { for (let p = x; p; p = p.parentElement) if (p === root) return true; return false; };
  it('从命中元素向上找最近的作者 id；生成 id、文本节点、舞台外不算', () => {
    const card = el('card', root, 'Card');
    const gen = el('_card_0', card, 'Group');
    const text = el('_t', gen, '#text');
    expect(authorElement(text as never, root as never, inside as never)).toBe(card);
    const btn = el('go', gen);
    expect(authorElement(btn as never, root as never, inside as never)).toBe(btn);
    const textNamed = el('label', card, '#text');
    expect(authorElement(textNamed as never, root as never, inside as never)).toBe(card);
    const outside = el('go', el(null, null));
    expect(authorElement(outside as never, root as never, inside as never)).toBeNull();
    expect(authorElement(el('_x', root) as never, root as never, inside as never)).toBeNull();
    expect(authorElement(null, root as never, inside as never)).toBeNull();
  });
  it('label 用 IR 节点的 nodeLabel；不在这个画面里时退回组件类型', () => {
    const p = project();
    const scene = p.scenarios['f.a.main']!.initial.sceneId;
    expect(elementLabel(p, scene, 'go', 'Button')).toBe('Go');
    expect(elementLabel(p, 'f.a~app', 'more', 'Button')).toBe('More');
    expect(elementLabel(p, scene, 'nope', 'Card')).toBe('Card');
    expect(elementLabel(p, 'missing-scene', 'go', null)).toBe('go');
  });
});

describe('画面', () => {
  it('review=1 的首帧与普通嵌入相同（封面），没有选择提示条', () => {
    vi.stubGlobal('location', { hash: '', search: '', href: 'https://joplo.app/s/Abc1234567/?embed=1&review=1' });
    try {
      const html = renderToStaticMarkup(<I18nProvider explicit="en"><SiteApp data={{ project: project(), home: null }} search="?embed=1&review=1" /></I18nProvider>);
      expect(html).toContain('data-testid="embed-cover"');
      expect(html).not.toContain('data-testid="review-pick-hint"');
      expect(html).not.toContain('data-review-highlight');
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe('源码守卫', () => {
  it('发布站里只有 review-bridge.ts 发 postMessage 或监听 message', () => {
    const dir = resolve(import.meta.dirname, '../src/site');
    for (const f of readdirSync(dir)) {
      if (f === 'review-bridge.ts') continue;
      const code = readFileSync(resolve(dir, f), 'utf8');
      expect(code, f).not.toMatch(/postMessage|['"]message['"]/);
    }
  });
});

describe('评审模式的边界', () => {
  it('pick-result 的 label 与清单同样最多 200 个码点；新标签页地址去掉 review 参数', () => {
    expect([...elementLabel({ scenes: {} } as unknown as Project, null, 'x', '名'.repeat(300))].length).toBe(200);
    expect(elementLabel({ scenes: {} } as unknown as Project, null, 'x', '名'.repeat(300)).endsWith('…')).toBe(true);
    const url = new URL(standaloneUrl('https://joplo.app/s/Abc1234567/?embed=1&review=1&scenario=a&x=1', null));
    expect(url.searchParams.has('review')).toBe(false);
    expect(url.searchParams.get('x')).toBe('1');
  });
});
