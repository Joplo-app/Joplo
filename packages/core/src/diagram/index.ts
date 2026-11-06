/**
 * 关系类图表（D67）的公共入口：给编译器挂布局、给 trace 建索引。浏览器安全（不加载 ELK）。
 */
import type { SceneNode } from '../schema.ts';
import { gridLayout } from './graph-layout.ts';
import { layoutSequence } from './sequence-layout.ts';
import { GRAPH_FAMILY, SEQUENCE_FAMILY, graphStructure, groupChains, isDiagramRoot, sequenceStructure, type DiagramLayout, type DiagramRootType, type GraphLayout, type GraphStructure } from './model.ts';

export * from './model.ts';
export { layoutSequence, SEQ_BADGE } from './sequence-layout.ts';
export { gridLayout, layoutGraph, feedbackEdges, toElk, rootOptions, sampleRoute, type ElkNode, type ElkEdge, type ElkRun } from './graph-layout.ts';

/** 编译期注入的图布局引擎（Node 入口的 elkLayout）。没有时退化为网格（只在测试或旧调用方出现）。 */
export type GraphLayoutEngine = (s: GraphStructure) => GraphLayout;

/** 算一张图表的布局；ELK 出错时退回网格，并通过 onError 报告（编译器转成 DIAGRAM_LAYOUT_FAILED 警告）。 */
export function layoutFor(node: SceneNode, engine?: GraphLayoutEngine, onError?: (message: string) => void): DiagramLayout | null {
  if (node.type === 'Sequence') return layoutSequence(sequenceStructure(node));
  if (node.type !== 'Diagram' && node.type !== 'StateMachine') return null;
  const s = graphStructure(node);
  if (!engine) return gridLayout(s);
  try {
    return engine(s);
  } catch (e) {
    onError?.(e instanceof Error ? e.message : String(e));
    return gridLayout(s);
  }
}

/** 给一棵画面树里的每张图表挂上布局（就地修改）。嵌套的图表各自布局。 */
export function attachLayouts(root: SceneNode, engine?: GraphLayoutEngine, onError?: (node: SceneNode, message: string) => void): void {
  const visit = (n: SceneNode) => {
    if (isDiagramRoot(n.type)) {
      const l = layoutFor(n, engine, (m) => onError?.(n, m));
      if (l) n.layout = l;
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
    if (n.type === 'Diagram' || n.type === 'StateMachine') {
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
    } else if (n.type === 'Sequence') {
      const s = sequenceStructure(n);
      out.push({
        id: n.id,
        type: 'Sequence',
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
export const MESSAGE_TYPES: ReadonlySet<string> = new Set([SEQUENCE_FAMILY.message, GRAPH_FAMILY.StateMachine.edge]);
