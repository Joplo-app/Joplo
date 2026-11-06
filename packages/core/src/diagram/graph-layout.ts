/**
 * 架构图 / 状态机的布局（D69）：ELK layered + 层级处理（hierarchyHandling = INCLUDE_CHILDREN），正交走线，标签进布局。
 *
 * 本文件是纯函数，ELK 由调用方注入（Node 入口 diagram/elk.ts 同步运行 elkjs）。流程：
 * 1. 结构 → ELK 图：节点尺寸来自 model.ts 的估算；分组是复合节点（顶部留出标题条）；连线标签带尺寸，ELK 为它们留位置。
 * 2. 回边（让图成环的连线，如“工具调用”回到 Biz Server、“回复”回到客户端）自己按源码顺序做 DFS 找出，
 *    交给 ELK 前先反向，布局后再把折线反回来：方向由作者的书写顺序决定，结果稳定、可预期。
 *    另外“指回上游所在分组”的连线也按回边处理，避免把一个分组拉成横跨整张图的长条。
 * 3. 布局结果平移到 (M, M)、坐标取 0.5px，分组标题沿顶部标题条找一个没有连线穿过的位置。
 *
 * 同一结构总是得到同一结果：ELK 的随机种子固定，输入按源码顺序，算法本身是确定的（测试覆盖）。
 */
import { GROUP_HEAD, GROUP_PAD, START, groupTitleWidth, type Box, type GEdge, type GraphLayout, type GraphStructure, type Point } from './model.ts';

/** ELK JSON 图（只用到的字段）。 */
export type ElkNode = {
  id: string;
  width?: number;
  height?: number;
  x?: number;
  y?: number;
  layoutOptions?: Record<string, string>;
  children?: ElkNode[];
  edges?: ElkEdge[];
  labels?: { text?: string; width: number; height: number; x?: number; y?: number }[];
};
export type ElkEdge = {
  id: string;
  sources: string[];
  targets: string[];
  labels?: { text?: string; width: number; height: number; x?: number; y?: number; layoutOptions?: Record<string, string> }[];
  sections?: { startPoint: Point; endPoint: Point; bendPoints?: Point[] }[];
};
/** 布局引擎：输入 ELK JSON，返回带坐标的同一张图（同步）。 */
export type ElkRun = (graph: ElkNode) => ElkNode;

const M = 12;
const r2 = (n: number) => Math.round(n * 2) / 2;

/** 根图的 ELK 选项。间距与 D61 的“节点之间留白”一致，宁可宽松也不挤。 */
export function rootOptions(direction: 'right' | 'down'): Record<string, string> {
  return {
    'elk.algorithm': 'layered',
    'elk.direction': direction === 'down' ? 'DOWN' : 'RIGHT',
    'elk.hierarchyHandling': 'INCLUDE_CHILDREN',
    'elk.edgeRouting': 'ORTHOGONAL',
    'elk.randomSeed': '1',
    'elk.layered.considerModelOrder.strategy': 'NODES_AND_EDGES',
    'elk.layered.cycleBreaking.strategy': 'MODEL_ORDER',
    'elk.layered.nodePlacement.strategy': 'NETWORK_SIMPLEX',
    'elk.layered.thoroughness': '20',
    'elk.spacing.nodeNode': '28',
    'elk.layered.spacing.nodeNodeBetweenLayers': '44',
    'elk.spacing.edgeNode': '14',
    'elk.spacing.edgeEdge': '10',
    'elk.layered.spacing.edgeNodeBetweenLayers': '14',
    'elk.layered.spacing.edgeEdgeBetweenLayers': '10',
    'elk.spacing.edgeLabel': '4',
    'elk.spacing.componentComponent': '36',
    'elk.edgeLabels.placement': 'CENTER',
    'elk.json.edgeCoords': 'ROOT',
    'elk.json.shapeCoords': 'ROOT',
    'elk.padding': `[top=${M},left=${M},bottom=${M},right=${M}]`,
  };
}

/**
 * 回边：按源码顺序做 DFS（先从没有入边的节点出发，pin="start" 的最先、pin="end" 的最后），指向栈上节点的连线是回边；
 * 再加上“指回上游所在分组”的连线（u → v，v 所在、不包含 u 的最外层分组里有别的成员能走到 u）。
 * 连到分组的连线不参与（交给 ELK 自己处理）。
 */
export function feedbackEdges(s: GraphStructure): Set<string> {
  const ids = new Set(s.nodes.map((n) => n.id));
  const order = new Map(s.nodes.map((n, i) => [n.id, i]));
  const pinOf = new Map(s.nodes.map((n) => [n.id, n.pin]));
  const plain = s.edges.filter((e) => ids.has(e.from) && ids.has(e.to) && e.from !== e.to);
  const out = new Map<string, GEdge[]>();
  const indeg = new Map<string, number>();
  for (const e of plain) {
    out.set(e.from, [...(out.get(e.from) ?? []), e]);
    indeg.set(e.to, (indeg.get(e.to) ?? 0) + 1);
  }
  const rank = (id: string) => (pinOf.get(id) === 'start' ? 0 : pinOf.get(id) === 'end' ? 2 : 1);
  const roots = [...s.nodes]
    .map((n) => n.id)
    .sort((a, b) => rank(a) - rank(b) || (indeg.get(a) ? 1 : 0) - (indeg.get(b) ? 1 : 0) || order.get(a)! - order.get(b)!);
  const back = new Set<string>();
  const state = new Map<string, 1 | 2>(); // 1 = 在栈上，2 = 完成
  const visit = (v: string) => {
    state.set(v, 1);
    for (const e of out.get(v) ?? []) {
      const st = state.get(e.to);
      if (st === 1 || pinOf.get(e.to) === 'start' || pinOf.get(v) === 'end') back.add(e.id);
      else if (!st) visit(e.to);
    }
    state.set(v, 2);
  };
  for (const r of roots) if (!state.has(r)) visit(r);

  // 指回上游所在分组的连线
  const parentOf = new Map(s.groups.map((g) => [g.id, g.parent]));
  const chain = (gid: string | null): string[] => (gid ? [gid, ...chain(parentOf.get(gid) ?? null)] : []);
  const groupsOf = new Map(s.nodes.map((n) => [n.id, chain(n.parent)]));
  const fwd = new Map<string, string[]>();
  for (const e of plain) if (!back.has(e.id)) fwd.set(e.from, [...(fwd.get(e.from) ?? []), e.to]);
  const reaches = (a: string, b: string, skip: GEdge): boolean => {
    const seen = new Set<string>([a]);
    const stack = [a];
    while (stack.length) {
      const x = stack.pop()!;
      if (x === b) return true;
      for (const y of fwd.get(x) ?? []) {
        if (seen.has(y) || (x === skip.from && y === skip.to)) continue;
        seen.add(y);
        stack.push(y);
      }
    }
    return false;
  };
  for (const e of plain) {
    if (back.has(e.id)) continue;
    const gu = new Set(groupsOf.get(e.from) ?? []);
    const outer = [...(groupsOf.get(e.to) ?? [])].reverse().find((g) => !gu.has(g));
    if (!outer) continue;
    const members = s.nodes.filter((n) => n.id !== e.to && (groupsOf.get(n.id) ?? []).includes(outer));
    if (members.some((m) => reaches(m.id, e.from, e))) back.add(e.id);
  }
  return back;
}

/** 结构 → ELK JSON。连线放在根上（edgeCoords = ROOT，ELK 自己找最近的公共祖先）。 */
export function toElk(s: GraphStructure): { graph: ElkNode; reversed: Set<string> } {
  const reversed = feedbackEdges(s);
  const elkNode = new Map<string, ElkNode>();
  const root: ElkNode = { id: '__root', layoutOptions: rootOptions(s.direction), children: [], edges: [] };
  const groupNode = (g: GraphStructure['groups'][number]): ElkNode => ({
    id: g.id,
    children: [],
    layoutOptions: {
      'elk.padding': `[top=${GROUP_HEAD + GROUP_PAD - 4},left=${GROUP_PAD},bottom=${GROUP_PAD},right=${GROUP_PAD}]`,
      // 标题要放得下：分组至少和标题一样宽
      'elk.nodeSize.constraints': 'MINIMUM_SIZE',
      'elk.nodeSize.minimum': `(${groupTitleWidth(g.label, !!g.icon) + 2 * GROUP_PAD}, ${GROUP_HEAD + 2 * GROUP_PAD})`,
      ...(g.pin ? { 'elk.layered.layering.layerConstraint': g.pin === 'start' ? 'FIRST' : 'LAST' } : {}),
    },
  });
  for (const g of s.groups) elkNode.set(g.id, groupNode(g));
  const parentFor = (pid: string | null) => (pid ? elkNode.get(pid) ?? root : root);
  for (const n of s.nodes) elkNode.set(n.id, { id: n.id, width: n.w, height: n.h, ...(n.pin ? { layoutOptions: { 'elk.layered.layering.layerConstraint': n.pin === 'start' ? 'FIRST' : 'LAST' } } : {}) });
  // 节点与分组按源码顺序挂到父分组下（ELK 的 considerModelOrder 用这个顺序排同层；父分组可能写在后面，先全部建好再挂）
  const items = [...s.groups.map((g) => ({ seq: g.seq, id: g.id, parent: g.parent, initial: false })), ...s.nodes.map((n) => ({ seq: n.seq, id: n.id, parent: n.parent, initial: !!n.initial }))].sort((a, b) => a.seq - b.seq);
  for (const it of items) {
    const kids = parentFor(it.parent).children!;
    if (it.initial) {
      // 状态机的起点：一个实心小圆点，连到初始状态
      const sid = `${START}${it.id}`;
      kids.push({ id: sid, width: 14, height: 14, layoutOptions: { 'elk.layered.layering.layerConstraint': 'FIRST' } });
      root.edges!.push({ id: sid, sources: [sid], targets: [it.id] });
    }
    kids.push(elkNode.get(it.id)!);
  }
  // 空分组：给一个占位尺寸（ELK 对没有子节点的复合节点按普通节点处理）
  for (const g of s.groups) {
    const en = elkNode.get(g.id)!;
    if (!en.children!.length) {
      en.width = groupTitleWidth(g.label, !!g.icon) + 2 * GROUP_PAD;
      en.height = GROUP_HEAD + 2 * GROUP_PAD + 20;
      delete en.children;
    }
  }
  const known = new Set([...s.nodes.map((n) => n.id), ...s.groups.map((g) => g.id)]);
  for (const e of s.edges) {
    if (!known.has(e.from) || !known.has(e.to)) continue; // 编译期已报 UNKNOWN_DIAGRAM_NODE
    const rev = reversed.has(e.id);
    root.edges!.push({
      id: e.id,
      sources: [rev ? e.to : e.from],
      targets: [rev ? e.from : e.to],
      ...(e.label ? { labels: [{ text: e.label, width: e.lw, height: e.lh, layoutOptions: { 'elk.edgeLabels.inline': 'true' } }] } : {}),
    });
  }
  return { graph: root, reversed };
}

/** 布局：结构 → 坐标（ELK），再整理成 IR 用的 GraphLayout。 */
export function layoutGraph(s: GraphStructure, run: ElkRun): GraphLayout {
  if (!s.nodes.length && !s.groups.length) return { kind: 'graph', engine: 'elk', width: 0, height: 0, nodes: {}, groups: {}, titles: {}, edges: {} };
  const { graph, reversed } = toElk(s);
  const res = run(graph);
  const nodes: Record<string, Box> = {};
  const groups: Record<string, Box> = {};
  const starts: Record<string, Box> = {};
  const gids = new Set(s.groups.map((g) => g.id));
  const walk = (n: ElkNode) => {
    for (const c of n.children ?? []) {
      const b = { x: c.x ?? 0, y: c.y ?? 0, w: c.width ?? 0, h: c.height ?? 0 };
      if (gids.has(c.id)) groups[c.id] = b;
      else if (c.id.startsWith(START)) starts[c.id.slice(START.length)] = b;
      else nodes[c.id] = b;
      walk(c);
    }
  };
  walk(res);
  const edges: GraphLayout['edges'] = {};
  const allEdges: ElkEdge[] = [];
  const collect = (n: ElkNode) => {
    allEdges.push(...(n.edges ?? []));
    for (const c of n.children ?? []) collect(c);
  };
  collect(res);
  for (const e of allEdges) {
    const pts: Point[] = [];
    for (const sec of e.sections ?? []) {
      for (const p of [sec.startPoint, ...(sec.bendPoints ?? []), sec.endPoint]) {
        const last = pts[pts.length - 1];
        if (!last || last.x !== p.x || last.y !== p.y) pts.push({ x: p.x, y: p.y });
      }
    }
    if (reversed.has(e.id)) pts.reverse();
    const l = e.labels?.[0];
    edges[e.id] = { points: pts, label: l && l.x !== undefined ? { x: l.x, y: l.y ?? 0, w: l.width, h: l.height } : null };
  }
  return finish(s, { nodes, groups, edges, starts });
}

/** 平移到 (M, M)、取 0.5px，放分组标题。 */
function finish(s: GraphStructure, l: { nodes: Record<string, Box>; groups: Record<string, Box>; edges: GraphLayout['edges']; starts: Record<string, Box> }): GraphLayout {
  const xs: number[] = [];
  const ys: number[] = [];
  const add = (b: Box) => {
    xs.push(b.x, b.x + b.w);
    ys.push(b.y, b.y + b.h);
  };
  [...Object.values(l.nodes), ...Object.values(l.groups), ...Object.values(l.starts)].forEach(add);
  for (const e of Object.values(l.edges)) {
    e.points.forEach((p) => add({ x: p.x, y: p.y, w: 0, h: 0 }));
    if (e.label) add(e.label);
  }
  if (!xs.length) return { kind: 'graph', engine: 'elk', width: 0, height: 0, nodes: {}, groups: {}, titles: {}, edges: {} };
  const dx = M - Math.min(...xs);
  const dy = M - Math.min(...ys);
  const mv = (b: Box): Box => ({ x: r2(b.x + dx), y: r2(b.y + dy), w: r2(b.w), h: r2(b.h) });
  const nodes = Object.fromEntries(Object.entries(l.nodes).map(([k, b]) => [k, mv(b)]));
  const groups = Object.fromEntries(Object.entries(l.groups).map(([k, b]) => [k, mv(b)]));
  const edges = Object.fromEntries(Object.entries(l.edges).map(([k, e]) => [k, { points: e.points.map((p) => ({ x: r2(p.x + dx), y: r2(p.y + dy) })), label: e.label ? mv(e.label) : null }]));
  const starts = Object.fromEntries(Object.entries(l.starts).map(([k, b]) => [k, mv(b)]));
  const titles = placeTitles(s, groups, edges);
  return {
    kind: 'graph',
    engine: 'elk',
    width: Math.ceil(Math.max(...xs) + dx + M),
    height: Math.ceil(Math.max(...ys) + dy + M),
    nodes,
    groups,
    titles,
    edges,
    ...(Object.keys(starts).length ? { starts } : {}),
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

/** 分组标题：在分组顶部标题条里，从左往右找一个没有连线穿过的位置；都有时取穿过最少的。 */
export function placeTitles(s: GraphStructure, groups: Record<string, Box>, edges: GraphLayout['edges']): Record<string, Box> {
  const samples = Object.values(edges).flatMap((e) => sampleRoute(e.points));
  const crossings = (b: Box) => samples.filter((p) => p.x > b.x - 2 && p.x < b.x + b.w + 2 && p.y > b.y - 2 && p.y < b.y + b.h + 2).length;
  const titles: Record<string, Box> = {};
  for (const g of s.groups) {
    const b = groups[g.id];
    if (!b || (!g.label && !g.icon)) continue;
    const w = Math.min(groupTitleWidth(g.label, !!g.icon), b.w - 8);
    let best: { box: Box; n: number } | null = null;
    for (let x = b.x + 6; x + w <= b.x + b.w - 4; x += 12) {
      const box = { x: r2(x), y: r2(b.y + 4), w, h: GROUP_HEAD - 6 };
      const n = crossings(box);
      if (!best || n < best.n) best = { box, n };
      if (n === 0) break;
    }
    titles[g.id] = best?.box ?? { x: r2(b.x + 6), y: r2(b.y + 4), w, h: GROUP_HEAD - 6 };
  }
  return titles;
}

/**
 * 没有布局引擎时的退化排列（测试、或绕过 server 直接调用 compile 的旧代码）：按源码顺序排成网格，分组包住成员。
 * 只保证不重叠、结果确定；正式产物（dev / build / check）都用 ELK。
 */
export function gridLayout(s: GraphStructure): GraphLayout {
  const cols = Math.max(1, Math.ceil(Math.sqrt(s.nodes.length)));
  const nodes: Record<string, Box> = {};
  s.nodes.forEach((n, i) => {
    nodes[n.id] = { x: M + (i % cols) * 240, y: M + 60 + Math.floor(i / cols) * 140, w: n.w, h: n.h };
  });
  const groups: Record<string, Box> = {};
  const boxOf = (gid: string, seen = new Set<string>()): Box | null => {
    if (groups[gid]) return groups[gid]!;
    if (seen.has(gid)) return null;
    seen.add(gid);
    const bs = [...s.nodes.filter((n) => n.parent === gid).map((n) => nodes[n.id]!), ...s.groups.filter((g) => g.parent === gid).map((g) => boxOf(g.id, seen)).filter((b): b is Box => !!b)];
    if (!bs.length) return null;
    const x0 = Math.min(...bs.map((b) => b.x)) - GROUP_PAD;
    const y0 = Math.min(...bs.map((b) => b.y)) - GROUP_PAD - GROUP_HEAD;
    const x1 = Math.max(...bs.map((b) => b.x + b.w)) + GROUP_PAD;
    const y1 = Math.max(...bs.map((b) => b.y + b.h)) + GROUP_PAD;
    return (groups[gid] = { x: x0, y: y0, w: x1 - x0, h: y1 - y0 });
  };
  for (const g of s.groups) boxOf(g.id);
  const center = (b: Box): Point => ({ x: b.x + b.w / 2, y: b.y + b.h / 2 });
  const edges: GraphLayout['edges'] = {};
  for (const e of s.edges) {
    const a = nodes[e.from] ?? groups[e.from];
    const b = nodes[e.to] ?? groups[e.to];
    if (a && b) edges[e.id] = { points: [center(a), center(b)], label: null };
  }
  const l = finish(s, { nodes, groups, edges, starts: {} });
  return { ...l, engine: 'grid' };
}
