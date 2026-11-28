import packageInfo from './version.json' with { type: 'json' };
import { dataSpec } from './data-spec.ts';
import { definePlugin, type PluginCompileHooks, type PluginIRNode } from '@joplo-app/kit/plugin';
import { isNode, type JNode, type JChild } from '@joplo-app/kit/node';
import type { PluginIRNode as SceneNode } from '@joplo-app/kit/plugin';
import { docs, examples } from './catalog.ts';
import { skill, patterns, boardSkillTopics } from './guide.ts';
import { checkDiagramRoot, resolveTrace } from './compile-helpers.ts';
import { diagramsIn, isDiagramRoot, layoutFor, graphStructure, sequenceStructure, type GraphLayoutEngine } from './model-index.ts';
import { NodeData, FrameData, type NodeStatus, type PulseSnapshot, type Trace } from './schema.ts';
import { advanceStates } from './state.ts';
import { machineStates } from './machine.ts';
import { componentLabels, inspectFields } from './inspect.ts';
import { NODE_STATUSES, TONES, pulseDurationMs, type Tone } from './board/tokens.ts';
import { blueprintTheme, juiceDarkTheme, juiceLightTheme, risoTheme, sketchTheme } from './board/themes.ts';

export { trace, pulse, setStatus } from './effects.ts';
export * from './components.ts';
export { TECH_ICONS, resolveTechIconId, type TechIconId } from './board/icon-catalog.ts';
import { defaultGraphLayout } from './elk.ts';
const links = new Set(['diagram:Diagram.Edge', 'diagram:StateMachine.Transition', 'diagram:Sequence.Message']);
const required = new Set(['Diagram.Node', 'StateMachine.State', 'Sequence.Actor']);
const cleanChild = (c: JChild): JChild => Array.isArray(c) ? c.map(cleanChild) : isNode(c) ? clean(c) : c;
const clean = (n: JNode): JNode => ({ ...n, props: n.props ?? {}, children: (n.children ?? []).map(cleanChild) });
const all = (n: PluginIRNode): PluginIRNode[] => [n, ...(n.children ?? []).flatMap(all)];
/** 小点沿连线走一圈的时长（毫秒）：每秒 260 像素、至少 0.9 秒。运行时画小点与编译期声明这一步的停留用同一个算法。 */
export const dotLapSeconds = (length: number) => Math.max(0.9, length / 260);
/**
 * 这一步 active 连线上的小点至少跑完一圈（再留 0.2 秒）要多久：连线长度取编译期布局的折线长度
 * （圆角让实际路径略短，所以只会多等一点）。没有布局或没有连线时为 0。
 */
function dotLapMs(roots: readonly PluginIRNode[], edgeIds: string[]): number {
  if (!edgeIds.length) return 0;
  let longest = 0;
  for (const root of roots) for (const node of all(root)) {
    if (!isDiagramRoot(node.type)) continue;
    const layout = (node.ext?.diagram as { layout?: { edges?: Record<string, { points: { x: number; y: number }[] }>; messages?: Record<string, { points: { x: number; y: number }[] }> } } | undefined)?.layout;
    for (const id of edgeIds) {
      const points = (layout?.edges?.[id] ?? layout?.messages?.[id])?.points;
      if (!points || points.length < 2) continue;
      let length = 0;
      for (let i = 1; i < points.length; i++) length += Math.hypot(points[i]!.x - points[i - 1]!.x, points[i]!.y - points[i - 1]!.y);
      longest = Math.max(longest, length);
    }
  }
  return longest ? Math.round(dotLapSeconds(longest) * 1000) + 200 : 0;
}
const isBoardTone = (v: unknown): v is Tone => typeof v === 'string' && (TONES as readonly string[]).includes(v);
const isBoardStatus = (v: unknown): v is NodeStatus => typeof v === 'string' && (NODE_STATUSES as readonly string[]).includes(v);
type BoardStepOp =
  | { kind: 'pulse'; edge: string; label?: string; reverse?: boolean; tone?: Tone; durationMs: number; explicitDuration?: boolean }
  | { kind: 'setStatus'; target: string; status: NodeStatus };

const hooks: PluginCompileHooks = {
  node(raw, { ids, report }) {
    const n = clean(raw);
    if (n.type === 'diagram:FlowEdge') {
      if (typeof n.props.from !== 'string' || !n.props.from || typeof n.props.to !== 'string' || !n.props.to) {
        report('DIAGRAM_EDGE_INVALID', '<FlowEdge> requires nonempty string "from" and "to" target ids', n.source);
      }
      return n;
    }
    if (isDiagramRoot(n.type)) {
      checkDiagramRoot(n, report);
      if (n.props.scale !== undefined && (typeof n.props.scale !== 'number' || !Number.isFinite(n.props.scale) || n.props.scale <= 0)) report('DIAGRAM_SCALE_INVALID', 'Diagram scale must be a finite number greater than 0', n.source);
    }
    if (links.has(n.type) && typeof n.props.id !== 'string' && typeof n.props.from === 'string' && typeof n.props.to === 'string') {
      const base = `${n.props.from}->${n.props.to}`;
      let id = base;
      // Repeated endpoints get stable source-order suffixes; explicit ids are never rewritten.
      for (let k = 2; ids.has(id); k++) id = `${base}~${k}`;
      return { ...n, props: { ...n.props, id } };
    }
    return n;
  },
  derive(node, { viewport, options, report }) {
    if (!isDiagramRoot(node.type)) return;
    const n = node as SceneNode;
    const layout = layoutFor(n, (Object.hasOwn(options, 'layout') ? options.layout : defaultGraphLayout) as GraphLayoutEngine | undefined, message => report('DIAGRAM_LAYOUT_FAILED', `<${n.type}> "${n.id}" could not be laid out (${message}); showing a simple grid instead. Check the edges and groups of this diagram`, n.source, 'warning'), viewport);
    const data = layout ? { layout, structure: n.type === 'diagram:Sequence' ? sequenceStructure(n) : graphStructure(n) } : undefined;
    const framing: NonNullable<import('@joplo-app/kit/plugin').PluginDerived['framing']> = {};
    const index = diagramsIn(n).find(d => d.id === n.id);
    if (!index) return;
    for (const child of all(node)) {
      if (!child.type.startsWith('diagram:')) continue;
      const name = child.type.slice(8);
      const kind = isDiagramRoot(child.type) ? 'root' : name.endsWith('.Block') ? 'block' : name.endsWith('.Group') ? 'group' : name.endsWith('.Message') ? 'row' : links.has(child.type) ? 'edge' : 'content';
      const edge = index.edges.find(e => e.id === child.id);
      const include = kind === 'row' && edge ? [edge.from, edge.to] : index.groupsOf.get(child.id)?.slice(0, 1) ?? [];
      framing[child.id] = { kind, ...(include.length ? { include } : {}) };
    }
    return { data, framing };
  },
  effect(effect, ctx) {
    const previous = ctx.data as { traces?: Trace[]; traceScenes?: string[]; boardOps?: BoardStepOp[] } | undefined;
    if (effect.name === 'pulse' || effect.name === 'setStatus') {
      const p = (effect.payload ?? {}) as Record<string, unknown>;
      const allNodes = ctx.roots.flatMap(all);
      const boardOps = [...(previous?.boardOps ?? [])];
      const keepPrev = { ...(previous?.traces ? { traces: previous.traces } : {}), ...(previous?.traceScenes ? { traceScenes: previous.traceScenes } : {}) };
      if (effect.name === 'pulse') {
        const edge = typeof p.edge === 'string' ? p.edge : '';
        if (!allNodes.some((n) => n.id === edge && n.type === 'diagram:FlowEdge')) {
          ctx.report('DIAGRAM_EDGE_UNKNOWN', `pulse("${edge}"): no <FlowEdge id="${edge}"> on this step`, ctx.source);
          return;
        }
        const hasExplicitDuration = typeof p.durationMs === 'number' && Number.isFinite(p.durationMs) && p.durationMs >= 150;
        const durationMs = pulseDurationMs(hasExplicitDuration ? (p.durationMs as number) : undefined);
        boardOps.push({
          kind: 'pulse',
          edge,
          ...(typeof p.label === 'string' ? { label: p.label } : {}),
          ...(typeof p.reverse === 'boolean' ? { reverse: p.reverse } : {}),
          ...(isBoardTone(p.tone) ? { tone: p.tone } : {}),
          durationMs,
          ...(hasExplicitDuration ? { explicitDuration: true } : {}),
        });
        return { data: { ...keepPrev, boardOps }, references: [edge], holdMs: durationMs + 150 };
      }
      const target = typeof p.target === 'string' ? p.target : '';
      if (!allNodes.some((n) => n.id === target)) {
        ctx.report('DIAGRAM_TARGET_UNKNOWN', `setStatus("${target}"): node not found on this step`, ctx.source);
        return;
      }
      if (!isBoardStatus(p.status)) {
        ctx.report('DIAGRAM_STATUS_INVALID', `setStatus("${target}"): invalid status`, ctx.source);
        return;
      }
      boardOps.push({ kind: 'setStatus', target, status: p.status });
      return { data: { ...keepPrev, boardOps }, references: [target] };
    }
    if (effect.name !== 'trace') { ctx.report('PLUGIN_EFFECT_UNKNOWN', `Unknown diagram effect ${effect.name}`, ctx.source); return; }
    const p = effect.payload as { ids?: unknown; mode?: unknown; focus?: unknown } | null;
    if (!p || !Array.isArray(p.ids) || !p.ids.every(id => typeof id === 'string') || !['ok', 'fail', 'skip'].includes(String(p.mode)) || (p.focus !== undefined && typeof p.focus !== 'boolean')) {
      ctx.report('TRACE_UNKNOWN', 'trace() needs a list of element ids, an ok / fail / skip mode, and optional boolean focus', ctx.source); return;
    }
    const t = resolveTrace(ctx.roots.flatMap(r => diagramsIn(r as SceneNode)), p.ids as string[], p.mode as Trace['mode'], ctx.source, ctx.report);
    if (!t) return;
    const owner = ctx.scenes.find(s => diagramsIn(s.root as SceneNode).some(d => (p.ids as string[]).every(id => d.nodes.has(id) || d.edges.some(e => e.id === id))));
    return {
      ...(t.mode === 'ok' ? { holdMs: dotLapMs(ctx.roots, t.edges.map(e => e.id)) } : {}),
      data: { ...(previous?.boardOps ? { boardOps: previous.boardOps } : {}), traces: [...previous?.traces ?? [], t], traceScenes: [...previous?.traceScenes ?? [], owner!.id] },
      targets: t.mode === 'skip' || p.focus === false ? undefined : t.targets ?? t.nodes,
      references: [...t.nodes, ...t.edges.map(e => e.id), ...t.groups ?? [], ...t.errorGroups ?? [], ...t.targets ?? []],
    };
  },
  frame(ctx) {
    const stepData = ctx.data as { traces?: Trace[]; traceScenes?: string[]; boardOps?: BoardStepOp[] } | undefined;
    const traces = stepData?.traces ?? [];
    const traceScenes = stepData?.traceScenes ?? [];
    const boardOps = stepData?.boardOps ?? [];
    const previous = ctx.previousData as (import('./data.ts').Frame & { scenes: Record<string, { pulses?: Record<string, PulseSnapshot>; nodeStates?: Record<string, NodeStatus> }> }) | undefined;
    const scenes: Record<string, any> = {};
    for (const scene of ctx.scenes) {
      const nodes = all(scene.root);
      const nodeIds = new Set(nodes.map(n => n.id));
      const sceneHasClassic = nodes.some(n => isDiagramRoot(n.type));
      const calls = traces.filter((_, i) => traceScenes[i] === scene.id);
      const states = sceneHasClassic ? advanceStates(previous?.scenes[scene.id]?.states ?? {}, calls) : {};
      const machines: Record<string, ReturnType<typeof machineStates>> = {};
      if (sceneHasClassic) {
        for (const node of nodes) if (node.type === 'diagram:StateMachine') {
          const n = node as SceneNode;
          const props = ctx.resolveProps(n);
          const prev = ctx.previousState ? ctx.resolveProps(n, true).value : undefined;
          machines[n.id] = machineStates(graphStructure(n), props.value, prev);
        }
      }
      const prevNodeStates = previous?.scenes[scene.id]?.nodeStates;
      const nodeStates: Record<string, NodeStatus> = { ...(prevNodeStates ?? {}) };
      for (const op of boardOps) {
        if (op.kind === 'setStatus' && nodeIds.has(op.target)) nodeStates[op.target] = op.status;
      }
      const pulses: Record<string, PulseSnapshot> = {};
      for (const node of nodes) {
        if (node.type !== 'diagram:FlowEdge') continue;
        const pulseOp = [...boardOps].reverse().find((o): o is Extract<BoardStepOp, { kind: 'pulse' }> => o.kind === 'pulse' && o.edge === node.id);
        if (pulseOp) {
          pulses[node.id] = {
            active: true,
            ...(pulseOp.label !== undefined ? { label: pulseOp.label } : {}),
            ...(pulseOp.reverse !== undefined ? { reverse: pulseOp.reverse } : {}),
            ...(pulseOp.tone !== undefined ? { tone: pulseOp.tone } : {}),
            durationMs: pulseOp.durationMs,
            ...(pulseOp.explicitDuration ? { explicitDuration: true } : {}),
          };
        }
      }
      const hasPulses = Object.keys(pulses).length > 0;
      const hasNodeStates = Object.keys(nodeStates).length > 0;
      if (!sceneHasClassic && !hasPulses && !hasNodeStates) continue;
      scenes[scene.id] = {
        traces: calls,
        states,
        now: [...new Set(calls.filter(t => t.mode !== 'skip').flatMap(t => [...t.nodes, ...t.edges.map(e => e.id)]))],
        machines,
        ...(hasPulses ? { pulses } : {}),
        ...(hasNodeStates ? { nodeStates } : {}),
      };
    }
    if (Object.keys(scenes).length) return { scenes };
  },
};
const DIAGRAM_ROLES: Record<string, import('@joplo-app/kit/plugin').ComponentRole> = {
  BoardZone: 'stage', ClusterBox: 'stage', DeviceFrame: 'stage', SwimLane: 'stage',
  ArchNode: 'topology', Database: 'topology', QueuePipe: 'topology', CacheNode: 'topology', FlowEdge: 'topology', TechIcon: 'topology', IconGrid: 'topology',
  Diagram: 'topology', 'Diagram.Group': 'topology', 'Diagram.Node': 'topology', 'Diagram.Edge': 'topology',
  Sequence: 'sequence', 'Sequence.Group': 'sequence', 'Sequence.Actor': 'sequence', 'Sequence.Message': 'sequence', 'Sequence.Block': 'sequence',
  StateMachine: 'state', 'StateMachine.Group': 'state', 'StateMachine.State': 'state', 'StateMachine.Transition': 'state',
  ArrayStrip: 'dsa', ArrayCell: 'dsa', LinkedList: 'dsa', ListNode: 'dsa', StackQueue: 'dsa', HashTable: 'dsa', MatrixGrid: 'dsa', FlowNode: 'dsa', ERTable: 'dsa', ERField: 'dsa',
  StickFigure: 'annotation', StickyNote: 'annotation', SpeechBubble: 'annotation', Callout: 'annotation',
};
export default /* @__PURE__ */ definePlugin({
  skillTopics: { patterns: { description: 'Recipes and individual pitfalls', body: patterns }, ...boardSkillTopics },
  packageName: '@joplo-app/plugin-diagram',
  id: 'diagram',
  title: 'Diagrams',
  version: packageInfo.version,
  bestFor: 'Manual system architecture whiteboards (ArchNode + FlowEdge + 86 tech logos), request sequences, state machines, data structures, ER schemas, and hand-drawn actors/notes',
  pairsWith: [
    { with: 'content', packageName: '@joplo-app/plugin-content', how: 'Space multiple BoardZone architecture islands on one content:Canvas world (300–500px apart) and steer camera() from overview to close-ups with pulse()/setStatus(); pass { focus: false } to trace() inside Canvas.' },
    { with: 'ui', packageName: '@joplo-app/plugin-ui', how: 'Embed ui Code, Terminal, Stat, RingProgress, Compare, or ChatMessage directly inside BoardZone/ClusterBox/ArchNode/DeviceFrame children, or place a diagram layer beside product screens.' },
    { with: 'viz', packageName: '@joplo-app/plugin-viz', how: 'Follow a diagram mechanism zone with a viz data chart zone on the same Canvas to prove system behavior with real measurements.' },
    { with: 'code', packageName: '@joplo-app/plugin-code', how: 'Show code:Editor beside a FlowEdge architecture or Sequence so highlighted lines or diffs map directly to runtime hops.' },
  ],
  runtime: new URL(import.meta.url.endsWith('.ts') ? './runtime.tsx' : './runtime.js', import.meta.url),
  themes: {
    juice: juiceLightTheme,
    sketch: sketchTheme,
    'juice-dark': juiceDarkTheme,
    riso: risoTheme,
    blueprint: blueprintTheme,
  },
  skill,
  components: Object.fromEntries(Object.entries(docs).map(([name, doc]) => [name, { ...(componentLabels[name] ? { label: componentLabels[name] } : {}), ...(inspectFields[name] ? { inspect: inspectFields[name] } : {}), ...(DIAGRAM_ROLES[name] ? { role: DIAGRAM_ROLES[name] } : {}), doc, example: examples[name], catalogFamily: !name.includes('.'), traits: { text: ['label', 'description', 'name', 'value', 'title', 'sub', 'text', 'eyebrow', 'metric', 'detail', 'author', 'speaker', 'role', 'pointer', 'tag', 'badge', 'storage', 'ttl', 'lag'] }, selfEvident: true, ...(required.has(name) ? { needsId: true } : {}) }])),
  data: dataSpec,
  compile: hooks,
  schemas: { node: NodeData, step: FrameData },
});
