import { fixtureConfig as config } from '../../../scripts/test/fixtures.ts';
/**
 * 讲解片原语：<Canvas> 的 camera()、flow({ from, layer })、patch()、旁白计入时长估算。
 * 不变量：
 * 1. camera() 只是状态（ui.__plugins.content.camera），跨步保留；回放、跳到任意一步结果相同；导演切到目标所在的层。
 * 2. from 接力的场景，初始状态 = 被接场景最后一步之后的状态（路径、ui / data / inputs、导演层），再叠上本场景的 state；链式接力按依赖解析，成环报错。
 * 3. patch() 等价于逐个 set()；步骤参数可以直接传效果数组。
 * 4. 带旁白的步骤，估算时长按朗读计；没有旁白的项目估算不变。
 */
import { describe, expect, it } from 'vitest';
import * as ui from '@joplo-app/plugin-ui';
import { Canvas, camera, cameraSequence } from '../src/plugin.ts';
import { $, feature, flow, go, layer, narrate, work, page, patch, set, spotlight, type Flow } from '@joplo-app/kit';
import { jsx } from '@joplo-app/kit/jsx-runtime';
import { cameraAt, compile, scenarioEstimateMs, stateAt, voiceMs, type AuthoringProject } from '@joplo-app/core';

const h = (type: unknown, props: Record<string, unknown> | null, ...children: unknown[]) => jsx(type, { ...(props ?? {}), ...(children.length ? { children } : {}) });
const F = (file: string) => ({ file: `/p/${file}`, source: `/p/${file}:1:1` });

const world = () => h(Canvas, { w: 2560, h: 1600 },
  h('div', { id: 'chat', style: { position: 'absolute', left: 60, top: 60, width: 1180, height: 700 } }, h(ui.Button, { id: 'send' }, 'Send')),
  h('div', { id: 'tape', style: { position: 'absolute', left: 120, top: 960 } },
    h('span', { motion: 'tok_0', when: $.ui.onTape }, '4912')),
  h('div', { screen: true, style: { position: 'absolute', left: 20, top: 16 } }, $.ui.chapter));
const other = () => h(ui.Text, { id: 'other' }, 'other layer');

function build(scenarios: Record<string, Flow>) {
  const home = page({ title: 'Home', layout: false }, h(ui.Text, { id: 'home' }, 'home'));
  const opt = work({
    title: 'A', summary: 'i',
    state: { ui: { onTape: false, chapter: '', n: 0 } },
    layers: { poster: layer('Poster', other()), world: layer('World', world()) },
    scenarios,
  });
  const src: AuthoringProject = {
    root: '/p',
    config: { ...config({ name: 'T', home: '/' }), ...F('joplo.config.ts') },
    layouts: {},
    routes: { '/': { ...home, ...F('routes/page.tsx') } },
    features: { f: { def: { ...feature({ name: 'F', goal: 'g', cases: {}, pick: 'a' }), ...F('features/f/feature.ts') }, works: { a: { ...opt, ...F('features/f/works/a.tsx') } } } },
  };
  return compile(src, 'dev');
}
const errorCodes = (r: ReturnType<typeof build>) => r.diagnostics.filter((d) => d.severity === 'error').map((d) => d.code);

describe('camera()', () => {
  it('records the frame as state, keeps it across steps, and moves the director to the target layer', () => {
    const r = build({
      one: flow('One', { start: '/' })
        .system('Zoom', camera('chat', { pad: 80 }))
        .system('Next', set($.ui.n, 1))
        .system('Whole', camera()),
    });
    expect(errorCodes(r)).toEqual([]);
    const p = r.project!;
    const sc = p.scenarios['f.a.one']!;
    expect(sc.steps[0]!.directorLayer).toBe('world');
    expect(stateAt(p, sc.id, 1).ui.__plugins).toEqual({ content: { camera: { targets: ['chat'], pad: 80 } } });
    expect(stateAt(p, sc.id, 2).ui.__plugins).toEqual({ content: { camera: { targets: ['chat'], pad: 80 } } });
    expect(stateAt(p, sc.id, 3).ui.__plugins).toEqual({ content: { camera: { targets: [] } } });
    expect(cameraAt(p, sc.id, 2).directorLayer).toBe('world');
  });
  it('rejects unknown targets and invalid works', () => {
    expect(errorCodes(build({ one: flow('One', { start: '/' }).system('Zoom', camera('nope')) }))).toContain('CAMERA_UNKNOWN');
    expect(errorCodes(build({ one: flow('One', { start: '/' }).system('Zoom', camera('chat', { zoom: 0 })) }))).toContain('CAMERA_INVALID');
  });
});

describe('flow({ from, layer })', () => {
  it('starts from the end state of another scenario, then applies its own state, in dependency order', () => {
    const r = build({
      // 声明顺序与依赖顺序相反：c 接 b，b 接 a
      c: flow('C', { from: 'b', state: { ui: { chapter: '03' } } }).system('Three', set($.ui.n, 3)),
      b: flow('B', { from: 'a' }).system('Two', patch($.ui, { n: 2, onTape: true }), camera('tape')),
      a: flow('A', { start: '/' }).system('One', set($.ui.n, 1), camera('chat')),
    });
    expect(errorCodes(r)).toEqual([]);
    const p = r.project!;
    expect(p.scenarios['f.a.b']!.initial.ui).toMatchObject({ n: 1, __plugins: { content: { camera: { targets: ['chat'] } } } });
    expect(p.scenarios['f.a.b']!.initial.layer).toBe('world');
    expect(p.scenarios['f.a.c']!.initial.ui).toMatchObject({ n: 2, onTape: true, chapter: '03', __plugins: { content: { camera: { targets: ['tape'] } } } });
    expect(cameraAt(p, 'f.a.c', 0).directorLayer).toBe('world');
  });
  it('reports unknown targets and cycles', () => {
    expect(errorCodes(build({ a: flow('A', { from: 'zzz' }).system('x', set($.ui.n, 1)) }))).toContain('FROM_UNKNOWN');
    expect(errorCodes(build({ a: flow('A', { from: 'a' }).system('x', set($.ui.n, 1)) }))).toContain('FROM_UNKNOWN');
    expect(errorCodes(build({
      a: flow('A', { from: 'b' }).system('x', set($.ui.n, 1)),
      b: flow('B', { from: 'a' }).system('y', set($.ui.n, 2)),
    }))).toContain('FROM_CYCLE');
  });
  it('reports a predecessor whose steps cannot replay', () => {
    expect(errorCodes(build({
      a: flow('A', { start: '/' }).click('not_here'),
      b: flow('B', { from: 'a' }).system('Continue', set($.ui.n, 1)),
    }))).toContain('FROM_FAILED');
  });
  it('layer sets the starting director layer and is validated', () => {
    const r = build({ a: flow('A', { start: '/', layer: 'world' }).system('x', set($.ui.n, 1)) });
    expect(errorCodes(r)).toEqual([]);
    expect(cameraAt(r.project!, 'f.a.a', 0).directorLayer).toBe('world');
    expect(errorCodes(build({ a: flow('A', { start: '/', layer: 'nope' }).system('x', set($.ui.n, 1)) }))).toContain('LAYER_UNKNOWN');
  });
});

describe('patch()', () => {
  it('equals one set() per key, and step arguments accept effect arrays', () => {
    expect(patch($.ui, { a: 1, b: 'x' })).toEqual([set($.ui.a, 1), set($.ui.b, 'x')]);
    const r = build({ a: flow('A', { start: '/' }).system('Both', patch($.ui, { n: 5, chapter: '01' })) });
    expect(errorCodes(r)).toEqual([]);
    expect(stateAt(r.project!, 'f.a.a', 1).ui).toMatchObject({ n: 5, chapter: '01' });
  });
});

describe('narration in time estimates', () => {
  it('voiceMs reads about 4.5 CJK characters per second plus a breath; empty is 0', () => {
    expect(voiceMs('')).toBe(0);
    expect(voiceMs(undefined)).toBe(0);
    expect(voiceMs('一二三四五六七八九十')).toBe(10 * 220 + 450);
    expect(voiceMs('一二三，四五六。')).toBe(6 * 220 + 450);
  });
  it('a narrated step counts at least its narration; unnarrated estimates stay the same', () => {
    const long = '这是一段很长的旁白，用来测试估算会不会按朗读时间计算，而不是只按字幕的阅读时间计算，所以要写得足够长才行。';
    const r = build({
      quiet: flow('Q', { start: '/' }).system('Caption only', set($.ui.n, 1)),
      loud: flow('L', { start: '/' }).system('Caption only', set($.ui.n, 1), narrate(long)),
    });
    const p = r.project!;
    const quiet = scenarioEstimateMs(p, p.scenarios['f.a.quiet']!);
    const loud = scenarioEstimateMs(p, p.scenarios['f.a.loud']!);
    expect(quiet).toBeLessThan(voiceMs(long));
    expect(loud).toBeGreaterThanOrEqual(voiceMs(long));
  });
});

/** 没有 layers 的方案：两个路径页面，/ 上有 atext，/b 上有按钮 bbtn（文字 Open）和 btext。 */
function buildPages(scenarios: Record<string, Flow>) {
  const home = page({ title: 'Home', layout: false }, h(ui.Stack, null, h(ui.Text, { id: 'atext' }, 'on home')));
  const b = page({ title: 'B', layout: false }, h(ui.Stack, null, h(ui.Button, { id: 'bbtn' }, 'Open'), h(ui.Text, { id: 'btext' }, 'on b')));
  const opt = work({ title: 'A', summary: 'i', state: { ui: { n: 0 } }, scenarios });
  const src: AuthoringProject = {
    root: '/p',
    config: { ...config({ name: 'T', home: '/' }), ...F('joplo.config.ts') },
    layouts: {},
    routes: { '/': { ...home, ...F('routes/page.tsx') }, '/b': { ...b, ...F('routes/b/page.tsx') } },
    features: { f: { def: { ...feature({ name: 'F', goal: 'g', cases: {}, pick: 'a' }), ...F('features/f/feature.ts') }, works: { a: { ...opt, ...F('features/f/works/a.tsx') } } } },
  };
  return compile(src, 'dev');
}

describe('flow({ from }) checks each step against where the previous scenario ended', () => {
  it('validates cues and builds auto captions on the page the previous scenario ended on', () => {
    const r = buildPages({
      a: flow('A', { start: '/' }).system('to b', go('/b')),
      b: flow('B', { from: 'a' }).click('bbtn').system('look', spotlight('btext')),
    });
    expect(errorCodes(r)).toEqual([]);
    const b = r.project!.scenarios['f.a.b']!;
    expect(b.steps[0]!.caption).toContain('Open');
    expect(b.initial.sceneId).toBe(stateAt(r.project!, 'f.a.a', 1).sceneId);
  });
  it('reports a cue whose target is only on the default start page, not where the previous scenario ended', () => {
    const r = buildPages({
      a: flow('A', { start: '/' }).system('to b', go('/b')),
      b: flow('B', { from: 'a' }).system('look', spotlight('atext')),
    });
    expect(errorCodes(r)).toContain('FOCUS_UNKNOWN');
  });
  it('resolves chains declared in any order', () => {
    const r = buildPages({
      c: flow('C', { from: 'b' }).system('look', spotlight('btext')),
      b: flow('B', { from: 'a' }).system('stay', set($.ui.n, 2)),
      a: flow('A', { start: '/' }).system('to b', go('/b')),
    });
    expect(errorCodes(r)).toEqual([]);
    // 编译按依赖顺序，IR 仍按作者声明的顺序（发布站按它当章节播放）
    expect(Object.keys(r.project!.scenarios)).toEqual(['f.a.c', 'f.a.b', 'f.a.a']);
  });
  it('does not silently ignore start when from is also written', () => {
    const r = buildPages({
      a: flow('A', { start: '/' }).system('to b', go('/b')),
      b: flow('B', { from: 'a', start: '/' }).system('stay', set($.ui.n, 2)),
    });
    expect(errorCodes(r)).toContain('FROM_WITH_START');
  });
});


describe('cameraSequence', () => {
  it('records deterministic waypoints, references and minimum clock duration', () => {
    const r = build({ one: flow('One', { start: '/' }).system('Travel', cameraSequence([
      { atMs: 0, target: 'chat', zoom: 1 }, { atMs: 2500, target: 'tape', zoom: 1.15, ease: 'easeInOut' }, { atMs: 6500, target: 'tape', zoom: 1.22, ease: 'easeOut' },
    ])) });
    expect(errorCodes(r)).toEqual([]);
    const step = r.project!.scenarios['f.a.one']!.steps[0]!;
    expect(step.ext?.content).toMatchObject({ scenes: { 'f.a~world': { camera: { sequence: [{ atMs: 0 }, { atMs: 2500 }, { atMs: 6500 }] } } } });
    expect(JSON.stringify(stateAt(r.project!, 'f.a.one', 1))).toContain('6500');
  });
  it.each([[1, 5000], [0, 0], [0, -1]])('rejects nonzero start or non-increasing times %s', (a, b) => {
    const r = build({ one: flow('One', { start: '/' }).system('Bad', cameraSequence([{ atMs: a, target: 'chat' }, { atMs: b, target: 'tape' }])) });
    expect(errorCodes(r)).toContain('CAMERA_INVALID');
  });
});
