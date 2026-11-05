/**
 * 架构图（Diagram，D41）的自动布局：纯函数，结果确定。
 *
 * - diagramStructure：从 IR 节点取出结构（分组、节点、连线、方向、节点尺寸）。只读**原始属性**：state 等绑定在 IR 里是
 *   "$ui.x" 这样的字符串，when 也不参与，所以播放中 state / 可见性变化不会改变结构，节点不会移动。
 * - layoutDiagram：@dagrejs/dagre（MIT，复合图支持分组）计算节点坐标；连线由 diagram-route.ts 正交走线
 *   （出入口分配、通道与轨道间距 ≥ 10px、不同连线不共线；放不下时加大层间距重排）。
 *   同一结构总是得到同一结果（dagre 对相同的插入顺序是确定的；这里按源码顺序插入）。
 * - structureKey：结构的稳定键，渲染器只在它变化时重新布局。
 */
import dagre from '@dagrejs/dagre';
import { routeOrthogonal } from './diagram-route';
import type { DiagramStates, SceneNode } from '@joplo-app/core';

export type Point = { x: number; y: number };
export type Box = { x: number; y: number; w: number; h: number };
export type DGroup = { id: string; label: string; parent: string | null };
export type DNode = { id: string; label: string; description: string; kind: string; parent: string | null; w: number; h: number };
export type DEdge = { id: string; from: string; to: string; label: string; lw: number; lh: number };
export type DStructure = { direction: 'right' | 'down'; groups: DGroup[]; nodes: DNode[]; edges: DEdge[] };
export type DLayout = {
  width: number;
  height: number;
  nodes: Record<string, Box>;
  groups: Record<string, Box>;
  edges: Record<string, { points: Point[]; label: Box | null }>;
  /** 分组标题所在的矩形（连线和连线标签都避开它）。 */
  titles: Record<string, Box>;
};

/** 分组框顶部标题所占的高度。 */
export const GROUP_LABEL_H = 18;
const GROUP_PAD = 8;
/** 分组标题字号。 */
export const GROUP_FONT = 12;
/** 节点主标签与 description 的字号（整图缩放后的实际字号由镜头推近 / 用户缩放保证可读）。 */
export const NODE_FONT = 14;
export const DESC_FONT = 12;
export const EDGE_FONT = 12;

const isBinding = (v: unknown) => typeof v === 'string' && /^\$(ui|data|inputs)\b/.test(v);
const staticText = (v: unknown) => (typeof v === 'string' && !isBinding(v) ? v : typeof v === 'number' ? String(v) : '');

/** 粗略的文字宽度：中日韩字符按 1 个字号宽，其余按 0.58。 */
export function textWidth(s: string, size: number): number {
  let w = 0;
  for (const ch of s) w += (ch.codePointAt(0) ?? 0) > 0x2e80 ? size : size * 0.58;
  return Math.ceil(w);
}

const NODE_MIN_W = 116;
const NODE_MAX_W = 196;

/** 节点尺寸只取决于静态的 label / description / kind（绑定的文字按固定宽度估算）。 */
export function nodeSize(label: string, description: string, kind: string): { w: number; h: number } {
  const icon = kind === 'database' || kind === 'queue' ? 0 : 26;
  const labelW = textWidth(label || ' ', 14) + icon + 28;
  const descW = description ? textWidth(description, 12) + 28 : 0;
  let w = Math.max(NODE_MIN_W, Math.min(NODE_MAX_W, Math.max(labelW, descW)));
  const descLines = description ? Math.min(2, Math.ceil(descW / w)) : 0;
  let h = 46 + descLines * 16;
  if (kind === 'database') h += 14; // 圆柱的上下盖
  if (kind === 'queue') w += 20; // 管道的左右端
  return { w, h };
}

export function diagramStructure(node: SceneNode): DStructure {
  const p = node.props ?? {};
  const direction = p.direction === 'down' ? 'down' : 'right';
  const groups: DGroup[] = [];
  const nodes: DNode[] = [];
  const edges: DEdge[] = [];
  const walk = (children: SceneNode[] | undefined, parent: string | null) => {
    for (const c of children ?? []) {
      const cp = c.props ?? {};
      if (c.type === 'Diagram.Group') {
        groups.push({ id: c.id, label: staticText(cp.label), parent });
        walk(c.children, c.id);
      } else if (c.type === 'Diagram.Node') {
        const label = staticText(cp.label) || c.id;
        const description = staticText(cp.description);
        const kind = typeof cp.kind === 'string' ? cp.kind : 'service';
        nodes.push({ id: c.id, label, description, kind, parent, ...nodeSize(label, description, kind) });
      } else if (c.type === 'Diagram.Edge') {
        const label = staticText(cp.label);
        edges.push({ id: c.id, from: String(cp.from ?? ''), to: String(cp.to ?? ''), label, lw: label ? textWidth(label, EDGE_FONT) + 10 : 0, lh: label ? 18 : 0 });
      }
      // 嵌套的 Diagram 自成一图；其他类型在架构图里不参与布局
    }
  };
  walk(node.children, null);
  return { direction, groups, nodes, edges };
}

export const structureKey = (s: DStructure) => JSON.stringify(s);

/**
 * 镜头聚焦时架构图里的焦点（T-director3）：targets 里的节点、分组（展开成它的全部后代节点）与连线。
 * 返回 null 表示焦点不在这张图里（或焦点就是整张图），连线照常画。
 */
export function diagramFocus(s: DStructure, targets: readonly string[] | null | undefined, diagramId?: string): { nodes: Set<string>; edges: Set<string> } | null {
  if (!targets?.length || (diagramId && targets.includes(diagramId))) return null;
  const parentOf = new Map(s.groups.map((g) => [g.id, g.parent]));
  const inGroup = (gid: string | null, target: string): boolean => (gid ? gid === target || inGroup(parentOf.get(gid) ?? null, target) : false);
  const nodes = new Set<string>();
  const edges = new Set<string>();
  for (const t of targets) {
    if (s.nodes.some((n) => n.id === t)) nodes.add(t);
    else if (s.edges.some((e) => e.id === t)) edges.add(t);
    else if (s.groups.some((g) => g.id === t)) for (const n of s.nodes) if (inGroup(n.parent, t)) nodes.add(n.id);
  }
  return nodes.size || edges.size ? { nodes, edges } : null;
}

/** 聚焦时这条连线是否突出：连着焦点节点、本身是焦点，或 state 是 active / ok / error。 */
export function edgeEmphasized(focus: { nodes: Set<string>; edges: Set<string> }, e: { id: string; from: string; to: string }, state: string): boolean {
  return focus.edges.has(e.id) || focus.nodes.has(e.from) || focus.nodes.has(e.to) || state === 'active' || state === 'ok' || state === 'error';
}

/**
 * 指回“上游所在分组”的连线：u → v，v 所在的、不包含 u 的最外层分组里，有别的成员能走到 u（它在 u 的上游）。
 * 这样的连线若照常参与分层，会把这个分组拉成横跨整张图的长条（例如 app → biz → local，app 与 local 同属“用户设备”）。
 * 布局时把它当成反向连线分层（类似 Graphviz 的 constraint=false），画的时候方向不变。
 */
export function backEdges(s: DStructure): Set<string> {
  const parentOfGroup = new Map(s.groups.map((g) => [g.id, g.parent]));
  const chain = (gid: string | null): string[] => (gid ? [gid, ...chain(parentOfGroup.get(gid) ?? null)] : []);
  const groupsOf = new Map(s.nodes.map((n) => [n.id, chain(n.parent)]));
  const out = new Map<string, string[]>();
  for (const e of s.edges) out.set(e.from, [...(out.get(e.from) ?? []), e.to]);
  const reaches = (a: string, b: string, skip: string): boolean => {
    const seen = new Set<string>([a]);
    const stack = [a];
    while (stack.length) {
      const x = stack.pop()!;
      if (x === b) return true;
      for (const y of out.get(x) ?? []) {
        if (seen.has(y) || (x === skip.split('\u0000')[0] && y === skip.split('\u0000')[1])) continue;
        seen.add(y);
        stack.push(y);
      }
    }
    return false;
  };
  const res = new Set<string>();
  for (const e of s.edges) {
    const gv = groupsOf.get(e.to) ?? [];
    const gu = new Set(groupsOf.get(e.from) ?? []);
    const outer = [...gv].reverse().find((g) => !gu.has(g));
    if (!outer) continue;
    const members = s.nodes.filter((n) => n.id !== e.to && (groupsOf.get(n.id) ?? []).includes(outer));
    if (members.some((m) => reaches(m.id, e.from, `${e.from}\u0000${e.to}`))) res.add(e.id);
  }
  return res;
}

export function layoutDiagram(s: DStructure, opts: { minRanksep?: number } = {}): DLayout {
  const empty: DLayout = { width: 0, height: 0, nodes: {}, groups: {}, edges: {}, titles: {} };
  if (s.nodes.length === 0) return empty;
  // 走线放不下所需的通道时加大层间距重新布局（最多几次，结果仍确定）
  // 连线多的节点：出入口那一侧加长到放得下全部出入口（间距 ≥ 10px）
  let extra = 0;
  const sizes: Record<string, number> = {};
  const run = () => {
    const placed = placeNodes(s, extra, sizes, opts.minRanksep ?? 0);
    return { placed, routed: routeOrthogonal(s.edges.filter((e) => placed.known.has(e.from) && placed.known.has(e.to)), placed.nodes, s.direction === 'down', Object.values(placed.groups), GROUP_LABEL_H) };
  };
  let { placed, routed } = run();
  for (let i = 0; i < 5 && (routed.deficit > 0 || Object.keys(routed.grow).length); i++) {
    extra += routed.deficit;
    for (const [id, v] of Object.entries(routed.grow)) sizes[id] = Math.max(sizes[id] ?? 0, Math.ceil(v));
    ({ placed, routed } = run());
  }
  return finish(s, placed.nodes, placed.groups, routed.routes);
}

/** dagre 排节点（连线只用于分层，不用它的折线），算出分组框。 */
function placeNodes(s: DStructure, extraRanksep: number, minSide: Record<string, number> = {}, minRanksep = 0): { nodes: Record<string, Box>; groups: Record<string, Box>; known: Set<string> } {
  const g = new dagre.graphlib.Graph({ compound: true, multigraph: true });
  // 紧凑：连线标签不进 dagre（不单独占一层），布局后贴在线上（placeLabels）
  const maxLabel = Math.max(0, ...s.edges.map((e) => (s.direction === 'down' ? e.lh : e.lw)));
  // dagre 不知道分组的内边距和标题留白：有分组时把它们加进间距（标题在上方：down 时加在层间距，right 时加在同层间距）
  // 嵌套几层就有几层标题与内边距
  const depthOf = (gid: string | null): number => (gid ? 1 + depthOf(s.groups.find((x) => x.id === gid)?.parent ?? null) : 0);
  const depth = Math.max(0, ...s.groups.map((x) => depthOf(x.id)));
  const head = depth * (GROUP_LABEL_H + GROUP_PAD);
  const pad = depth * GROUP_PAD;
  const down = s.direction === 'down';
  // 标签贴在线上，不再需要为标签留出整层；只在标签很长时略微放宽
  const ranksep = Math.max(minRanksep, Math.min(64, Math.max(32, maxLabel * 0.35)) + (down ? head + pad : 2 * pad)) + extraRanksep;
  const nodesep = 20 + (down ? 2 * pad : head + pad);
  g.setGraph({ rankdir: down ? 'TB' : 'LR', nodesep, ranksep, edgesep: 14, marginx: 0, marginy: 0 });
  g.setDefaultEdgeLabel(() => ({}));
  const known = new Set(s.nodes.map((n) => n.id));
  for (const gr of s.groups) g.setNode(gr.id, { label: gr.label, paddingTop: GROUP_LABEL_H });
  for (const gr of s.groups) if (gr.parent) g.setParent(gr.id, gr.parent);
  for (const n of s.nodes) {
    // minSide：出入口那一侧的最小长度（right 方向是高度，down 方向是宽度）
    const m = minSide[n.id] ?? 0;
    g.setNode(n.id, down ? { width: Math.max(n.w, m), height: n.h } : { width: n.w, height: Math.max(n.h, m) });
    if (n.parent) g.setParent(n.id, n.parent);
  }
  const reversed = backEdges(s);
  for (const e of s.edges) {
    if (!known.has(e.from) || !known.has(e.to)) continue; // 编译期已报 UNKNOWN_DIAGRAM_NODE
    if (reversed.has(e.id)) g.setEdge(e.to, e.from, {}, e.id);
    else g.setEdge(e.from, e.to, {}, e.id);
  }
  dagre.layout(g);

  const nodes: Record<string, Box> = {};
  for (const n of s.nodes) {
    const v = g.node(n.id) as { x: number; y: number; width: number; height: number };
    nodes[n.id] = { x: v.x - v.width / 2, y: v.y - v.height / 2, w: v.width, h: v.height };
  }
  // 分组框：包住它的所有后代节点（含嵌套分组），四周留白，顶部留出标题。由内向外计算。
  const groups: Record<string, Box> = {};
  const childrenOf = (gid: string) => ({ nodes: s.nodes.filter((n) => n.parent === gid), groups: s.groups.filter((x) => x.parent === gid) });
  const boxOf = (gid: string): Box | null => {
    if (groups[gid]) return groups[gid]!;
    const c = childrenOf(gid);
    const boxes = [...c.nodes.map((n) => nodes[n.id]!), ...c.groups.map((x) => boxOf(x.id)).filter((b): b is Box => !!b)];
    if (!boxes.length) return null;
    const x0 = Math.min(...boxes.map((b) => b.x)) - GROUP_PAD;
    const y0 = Math.min(...boxes.map((b) => b.y)) - GROUP_PAD - GROUP_LABEL_H;
    const x1 = Math.max(...boxes.map((b) => b.x + b.w)) + GROUP_PAD;
    const y1 = Math.max(...boxes.map((b) => b.y + b.h)) + GROUP_PAD;
    groups[gid] = { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
    return groups[gid]!;
  };
  for (const gr of s.groups) boxOf(gr.id);
  return { nodes, groups, known };
}

function finish(s: DStructure, nodes: Record<string, Box>, groups: Record<string, Box>, routed: Map<string, Point[]>): DLayout {
  const edges: DLayout['edges'] = {};
  // 分组标题：在分组顶部那条留白里，从左往右找一个没有连线经过的位置
  const titles: Record<string, Box> = {};
  const allRoutes = [...routed.values()];
  const crossings = (box: Box) => allRoutes.reduce((n, pts) => n + sampleRoute(pts).filter((p) => p.x > box.x - 2 && p.x < box.x + box.w + 2 && p.y > box.y - 2 && p.y < box.y + box.h + 2).length, 0);
  for (const gr of s.groups) {
    const b = groups[gr.id];
    if (!b || !gr.label) continue;
    const w = textWidth(gr.label, GROUP_FONT) + 10;
    let best: { box: Box; n: number } | null = null;
    for (let x = b.x + 6; x + w <= b.x + b.w - 4; x += 12) {
      const box = { x, y: b.y + 2, w, h: GROUP_LABEL_H - 3 };
      const n = crossings(box);
      if (!best || n < best.n) best = { box, n };
      if (n === 0) break;
    }
    titles[gr.id] = best?.box ?? { x: b.x + 6, y: b.y + 2, w, h: GROUP_LABEL_H - 3 };
  }
  const placed = placeLabels(
    s.edges.filter((e) => routed.has(e.id)),
    routed,
    [...Object.values(nodes), ...Object.values(titles)],
  );
  for (const [id, points] of routed) edges[id] = { points, label: placed.get(id) ?? null };

  // 平移到 (M, M) 起，算出整体尺寸
  const M = 12;
  const xs: number[] = [];
  const ys: number[] = [];
  const add = (b: Box) => {
    xs.push(b.x, b.x + b.w);
    ys.push(b.y, b.y + b.h);
  };
  Object.values(nodes).forEach(add);
  Object.values(groups).forEach(add);
  Object.values(titles).forEach(add);
  for (const e of Object.values(edges)) {
    e.points.forEach((pt) => add({ x: pt.x, y: pt.y, w: 0, h: 0 }));
    if (e.label) add(e.label);
  }
  const dx = M - Math.min(...xs);
  const dy = M - Math.min(...ys);
  const r = (n: number) => Math.round(n * 10) / 10;
  const move = (b: Box): Box => ({ x: r(b.x + dx), y: r(b.y + dy), w: r(b.w), h: r(b.h) });
  return {
    width: Math.ceil(Math.max(...xs) + dx + M),
    height: Math.ceil(Math.max(...ys) + dy + M),
    nodes: Object.fromEntries(Object.entries(nodes).map(([k, b]) => [k, move(b)])),
    groups: Object.fromEntries(Object.entries(groups).map(([k, b]) => [k, move(b)])),
    edges: Object.fromEntries(Object.entries(edges).map(([k, e]) => [k, { points: e.points.map((pt) => ({ x: r(pt.x + dx), y: r(pt.y + dy) })), label: e.label ? move(e.label) : null }])),
    titles: Object.fromEntries(Object.entries(titles).map(([k, b]) => [k, move(b)])),
  };
}

/** 沿折线每 4px 取一个点。 */
export function sampleRoute(points: Point[], step = 4): Point[] {
  const out: Point[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i]!;
    const b = points[i + 1]!;
    const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / step));
    for (let k = 0; k <= n; k++) out.push({ x: a.x + ((b.x - a.x) * k) / n, y: a.y + ((b.y - a.y) * k) / n });
  }
  return out;
}

const overlapArea = (a: Box, b: Box) => Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
const inflate = (b: Box, m: number): Box => ({ x: b.x - m, y: b.y - m, w: b.w + 2 * m, h: b.h + 2 * m });

/** 折线上按长度比例 t 处的点。 */
export function pointAt(points: Point[], t: number): Point {
  const segs = points.slice(1).map((p, i) => Math.hypot(p.x - points[i]!.x, p.y - points[i]!.y));
  const total = segs.reduce((a, b) => a + b, 0);
  let d = total * t;
  for (let i = 0; i < segs.length; i++) {
    if (d <= segs[i]! || i === segs.length - 1) {
      const a = points[i]!;
      const b = points[i + 1]!;
      const k = segs[i]! ? Math.min(1, d / segs[i]!) : 0;
      return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k };
    }
    d -= segs[i]!;
  }
  return points[0]!;
}

/**
 * 连线标签贴在线上：沿着连线从中点向两侧找位置，标签框不与节点、分组标题和已放好的标签重叠；
 * 都放不下时取重叠最少的位置。按源码顺序放，结果确定。
 */
export function placeLabels(list: DEdge[], routes: Map<string, Point[]>, obstacles: Box[]): Map<string, Box> {
  const out = new Map<string, Box>();
  const taken: Box[] = [];
  const samplesOf = new Map([...routes].map(([id, pts]) => [id, sampleRoute(pts)]));
  const others = new Map(list.map((e) => [e.id, [...samplesOf].filter(([id]) => id !== e.id).flatMap(([, ps]) => ps)]));
  const ts = [0.5];
  for (let k = 1; k <= 16; k++) ts.push(0.5 - k * 0.025, 0.5 + k * 0.025);
  for (const e of list) {
    if (!e.label) continue;
    const pts = routes.get(e.id)!;
    if (pts.length < 2) continue;
    let best: { box: Box; cost: number } | null = null;
    // 先试正好压在线上，再试贴着线的两侧（标签边缘碰到线）
    const cands: Point[] = [];
    for (const off of [0, -1, 1]) for (const t of ts) {
      const c = pointAt(pts, t);
      const d = pointAt(pts, Math.min(1, t + 0.01));
      const len = Math.hypot(d.x - c.x, d.y - c.y) || 1;
      const nx = -(d.y - c.y) / len;
      const ny = (d.x - c.x) / len;
      const k = off * (Math.abs(ny) > 0.5 ? e.lh / 2 + 1 : e.lw / 2 + 1);
      cands.push({ x: c.x + nx * k, y: c.y + ny * k });
    }
    for (const c of cands) {
      const box = { x: c.x - e.lw / 2, y: c.y - e.lh / 2, w: e.lw, h: e.lh };
      // 节点、标题、别的标签：硬冲突（按面积）；别的连线：软冲突（每个采样点算 4）
      const lines = others.get(e.id)!.reduce((a, p) => a + (p.x > box.x - 1 && p.x < box.x + box.w + 1 && p.y > box.y - 1 && p.y < box.y + box.h + 1 ? 4 : 0), 0);
      const cost = obstacles.reduce((a, o) => a + overlapArea(box, inflate(o, 3)), 0) * 10 + taken.reduce((a, o) => a + overlapArea(box, inflate(o, 2)) * 20, 0) + lines;
      if (!best || cost < best.cost) best = { box, cost };
      if (cost === 0) break;
    }
    out.set(e.id, best!.box);
    taken.push(best!.box);
  }
  return out;
}

/**
 * 整图缩放（T-director2）：整图放进容器宽度与高度 h，不放大、不滚动。
 * 看不清的细节交给舞台统一的缩放平移（滚轮 / 捏合 / 拖动）和镜头推近，Diagram 内部不再有第二套滚动与拖动。
 */
export function diagramFit(layout: Pick<DLayout, 'width' | 'height'>, availW: number, availH: number): { scale: number } {
  if (!layout.width || !availW) return { scale: 1 };
  return { scale: Math.max(0.05, Math.min(1, (availW - 8) / layout.width, (availH - 8) / layout.height)) };
}

/** 折线点 → 路径：直线段，转角处用半径 ≤ 8px 的圆角（不会切到相邻通道，平行段间距保持不变）。 */
export function edgePath(points: Point[], radius = 8): string {
  if (points.length < 2) return '';
  const f = (n: number) => Math.round(n * 10) / 10;
  let d = `M${f(points[0]!.x)},${f(points[0]!.y)}`;
  for (let i = 1; i < points.length - 1; i++) {
    const a = points[i - 1]!;
    const p = points[i]!;
    const b = points[i + 1]!;
    const la = Math.hypot(p.x - a.x, p.y - a.y);
    const lb = Math.hypot(b.x - p.x, b.y - p.y);
    const r = Math.min(radius, la / 2, lb / 2);
    if (r < 0.5) {
      d += ` L${f(p.x)},${f(p.y)}`;
      continue;
    }
    const p1 = { x: p.x + ((a.x - p.x) / la) * r, y: p.y + ((a.y - p.y) / la) * r };
    const p2 = { x: p.x + ((b.x - p.x) / lb) * r, y: p.y + ((b.y - p.y) / lb) * r };
    d += ` L${f(p1.x)},${f(p1.y)} Q${f(p.x)},${f(p.y)} ${f(p2.x)},${f(p2.y)}`;
  }
  const last = points[points.length - 1]!;
  return d + ` L${f(last.x)},${f(last.y)}`;
}

/** 箭头：终点处的实心三角形。 */
export function arrowHead(points: Point[], size = 9): string {
  if (points.length < 2) return '';
  const p = points[points.length - 1]!;
  const q = points[points.length - 2]!;
  const len = Math.hypot(p.x - q.x, p.y - q.y) || 1;
  const ux = (p.x - q.x) / len;
  const uy = (p.y - q.y) / len;
  const bx = p.x - ux * size;
  const by = p.y - uy * size;
  const f = (n: number) => Math.round(n * 10) / 10;
  return `M${f(p.x)},${f(p.y)} L${f(bx - uy * size * 0.55)},${f(by + ux * size * 0.55)} L${f(bx + uy * size * 0.55)},${f(by - ux * size * 0.55)} Z`;
}

// ---------- 聚焦布局（T-director3） ----------
/** 聚焦小图里连线标签的字号（全图是 EDGE_FONT）。 */
export const FOCUS_EDGE_FONT = 14;
/** 节点从全图位置移到小图（以及移回去）的时长。 */
export const FOCUS_MOVE_MS = 800;

/**
 * 这一步要不要用聚焦布局：镜头对准这张图里的 2 个及以上节点（对准连线时取它两端的节点）。
 * 只对准一个节点、对准分组或整张图、焦点不在这张图里：返回 null（保持全图，只推近镜头）。
 */
export function focusMembers(s: DStructure, targets: readonly string[] | null | undefined, diagramId?: string): string[] | null {
  if (!targets?.length || (diagramId && targets.includes(diagramId))) return null;
  if (targets.some((t) => s.groups.some((g) => g.id === t))) return null;
  const ids = new Set(s.nodes.map((n) => n.id));
  const out: string[] = [];
  const add = (id: string) => {
    if (ids.has(id) && !out.includes(id)) out.push(id);
  };
  for (const t of targets) {
    if (ids.has(t)) add(t);
    const e = s.edges.find((x) => x.id === t);
    if (e) {
      add(e.from);
      add(e.to);
    }
  }
  // 按结构里的顺序，结果与 targets 的书写顺序无关
  const order = s.nodes.map((n) => n.id);
  out.sort((a, b) => order.indexOf(a) - order.indexOf(b));
  return out.length >= 2 ? out : null;
}

export type FocusLayout = {
  /** 小图里节点的位置（与全图同一坐标系，小图放在全图中央）。 */
  nodes: Record<string, Box>;
  edges: Record<string, { points: Point[]; label: Box | null }>;
  /** 小图的范围（含连线与标签），背后画一块浅色底。 */
  box: Box;
  members: string[];
  /** 结构 + 聚焦集合的稳定键（缓存、动画都按它）。 */
  key: string;
};

/**
 * 聚焦布局：只用聚焦的节点和它们之间的连线（两端都在集合里），用同一套 dagre + 正交走线排一张紧凑的小图，
 * 连线标签按 FOCUS_EDGE_FONT 估算尺寸，层间距放宽，放在全图的中央。只由结构 + 聚焦集合决定，结果确定。
 */
export function focusLayout(s: DStructure, full: Pick<DLayout, 'width' | 'height'>, members: string[]): FocusLayout {
  const set = new Set(members);
  const sub: DStructure = {
    direction: s.direction,
    groups: [],
    nodes: s.nodes.filter((n) => set.has(n.id)).map((n) => ({ ...n, parent: null })),
    edges: s.edges.filter((e) => set.has(e.from) && set.has(e.to)).map((e) => ({ ...e, lw: e.label ? textWidth(e.label, FOCUS_EDGE_FONT) + 12 : 0, lh: e.label ? 22 : 0 })),
  };
  const l = layoutDiagram(sub, { minRanksep: 84 });
  const dx = Math.round((full.width - l.width) / 2);
  const dy = Math.round((full.height - l.height) / 2);
  const mv = (b: Box): Box => ({ x: b.x + dx, y: b.y + dy, w: b.w, h: b.h });
  return {
    nodes: Object.fromEntries(Object.entries(l.nodes).map(([k, b]) => [k, mv(b)])),
    edges: Object.fromEntries(Object.entries(l.edges).map(([k, e]) => [k, { points: e.points.map((p) => ({ x: p.x + dx, y: p.y + dy })), label: e.label ? mv(e.label) : null }])),
    box: { x: dx, y: dy, w: l.width, h: l.height },
    members: [...members],
    key: JSON.stringify([structureKey(s), members]),
  };
}

/** 全图位置与小图位置之间的插值（t = 0 全图，1 小图），渲染用 Motion 做同样的过渡。 */
export function lerpBox(a: Box, b: Box, t: number): Box {
  const k = Math.max(0, Math.min(1, t));
  return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, w: a.w + (b.w - a.w) * k, h: a.h + (b.h - a.h) * k };
}

export function interpolateNodes(full: Record<string, Box>, focus: FocusLayout | null, t: number): Record<string, Box> {
  if (!focus) return full;
  return Object.fromEntries(Object.entries(full).map(([id, b]) => [id, focus.nodes[id] ? lerpBox(b, focus.nodes[id]!, t) : b]));
}

// ---------- 调用链（D48） ----------
const D_STATES = new Set(['idle', 'active', 'ok', 'error', 'dim']);
/**
 * 节点 / 连线实际显示的 state：作者显式写的 state（字面量或绑定解析后的值）优先；没写（undefined / null）时用 trace 推算的值；
 * 都没有是 idle。reverse 只在使用推算值时有意义（逆着连线方向走，小点逆向流动）。
 */
export function effectiveState(explicit: unknown, traced: DiagramStates | undefined, id: string): { state: string; reverse: boolean } {
  if (explicit !== undefined && explicit !== null) return { state: typeof explicit === 'string' && D_STATES.has(explicit) ? explicit : 'idle', reverse: false };
  const t = traced?.[id];
  return t ? { state: t.state, reverse: !!t.reverse } : { state: 'idle', reverse: false };
}
