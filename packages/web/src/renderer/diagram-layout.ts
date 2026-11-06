/**
 * 关系类图表（D41 / D69）在网页端的渲染辅助。布局不在这里算：编译期由 ELK（架构图、状态机）或纯函数（时序图）算好，
 * 写在 IR 的 SceneNode.layout 里；渲染器只读坐标、画图、做动画。发布站因此不带任何布局算法，
 * 同一张图在一个场景的所有步骤里坐标完全相同（D69 不变量 1）：镜头只平移缩放，不移动节点。
 *
 * - graphView：从 IR 节点取结构与布局（缺布局时退化为网格，只在旧 IR 或测试里出现）；
 * - diagramFocus / edgeEmphasized：镜头聚焦时哪些连线突出；
 * - effectiveState：显式 state 优先，否则用 trace 推算的状态；machineStates：状态机的当前状态与本步走过的转换；
 * - edgePath / arrowHead / pointAt：折线 → SVG 路径。
 */
import { GROUP_FONT, DESC_FONT, EDGE_FONT, NODE_FONT, START, graphStructure, gridLayout, sampleRoute, sequenceStructure, layoutSequence, textWidth, type Box, type DiagramStates, type GraphLayout, type GraphStructure, type Point, type SceneNode, type SequenceLayout, type SequenceStructure } from '@joplo-app/core';

export { GROUP_FONT, DESC_FONT, EDGE_FONT, NODE_FONT, START, sampleRoute, textWidth };
export type { Box, Point, GraphLayout, SequenceLayout };

/** 结构 + 编译期布局。 */
export function graphView(node: SceneNode): { structure: GraphStructure; layout: GraphLayout } {
  const structure = graphStructure(node);
  const layout = node.layout?.kind === 'graph' ? node.layout : gridLayout(structure);
  return { structure, layout };
}

export function sequenceView(node: SceneNode): { structure: SequenceStructure; layout: SequenceLayout } {
  const structure = sequenceStructure(node);
  const layout = node.layout?.kind === 'sequence' ? node.layout : layoutSequence(structure);
  return { structure, layout };
}

/**
 * 镜头聚焦时图里的焦点：targets 里的节点、分组（展开成它的全部后代节点）与连线。
 * 返回 null 表示焦点不在这张图里（或焦点就是整张图），连线照常画。节点不会因此移动（D69 取代 D47 的聚焦布局）。
 */
export function diagramFocus(s: GraphStructure, targets: readonly string[] | null | undefined, diagramId?: string): { nodes: Set<string>; edges: Set<string> } | null {
  if (!targets?.length || (diagramId && targets.includes(diagramId))) return null;
  const parentOf = new Map(s.groups.map((g) => [g.id, g.parent]));
  const inGroup = (gid: string | null, target: string, seen = new Set<string>()): boolean => (gid && !seen.has(gid) ? gid === target || inGroup(parentOf.get(gid) ?? null, target, seen.add(gid)) : false);
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
 * 整图缩放：整图放进容器宽度与高度 h，不放大、不滚动。
 * 看不清的细节交给舞台统一的缩放平移（滚轮 / 捏合 / 拖动）和镜头推近，图内部没有第二套滚动与拖动。
 */
export function diagramFit(layout: Pick<GraphLayout, 'width' | 'height'>, availW: number, availH: number): { scale: number } {
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

/** 箭头：终点处的实心三角形（open = 空心折线箭头，时序图的异步消息与返回）。 */
export function arrowHead(points: Point[], size = 9, open = false): string {
  if (points.length < 2) return '';
  const p = points[points.length - 1]!;
  const q = points[points.length - 2]!;
  const len = Math.hypot(p.x - q.x, p.y - q.y) || 1;
  const ux = (p.x - q.x) / len;
  const uy = (p.y - q.y) / len;
  const bx = p.x - ux * size;
  const by = p.y - uy * size;
  const f = (n: number) => Math.round(n * 10) / 10;
  const l = `${f(bx - uy * size * 0.55)},${f(by + ux * size * 0.55)}`;
  const r = `${f(bx + uy * size * 0.55)},${f(by - ux * size * 0.55)}`;
  return open ? `M${l} L${f(p.x)},${f(p.y)} L${r}` : `M${f(p.x)},${f(p.y)} L${l} L${r} Z`;
}

// ---------- 状态（D48 / D69） ----------
const D_STATES = new Set(['idle', 'active', 'ok', 'error', 'dim']);
/**
 * 节点 / 连线 / 分组实际显示的 state：作者显式写的 state（字面量或绑定解析后的值）优先；没写（undefined / null）时用 trace 推算的值；
 * 都没有是 idle。reverse 只在使用推算值时有意义（逆着连线方向走，小点逆向流动）。
 */
export function effectiveState(explicit: unknown, traced: DiagramStates | undefined, id: string): { state: string; reverse: boolean } {
  if (explicit !== undefined && explicit !== null) return { state: typeof explicit === 'string' && D_STATES.has(explicit) ? explicit : 'idle', reverse: false };
  const t = traced?.[id];
  return t ? { state: t.state, reverse: !!t.reverse } : { state: 'idle', reverse: false };
}

/**
 * 状态机（D69）：value 绑定的当前状态是 current；这一步 value 从 prev 变成当前值、并且有对应的转换时，这条转换 active（小点流动）。
 * 返回值与 trace 推算的状态合并（trace 优先）：渲染器把它当成“推算值”，显式 state 仍然优先。
 */
export function machineStates(s: GraphStructure, value: unknown, prev: unknown): { current: string | null; states: DiagramStates } {
  const cur = typeof value === 'string' && s.nodes.some((n) => n.id === value) ? value : null;
  const states: DiagramStates = {};
  if (cur && typeof prev === 'string' && prev !== cur) {
    const t = s.edges.find((e) => e.from === prev && e.to === cur);
    if (t) states[t.id] = { state: 'active' };
  }
  if (cur) states[cur] = { state: 'active' };
  return { current: cur, states };
}

/** 状态机起点圆点的连线 id。 */
export const startEdgeId = (stateId: string) => `${START}${stateId}`;

/** 两个盒子的交叠面积（测试与标题避让用）。 */
export const overlapArea = (a: Box, b: Box) => Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
