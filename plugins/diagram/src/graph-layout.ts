import { sampleRoute } from './geometry.ts';
export { sampleRoute } from './geometry.ts';
/**
 * 架构图 / 状态机的布局（D69）：ELK layered + 层级处理（hierarchyHandling = INCLUDE_CHILDREN），正交走线。
 *
 * 可读性修复（D69 补充，用户看了 v2 的效果：“几乎看不到谁调用了谁”）：
 * - 比例适应舞台：同时试几种候选（方向 right / down × 是否压缩层次），取外框比例最接近目标（舞台）比例的一种；
 *   作者写了 direction 时只在这个方向里选。ELK 在层级图里不支持“分组各自的方向”和图换行，所以靠这两个杠杆：
 *   - 方向；
 *   - 压缩层次：节点有多个上游时，把它推到最深处的那条次要连线（优先 async）在分层时反向，图变浅、变宽。
 * - 连线可读：端口沿节点边均匀分散，平行连线之间至少 16px；上→下时标签不占层，布局后贴在自己的线段中部（带底色）。
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

/** 一种布局候选：方向、是否压缩层次、标签是否作为占位参与 ELK 分层。 */
export type LayoutVariant = { direction: 'right' | 'down'; compact: boolean; labelsInLayout: boolean };
/**
 * 布局目标（由 attachLayouts 按页面设备与 h / aspect 算出）：外框的宽高比；知道放图的区域大小时同时给 width / height，
 * 候选按“放进这个区域后的缩放比例”比较（缩放越大，舞台上的字越大）。
 */
export type LayoutGoal = { aspect: number; width?: number; height?: number };
/** 电脑舞台的目标比例：1280 × 800 的舞台留出四周边距后约 1232 × 756。 */
export const DEFAULT_ASPECT = 1232 / 756;

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
/** 不参与分层的连线用到的看不见的点（D69 补充），以及它的两段连线的后缀。 */
const VIA = '__via:';
const VIA_A = '#a';
const VIA_B = '#b';

/**
 * 根图的 ELK 选项。间距宁可宽松也不挤：平行连线之间 ≥ 16px、端口沿节点边均匀分散，
 * 整图缩小到舞台上时仍能分清每一条线（D69 补充）。
 */
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
    'elk.layered.mergeEdges': 'false',
    // 上→下：同层（横向）间距放宽、层间（纵向）间距收紧，让图更接近横向舞台的比例
    'elk.spacing.nodeNode': direction === 'down' ? '56' : '32',
    'elk.layered.spacing.nodeNodeBetweenLayers': direction === 'down' ? '48' : '48',
    'elk.spacing.edgeNode': '18',
    'elk.spacing.edgeEdge': '16',
    'elk.spacing.portPort': '18',
    'elk.portAlignment.default': 'DISTRIBUTED',
    'elk.layered.spacing.edgeNodeBetweenLayers': '18',
    'elk.layered.spacing.edgeEdgeBetweenLayers': '16',
    'elk.spacing.edgeLabel': '4',
    'elk.spacing.componentComponent': '40',
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

/** 按“有效方向”（回边已反向）算最长路径层次；有环时返回 null。 */
function ranksOf(nodes: string[], edges: [string, string][]): Map<string, number> | null {
  const indeg = new Map(nodes.map((n) => [n, 0]));
  const out = new Map<string, string[]>();
  for (const [a, b] of edges) {
    out.set(a, [...(out.get(a) ?? []), b]);
    indeg.set(b, (indeg.get(b) ?? 0) + 1);
  }
  const rank = new Map(nodes.map((n) => [n, 0]));
  const queue = nodes.filter((n) => !indeg.get(n));
  let seen = 0;
  while (queue.length) {
    const v = queue.shift()!;
    seen++;
    for (const w of out.get(v) ?? []) {
      rank.set(w, Math.max(rank.get(w)!, rank.get(v)! + 1));
      indeg.set(w, indeg.get(w)! - 1);
      if (!indeg.get(w)) queue.push(w);
    }
  }
  return seen === nodes.length ? rank : null;
}

/**
 * 压缩层次（D69 补充）：ELK 的层级布局按容器逐层排——在每个容器（整张图或一个分组）里，子节点和子分组各是一个单元，
 * 跨单元的连线“提升”成单元之间的连线。某个单元有多个上游时，它的层次由最深的上游决定；让那条连线“不参与分层”
 * （相当于 Graphviz 的 constraint=false，做法见 toElk），单元就能和较浅的上游并排，整张图变浅、变宽
 * （例如“计费”与“大脑”并排在“控制面”下面）。只放开“还有别的入边”的连线（不让单元变成孤立的起点），
 * 优先 async 连线、其次写在后面的；每次只在这一层真的变浅时接受。返回这些连线的 id。
 */
export function compactReversals(s: GraphStructure, base: Set<string>): Set<string> {
  const parentOf = new Map<string, string | null>([...s.nodes.map((n) => [n.id, n.parent] as const), ...s.groups.map((g) => [g.id, g.parent] as const)]);
  /** 从自己到最外层的祖先链（含自己），最后是 null（整张图）。 */
  const chain = (id: string): (string | null)[] => {
    const out: (string | null)[] = [id];
    const seen = new Set([id]);
    for (let q = parentOf.get(id) ?? null; q && !seen.has(q); q = parentOf.get(q) ?? null) {
      seen.add(q);
      out.push(q);
    }
    out.push(null);
    return out;
  };
  const known = new Set(parentOf.keys());
  const order = new Map(s.edges.map((e, i) => [e.id, i]));
  // 每条连线归到两端的最近公共容器，提升成那一层两个子单元之间的连线
  type Lifted = { e: GEdge; u: string; v: string };
  const levels = new Map<string | null, Lifted[]>();
  for (const e of s.edges) {
    if (!known.has(e.from) || !known.has(e.to) || e.from === e.to) continue;
    const cu = chain(e.from);
    const cv = chain(e.to);
    const lca = cu.find((c) => c !== cu[0] && cv.includes(c) && c !== cv[0]);
    if (lca === undefined) continue;
    const u = cu[cu.indexOf(lca) - 1];
    const v = cv[cv.indexOf(lca) - 1];
    if (u === undefined || v === undefined || u === null || v === null || u === v) continue;
    levels.set(lca, [...(levels.get(lca) ?? []), { e, u, v }]);
  }
  const rev = new Set<string>();
  for (const lifted of levels.values()) {
    const units = [...new Set(lifted.flatMap((l) => [l.u, l.v]))];
    const eff = (l: Lifted): [string, string] => (base.has(l.e.id) ? [l.v, l.u] : [l.u, l.v]);
    /** 参与分层的连线（放开的不算）。 */
    const active = () => lifted.filter((l) => !rev.has(l.e.id)).map(eff);
    for (let iter = 0; iter < 8; iter++) {
      const ranks = ranksOf(units, active());
      if (!ranks) break;
      const depth = Math.max(0, ...ranks.values());
      let best: { l: Lifted; depth: number; sum: number } | null = null;
      const candidates = lifted
        .filter((l) => {
          const [u, v] = eff(l);
          if (ranks.get(v)! !== ranks.get(u)! + 1) return false;
          if (rev.has(l.e.id)) return false;
          return lifted.some((o) => o.e.id !== l.e.id && !rev.has(o.e.id) && eff(o)[1] === v && ranks.get(eff(o)[0])! + 1 < ranks.get(v)!);
        })
        .sort((a, b) => Number(!!b.e.async) - Number(!!a.e.async) || order.get(b.e.id)! - order.get(a.e.id)!);
      for (const l of candidates) {
        rev.add(l.e.id);
        const r = ranksOf(units, active());
        rev.delete(l.e.id);
        if (!r) continue;
        const d = Math.max(0, ...r.values());
        const sum = [...r.values()].reduce((x, y) => x + y, 0);
        if (d < depth && (!best || d < best.depth || (d === best.depth && sum < best.sum))) best = { l, depth: d, sum };
      }
      if (!best) break;
      rev.add(best.l.e.id);
    }
  }
  return rev;
}

/** 结构 → ELK JSON。连线放在根上（edgeCoords = ROOT，ELK 自己找最近的公共祖先）。 */
export function toElk(s: GraphStructure, variant: LayoutVariant = { direction: s.direction === 'down' ? 'down' : 'right', compact: false, labelsInLayout: true }): { graph: ElkNode; reversed: Set<string> } {
  const reversed = feedbackEdges(s);
  const free = variant.compact ? compactReversals(s, reversed) : new Set<string>();
  const elkNode = new Map<string, ElkNode>();
  const root: ElkNode = { id: '__root', layoutOptions: rootOptions(variant.direction), children: [], edges: [] };
  // 间距类选项不会从根图继承到分组里：每个分组复制一份，组内的层间距同样放得下贴在线上的标签
  const spacing = Object.fromEntries(Object.entries(rootOptions(variant.direction)).filter(([k]) => k.startsWith('elk.spacing.') || k.startsWith('elk.layered.spacing.') || k === 'elk.portAlignment.default'));
  const groupNode = (g: GraphStructure['groups'][number]): ElkNode => ({
    id: g.id,
    children: [],
    layoutOptions: {
      ...spacing,
      // 组内略紧：层间 30px 仍放得下 18px 高、贴在线上的标签（四周各留 3px）
      ...(variant.direction === 'down' ? { 'elk.layered.spacing.nodeNodeBetweenLayers': '30', 'elk.spacing.nodeNode': '40', 'elk.layered.spacing.edgeNodeBetweenLayers': '12' } : {}),
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
  const parentOfAny = new Map<string, string | null>([...s.nodes.map((n) => [n.id, n.parent] as const), ...s.groups.map((g) => [g.id, g.parent] as const)]);
  const ancestors = (id: string): (string | null)[] => {
    const out: (string | null)[] = [];
    for (let q = parentOfAny.get(id) ?? null; q; q = parentOfAny.get(q) ?? null) out.push(q);
    return [...out, null];
  };
  for (const e of s.edges) {
    if (!known.has(e.from) || !known.has(e.to)) continue; // 编译期已报 UNKNOWN_DIAGRAM_NODE
    if (free.has(e.id)) {
      // 不参与分层的连线：from → X、to → X 两段，X 是两端最近公共容器里的一个看不见的点（在两端之后的层）。
      // 分层时 from 和 to 互不约束；走线仍由 ELK 完成，布局后拼成一条 from … X … to 的折线（layoutVariant）
      const lca = ancestors(e.from).find((c) => ancestors(e.to).includes(c)) ?? null;
      const via: ElkNode = { id: `${VIA}${e.id}`, width: 1, height: 1 };
      parentFor(lca).children!.push(via);
      root.edges!.push({ id: `${VIA}${e.id}${VIA_A}`, sources: [e.from], targets: [via.id] }, { id: `${VIA}${e.id}${VIA_B}`, sources: [e.to], targets: [via.id] });
      continue;
    }
    const rev = reversed.has(e.id);
    root.edges!.push({
      id: e.id,
      sources: [rev ? e.to : e.from],
      targets: [rev ? e.from : e.to],
      ...(e.label && variant.labelsInLayout ? { labels: [{ text: e.label, width: e.lw, height: e.lh, layoutOptions: { 'elk.edgeLabels.inline': 'true' } }] } : {}),
    });
  }
  return { graph: root, reversed };
}

/**
 * 布局：结构 → 坐标（ELK），再整理成 IR 用的 GraphLayout。
 * 作者写了方向时只在这个方向里选；没写（auto）时 right、down 都试。每个方向再试“压缩层次”与否，
 * 取“放进舞台后缩放比例最大”（字最大）的一种，比例偏差、交叉、压缩略扣分。结果确定。
 */
export function layoutGraph(s: GraphStructure, run: ElkRun, goal: LayoutGoal = { aspect: DEFAULT_ASPECT }): GraphLayout {
  if (!s.nodes.length && !s.groups.length) return { kind: 'graph', engine: 'elk', width: 0, height: 0, nodes: {}, groups: {}, titles: {}, edges: {} };
  const dirs: ('right' | 'down')[] = s.direction === 'auto' ? ['down', 'right'] : [s.direction];
  const target = Math.max(0.2, Math.min(8, goal.aspect || DEFAULT_ASPECT));
  // 放图区域：给了就用；没给按目标比例取一个 1200 宽的区域（只用来比较候选，不影响坐标）
  const areaW = goal.width ?? 1200;
  const areaH = goal.height ?? areaW / target;
  let best: { l: GraphLayout; score: number } | null = null;
  for (const direction of dirs) {
    const base = feedbackEdges(s);
    const canCompact = compactReversals(s, base).size > 0;
    for (const compact of canCompact ? [false, true] : [false]) {
      // 上→下时标签不占层（标签很矮，放在层与层之间的竖线上就够），左→右时标签占位（标签很宽，需要横向空间）
      const l = layoutVariant(s, run, { direction, compact, labelsInLayout: direction === 'right' });
      // 读得清最重要：整图放进区域后的缩放比例越大越好（取对数，与比例偏差同量纲）；交叉多、压缩略扣分
      const fit = Math.min(1, areaW / Math.max(1, l.width), areaH / Math.max(1, l.height));
      const score = -Math.log(fit) + 0.25 * Math.abs(Math.log(Math.max(1, l.width) / Math.max(1, l.height) / target)) + 0.03 * crossings(l) + (compact ? 0.04 : 0);
      if (!best || score < best.score - 1e-9) best = { l, score };
    }
  }
  return best!.l;
}

/** 两条连线（正交折线）之间的交叉数。 */
export function crossings(l: Pick<GraphLayout, 'edges'>): number {
  const segs = Object.entries(l.edges).flatMap(([id, e]) => e.points.slice(1).map((p, i) => ({ id, a: e.points[i]!, b: p })));
  let n = 0;
  for (let i = 0; i < segs.length; i++)
    for (let j = i + 1; j < segs.length; j++) {
      const s1 = segs[i]!;
      const s2 = segs[j]!;
      if (s1.id === s2.id) continue;
      const h1 = s1.a.y === s1.b.y;
      const h2 = s2.a.y === s2.b.y;
      if (h1 === h2) continue;
      const [h, v] = h1 ? [s1, s2] : [s2, s1];
      const x0 = Math.min(h.a.x, h.b.x);
      const x1 = Math.max(h.a.x, h.b.x);
      const y0 = Math.min(v.a.y, v.b.y);
      const y1 = Math.max(v.a.y, v.b.y);
      if (v.a.x > x0 + 0.5 && v.a.x < x1 - 0.5 && h.a.y > y0 + 0.5 && h.a.y < y1 - 0.5) n++;
    }
  return n;
}

/** 一种候选的完整布局。 */
export function layoutVariant(s: GraphStructure, run: ElkRun, variant: LayoutVariant): GraphLayout {
  const { graph, reversed } = toElk(s, variant);
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
      else if (!c.id.startsWith(VIA)) nodes[c.id] = b;
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
  // 拼回不参与分层的连线：from → X 加上 (to → X) 反过来；去掉共线的中间点
  for (const id of Object.keys(edges)) {
    if (!id.startsWith(VIA) || !id.endsWith(VIA_A)) continue;
    const eid = id.slice(VIA.length, -VIA_A.length);
    const a = edges[id]!.points;
    const b = edges[`${VIA}${eid}${VIA_B}`]?.points ?? [];
    delete edges[id];
    delete edges[`${VIA}${eid}${VIA_B}`];
    edges[eid] = { points: simplify([...a, ...[...b].reverse()]), label: null };
  }
  const freeLabels = !variant.labelsInLayout ? null : new Set(s.edges.filter((e) => e.label && edges[e.id] && !edges[e.id]!.label).map((e) => e.id));
  if (!variant.labelsInLayout || freeLabels?.size) {
    // 标签贴在自己的线段中部：避开节点、分组标题条和已放好的标签（D69 补充）
    const heads = Object.values(groups).map((g) => ({ x: g.x, y: g.y, w: g.w, h: GROUP_HEAD }));
    const placed = placeLabels(s.edges.filter((e) => e.label && edges[e.id] && (!freeLabels || freeLabels.has(e.id))), edges, [...Object.values(nodes), ...heads, ...Object.values(edges).flatMap((x) => (x.label ? [x.label] : []))]);
    for (const [id, box] of placed) edges[id]!.label = box;
  }
  return finish(s, { nodes, groups, edges, starts }, variant.direction);
}

/** 去掉重复点和共线的中间点。 */
function simplify(points: Point[]): Point[] {
  const out: Point[] = [];
  for (const p of points) {
    const last = out[out.length - 1];
    if (last && Math.abs(last.x - p.x) < 0.01 && Math.abs(last.y - p.y) < 0.01) continue;
    out.push({ ...p });
    while (out.length >= 3) {
      const [a, b, c] = out.slice(-3) as [Point, Point, Point];
      const collinear = (Math.abs(a.x - b.x) < 0.01 && Math.abs(b.x - c.x) < 0.01) || (Math.abs(a.y - b.y) < 0.01 && Math.abs(b.y - c.y) < 0.01);
      if (!collinear) break;
      out.splice(out.length - 2, 1);
    }
  }
  return out;
}

const overlapArea = (a: Box, b: Box) => Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
const inflate = (b: Box, m: number): Box => ({ x: b.x - m, y: b.y - m, w: b.w + 2 * m, h: b.h + 2 * m });

/** 折线上按长度比例 t 处的点与这一段的方向。 */
function pointOn(points: Point[], t: number): { p: Point; horizontal: boolean } {
  const segs = points.slice(1).map((q, i) => Math.hypot(q.x - points[i]!.x, q.y - points[i]!.y));
  const total = segs.reduce((a, b) => a + b, 0);
  let d = total * t;
  for (let i = 0; i < segs.length; i++) {
    if (d <= segs[i]! || i === segs.length - 1) {
      const a = points[i]!;
      const b = points[i + 1]!;
      const k = segs[i]! ? Math.min(1, d / segs[i]!) : 0;
      return { p: { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k }, horizontal: Math.abs(b.y - a.y) < Math.abs(b.x - a.x) };
    }
    d -= segs[i]!;
  }
  return { p: points[0]!, horizontal: true };
}

/**
 * 标签贴在自己的线上：从折线中点出发沿线向两侧找位置（先压在线上，再贴在线的两侧），标签框不与节点、分组标题条、
 * 已放好的标签重叠，尽量不压别的连线；都不行时取代价最小的位置。按源码顺序放，结果确定。
 */
export function placeLabels(list: GEdge[], routes: GraphLayout['edges'], obstacles: Box[]): Map<string, Box> {
  const out = new Map<string, Box>();
  const taken: Box[] = [];
  const samplesOf = new Map(Object.entries(routes).map(([id, e]) => [id, sampleRoute(e.points)]));
  const ts = [0.5];
  for (let k = 1; k <= 18; k++) ts.push(0.5 - k * 0.025, 0.5 + k * 0.025);
  for (const e of list) {
    const pts = routes[e.id]?.points;
    if (!pts || pts.length < 2 || !e.label) continue;
    const others = [...samplesOf].filter(([id]) => id !== e.id).flatMap(([, ps]) => ps);
    const own = samplesOf.get(e.id) ?? [];
    let best: { box: Box; cost: number } | null = null;
    for (const off of [0, -1, 1]) {
      for (const t of ts) {
        const { p, horizontal } = pointOn(pts, t);
        // 在线上（off = 0）或贴在线的一侧：竖线时左右挪半个标签宽，横线时上下挪半个标签高
        const c = horizontal ? { x: p.x, y: p.y + off * (e.lh / 2 + 2) } : { x: p.x + off * (e.lw / 2 + 3), y: p.y };
        const box = { x: c.x - e.lw / 2, y: c.y - e.lh / 2, w: e.lw, h: e.lh };
        const lines = others.reduce((a, q) => a + (q.x > box.x - 1 && q.x < box.x + box.w + 1 && q.y > box.y - 1 && q.y < box.y + box.h + 1 ? 4 : 0), 0);
        // 短线上压着标签会把线和箭头整段盖住：按标签盖住自己这条线的比例扣分，短线时标签改贴在线旁边
        const covered = own.length ? own.filter((q) => q.x > box.x - 1 && q.x < box.x + box.w + 1 && q.y > box.y - 1 && q.y < box.y + box.h + 1).length / own.length : 0;
        const cost =
          obstacles.reduce((a, o) => a + overlapArea(box, inflate(o, 3)), 0) * 10 +
          taken.reduce((a, o) => a + overlapArea(box, inflate(o, 3)) * 20, 0) +
          lines +
          Math.max(0, covered - 0.25) * 80 +
          Math.abs(t - 0.5) * 40 +
          Math.abs(off) * 6;
        if (!best || cost < best.cost) best = { box, cost };
      }
    }
    if (best) {
      out.set(e.id, best.box);
      taken.push(best.box);
    }
  }
  return out;
}

/** 平移到 (M, M)、取 0.5px，放分组标题。 */
function finish(s: GraphStructure, l: { nodes: Record<string, Box>; groups: Record<string, Box>; edges: GraphLayout['edges']; starts: Record<string, Box> }, direction?: 'right' | 'down'): GraphLayout {
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
    ...(direction ? { direction } : {}),
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
