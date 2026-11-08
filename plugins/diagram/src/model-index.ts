/**
 * 关系类图表（D69）的公共入口：给编译器挂布局、给 trace 建索引。浏览器安全（不加载 ELK）。
 */
import type { SceneNode } from '../../../packages/core/src/schema.ts';
import { DEFAULT_ASPECT, gridLayout, type LayoutGoal } from './graph-layout.ts';
import { layoutSequence } from './sequence-layout.ts';
import { GRAPH_FAMILY, SEQUENCE_FAMILY, graphStructure, groupChains, isDiagramRoot, sequenceStructure, type DiagramLayout, type DiagramRootType, type GraphLayout, type GraphStructure } from './model.ts';

export * from './model.ts';
export { layoutSequence, SEQ_BADGE } from './sequence-layout.ts';
export { DEFAULT_ASPECT, compactReversals, crossings, gridLayout, layoutGraph, layoutVariant, feedbackEdges, placeLabels, toElk, rootOptions, sampleRoute, type ElkNode, type ElkEdge, type ElkRun, type LayoutGoal, type LayoutVariant } from './graph-layout.ts';

/** 编译期注入的图布局引擎（Node 入口的 elkLayout）。没有时退化为网格（只在测试或旧调用方出现）。 */
export type GraphLayoutEngine = (s: GraphStructure, goal?: LayoutGoal) => GraphLayout;

/** 舞台画面区域（字幕区在舞台外）：电脑 1280 × 800，手机 390 × 760（手机外框内）。 */
const STAGE_AREA = { desktop: { w: 1280, h: 800 }, mobile: { w: 390, h: 760 } } as const;

/**
 * 一张图的目标外框比例（D69 补充）：作者写了 aspect 就用它；写了数字高度 h 时按“舞台宽度 / h”；
 * 否则（h="100%" 或不写，通常是层级里铺满舞台的图）用舞台画面区域的比例。
 */
export function diagramGoal(node: SceneNode, viewport: 'desktop' | 'mobile' = 'desktop'): LayoutGoal {
  const p = node.props ?? {};
  const area = STAGE_AREA[viewport] ?? STAGE_AREA.desktop;
  const w = area.w - 48;
  if (typeof p.aspect === 'number' && Number.isFinite(p.aspect) && p.aspect > 0) return { aspect: p.aspect, width: w, height: w / p.aspect };
  if (typeof p.h === 'number' && p.h > 0) return { aspect: Math.max(0.3, Math.min(6, w / p.h)), width: w, height: p.h };
  const h = area.h - 44;
  return { aspect: w / h, width: w, height: h };
}

/** 算一张图表的布局；ELK 出错时退回网格，并通过 onError 报告（编译器转成 DIAGRAM_LAYOUT_FAILED 警告）。 */
export function layoutFor(node: SceneNode, engine?: GraphLayoutEngine, onError?: (message: string) => void, viewport: 'desktop' | 'mobile' = 'desktop'): DiagramLayout | null {
  if (node.type === 'diagram:Sequence') return layoutSequence(sequenceStructure(node));
  if (node.type !== 'diagram:Diagram' && node.type !== 'diagram:StateMachine') return null;
  const s = graphStructure(node);
  if (!engine) return gridLayout(s);
  try {
    return engine(s, diagramGoal(node, viewport));
  } catch (e) {
    onError?.(e instanceof Error ? e.message : String(e));
    return gridLayout(s);
  }
}

/** 给一棵画面树里的每张图表挂上布局（就地修改）。嵌套的图表各自布局。viewport：画面的设备（决定目标比例）。 */
export function attachLayouts(root: SceneNode, engine?: GraphLayoutEngine, onError?: (node: SceneNode, message: string) => void, viewport: 'desktop' | 'mobile' = 'desktop'): void {
  const visit = (n: SceneNode) => {
    if (isDiagramRoot(n.type)) {
      const l = layoutFor(n, engine, (m) => onError?.(n, m), viewport);
      if (l) n.ext = { ...n.ext, diagram: { layout: l, structure: n.type === 'diagram:Sequence' ? sequenceStructure(n) : graphStructure(n) } };
    }
    for (const c of n.children ?? []) visit(c);
  };
  visit(root);
}

/**
 * 一张图表里能被 trace 引用的东西：节点（架构图节点、状态、时序图参与者；以及有 id 的分组）、连线（连线、转换、消息），
 * 以及每个节点的父分组链（trace 经过时分组也被点亮）。
 */
export type DiagramIndex = {
  id: string;
  type: DiagramRootType;
  nodes: Set<string>;
  edges: { id: string; from: string; to: string }[];
  /** 节点 / 分组 → 由内到外的父分组（不含自己）。 */
  groupsOf: Map<string, string[]>;
  /** 有作者 id 的分组（可以被连线连接、出现在 trace 路径里）。 */
  groupIds: Set<string>;
};

export function diagramsIn(root: SceneNode): DiagramIndex[] {
  const out: DiagramIndex[] = [];
  const visit = (n: SceneNode) => {
    if (n.type === 'diagram:Diagram' || n.type === 'diagram:StateMachine') {
      const fam = GRAPH_FAMILY[n.type];
      const s = graphStructure(n);
      const groupIds = new Set(s.groups.filter((g) => !g.id.startsWith('_')).map((g) => g.id));
      const d: DiagramIndex = { id: n.id, type: n.type, nodes: new Set([...s.nodes.map((x) => x.id), ...groupIds]), edges: [], groupsOf: groupChains(s), groupIds };
      const walk = (c: SceneNode) => {
        if (isDiagramRoot(c.type)) return; // 嵌套的图表自成一图
        if (c.type === fam.edge) d.edges.push({ id: c.id, from: String(c.props?.from ?? ''), to: String(c.props?.to ?? '') });
        for (const k of c.children ?? []) walk(k);
      };
      for (const k of n.children ?? []) walk(k);
      out.push(d);
    } else if (n.type === 'diagram:Sequence') {
      const s = sequenceStructure(n);
      out.push({
        id: n.id,
        type: 'diagram:Sequence',
        nodes: new Set(s.actors.map((a) => a.id)),
        edges: s.messages.map((m) => ({ id: m.id, from: m.from, to: m.to })),
        groupsOf: new Map(s.actors.map((a) => [a.id, a.group ? [a.group] : []])),
        groupIds: new Set(),
      });
    }
    for (const c of n.children ?? []) visit(c);
  };
  visit(root);
  return out;
}

/** 时序图的消息类型名（compile 生成缺省 id 用）。 */
export const MESSAGE_TYPES: ReadonlySet<string> = new Set([SEQUENCE_FAMILY.message, GRAPH_FAMILY['diagram:StateMachine'].edge]);
