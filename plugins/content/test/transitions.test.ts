import { fixtureConfig as config } from '../../../scripts/test/fixtures.ts';
/**
 * D92 进退场与镜头漂移的编译期契约与纯函数：
 * - enter / exit 只接受预设名，时长与延迟有边界；非法值报 PLUGIN_PROPERTY_INVALID 并列出可选值。
 * - drift：camera(…, { drift }) 与 <Canvas drift> 编译期校验（CAMERA_INVALID），数值写进 IR 的镜头快照。
 * - 镜头段：从实际位置出发、漂移在 view 中心不动、有终点且非匀速。
 */
import { describe, expect, it } from 'vitest';
import { Canvas, camera, TRANSITIONS } from '../src/plugin.ts';
import { cameraAt, canvasFrame, drifted, driftOf, bezier, safeOf, DEFAULT_DRIFT, jumpedSince, AWAY, type CameraSegment } from '../src/runtime.tsx';
import { $, feature, flow, work, page, type Flow } from '@joplo-app/kit';
import { jsx } from '@joplo-app/kit/jsx-runtime';
import { compile, type AuthoringProject } from '@joplo-app/core';

const h = (type: unknown, props: Record<string, unknown> | null, ...children: unknown[]) => jsx(type, { ...(props ?? {}), ...(children.length ? { children } : {}) });
const F = (file: string) => ({ file: `/p/${file}`, source: `/p/${file}:1:1` });
function build(tree: unknown, scenarios: Record<string, Flow> = { one: flow('One', { start: '/' }).system('Look', camera('a')) }) {
  const opt = work({ title: 'A', summary: 'i', state: { ui: { on: true } }, scenarios });
  const src: AuthoringProject = {
    root: '/p', config: { ...config({ name: 'T', home: '/' }), ...F('joplo.config.ts') }, layouts: {},
    routes: { '/': { ...page({ title: 'Home', layout: false }, tree as never), ...F('routes/page.tsx') } },
    features: { f: { def: { ...feature({ name: 'F', goal: 'g', cases: {}, pick: 'a' }), ...F('features/f/feature.ts') }, works: { a: { ...opt, ...F('features/f/works/a.tsx') } } } },
  };
  return compile(src, 'dev');
}
// 同一节点在页面与场景里各校验一次，可能出现重复的同一条诊断：按 code + message 去重
const errors = (r: ReturnType<typeof build>) => [...new Map(r.diagnostics.filter(d => d.severity === 'error').map(d => [d.code + d.message, d])).values()];
const canvas = (props: Record<string, unknown>, child: Record<string, unknown> = {}) => h(Canvas, { w: 1280, h: 800, ...props }, h('div', { id: 'a', ...child }, 'A'));

describe('enter / exit', () => {
  it('accepts every preset with bounded timing and puts them on the DOM anchor attributes', () => {
    for (const preset of TRANSITIONS) expect(errors(build(canvas({}, { enter: preset, exit: preset, enterMs: 800, enterDelay: 100, exitMs: 300, exitDelay: 0, when: $.ui.on })))).toEqual([]);
    expect(Object.keys(AWAY).sort()).toEqual([...TRANSITIONS].sort());
  });
  it('rejects unknown presets and out-of-range timing with the list of presets', () => {
    const bad = errors(build(canvas({}, { enter: 'slide' })));
    expect(bad.map(d => d.code)).toEqual(['PLUGIN_PROPERTY_INVALID']);
    expect(bad[0]!.message).toContain('one of fade, rise, zoom, shrink, wipe, iris');
    expect(errors(build(canvas({}, { exitMs: 20000 }))).map(d => d.code)).toEqual(['PLUGIN_PROPERTY_INVALID']);
    expect(errors(build(canvas({}, { exit: 3 }))).map(d => d.code)).toEqual(['PLUGIN_PROPERTY_INVALID']);
  });
});

describe('drift', () => {
  it('camera(…, { drift }) is validated and stored in the step camera snapshot (IR)', () => {
    const r = build(canvas({}), { one: flow('One', { start: '/' }).system('Look', camera('a', { drift: { zoom: 1.05, x: 20, ms: 6000 } })).system('Off', camera('a', { drift: false })) });
    expect(errors(r)).toEqual([]);
    const steps = r.project!.scenarios['f.a.one']!.steps;
    const cam = (i: number) => (steps[i]!.ext!.content as { scenes: Record<string, { camera: unknown }> }).scenes;
    expect(Object.values(cam(0))[0]).toEqual({ camera: { targets: ['a'], drift: { zoom: 1.05, x: 20, ms: 6000 } } });
    expect(Object.values(cam(1))[0]).toEqual({ camera: { targets: ['a'], drift: false } });
    for (const drift of [3, 0.2, { zoom: 1.1, ms: 10 }, { spin: 1 }, 'slow'])
      expect(errors(build(canvas({}), { one: flow('One', { start: '/' }).system('Look', camera('a', { drift } as never)) })).map(d => d.code)).toEqual(['CAMERA_INVALID']);
  });
  it('<Canvas drift> and <Canvas safe> are validated at compile time', () => {
    expect(errors(build(canvas({ drift: 1.04, safe: [86, 0, 190, 0] })))).toEqual([]);
    expect(errors(build(canvas({ safe: [86, 0, 190] }))).map(d => d.code)).toEqual(['CAMERA_INVALID']);
    expect(errors(build(canvas({ safe: [-1, 0, 0, 0] }))).map(d => d.code)).toEqual(['CAMERA_INVALID']);
    expect(errors(build(canvas({ drift: false })))).toEqual([]);
    expect(errors(build(canvas({ drift: { zoom: 9 } }))).map(d => d.code)).toEqual(['CAMERA_INVALID']);
  });
  it('camera drift overrides the Canvas default; false turns it off; nothing written means a subtle default', () => {
    expect(driftOf(undefined, undefined)).toEqual(DEFAULT_DRIFT);
    expect(driftOf(undefined, 1.05)).toEqual({ ...DEFAULT_DRIFT, zoom: 1.05 });
    expect(driftOf(false, 1.05)).toBeNull();
    expect(driftOf({ x: 30, ms: 4000 }, false)).toEqual({ zoom: 1, x: 30, y: 0, ms: 4000 });
    expect(driftOf(1, undefined)).toBeNull();
  });
});

describe('camera segments on the engine clock', () => {
  const view = { w: 1280, h: 800 };
  const a = { k: 1, tx: 0, ty: 0 }, b = { k: 2, tx: -400, ty: -300 };
  const seg: CameraSegment = { from: a, to: b, start: 1000, ms: 1000, drift: { zoom: 1.1, x: 0, y: 0, ms: 4000 } };
  it('eases from the actual start, settles exactly, then drifts non-linearly to an end point', () => {
    expect(cameraAt(seg, 1000, view)).toEqual(a);
    expect(cameraAt(seg, 2000, view)).toEqual(b);
    const q1 = cameraAt(seg, 2400, view).k, q2 = cameraAt(seg, 4000, view).k, q3 = cameraAt(seg, 5600, view).k;
    expect(q2 - b.k).toBeGreaterThan((q1 - b.k) * 3); // 先慢后快：不是匀速
    expect(q3 - q2).toBeLessThan(q2 - b.k);
    expect(cameraAt(seg, 6000, view).k).toBeCloseTo(2.2, 6);
    expect(cameraAt(seg, 60000, view).k).toBeCloseTo(2.2, 6); // 有终点
  });
  it('drift keeps the point under the view centre fixed while zooming', () => {
    const f = drifted(b, { zoom: 1.5, x: 0, y: 0, ms: 1 }, 1, view);
    const centre = (g: typeof b) => [(view.w / 2 - g.tx) / g.k, (view.h / 2 - g.ty) / g.k];
    expect(centre(f)[0]).toBeCloseTo(centre(b)[0]!, 6);
    expect(centre(f)[1]).toBeCloseTo(centre(b)[1]!, 6);
  });
  it('a new segment started mid-drift begins exactly where the camera is', () => {
    const now = cameraAt(seg, 3500, view);
    const next: CameraSegment = { from: now, to: a, start: 3500, ms: 800, drift: null };
    expect(cameraAt(next, 3500, view)).toEqual(now);
  });
  it('targeted frames land inside the safe area; drift zooms around the safe-area centre', () => {
    const safe = safeOf([80, 0, 200, 0]);
    const f = canvasFrame({ x: 100, y: 100, w: 200, h: 100 }, view, 10, safe);
    expect(f.k).toBeCloseTo(5.2, 6); // (800 − 280) / 100
    expect(100 * f.k + f.ty).toBeCloseTo(80, 6); // 目标上沿贴住安全区上沿
    expect((100 + 100) * f.k + f.ty).toBeCloseTo(600, 6);
    expect(safeOf('x')).toEqual({ top: 0, right: 0, bottom: 0, left: 0 });
    const lens = { ...view, cx: 640, cy: 340 };
    const d = drifted(f, { zoom: 1.2, x: 0, y: 0, ms: 1 }, 1, lens);
    expect((340 - d.ty) / d.k).toBeCloseTo((340 - f.ty) / f.k, 6);
  });
  it('bezier matches its end points and is monotonic for the camera curve', () => {
    const e = bezier(.65, 0, .35, 1);
    expect(e(0)).toBe(0); expect(e(1)).toBe(1); expect(e(.5)).toBeCloseTo(.5, 3);
    let prev = 0; for (let x = .05; x <= 1; x += .05) { const y = e(x); expect(y).toBeGreaterThanOrEqual(prev); prev = y; }
  });
  it('tells a resume (same step) from a jump', () => {
    const last = { resetKey: 's:1', scenarioId: 'x', position: 3, playground: false };
    expect(jumpedSince(last, { resetKey: 's:1', scenarioId: 'x', position: 4 })).toBe(false);
    expect(jumpedSince(last, { resetKey: 's:2', scenarioId: 'x', position: 3 })).toBe(false);
    expect(jumpedSince(last, { resetKey: 's:2', scenarioId: 'x', position: 1 })).toBe(true);
    expect(jumpedSince({ ...last, playground: true }, { resetKey: 's:2', scenarioId: 'x', position: 3 })).toBe(true);
    expect(jumpedSince(null, { resetKey: 's:2', scenarioId: 'x', position: 3 })).toBe(false);
  });
});
