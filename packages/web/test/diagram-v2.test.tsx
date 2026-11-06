/**
 * D67 关系类图表在网页端的不变量：
 * 1. 同一张图在同一场景的所有步骤里，每个节点的坐标完全相同（A→B 变成 A→C、节点出现、trace 变化、多节点镜头都不移动节点）；
 * 2. 发布站不跑布局：坐标来自 IR（编译期 ELK），渲染器里没有布局算法。
 * 镜头取景（父分组标题在画面内）见 camera-frame.test.ts。
 */
import { existsSync, readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { stateAt, type Project } from '@joplo-app/core';
import { machineProject, project } from './diagram-fixture';
import { cameraFor } from '../src/player/cameraFor';
import { edgePath, effectiveState, machineStates } from '../src/renderer/diagram-layout';
import { Stage } from '../src/renderer/Stage';
import { I18nProvider } from '../src/i18n/context';

/** 与 renderStep 静态截图相同：导演层的画面 + 这一步的镜头。 */
const render = (p: Project, pos: number) => {
  const plan = cameraFor(p, 'f.a.s', pos, null);
  return renderToStaticMarkup(createElement(I18nProvider, { explicit: 'zh-CN', children: createElement(Stage, { project: p, state: stateAt(p, 'f.a.s', pos), theme: 'sketch', mode: 'render', animate: false, sceneId: plan.sceneId, camera: plan.spec }) }));
};

/** 每个节点渲染出来的位置（left / top / width / height）。 */
function nodeBoxes(html: string): Record<string, string> {
  const out: Record<string, string> = {};
  const re = /<div[^>]*data-jid="([^"]+)"[^>]*data-jtype="Diagram\.Node"[^>]*>/g;
  for (const m of html.matchAll(re)) {
    const style = /style="([^"]*)"/.exec(m[0])?.[1] ?? '';
    const pick = (k: string) => new RegExp(`(?:^|;)${k}:([^;]+)`).exec(style)?.[1] ?? '?';
    out[m[1]!] = ['left', 'top', 'width', 'height'].map(pick).join(',');
  }
  return out;
}

describe('D67 不变量 1：节点在一个场景的所有步骤里位置不变', () => {
  it('A→B、A→C、节点出现、多节点镜头、连到分组：每个节点每一步的位置都相同', () => {
    const p = project();
    const steps = p.scenarios['f.a.s']!.steps.length;
    const base = nodeBoxes(render(p, 1));
    expect(Object.keys(base).sort()).toEqual(['a', 'b', 'c']);
    for (let pos = 0; pos <= steps; pos++) {
      const boxes = nodeBoxes(render(p, pos));
      for (const [id, b] of Object.entries(boxes)) expect(b, `step ${pos} node ${id}`).toBe(base[id] ?? boxes[id]);
      if (pos >= 3) expect(boxes.d).toBeDefined();
    }
    // D 出现之后与之前，其他节点不动；D 自己的位置每一步也相同
    const d3 = nodeBoxes(render(p, 3)).d;
    for (let pos = 3; pos <= steps; pos++) expect(nodeBoxes(render(p, pos)).d).toBe(d3);
  });

  it('坐标来自 IR：渲染出的节点盒子就是编译期布局里的盒子', () => {
    const p = project();
    const arch = Object.values(p.scenes).flatMap((s) => (s.root.type === 'Diagram' ? [s.root] : [])).find((n) => n.id === 'arch')!;
    expect(arch.layout?.kind).toBe('graph');
    const l = arch.layout as Extract<NonNullable<typeof arch.layout>, { kind: 'graph' }>;
    expect(l.engine).toBe('elk');
    const boxes = nodeBoxes(render(p, 2));
    // 节点在分组里：位置相对分组框
    const g = l.groups.g_run!;
    const b = l.nodes.b!;
    expect(boxes.b).toBe(`${b.x - g.x}px,${b.y - g.y}px,${b.w}px,${b.h}px`);
  });
});

describe('当前调用一眼可见（D67 补充）', () => {
  /** 连线 g 上的 data-emph / data-quiet。 */
  const edgeMark = (html: string, id: string) => {
    const m = new RegExp(`<g[^>]*data-jid="${id.replace(/[>]/g, '\\$&')}"[^>]*>`).exec(html)?.[0] ?? '';
    return m.includes('data-emph') ? 'emph' : m.includes('data-quiet') ? 'quiet' : 'plain';
  };
  it('本步 trace 的连线突出（加粗、着色、不调暗），连着同一个节点的其他连线变细变浅；只有 shot 的步骤突出焦点节点之间的连线', () => {
    const p = project();
    const s1 = render(p, 1); // trace('a', 'b')
    expect(edgeMark(s1, 'ab')).toBe('emph');
    expect(edgeMark(s1, 'ac')).toBe('quiet');
    expect(edgeMark(s1, 'b_data')).toBe('quiet');
    expect(s1).toMatch(/data-jid="ab"[^>]*data-state="active"/);
    const s2 = render(p, 2); // trace('a', 'c')：上一步的 ab 变为完成但不再突出
    expect(edgeMark(s2, 'ac')).toBe('emph');
    expect(edgeMark(s2, 'ab')).toBe('quiet');
    const s4 = render(p, 4); // shot('a', 'b', 'c', 'd')：焦点节点之间的连线突出，连到分组的不突出
    expect(edgeMark(s4, 'ab')).toBe('emph');
    expect(edgeMark(s4, 'cd')).toBe('emph');
    expect(edgeMark(s4, 'b_data')).toBe('quiet');
  });
});

describe('状态机：value 绑定的当前状态与本步走过的转换（D67）', () => {
  const stateOf = (html: string, id: string) => new RegExp(`data-jid="${id}"[^>]*data-state="([a-z]+)"`).exec(html)?.[1] ?? new RegExp(`data-state="([a-z]+)"[^>]*data-jid="${id}"`).exec(html)?.[1];
  const renderM = (p: Project, pos: number) => {
    const plan = cameraFor(p, 'f.a.s', pos, null);
    return renderToStaticMarkup(createElement(I18nProvider, { explicit: 'zh-CN', children: createElement(Stage, { project: p, state: stateAt(p, 'f.a.s', pos), theme: 'sketch', mode: 'render', animate: false, sceneId: plan.sceneId, camera: plan.spec }) }));
  };
  it('支付那一步：已支付是当前状态（data-current），支付这条转换点亮；下一步值不变时转换不再点亮；发货时发货点亮', () => {
    const p = machineProject();
    const s1 = renderM(p, 1);
    expect(s1).toMatch(/data-jid="paid"[^>]*data-current=""/);
    expect(stateOf(s1, 't_pay')).toBe('active');
    expect(stateOf(s1, 't_ship')).toBe('idle');
    const s2 = renderM(p, 2);
    expect(s2).toMatch(/data-jid="paid"[^>]*data-current=""/);
    expect(stateOf(s2, 't_pay')).toBe('idle');
    const s3 = renderM(p, 3);
    expect(stateOf(s3, 't_ship')).toBe('active');
    expect(s3).toMatch(/data-jid="shipped"[^>]*data-current=""/);
    // 起点圆点：只画一次，指向初始状态
    expect((s3.match(/data-jstart=""/g) ?? []).length).toBe(1);
  });
});

describe('渲染辅助（由 diagram-route.test.ts 移来）', () => {
  it('edgePath：直线段 + 小圆角，转角半径不超过 8px，也不超过相邻段长的一半', () => {
    const d = edgePath([{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 6 }, { x: 200, y: 6 }]);
    expect(d).toMatch(/^M0,0 L97,0 Q100,0 100,3 L100,3 Q100,6 103,6 L200,6$/);
    expect(edgePath([{ x: 0, y: 0 }, { x: 10, y: 0 }])).toBe('M0,0 L10,0');
  });

  it('effectiveState（D48）：显式字面量或绑定解析出的值优先；没写时用推算值；都没有是 idle；非法值按 idle', () => {
    const traced = { biz: { state: 'active' as const }, e1: { state: 'active' as const, reverse: true } };
    expect(effectiveState('ok', traced, 'biz')).toEqual({ state: 'ok', reverse: false });
    expect(effectiveState(undefined, traced, 'biz')).toEqual({ state: 'active', reverse: false });
    expect(effectiveState(null, traced, 'e1')).toEqual({ state: 'active', reverse: true });
    expect(effectiveState(undefined, traced, 'llm')).toEqual({ state: 'idle', reverse: false });
    expect(effectiveState('weird', traced, 'biz')).toEqual({ state: 'idle', reverse: false });
    expect(effectiveState('idle', traced, 'biz')).toEqual({ state: 'idle', reverse: false });
  });

  it('machineStates（D67）：value 是当前状态；这一步从 prev 变过来且有对应转换时，这条转换 active；没有转换或值不是状态时不点亮', () => {
    const s = { root: 'StateMachine', direction: 'right', groups: [], nodes: ['a', 'b', 'c'].map((id, i) => ({ id, seq: i, label: id, description: '', kind: 'state', parent: null, w: 90, h: 40 })), edges: [{ id: 'a->b', from: 'a', to: 'b', label: '', lw: 0, lh: 0 }] } as const;
    expect(machineStates(s as never, 'b', 'a')).toEqual({ current: 'b', states: { b: { state: 'active' }, 'a->b': { state: 'active' } } });
    expect(machineStates(s as never, 'c', 'a')).toEqual({ current: 'c', states: { c: { state: 'active' } } });
    expect(machineStates(s as never, 'b', undefined)).toEqual({ current: 'b', states: { b: { state: 'active' } } });
    expect(machineStates(s as never, 'zzz', 'a')).toEqual({ current: null, states: {} });
  });

  it('网页包里没有布局算法：不再依赖 dagre，diagram-route.ts 已删除', async () => {
    const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
    expect({ ...pkg.dependencies, ...pkg.devDependencies }['@dagrejs/dagre']).toBeUndefined();
    expect(existsSync(new URL('../src/renderer/diagram-route.ts', import.meta.url))).toBe(false);
  });
});
