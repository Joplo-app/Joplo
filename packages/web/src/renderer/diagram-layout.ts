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
  /** 分组标题所在的矩形（连线和连线标签都避开它）。 */
  titles: Record<string, Box>;
};

/** 分组框顶部标题所占的高度。 */
export const GROUP_LABEL_H = 18;
const GROUP_PAD = 8;
/** 分组标题字号。 */
export const GROUP_FONT = 12;
/** 节点主标签与 description 的字号；整图缩放不低于 MIN_SCALE，保证实际字号不小于 12px / 10px。 */
export const NODE_FONT = 14;
export const DESC_FONT = 12;
export const EDGE_FONT = 12;
export const MIN_SCALE = 12 / NODE_FONT;

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

export function layoutDiagram(s: DStructure): DLayout {
  const empty: DLayout = { width: 0, height: 0, nodes: {}, groups: {}, edges: {}, titles: {} };
  if (s.nodes.length === 0) return empty;
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
  const ranksep = Math.min(64, Math.max(32, maxLabel * 0.35)) + (down ? head + pad : 2 * pad);
  const nodesep = 20 + (down ? 2 * pad : head + pad);
  g.setGraph({ rankdir: down ? 'TB' : 'LR', nodesep, ranksep, edgesep: 14, marginx: 0, marginy: 0 });
  g.setDefaultEdgeLabel(() => ({}));
  const known = new Set(s.nodes.map((n) => n.id));
  for (const gr of s.groups) g.setNode(gr.id, { label: gr.label, paddingTop: GROUP_LABEL_H });
  for (const gr of s.groups) if (gr.parent) g.setParent(gr.id, gr.parent);
  for (const n of s.nodes) {
    g.setNode(n.id, { width: n.w, height: n.h });
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

  const edges: DLayout['edges'] = {};
  const flip = s.direction === 'down';
  const raws = new Map<string, Point[]>();
  for (const e of s.edges) {
    if (!known.has(e.from) || !known.has(e.to)) continue;
    const rev = reversed.has(e.id);
    const v = g.edge({ v: rev ? e.to : e.from, w: rev ? e.from : e.to, name: e.id }) as { points?: Point[] } | undefined;
    const pts = (v?.points ?? []).map((pt) => ({ x: pt.x, y: pt.y }));
    raws.set(e.id, rev ? pts.reverse() : pts);
  }
  const routed = routeEdges(s.edges.filter((e) => raws.has(e.id)), raws, nodes, flip, Object.values(groups));
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

const T = (p: Point, flip: boolean): Point => (flip ? { x: p.y, y: p.x } : p);
const TB = (b: Box, flip: boolean): Box => (flip ? { x: b.y, y: b.x, w: b.h, h: b.w } : b);

/**
 * 连线的首末两段。dagre 给出的是从节点中心指向第一个 / 最后一个中间点的斜线，可能擦过同一列的其他节点，
 * 多条线还会挤在同一个出口上。这里改成“横出横进”（down 方向交换坐标轴处理）：
 * - 每个节点的每一侧，按另一端的位置排序，把出入口均匀分布在这一侧（只有一条线时取最近的点）；
 * - 需要转弯的线在列间空隙里转弯，每条线占一条通道：从列外缘向外找第一个与其他通道相距 ≥ 8px、且不穿过节点的位置；
 * - dagre 的中间点（绕开节点的路由）原样保留。
 */
export function routeEdges(list: DEdge[], raws: Map<string, Point[]>, nodeBoxes: Record<string, Box>, flip: boolean, groupBoxes: Box[] = []): Map<string, Point[]> {
  const boxes: Record<string, Box> = Object.fromEntries(Object.entries(nodeBoxes).map(([k, b]) => [k, TB(b, flip)]));
  const all = Object.values(boxes);
  const cx = (b: Box) => b.x + b.w / 2;
  const cy = (b: Box) => b.y + b.h / 2;
  const column = (b: Box) => all.filter((o) => Math.abs(cx(o) - cx(b)) < 1);
  const clampY = (y: number, b: Box) => Math.max(b.y + 10, Math.min(b.y + b.h - 10, y));
  type R = { e: DEdge; S: Box; D: Box; mid: Point[]; forward: boolean; wantS: number; wantT: number; sy: number; ty: number };
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
    rs.push({ e, S, D, mid, forward, wantS, wantT, sy: 0, ty: 0 });
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
  // 转弯通道：同一列同一侧需要转弯的线各占一条竖直通道（往返连线因此分开）。
  type L = { r: R; end: 's' | 't'; y: number; near: number };
  const lanes = new Map<string, { edge: number; dir: 1 | -1; list: L[] }>();
  // 列的外缘：节点外缘；紧贴着的分组边框（含标题留白）也算进去，线先出分组再转弯，不在分组标题那条留白里走
  const gbs = groupBoxes.map((b) => TB(b, flip));
  const colRight = (b: Box) => {
    let e = Math.max(...column(b).map((o) => o.x + o.w));
    for (const g of [...gbs].sort((a, c) => a.x + a.w - (c.x + c.w))) if (g.x + g.w >= e && g.x + g.w - e < 48 && column(b).some((o) => o.x >= g.x && o.x + o.w <= g.x + g.w && o.y >= g.y && o.y + o.h <= g.y + g.h)) e = g.x + g.w;
    return e;
  };
  const colLeft = (b: Box) => {
    let e = Math.min(...column(b).map((o) => o.x));
    for (const g of [...gbs].sort((a, c) => c.x - a.x)) if (g.x <= e && e - g.x < 48 && column(b).some((o) => o.x >= g.x && o.x + o.w <= g.x + g.w && o.y >= g.y && o.y + o.h <= g.y + g.h)) e = g.x;
    return e;
  };
  const addLane = (box: Box, side: 'R' | 'L', l: L) => {
    const k = `${cx(box)}:${side}`;
    const cur = lanes.get(k) ?? { edge: side === 'R' ? colRight(box) : colLeft(box), dir: side === 'R' ? (1 as const) : (-1 as const), list: [] };
    cur.list.push(l);
    lanes.set(k, cur);
  };
  for (const r of rs) {
    const first = r.mid[0];
    const last = r.mid[r.mid.length - 1];
    const sideS = r.forward ? 'R' : 'L';
    const sideD = r.forward ? 'L' : 'R';
    if (first && last) {
      if (Math.abs(r.sy - first.y) > 0.5) addLane(r.S, sideS, { r, end: 's', y: r.sy, near: first.x });
      if (Math.abs(r.ty - last.y) > 0.5) addLane(r.D, sideD, { r, end: 't', y: r.ty, near: last.x });
    } else if (Math.abs(r.sy - r.ty) > 0.5) addLane(r.D, sideD, { r, end: 't', y: r.ty, near: r.forward ? colRight(r.S) : colLeft(r.S) });
  }
  // 每个缺口里按出入口的位置依次找通道：从列外缘 + 6px 起每次外移 9px，取第一个
  // ① 与本缺口里已占用、竖直范围有重叠的通道相距 ≥ 8px，② 竖直段和连到路由点的那一小段都不穿过节点。
  const laneX = new Map<string, number>(); // `${edge id}:s|t` → x
  const hitsNode = (x0: number, y0: number, x1: number, y1: number) =>
    all.some((b) => Math.max(x0, x1) > b.x - 2 && Math.min(x0, x1) < b.x + b.w + 2 && Math.max(y0, y1) > b.y - 2 && Math.min(y0, y1) < b.y + b.h + 2);
  for (const { edge, dir, list } of lanes.values()) {
    list.sort((a, b) => a.y - b.y);
    const used: { x: number; y0: number; y1: number }[] = [];
    for (const l of list) {
      const other = l.end === 's' ? (l.r.mid[0]?.y ?? l.r.ty) : (l.r.mid[l.r.mid.length - 1]?.y ?? l.r.sy);
      const y0 = Math.min(l.y, other);
      const y1 = Math.max(l.y, other);
      let chosen = edge + dir * 6;
      for (let k = 0; k < 40; k++) {
        const x = edge + dir * (6 + k * 9);
        if (used.some((u) => Math.abs(u.x - x) < 8 && u.y1 > y0 - 3 && u.y0 < y1 + 3)) continue;
        if (hitsNode(x, y0 + 1, x, y1 - 1)) continue;
        if (l.r.mid.length && hitsNode(x, other, l.near, other)) continue;
        chosen = x;
        break;
      }
      used.push({ x: chosen, y0, y1 });
      laneX.set(`${l.r.e.id}:${l.end}`, chosen);
    }
  }
  for (const r of rs) {
    const { S, D, mid, forward } = r;
    const sx = forward ? S.x + S.w : S.x;
    const dx = forward ? D.x : D.x + D.w;
    const sGap = laneX.get(`${r.e.id}:s`) ?? 0;
    const dGap = laneX.get(`${r.e.id}:t`) ?? 0;
    const pts: Point[] = [{ x: sx, y: r.sy }];
    const first = mid[0];
    const last = mid[mid.length - 1];
    if (!first || !last) {
      if (Math.abs(r.sy - r.ty) > 0.5) pts.push({ x: dGap, y: r.sy }, { x: dGap, y: r.ty });
    } else {
      if (Math.abs(r.sy - first.y) > 0.5) {
        pts.push({ x: sGap, y: r.sy }, { x: sGap, y: first.y });
      }
      pts.push(...mid);
      if (Math.abs(r.ty - last.y) > 0.5) {
        pts.push({ x: dGap, y: last.y }, { x: dGap, y: r.ty });
      }
    }
    pts.push({ x: dx, y: r.ty });
    out.set(r.e.id, pts.map((p) => T(p, flip)));
  }
  return out;
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
 * 整图缩放：放进容器宽度与高度 h，但不小于 MIN_SCALE（节点主标签实际 ≥ 12px、description ≥ 10px）；
 * 也不放大。放不下时 scroll = true，Diagram 内部可以滚动或拖动平移。
 */
export function diagramScale(layout: Pick<DLayout, 'width' | 'height'>, availW: number, availH: number): { scale: number; scroll: boolean } {
  if (!layout.width || !availW) return { scale: 1, scroll: false };
  const fit = Math.min(1, (availW - 8) / layout.width, (availH - 8) / layout.height);
  return fit >= MIN_SCALE ? { scale: fit, scroll: false } : { scale: MIN_SCALE, scroll: true };
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
