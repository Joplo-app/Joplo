/**
 * 焦点提示的呈现（D70）：几何纯函数、呈现层不拦截点击（不变量 3）、redact、hold 计入停留与封面时长。
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { SCHEMA_VERSION, holdMsOf, type PlayState, type Project, type Scenario } from '@joplo-app/core';
import { Stage } from '../src/renderer/Stage';
import { badgeCenter, placeCallout, spotlightHoles, spotlightPath, visibleRegion } from '../src/renderer/cue-math';
import { scenarioMs } from '../src/player/cover-content';

const region = { x: 0, y: 0, w: 1000, h: 600 };

describe('cue-math', () => {
  it('visibleRegion：镜头变换反算可见的内容范围', () => {
    expect(visibleRegion(1000, 600, null)).toEqual({ x: 0, y: 0, w: 1000, h: 600 });
    expect(visibleRegion(1000, 600, { k: 2, tx: -200, ty: -100 })).toEqual({ x: 100, y: 50, w: 500, h: 300 });
    expect(visibleRegion(1000, 600, { k: 0, tx: 0, ty: 0 })).toEqual({ x: 0, y: 0, w: 1000, h: 600 });
  });
  it('聚光的洞：外扩 pad，重叠的合并；没有洞时不压暗整屏', () => {
    expect(spotlightPath([], 8)).toBeNull();
    expect(spotlightHoles([{ x: 10, y: 10, w: 0, h: 5 }], 8)).toEqual([]);
    const holes = spotlightHoles([{ x: 100, y: 100, w: 50, h: 20 }, { x: 140, y: 110, w: 50, h: 20 }, { x: 600, y: 300, w: 10, h: 10 }], 8);
    expect(holes).toEqual([{ x: 92, y: 92, w: 106, h: 46 }, { x: 592, y: 292, w: 26, h: 26 }]);
    const d = spotlightPath(holes, 10)!;
    expect(d.match(/M/g)!.length).toBe(3); // 外框 + 两个洞
  });
  it('气泡：默认右侧；靠右边放不下时换左侧；写了 side 就用它；避开已放好的气泡；夹进可见范围', () => {
    const size = { w: 200, h: 40 };
    const opts = { gap: 16, margin: 8 };
    expect(placeCallout({ x: 100, y: 100, w: 80, h: 30 }, size, region, opts)).toMatchObject({ side: 'right', box: { x: 196, y: 95, w: 200, h: 40 } });
    expect(placeCallout({ x: 900, y: 100, w: 80, h: 30 }, size, region, opts).side).toBe('left');
    expect(placeCallout({ x: 100, y: 100, w: 80, h: 30 }, size, region, { ...opts, side: 'bottom' })).toMatchObject({ side: 'bottom', box: { y: 146 } });
    const first = placeCallout({ x: 400, y: 100, w: 80, h: 30 }, size, region, opts);
    const second = placeCallout({ x: 400, y: 100, w: 80, h: 30 }, size, region, { ...opts, placed: [first.box] });
    expect(second.side).not.toBe(first.side);
    // 太靠上：放到上面会出界，被夹回可见范围
    const top = placeCallout({ x: 400, y: 4, w: 80, h: 10 }, size, region, { ...opts, side: 'top' });
    expect(top.box.y).toBeGreaterThanOrEqual(8);
    // 引线两端分别落在气泡边与目标边上
    const p = placeCallout({ x: 100, y: 100, w: 80, h: 30 }, size, region, opts);
    expect(p.from.x).toBe(p.box.x);
    expect(p.to.x).toBe(180);
  });
  it('编号角标：放在目标左上角，夹进可见范围', () => {
    expect(badgeCenter({ x: 100, y: 100, w: 50, h: 50 }, 24, region)).toEqual({ x: 100, y: 100 });
    expect(badgeCenter({ x: 0, y: 0, w: 50, h: 50 }, 24, region)).toEqual({ x: 14, y: 14 });
  });
});

describe('呈现层不拦截点击（不变量 3）', () => {
  it('Cues.tsx 里所有层都是 pointer-events-none，没有任何地方恢复 auto', () => {
    const src = readFileSync(new URL('../src/renderer/Cues.tsx', import.meta.url), 'utf8');
    expect(src).not.toMatch(/pointer-events-auto|pointerEvents:\s*['"]auto/);
    expect(src.match(/className="pointer-events-none/g)!.length).toBeGreaterThanOrEqual(3);
  });
  const scene = {
    id: 'sc', optionId: null, route: '/', name: 'x', viewport: 'desktop',
    root: { id: 'root', type: 'Stack', children: [{ id: 'key', type: 'Code', redact: { falsy: 'ui.revealed' }, children: [{ id: '_t', type: '#text', props: { text: 'sk-live' } }] }, { id: 'go', type: 'Button', children: [{ id: '_g', type: '#text', props: { text: 'Go' } }] }] },
  };
  const sc = { id: 's', optionId: 'o', name: 's', description: '', caseIds: [], mock: { label: 'ok', outcome: 'success' }, initial: { sceneId: 'sc', ui: {}, data: {}, inputs: {} }, expected: '',
    steps: [{ id: 's#1', kind: 'system', action: { type: 'event', name: 'e' }, caption: 'e', effects: [], ruleIds: [], shots: [], directorLayer: null, traces: [], forks: [], marks: [], cues: [{ kind: 'spotlight', targets: ['key'] }], callouts: [{ target: 'go', text: '点这里' }], hold: 5000 }] };
  const project = { schemaVersion: SCHEMA_VERSION, name: 'p', description: '', theme: 'sketch', themes: {}, mode: 'publish', routes: {}, features: {}, cases: {}, options: {}, rules: {}, scenes: { sc: scene }, scenarios: { s: sc }, issues: {} } as unknown as Project;
  const state = (position: number, revealed = false): PlayState => ({ scenarioId: 's', position, sceneId: 'sc', ui: { revealed }, data: {}, inputs: {}, toasts: [], completed: null, sceneStack: [] });
  it('舞台：提示层存在且不接收指针；redact 按条件给元素加 data-jredact', () => {
    const html = renderToStaticMarkup(createElement(Stage, { project, state: state(1), theme: 'sketch', mode: 'demo', animate: false, viewportOverride: { width: 400, height: 300 } }));
    expect(html).toMatch(/<div class="pointer-events-none absolute inset-0" data-jlayer="cues"/);
    expect(html).toMatch(/data-jid="key"[^>]*data-jredact=""/);
    const shown = renderToStaticMarkup(createElement(Stage, { project, state: state(1, true), theme: 'sketch', mode: 'demo', animate: false, viewportOverride: { width: 400, height: 300 } }));
    expect(shown).not.toContain('data-jredact');
  });
  it('旧的发布产物（没有焦点字段）照常渲染', () => {
    const old = structuredClone(project) as unknown as { scenarios: { s: { steps: Record<string, unknown>[] } } };
    for (const st of old.scenarios.s.steps) { delete st.cues; delete st.callouts; delete st.hold; }
    expect(() => renderToStaticMarkup(createElement(Stage, { project: old as unknown as Project, state: state(1), theme: 'sketch', mode: 'demo', animate: false, viewportOverride: { width: 400, height: 300 } }))).not.toThrow();
  });
  it('hold：自动播放的最短停留按速度缩放；封面时长计入 hold', () => {
    expect(holdMsOf({ hold: 5000 })).toBe(5000);
    expect(holdMsOf({ hold: 5000 }, 1.5)).toBe(3333);
    expect(holdMsOf({}, 1)).toBe(0);
    expect(holdMsOf(undefined)).toBe(0);
    const s = project.scenarios.s as Scenario;
    expect(scenarioMs(project, s)).toBeGreaterThanOrEqual(5000);
    expect(scenarioMs(project, { ...s, steps: s.steps.map((st) => ({ ...st, hold: undefined })) })).toBeLessThan(5000);
  });
});
