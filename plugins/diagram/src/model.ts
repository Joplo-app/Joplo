/**
 * 关系类图表（D69）的结构与几何类型：架构图 Diagram、状态机 StateMachine、时序图 Sequence。
 *
 * - 结构只取**静态属性**（label / description / kind / group / pin…）：state、when 等绑定不参与，
 *   所以播放中状态与可见性变化不会改变结构，布局只算一次（一张图在所有步骤里坐标相同）。
 * - 布局在编译期算好写进 IR（SceneNode.layout），发布站和看板只负责渲染和动画，浏览器里不跑布局算法。
 * - 本文件不依赖 Node，可以被浏览器端（@joplo-app/web）引用；ELK 只在 Node 入口（diagram/elk.ts）里加载。
 */
import type { SceneNode } from '../../../packages/core/src/schema.ts';

export type Point = { x: number; y: number };
export type Box = { x: number; y: number; w: number; h: number };

/** 架构图与状态机共用的“图”布局（ELK layered + 层级处理，见 graph-layout.ts）。 */
export type GraphLayout = {
  kind: 'graph';
  /** elk = 编译期 ELK 布局；grid = 没有布局引擎时的退化排列（只在测试或旧调用方出现）。 */
  engine: 'elk' | 'grid';
  /** 实际采用的方向（作者没写 direction 时由比例决定，D69 补充）。 */
  direction?: 'right' | 'down';
  width: number;
  height: number;
  nodes: Record<string, Box>;
  groups: Record<string, Box>;
  /** 分组标题（图标 + 文字）所在的矩形，在分组框顶部的留白里。 */
  titles: Record<string, Box>;
  edges: Record<string, { points: Point[]; label: Box | null }>;
  /** 状态机的起点圆点：初始状态 id → 圆点盒子；指向初始状态的连线在 edges[`${START}${id}`]。 */
  starts?: Record<string, Box>;
};

/** 时序图布局（sequence-layout.ts，纯函数）。 */
export type SequenceLayout = {
  kind: 'sequence';
  width: number;
  height: number;
  /** 参与者头部盒子。 */
  actors: Record<string, Box>;
  /** 生命线：x 与上下端。 */
  lifelines: Record<string, { x: number; y1: number; y2: number }>;
  /** 消息：折线（自调用是回环），标签框，序号（从 1 起，按源码顺序）。 */
  messages: Record<string, { points: Point[]; label: Box | null; n: number; self: boolean }>;
  /** 参与者分组（业务域框）与它的标题。 */
  groups: Record<string, Box>;
  titles: Record<string, Box>;
  /** 片段（alt / opt / loop / par…）框与它左上角的标签。 */
  blocks: Record<string, Box>;
  blockTitles: Record<string, Box>;
};

export type DiagramLayout = GraphLayout | SequenceLayout;

/** 状态机起点圆点的 id 前缀（不会与作者 id 冲突：作者 id 只能以字母开头）。 */
export const START = '__start:';

// ---------- 组件家族 ----------
export type GraphRootType = 'diagram:Diagram' | 'diagram:StateMachine';
export const GRAPH_FAMILY = {
  'diagram:Diagram': { node: 'diagram:Diagram.Node', edge: 'diagram:Diagram.Edge', group: 'diagram:Diagram.Group' },
  'diagram:StateMachine': { node: 'diagram:StateMachine.State', edge: 'diagram:StateMachine.Transition', group: 'diagram:StateMachine.Group' },
} as const;
export const SEQUENCE_FAMILY = { root: 'diagram:Sequence', actor: 'diagram:Sequence.Actor', message: 'diagram:Sequence.Message', group: 'diagram:Sequence.Group', block: 'diagram:Sequence.Block' } as const;
/** 能被 trace 的图表根组件。 */
export const DIAGRAM_ROOTS = ['diagram:Diagram', 'diagram:StateMachine', 'diagram:Sequence'] as const;
export type DiagramRootType = (typeof DIAGRAM_ROOTS)[number];
export const isDiagramRoot = (t: string): t is DiagramRootType => (DIAGRAM_ROOTS as readonly string[]).includes(t);

/** 节点 / 参与者的 kind（决定图标与外形）。 */
export const DIAGRAM_NODE_KINDS = ['client', 'service', 'model', 'database', 'queue', 'storage', 'external', 'tool', 'user'] as const;
/** 分组图标（预设）：节点 kind 之外再加几种常用的“域”图标。 */
export const DIAGRAM_GROUP_ICONS = [...DIAGRAM_NODE_KINDS, 'cloud', 'gateway', 'lock', 'network', 'device', 'box', 'brain'] as const;
/** 分组色调：映射到主题变量（blue = --jp-info，green = --jp-ok，orange = --jp-warn，red = --jp-danger），其余为固定低饱和色。 */
export const DIAGRAM_TONES = ['gray', 'blue', 'green', 'orange', 'red', 'purple', 'teal'] as const;
export const DIAGRAM_PINS = ['start', 'end'] as const;
export const SEQUENCE_BLOCK_KINDS = ['alt', 'opt', 'loop', 'par', 'break', 'critical'] as const;

// ---------- 尺寸估算（编译期与浏览器共用，结果确定） ----------
/** 分组框顶部标题条的高度（图标 + 文字）与内边距。 */
export const GROUP_HEAD = 26;
export const GROUP_PAD = 12;
export const GROUP_FONT = 12;
export const NODE_FONT = 14;
export const DESC_FONT = 12;
export const EDGE_FONT = 12;
const NODE_MIN_W = 116;
const NODE_MAX_W = 196;

const isBinding = (v: unknown) => typeof v === 'string' && /^\$(ui|data|inputs)\b/.test(v);
export const staticText = (v: unknown): string => (typeof v === 'string' && !isBinding(v) ? v : typeof v === 'number' ? String(v) : '');

/** 粗略的文字宽度：中日韩字符按 1 个字号宽，其余按 0.58（与渲染字体无关，结果确定）。 */
export function textWidth(s: string, size: number): number {
  let w = 0;
  for (const ch of s) w += (ch.codePointAt(0) ?? 0) > 0x2e80 ? size : size * 0.58;
  return Math.ceil(w);
}

/** 架构图节点尺寸：只取决于静态的 label / description / kind。 */
export function nodeSize(label: string, description: string, kind: string): { w: number; h: number } {
  const icon = kind === 'database' || kind === 'queue' ? 0 : 26;
  const labelW = textWidth(label || ' ', NODE_FONT) + icon + 28;
  const descW = description ? textWidth(description, DESC_FONT) + 28 : 0;
  let w = Math.max(NODE_MIN_W, Math.min(NODE_MAX_W, Math.max(labelW, descW)));
  const descLines = description ? Math.min(2, Math.ceil(descW / w)) : 0;
  let h = 46 + descLines * 16;
  if (kind === 'database') h += 14; // 圆柱的上下盖
  if (kind === 'queue') w += 20; // 管道的左右端
  return { w, h };
}

/** 状态机的状态：圆角胶囊，文字居中；终态外圈再留 4px 画双线。 */
export function stateSize(label: string, description: string, final: boolean): { w: number; h: number } {
  const labelW = textWidth(label || ' ', NODE_FONT) + 32;
  const descW = description ? textWidth(description, DESC_FONT) + 28 : 0;
  const w = Math.max(88, Math.min(NODE_MAX_W, Math.max(labelW, descW)));
  const descLines = description ? Math.min(2, Math.ceil(descW / w)) : 0;
  const pad = final ? 8 : 0;
  return { w: w + pad, h: 40 + descLines * 16 + pad };
}

/** 分组标题条的宽度：手写字体的拉丁字母比估算宽，多留 20%（宁可宽也不截断）。 */
export const groupTitleWidth = (label: string, icon: boolean) => Math.ceil(textWidth(label || ' ', GROUP_FONT) * 1.2) + (icon ? 19 : 0) + 18;
export const edgeLabelSize = (label: string, font = EDGE_FONT) => (label ? { lw: textWidth(label, font) + 10, lh: 18 } : { lw: 0, lh: 0 });

// ---------- 结构 ----------
export type GNode = {
  id: string;
  /** 源码顺序（节点与分组统一编号）：ELK 按它排同层顺序。 */
  seq: number;
  label: string;
  description: string;
  kind: string;
  parent: string | null;
  w: number;
  h: number;
  pin?: 'start' | 'end';
  /** 状态机：初始状态（前面画一个实心起点）、终态（双线）。 */
  initial?: boolean;
  final?: boolean;
};
export type GGroup = { id: string; seq: number; label: string; parent: string | null; icon?: string; pin?: 'start' | 'end' };
export type GEdge = { id: string; from: string; to: string; label: string; lw: number; lh: number; async?: boolean };
/** direction：作者写的方向；auto = 没写，按舞台比例在 right / down 里选（D69 补充）。 */
export type GraphStructure = { root: GraphRootType; direction: 'right' | 'down' | 'auto'; groups: GGroup[]; nodes: GNode[]; edges: GEdge[] };

const pinOf = (v: unknown) => (v === 'start' || v === 'end' ? v : undefined);

/**
 * 从 IR 里的 Diagram / StateMachine 节点取出结构。分组既可以用嵌套表达，也可以用 group="分组 id" 引用
 * （编译期已校验引用存在、不成环、与嵌套不冲突；这里引用无效时退回嵌套的父分组）。
 */
export function graphStructure(node: SceneNode): GraphStructure {
  const root = (node.type === 'diagram:StateMachine' ? 'diagram:StateMachine' : 'diagram:Diagram') as GraphRootType;
  const fam = GRAPH_FAMILY[root];
  const p = node.props ?? {};
  const direction = p.direction === 'down' ? 'down' : p.direction === 'right' ? 'right' : 'auto';
  const groups: GGroup[] = [];
  const nodes: GNode[] = [];
  const edges: GEdge[] = [];
  let seq = 0;
  const walk = (children: SceneNode[] | undefined, parent: string | null) => {
    for (const c of children ?? []) {
      const cp = c.props ?? {};
      const ref = typeof cp.group === 'string' ? cp.group : null;
      if (c.type === fam.group) {
        groups.push({ id: c.id, seq: seq++, label: staticText(cp.label), parent: ref ?? parent, ...(typeof cp.icon === 'string' ? { icon: cp.icon } : {}), ...(pinOf(cp.pin) ? { pin: pinOf(cp.pin) } : {}) });
        walk(c.children, c.id);
      } else if (c.type === fam.node) {
        const label = staticText(cp.label) || c.id;
        const description = staticText(cp.description);
        if (root === 'diagram:StateMachine') {
          const final = cp.final === true;
          nodes.push({ id: c.id, seq: seq++, label, description, kind: 'state', parent: ref ?? parent, ...stateSize(label, description, final), ...(pinOf(cp.pin) ? { pin: pinOf(cp.pin) } : {}), ...(cp.initial === true ? { initial: true } : {}), ...(final ? { final: true } : {}) });
        } else {
          const kind = typeof cp.kind === 'string' ? cp.kind : 'service';
          nodes.push({ id: c.id, seq: seq++, label, description, kind, parent: ref ?? parent, ...nodeSize(label, description, kind), ...(pinOf(cp.pin) ? { pin: pinOf(cp.pin) } : {}) });
        }
      } else if (c.type === fam.edge) {
        const label = staticText(cp.label);
        edges.push({ id: c.id, from: String(cp.from ?? ''), to: String(cp.to ?? ''), label, ...edgeLabelSize(label), ...(cp.async === true ? { async: true } : {}) });
      }
      // 嵌套的另一张图自成一图；其他类型在图里不参与布局
    }
  };
  walk(node.children, null);
  // 引用了不存在的分组：退回顶层（编译期已报错，这里只保证不崩）
  const gids = new Set(groups.map((g) => g.id));
  for (const g of groups) if (g.parent && !gids.has(g.parent)) g.parent = null;
  for (const n of nodes) if (n.parent && !gids.has(n.parent)) n.parent = null;
  // 成环的分组引用：断开（编译期已报 DIAGRAM_GROUP_CYCLE）
  const parentOf = new Map(groups.map((g) => [g.id, g.parent]));
  for (const g of groups) {
    const seen = new Set<string>([g.id]);
    for (let q = g.parent; q; q = parentOf.get(q) ?? null) {
      if (seen.has(q)) {
        g.parent = null;
        parentOf.set(g.id, null);
        break;
      }
      seen.add(q);
    }
  }
  return { root, direction, groups, nodes, edges };
}

export type SActor = { id: string; label: string; description: string; kind: string; group: string | null; w: number; h: number };
export type SGroup = { id: string; label: string; icon?: string };
export type SMessage = { id: string; from: string; to: string; label: string; reply: boolean; async: boolean; blocks: string[] };
export type SBlock = { id: string; label: string; kind: string; parent: string | null };
export type SequenceStructure = { numbered: boolean; actors: SActor[]; groups: SGroup[]; messages: SMessage[]; blocks: SBlock[] };

export function actorSize(label: string, description: string, kind: string): { w: number; h: number } {
  // 参与者头部总带图标（数据库、队列也画小图标）；手写字体的拉丁字母偏宽，多留 15%
  void kind;
  const labelW = Math.ceil(textWidth(label || ' ', NODE_FONT) * 1.15) + 22 + 30;
  const descW = description ? textWidth(description, DESC_FONT) + 24 : 0;
  const w = Math.max(96, Math.min(NODE_MAX_W, Math.max(labelW, descW)));
  return { w, h: description ? 58 : 42 };
}

export function sequenceStructure(node: SceneNode): SequenceStructure {
  const p = node.props ?? {};
  const actors: SActor[] = [];
  const groups: SGroup[] = [];
  const messages: SMessage[] = [];
  const blocks: SBlock[] = [];
  const walk = (children: SceneNode[] | undefined, group: string | null, chain: string[]) => {
    for (const c of children ?? []) {
      const cp = c.props ?? {};
      if (c.type === SEQUENCE_FAMILY.group) {
        groups.push({ id: c.id, label: staticText(cp.label), ...(typeof cp.icon === 'string' ? { icon: cp.icon } : {}) });
        walk(c.children, c.id, chain);
      } else if (c.type === SEQUENCE_FAMILY.actor) {
        const label = staticText(cp.label) || c.id;
        const description = staticText(cp.description);
        const kind = typeof cp.kind === 'string' ? cp.kind : 'service';
        actors.push({ id: c.id, label, description, kind, group, ...actorSize(label, description, kind) });
      } else if (c.type === SEQUENCE_FAMILY.block) {
        const kind = typeof cp.kind === 'string' ? cp.kind : 'opt';
        blocks.push({ id: c.id, label: staticText(cp.label), kind, parent: chain[chain.length - 1] ?? null });
        walk(c.children, group, [...chain, c.id]);
      } else if (c.type === SEQUENCE_FAMILY.message) {
        messages.push({ id: c.id, from: String(cp.from ?? ''), to: String(cp.to ?? ''), label: staticText(cp.label), reply: cp.reply === true, async: cp.async === true, blocks: [...chain] });
      }
    }
  };
  walk(node.children, null, []);
  return { numbered: p.numbered !== false, actors, groups, messages, blocks };
}

/** 布局缓存与“结构是否变化”的稳定键。 */
export const structureKey = (s: GraphStructure | SequenceStructure) => JSON.stringify(s);

/** 图表根节点里，节点 / 分组的父链（用于 trace 推算分组状态、镜头取景）。 */
export function groupChains(s: GraphStructure): Map<string, string[]> {
  const parentOf = new Map(s.groups.map((g) => [g.id, g.parent]));
  const chain = (gid: string | null): string[] => {
    const out: string[] = [];
    const seen = new Set<string>();
    for (let q = gid; q && !seen.has(q); q = parentOf.get(q) ?? null) {
      seen.add(q);
      out.push(q);
    }
    return out;
  };
  const m = new Map<string, string[]>();
  for (const n of s.nodes) m.set(n.id, chain(n.parent));
  for (const g of s.groups) m.set(g.id, chain(g.parent));
  return m;
}
