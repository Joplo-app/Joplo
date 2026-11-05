/**
 * 架构图连线的正交走线（T-director3）：用 examples/agent-arch 编译后的真实结构（方案 A 混合、方案 B 全云端），
 * 外加 down / right 两个方向的同一结构，检查三条不变量：
 * ① 同一节点同一侧的出入口互不重合（相距 ≥ 10px）；
 * ② 不同连线的平行段（投影有重叠）之间至少 10px；
 * ③ 不同连线没有共线重叠（② 的特例：距离为 0）。
 * 另外：连线只由水平 / 竖直段组成，端点落在两端节点的边上，不穿过别的节点。
 */
import { resolve } from 'node:path';
import { tsImport } from 'tsx/esm/api';
import { beforeAll, describe, expect, it } from 'vitest';
import { compile, type SceneNode } from '@tokenroll/joplo-core';
import { loadAuthoring } from '@tokenroll/joplo-core/node';
import { FOCUS_EDGE_FONT, diagramFocus, diagramStructure, edgeEmphasized, edgePath, focusLayout, focusMembers, interpolateNodes, layoutDiagram, lerpBox, textWidth, type Box, type DLayout, type DStructure, type Point } from '../src/renderer/diagram-layout';
import { SP } from '../src/renderer/diagram-route';

const root = resolve(import.meta.dirname, '../../../examples/agent-arch');
const archOf: Record<string, SceneNode> = {};
const find = (n: SceneNode, id: string): SceneNode | undefined => (n.id === id ? n : (n.children ?? []).map((c) => find(c, id)).find(Boolean));

beforeAll(async () => {
  const r = await loadAuthoring(root, (p) => tsImport(p, { parentURL: import.meta.url, tsconfig: `${root}/tsconfig.json` }));
  expect(r.diagnostics).toEqual([]);
  const c = compile(r.authoring!, 'dev');
  expect(c.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
  const p = c.project!;
  for (const opt of ['agent.a-hybrid', 'agent.b-cloud']) {
    const scene = p.scenes[p.options[opt]!.layers.backend!.sceneId]!;
    archOf[opt] = find(scene.root, 'arch')!;
    expect(archOf[opt]?.type).toBe('Diagram');
  }
}, 60_000);

type Seg = { edge: string; a: Point; b: Point; dir: 'h' | 'v' };
function segmentsOf(l: DLayout): Seg[] {
  const out: Seg[] = [];
  for (const [edge, { points }] of Object.entries(l.edges))
    for (let i = 0; i < points.length - 1; i++) {
      const a = points[i]!;
      const b = points[i + 1]!;
      const dir = Math.abs(a.y - b.y) < 0.05 ? 'h' : Math.abs(a.x - b.x) < 0.05 ? 'v' : null;
      expect(dir, `${edge} 第 ${i} 段不是水平或竖直`).not.toBeNull();
      out.push({ edge, a, b, dir: dir! });
    }
  return out;
}

/** 端点在节点哪一侧（以及沿这一侧的坐标）。 */
function sideOf(p: Point, b: Box): { side: string; t: number } | null {
  const e = 1.5;
  if (Math.abs(p.x - b.x) < e && p.y >= b.y - e && p.y <= b.y + b.h + e) return { side: 'L', t: p.y };
  if (Math.abs(p.x - (b.x + b.w)) < e && p.y >= b.y - e && p.y <= b.y + b.h + e) return { side: 'R', t: p.y };
  if (Math.abs(p.y - b.y) < e && p.x >= b.x - e && p.x <= b.x + b.w + e) return { side: 'T', t: p.x };
  if (Math.abs(p.y - (b.y + b.h)) < e && p.x >= b.x - e && p.x <= b.x + b.w + e) return { side: 'B', t: p.x };
  return null;
}

function check(s: DStructure, l: DLayout, label: string) {
  // ① 出入口
  const bySide = new Map<string, { edge: string; t: number }[]>();
  for (const e of s.edges) {
    const pts = l.edges[e.id]!.points;
    for (const [node, p] of [[e.from, pts[0]!], [e.to, pts[pts.length - 1]!]] as const) {
      const sd = sideOf(p, l.nodes[node]!);
      expect(sd, `${label}: ${e.id} 的端点不在 ${node} 的边上`).not.toBeNull();
      const k = `${node}:${sd!.side}`;
      bySide.set(k, [...(bySide.get(k) ?? []), { edge: e.id, t: sd!.t }]);
    }
  }
  for (const [k, ends] of bySide)
    for (let i = 0; i < ends.length; i++)
      for (let j = i + 1; j < ends.length; j++)
        expect(Math.abs(ends[i]!.t - ends[j]!.t), `${label}: ${k} 上 ${ends[i]!.edge} 与 ${ends[j]!.edge} 的出入口相距不到 ${SP}px`).toBeGreaterThanOrEqual(SP - 0.05);
  // ②③ 平行段间距与共线重叠
  const segs = segmentsOf(l);
  for (let i = 0; i < segs.length; i++)
    for (let j = i + 1; j < segs.length; j++) {
      const p = segs[i]!;
      const q = segs[j]!;
      if (p.edge === q.edge || p.dir !== q.dir) continue;
      const [pa, pb, qa, qb, dist] =
        p.dir === 'h'
          ? [Math.min(p.a.x, p.b.x), Math.max(p.a.x, p.b.x), Math.min(q.a.x, q.b.x), Math.max(q.a.x, q.b.x), Math.abs(p.a.y - q.a.y)]
          : [Math.min(p.a.y, p.b.y), Math.max(p.a.y, p.b.y), Math.min(q.a.y, q.b.y), Math.max(q.a.y, q.b.y), Math.abs(p.a.x - q.a.x)];
      const overlap = Math.min(pb, qb) - Math.max(pa, qa);
      if (overlap <= 0.5) continue;
      expect(dist, `${label}: ${p.edge} 与 ${q.edge} 的平行段相距 ${dist.toFixed(1)}px（重叠 ${overlap.toFixed(0)}px）`).toBeGreaterThanOrEqual(SP - 0.05);
    }
  // 不穿过别的节点
  for (const sg of segs)
    for (const [id, b] of Object.entries(l.nodes)) {
      const e = s.edges.find((x) => x.id === sg.edge)!;
      if (id === e.from || id === e.to) continue;
      const x0 = Math.min(sg.a.x, sg.b.x), x1 = Math.max(sg.a.x, sg.b.x), y0 = Math.min(sg.a.y, sg.b.y), y1 = Math.max(sg.a.y, sg.b.y);
      expect(x1 > b.x + 1 && x0 < b.x + b.w - 1 && y1 > b.y + 1 && y0 < b.y + b.h - 1, `${label}: ${sg.edge} 穿过节点 ${id}`).toBe(false);
    }
}

describe('连线走线：agent-arch 的真实结构', () => {
  for (const opt of ['agent.a-hybrid', 'agent.b-cloud'])
    it(`${opt}：同一节点同侧出入口不重合、平行段间距 ≥ ${SP}px、不同连线无共线重叠`, () => {
      const s = diagramStructure(archOf[opt]!);
      expect(s.edges.length).toBeGreaterThan(8);
      check(s, layoutDiagram(s), opt);
    });
  for (const opt of ['agent.a-hybrid', 'agent.b-cloud'])
    it(`${opt}：换成另一个方向（right）同样成立`, () => {
      const node = archOf[opt]!;
      const s = diagramStructure({ ...node, props: { ...node.props, direction: node.props?.direction === 'down' ? 'right' : 'down' } });
      check(s, layoutDiagram(s), `${opt}/flip`);
    });
  it('Biz Server 底部的多条连线各有出入口，不挤成一束（出入口之间 ≥ 10px）', () => {
    const s = diagramStructure(archOf['agent.a-hybrid']!);
    const l = layoutDiagram(s);
    const biz = l.nodes.biz!;
    const ends = s.edges.flatMap((e) => {
      const pts = l.edges[e.id]!.points;
      return [e.from === 'biz' ? pts[0]! : null, e.to === 'biz' ? pts[pts.length - 1]! : null].filter((p): p is Point => !!p);
    });
    expect(ends.length).toBeGreaterThanOrEqual(7);
    const keys = new Set(ends.map((p) => `${Math.round(p.x)},${Math.round(p.y)}`));
    expect(keys.size).toBe(ends.length);
    expect(ends.every((p) => sideOf(p, biz))).toBe(true);
  });
});

describe('edgePath：直线段 + 小圆角', () => {
  it('转角半径不超过 8px，也不超过相邻段长的一半', () => {
    const d = edgePath([{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 6 }, { x: 200, y: 6 }]);
    expect(d).toMatch(/^M0,0 L97,0 Q100,0 100,3 L100,3 Q100,6 103,6 L200,6$/);
    expect(edgePath([{ x: 0, y: 0 }, { x: 10, y: 0 }])).toBe('M0,0 L10,0');
  });
});

describe('聚焦布局（镜头对准同一张图里的多个节点时，排一张紧凑小图）', () => {
  const area = (a: Box, b: Box) => Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
  it('聚焦集合：2 个及以上节点；对准连线取两端；只有一个节点、对准分组或整张图时不重新布局', () => {
    const s = diagramStructure(archOf['agent.a-hybrid']!);
    expect(focusMembers(s, ['brain', 'biz'], 'arch')).toEqual(['biz', 'brain']); // 按结构顺序，与书写顺序无关
    expect(focusMembers(s, ['e_brain_llm'], 'arch')).toEqual(['brain', 'llm']);
    expect(focusMembers(s, ['biz'], 'arch')).toBeNull();
    expect(focusMembers(s, ['g_brain', 'biz'], 'arch')).toBeNull();
    expect(focusMembers(s, ['arch'], 'arch')).toBeNull();
    expect(focusMembers(s, ['msg_user', 'tc_sheet'], 'arch')).toBeNull();
    expect(focusMembers(s, [], 'arch')).toBeNull();
  });
  it('小图只含聚焦节点与它们之间的连线，放在全图中央，比全图紧凑；节点不重叠、标签不重叠；结果确定', () => {
    const s = diagramStructure(archOf['agent.a-hybrid']!);
    const full = layoutDiagram(s);
    const members = focusMembers(s, ['biz', 'brain'], 'arch')!;
    const f = focusLayout(s, full, members);
    expect(f).toEqual(focusLayout(s, full, members));
    expect(Object.keys(f.nodes).sort()).toEqual(['biz', 'brain']);
    expect(Object.keys(f.edges).sort()).toEqual(['e_biz_brain', 'e_brain_biz']); // 连向小图外部的线不在小图里
    // 两个节点在小图里靠得近：中心距离远小于全图里
    const d = (m: Record<string, Box>) => Math.hypot(m.biz!.x + m.biz!.w / 2 - (m.brain!.x + m.brain!.w / 2), m.biz!.y + m.biz!.h / 2 - (m.brain!.y + m.brain!.h / 2));
    expect(d(f.nodes)).toBeLessThan(d(full.nodes) * 0.75);
    expect(f.box.w * f.box.h).toBeLessThan(full.width * full.height * 0.25);
    expect(Math.abs(f.box.x + f.box.w / 2 - full.width / 2)).toBeLessThanOrEqual(1);
    expect(Math.abs(f.box.y + f.box.h / 2 - full.height / 2)).toBeLessThanOrEqual(1);
    expect(area(f.nodes.biz!, f.nodes.brain!)).toBe(0);
    // 往返两条线各自的标签都在，按 14px 估算尺寸，互不重叠
    const a = f.edges.e_biz_brain!.label!;
    const b = f.edges.e_brain_biz!.label!;
    expect(a.w).toBeGreaterThanOrEqual(textWidth('③ 任务 + 工具定义', FOCUS_EDGE_FONT));
    expect(area(a, b)).toBe(0);
    // 小图里同样满足走线不变量
    const sub: DStructure = { ...s, groups: [], nodes: s.nodes.filter((n) => members.includes(n.id)).map((n) => ({ ...n, parent: null })), edges: s.edges.filter((e) => members.includes(e.from) && members.includes(e.to)) };
    check(sub, { width: full.width, height: full.height, nodes: f.nodes, groups: {}, edges: f.edges, titles: {} }, 'focus');
  });
  it('三个节点（额度预检链路）同样排成小图；聚焦集合不同 → 键不同', () => {
    const s = diagramStructure(archOf['agent.b-cloud']!);
    const full = layoutDiagram(s);
    const f = focusLayout(s, full, focusMembers(s, ['brain', 'queue', 'billing'], 'arch')!);
    expect(Object.keys(f.edges).sort()).toEqual(['e_brain_queue', 'e_queue_billing']);
    expect(f.key).not.toBe(focusLayout(s, full, ['biz', 'brain']).key);
  });
  it('插值：t = 0 是全图位置，t = 1 是小图位置，中间线性；不在小图里的节点不动', () => {
    const s = diagramStructure(archOf['agent.a-hybrid']!);
    const full = layoutDiagram(s);
    const f = focusLayout(s, full, ['biz', 'brain']);
    expect(interpolateNodes(full.nodes, f, 0)).toEqual(full.nodes);
    expect(interpolateNodes(full.nodes, f, 1).biz).toEqual(f.nodes.biz);
    const half = interpolateNodes(full.nodes, f, 0.5).biz!;
    expect(half.x).toBeCloseTo((full.nodes.biz!.x + f.nodes.biz!.x) / 2, 6);
    expect(interpolateNodes(full.nodes, f, 0.5).llm).toEqual(full.nodes.llm);
    expect(interpolateNodes(full.nodes, null, 0.5)).toBe(full.nodes);
    expect(lerpBox({ x: 0, y: 0, w: 10, h: 10 }, { x: 10, y: 20, w: 30, h: 10 }, 2)).toEqual({ x: 10, y: 20, w: 30, h: 10 });
  });
  it('聚焦时突出的连线：连着焦点节点、本身是焦点、或 active / ok / error；对准分组时展开成组内节点', () => {
    const s = diagramStructure(archOf['agent.a-hybrid']!);
    const f = diagramFocus(s, ['biz'], 'arch')!;
    expect(edgeEmphasized(f, { id: 'e_biz_brain', from: 'biz', to: 'brain' }, 'idle')).toBe(true);
    expect(edgeEmphasized(f, { id: 'e_brain_llm', from: 'brain', to: 'llm' }, 'idle')).toBe(false);
    expect(edgeEmphasized(f, { id: 'e_brain_llm', from: 'brain', to: 'llm' }, 'active')).toBe(true);
    expect([...diagramFocus(s, ['g_brain'], 'arch')!.nodes].sort()).toEqual(['brain', 'llm']);
    expect(diagramFocus(s, ['arch'], 'arch')).toBeNull();
    expect(diagramFocus(s, ['msg_user'], 'arch')).toBeNull();
  });
});

describe('effectiveState（D48：显式 state 优先，否则用 trace 推算）', () => {
  it('显式字面量或绑定解析出的值优先；没写时用推算值；都没有是 idle；非法值按 idle', async () => {
    const { effectiveState } = await import('../src/renderer/diagram-layout');
    const traced = { biz: { state: 'active' as const }, e1: { state: 'active' as const, reverse: true } };
    expect(effectiveState('ok', traced, 'biz')).toEqual({ state: 'ok', reverse: false });
    expect(effectiveState(undefined, traced, 'biz')).toEqual({ state: 'active', reverse: false });
    expect(effectiveState(null, traced, 'e1')).toEqual({ state: 'active', reverse: true });
    expect(effectiveState(undefined, traced, 'llm')).toEqual({ state: 'idle', reverse: false });
    expect(effectiveState('weird', traced, 'biz')).toEqual({ state: 'idle', reverse: false });
    expect(effectiveState('idle', traced, 'biz')).toEqual({ state: 'idle', reverse: false }); // 旧项目绑定到 'idle' 时结果不变
  });
});
