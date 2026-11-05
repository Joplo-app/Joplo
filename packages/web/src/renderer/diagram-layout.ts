/**
 * 架构图（Diagram，D41）的自动布局：纯函数，结果确定。
 *
 * - diagramStructure：从 IR 节点取出结构（分组、节点、连线、方向、节点尺寸）。只读**原始属性**：state 等绑定在 IR 里是
 *   "$ui.x" 这样的字符串，when 也不参与，所以播放中 state / 可见性变化不会改变结构，节点不会移动。
 * - layoutDiagram：@dagrejs/dagre（MIT，复合图支持分组）计算坐标；连线用 dagre 给出的折线点（绕开节点）。
 *   同一结构总是得到同一结果（dagre 对相同的插入顺序是确定的；这里按源码顺序插入）。
 * - structureKey：结构的稳定键，渲染器只在它变化时重新布局。
 */
import dagre from '@dagrejs/dagre';
import type { SceneNode } from '@tokenroll/joplo-core';

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
};

/** 分组框顶部标题所占的高度。 */
export const GROUP_LABEL_H = 26;
const GROUP_PAD = 14;

const isBinding = (v: unknown) => typeof v === 'string' && /^\$(ui|data|inputs)\b/.test(v);
const staticText = (v: unknown) => (typeof v === 'string' && !isBinding(v) ? v : typeof v === 'number' ? String(v) : '');

/** 粗略的文字宽度：中日韩字符按 1 个字号宽，其余按 0.58。 */
export function textWidth(s: string, size: number): number {
  let w = 0;
  for (const ch of s) w += (ch.codePointAt(0) ?? 0) > 0x2e80 ? size : size * 0.58;
  return Math.ceil(w);
}

const NODE_MIN_W = 132;
const NODE_MAX_W = 240;

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
        edges.push({ id: c.id, from: String(cp.from ?? ''), to: String(cp.to ?? ''), label, lw: label ? textWidth(label, 12) + 14 : 0, lh: label ? 20 : 0 });
      }
      // 嵌套的 Diagram 自成一图；其他类型在架构图里不参与布局
    }
  };
  walk(node.children, null);
  return { direction, groups, nodes, edges };
}

export const structureKey = (s: DStructure) => JSON.stringify(s);

export function layoutDiagram(s: DStructure): DLayout {
  const empty: DLayout = { width: 0, height: 0, nodes: {}, groups: {}, edges: {} };
  if (s.nodes.length === 0) return empty;
  const g = new dagre.graphlib.Graph({ compound: true, multigraph: true });
  g.setGraph({ rankdir: s.direction === 'down' ? 'TB' : 'LR', nodesep: 46, ranksep: 96, edgesep: 24, marginx: 0, marginy: 0 });
  g.setDefaultEdgeLabel(() => ({}));
  const known = new Set(s.nodes.map((n) => n.id));
  for (const gr of s.groups) g.setNode(gr.id, { label: gr.label, paddingTop: GROUP_LABEL_H });
  for (const gr of s.groups) if (gr.parent) g.setParent(gr.id, gr.parent);
  for (const n of s.nodes) {
    g.setNode(n.id, { width: n.w, height: n.h });
    if (n.parent) g.setParent(n.id, n.parent);
  }
  for (const e of s.edges) {
    if (!known.has(e.from) || !known.has(e.to)) continue; // 编译期已报 UNKNOWN_DIAGRAM_NODE
    g.setEdge(e.from, e.to, e.label ? { width: e.lw, height: e.lh, labelpos: 'c' } : {}, e.id);
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

  const edges: DLayout['edges'] = {};
  const flip = s.direction === 'down';
  const raws = new Map<string, Point[]>();
  const labels = new Map<string, Box | null>();
  for (const e of s.edges) {
    if (!known.has(e.from) || !known.has(e.to)) continue;
    const v = g.edge({ v: e.from, w: e.to, name: e.id }) as { points?: Point[]; x?: number; y?: number } | undefined;
    raws.set(e.id, (v?.points ?? []).map((pt) => ({ x: pt.x, y: pt.y })));
    labels.set(e.id, e.label && v?.x !== undefined && v?.y !== undefined ? { x: v.x - e.lw / 2, y: v.y - e.lh / 2, w: e.lw, h: e.lh } : null);
  }
  const routed = routeEdges(s.edges.filter((e) => raws.has(e.id)), raws, nodes, flip);
  for (const [id, points] of routed) edges[id] = { points, label: labels.get(id) ?? null };

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
  };
}

const T = (p: Point, flip: boolean): Point => (flip ? { x: p.y, y: p.x } : p);
const TB = (b: Box, flip: boolean): Box => (flip ? { x: b.y, y: b.x, w: b.h, h: b.w } : b);
const LANE = 11;

/**
 * 连线的首末两段。dagre 给出的是从节点中心指向第一个 / 最后一个中间点的斜线，可能擦过同一列的其他节点，
 * 多条线还会挤在同一个出口上。这里改成“横出横进”（down 方向交换坐标轴处理）：
 * - 每个节点的每一侧，按另一端的位置排序，把出入口均匀分布在这一侧（只有一条线时取最近的点）；
 * - 需要转弯的线在列间空隙里转弯，转弯处在同一列所有节点外缘之外 20px 起，每条线占一条 11px 的通道，互不重叠；
 * - dagre 的中间点（绕开节点的路由）原样保留。
 */
export function routeEdges(list: DEdge[], raws: Map<string, Point[]>, nodeBoxes: Record<string, Box>, flip: boolean): Map<string, Point[]> {
  const boxes: Record<string, Box> = Object.fromEntries(Object.entries(nodeBoxes).map(([k, b]) => [k, TB(b, flip)]));
  const all = Object.values(boxes);
  const cx = (b: Box) => b.x + b.w / 2;
  const cy = (b: Box) => b.y + b.h / 2;
  const column = (b: Box) => all.filter((o) => Math.abs(cx(o) - cx(b)) < 1);
  const clampY = (y: number, b: Box) => Math.max(b.y + 10, Math.min(b.y + b.h - 10, y));
  type R = { e: DEdge; S: Box; D: Box; mid: Point[]; forward: boolean; wantS: number; wantT: number; sy: number; ty: number; sLane: number; dLane: number };
  const rs: R[] = [];
  const out = new Map<string, Point[]>();
  for (const e of list) {
    const raw = raws.get(e.id)!;
    if (e.from === e.to || raw.length < 2) {
      out.set(e.id, raw);
      continue;
    }
    const S = boxes[e.from]!;
    const D = boxes[e.to]!;
    const mid = raw.slice(1, -1).map((p) => T(p, flip));
    const forward = cx(D) >= cx(S);
    const wantS = mid[0]?.y ?? cy(D);
    const wantT = mid[mid.length - 1]?.y ?? cy(S);
    rs.push({ e, S, D, mid, forward, wantS, wantT, sy: 0, ty: 0, sLane: 0, dLane: 0 });
  }
  // 出入口：同一节点同一侧的线按另一端排序后均匀分布
  const ports = new Map<string, { r: R; end: 's' | 't' }[]>();
  for (const r of rs) {
    const sk = `${r.e.from}:${r.forward ? 'R' : 'L'}`;
    const tk = `${r.e.to}:${r.forward ? 'L' : 'R'}`;
    ports.set(sk, [...(ports.get(sk) ?? []), { r, end: 's' }]);
    ports.set(tk, [...(ports.get(tk) ?? []), { r, end: 't' }]);
  }
  for (const list2 of ports.values()) {
    const want = (x: { r: R; end: 's' | 't' }) => (x.end === 's' ? x.r.wantS : x.r.wantT);
    list2.sort((a, b) => want(a) - want(b));
    list2.forEach((x, i) => {
      const box = x.end === 's' ? x.r.S : x.r.D;
      const y = list2.length === 1 ? clampY(want(x), box) : box.y + (box.h * (i + 1)) / (list2.length + 1);
      if (x.end === 's') x.r.sy = y;
      else x.r.ty = y;
    });
  }
  // 转弯通道：同一列同一侧需要转弯的线各占一条通道
  const lanes = new Map<string, { r: R; end: 's' | 't'; y: number }[]>();
  for (const r of rs) {
    const first = r.mid[0];
    const last = r.mid[r.mid.length - 1];
    const sTurn = first ? Math.abs(r.sy - first.y) > 0.5 : Math.abs(r.sy - r.ty) > 0.5;
    const tTurn = last ? Math.abs(r.ty - last.y) > 0.5 : false;
    if (sTurn && first) {
      const k = `${cx(r.S)}:${r.forward ? 'R' : 'L'}`;
      lanes.set(k, [...(lanes.get(k) ?? []), { r, end: 's', y: r.sy }]);
    }
    if (tTurn || (!first && sTurn)) {
      const k = `${cx(r.D)}:${r.forward ? 'L' : 'R'}`;
      lanes.set(k, [...(lanes.get(k) ?? []), { r, end: 't', y: r.ty }]);
    }
  }
  for (const l of lanes.values()) {
    l.sort((a, b) => a.y - b.y);
    l.forEach((x, i) => {
      if (x.end === 's') x.r.sLane = i;
      else x.r.dLane = i;
    });
  }
  for (const r of rs) {
    const { S, D, mid, forward } = r;
    const sx = forward ? S.x + S.w : S.x;
    const dx = forward ? D.x : D.x + D.w;
    const sGap = (forward ? Math.max(...column(S).map((b) => b.x + b.w)) + 20 : Math.min(...column(S).map((b) => b.x)) - 20) + (forward ? 1 : -1) * r.sLane * LANE;
    const dGap = (forward ? Math.min(...column(D).map((b) => b.x)) - 20 : Math.max(...column(D).map((b) => b.x + b.w)) + 20) - (forward ? 1 : -1) * r.dLane * LANE;
    const pts: Point[] = [{ x: sx, y: r.sy }];
    const first = mid[0];
    const last = mid[mid.length - 1];
    if (!first || !last) {
      if (Math.abs(r.sy - r.ty) > 0.5) pts.push({ x: dGap, y: r.sy }, { x: dGap, y: r.ty });
    } else {
      if (Math.abs(r.sy - first.y) > 0.5) {
        const gx = forward ? Math.min(sGap, first.x) : Math.max(sGap, first.x);
        pts.push({ x: gx, y: r.sy }, { x: gx, y: first.y });
      }
      pts.push(...mid);
      if (Math.abs(r.ty - last.y) > 0.5) {
        const gx = forward ? Math.max(dGap, last.x) : Math.min(dGap, last.x);
        pts.push({ x: gx, y: last.y }, { x: gx, y: r.ty });
      }
    }
    pts.push({ x: dx, y: r.ty });
    out.set(r.e.id, pts.map((p) => T(p, flip)));
  }
  return out;
}

/** 折线点 → 平滑路径（经过首尾点，中间点作为二次贝塞尔的控制点）。 */
export function edgePath(points: Point[]): string {
  if (points.length < 2) return '';
  const f = (n: number) => Math.round(n * 10) / 10;
  if (points.length === 2) return `M${f(points[0]!.x)},${f(points[0]!.y)} L${f(points[1]!.x)},${f(points[1]!.y)}`;
  let d = `M${f(points[0]!.x)},${f(points[0]!.y)}`;
  for (let i = 1; i < points.length - 1; i++) {
    const p = points[i]!;
    const n = points[i + 1]!;
    const mid = i === points.length - 2 ? n : { x: (p.x + n.x) / 2, y: (p.y + n.y) / 2 };
    d += ` Q${f(p.x)},${f(p.y)} ${f(mid.x)},${f(mid.y)}`;
  }
  return d;
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
