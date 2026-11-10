import { fixtureConfig as config } from '../../../scripts/test/fixtures.ts';
/**
 * 进退场的表现力原语（D107）：缓动预设、错峰、grow / blur 预设与逐块进场的 <Split>。
 * 全部仍是 WAAPI 动画，由舞台按引擎时间采样；这里测编译期契约与纯函数。
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Canvas, Split, EASES } from '../src/plugin.ts';
import { AWAY, easeOf, lookKey, springAt, springEasing, splitPieces, staggered } from '../src/runtime.tsx';
import { $, feature, flow, work, page, type Flow } from '@joplo-app/kit';
import { jsx } from '@joplo-app/kit/jsx-runtime';
import { compile, type AuthoringProject } from '@joplo-app/core';

const h = (type: unknown, props: Record<string, unknown> | null, ...children: unknown[]) => jsx(type, { ...(props ?? {}), ...(children.length ? { children } : {}) });
const F = (file: string) => ({ file: `/p/${file}`, source: `/p/${file}:1:1` });
function build(tree: unknown, scenarios: Record<string, Flow> = { one: flow('One', { start: '/' }).system('Look') }) {
  const opt = work({ title: 'A', summary: 'i', state: { ui: { on: true, title: 'Hello world' } }, scenarios });
  const src: AuthoringProject = {
    root: '/p', config: { ...config({ name: 'T', home: '/' }), ...F('joplo.config.ts') }, layouts: {},
    routes: { '/': { ...page({ title: 'Home', layout: false }, tree as never), ...F('routes/page.tsx') } },
    features: { f: { def: { ...feature({ name: 'F', goal: 'g', cases: {}, pick: 'a' }), ...F('features/f/feature.ts') }, works: { a: { ...opt, ...F('features/f/works/a.tsx') } } } },
  };
  return compile(src, 'dev');
}
const errors = (r: ReturnType<typeof build>) => [...new Map(r.diagnostics.filter(d => d.severity === 'error').map(d => [d.code + d.message, d])).values()];
const canvas = (...kids: unknown[]) => h(Canvas, { w: 1280, h: 800 }, ...kids);

describe('ease and stagger properties', () => {
  it('accept the presets and bounded stagger on any element', () => {
    for (const e of EASES) expect(errors(build(canvas(h('div', { id: 'a', enter: 'rise', enterEase: e, exit: 'fade', exitEase: e, motion: 'a', motionEase: e, enterStagger: 80, exitStagger: 40 }, 'A'))))).toEqual([]);
  });
  it('reject unknown eases and out-of-range stagger', () => {
    const bad = errors(build(canvas(h('div', { id: 'a', enterEase: 'elastic' }, 'A'))));
    expect(bad.map(d => d.code)).toEqual(['PLUGIN_PROPERTY_INVALID']);
    expect(bad[0]!.message).toContain('one of smooth, snappy, spring, bounce, linear');
    expect(errors(build(canvas(h('div', { id: 'a', enterStagger: 5000 }, 'A')))).map(d => d.code)).toEqual(['PLUGIN_PROPERTY_INVALID']);
  });
});

describe('<Split>', () => {
  it('compiles with literal or bound text, and the text is display text', () => {
    const r = build(canvas(h(Split, { id: 's', text: 'It is guessing', by: 'char', enter: 'blur', enterEase: 'spring' }), h(Split, { id: 't', text: $.ui.title })));
    expect(errors(r)).toEqual([]);
    expect(r.diagnostics.filter(d => d.code === 'SPLIT_INVALID')).toEqual([]);
  });
  it('reports empty text, an unknown split and text written as children', () => {
    expect(errors(build(canvas(h(Split, { id: 's', text: ' ' })))).map(d => d.code)).toEqual(['SPLIT_INVALID']);
    expect(errors(build(canvas(h(Split, { id: 's', text: 'a', by: 'line' })))).map(d => d.code)).toEqual(['SPLIT_INVALID']);
    expect(errors(build(canvas(h(Split, { id: 's' }, 'inline text')))).map(d => d.code)).toContain('SPLIT_INVALID');
  });
  it('splits English by word with punctuation kept on the word, spaces kept as text', () => {
    expect(splitPieces('Not typing, guessing!')).toEqual([['Not'], ' ', ['typing,'], ' ', ['guessing!']]);
  });
  it('splits Chinese into words (not one block) and never starts a group with punctuation', () => {
    const g = splitPieces('它不是在写，是在猜');
    expect(g.length).toBeGreaterThan(2);
    expect(g.every(x => Array.isArray(x) && !/^[，。！]/.test(x[0]!))).toBe(true);
    expect(g.flat().join('')).toBe('它不是在写，是在猜');
  });
  it('opening quotes and brackets go with the next word', () => {
    expect(splitPieces('Say “hi” (now)')).toEqual([['Say'], ' ', ['“hi”'], ' ', ['(now)']]);
    expect(splitPieces('它读到的“字”是什么？').flat().some(w => w.endsWith('“'))).toBe(false);
  });
  it('char mode keeps each word unbroken and does not split emoji', () => {
    const g = splitPieces('Hi 👋🏽 there', 'char');
    expect(g).toEqual([['H', 'i'], ' ', ['👋🏽'], ' ', ['t', 'h', 'e', 'r', 'e']]);
  });
});

describe('easing and presets', () => {
  afterEach(() => vi.unstubAllGlobals());
  it('the spring starts at 0, overshoots, and settles at exactly 1', () => {
    expect(springAt(.5, 0)).toBe(0);
    expect(springAt(.5, 1)).toBe(1);
    const samples = Array.from({ length: 101 }, (_, i) => springAt(.5, i / 100));
    expect(Math.max(...samples)).toBeGreaterThan(1.1);
    expect(Math.abs(springAt(.5, .99) - 1)).toBeLessThan(.005);
    // bounce overshoots more than spring
    expect(Math.max(...Array.from({ length: 101 }, (_, i) => springAt(.32, i / 100)))).toBeGreaterThan(Math.max(...samples));
  });
  it('springEasing is a CSS linear() from 0 to 1', () => {
    const css = springEasing(.5, 10);
    expect(css).toMatch(/^linear\(0, .*, 1\)$/);
    expect(css.split(',').length).toBe(11);
  });
  it('easeOf keeps each animation default for smooth/none and falls back when linear() is unsupported', () => {
    expect(easeOf(undefined, 'D')).toBe('D');
    expect(easeOf('smooth', 'D')).toBe('D');
    expect(easeOf('linear', 'D')).toBe('linear');
    vi.stubGlobal('CSS', { supports: () => true });
    expect(easeOf('spring', 'D')).toMatch(/^linear\(/);
    vi.stubGlobal('CSS', { supports: () => false });
    expect(easeOf('bounce', 'D')).toMatch(/^cubic-bezier\(/);
  });
  it('grow grows from the left, growUp from the bottom, whatever the element size', () => {
    expect(AWAY.grow).toEqual({ scale: '0 1', transformOrigin: '0 50%' });
    expect(AWAY.growUp).toEqual({ scale: '1 0', transformOrigin: '50% 100%' });
    expect(AWAY.blur).toMatchObject({ opacity: 0 });
  });
  it('staggered counts per container in call order and ignores missing containers', () => {
    class El { dataset: Record<string, string> = {}; }
    vi.stubGlobal('HTMLElement', El);
    const a = new El(); a.dataset.jpContentEnterStagger = '80';
    const b = new El(); b.dataset.jpContentEnterStagger = '30';
    const ranks = new Map<Element, number>();
    const run = (host: El | null) => staggered(ranks, host as unknown as Element, 'enterStagger');
    expect([run(a), run(b), run(a), run(a), run(b), run(null)]).toEqual([0, 0, 80, 160, 30, 0]);
  });
});

describe('same-key look change', () => {
  it('lookKey ignores identity and Joplo anchors but sees style, class and text', () => {
    type N = { attrs: Map<string, string>; kids: N[]; text: string; tag: string };
    const mk = (attrs: Record<string, string>, text = '', kids: N[] = []): N => ({ attrs: new Map(Object.entries(attrs)), kids, text, tag: 'span' });
    const wrap = (n: N): Element => {
      const all = (x: N): N[] => [x, ...x.kids.flatMap(all)];
      const html = (x: N): string => `<${x.tag}${[...x.attrs].map(([k, v]) => ` ${k}="${v}"`).join('')}>${x.text}${x.kids.map(html).join('')}</${x.tag}>`;
      const el = (x: N): any => ({ getAttributeNames: () => [...x.attrs.keys()], removeAttribute: (k: string) => x.attrs.delete(k), get outerHTML() { return html(x); }, querySelectorAll: (sel: string) => sel.includes('jghost') ? [] : all(x).slice(1).map(el), cloneNode: () => { const copy = (y: N): N => ({ ...y, attrs: new Map(y.attrs), kids: y.kids.map(copy) }); return el(copy(x)); } });
      return el(n);
    };
    const a = wrap(mk({ id: 'a', 'data-jid': 'a', 'data-jat': 'x.tsx:1', 'aria-hidden': 'true', style: 'color:red', class: 'chip' }, 'Hi', [mk({ 'data-jp-content-motion': 'k' }, '!')]));
    const b = wrap(mk({ id: 'b', 'data-jid': 'b', 'data-jat': 'x.tsx:9', style: 'color:red', class: 'chip' }, 'Hi', [mk({}, '!')]));
    const c = wrap(mk({ style: 'color:blue', class: 'chip' }, 'Hi', [mk({}, '!')]));
    expect(lookKey(a)).toBe(lookKey(b));
    expect(lookKey(a)).not.toBe(lookKey(c));
  });
});
