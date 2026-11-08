import { definePlugin, type PluginCompileHooks, type PluginIRNode } from '@joplo-app/kit/plugin';
import { isNode, type JNode, type JChild } from '@joplo-app/kit/node';
import { resolveProps } from '../../../packages/core/src/player.ts';
import type { SceneNode } from '../../../packages/core/src/schema.ts';
import { docs } from './catalog.ts';
import { skill } from './guide.ts';
import { checkDiagramRoot, resolveTrace } from './compile-helpers.ts';
import { diagramsIn, isDiagramRoot, layoutFor, graphStructure, sequenceStructure, type GraphLayoutEngine } from './model-index.ts';
import { NodeData, FrameData, type Trace } from './schema.ts';
import { advanceStates } from './state.ts';
import { machineStates } from './machine.ts';

export { trace } from './effects.ts';
export { Diagram, StateMachine, Sequence } from '@joplo-app/kit/ui';
const links = new Set(['diagram:Diagram.Edge', 'diagram:StateMachine.Transition', 'diagram:Sequence.Message']);
const required = new Set(['Diagram.Node', 'StateMachine.State', 'Sequence.Actor']);
const cleanChild = (c: JChild): JChild => Array.isArray(c) ? c.map(cleanChild) : isNode(c) ? clean(c) : c;
const clean = (n: JNode): JNode => ({ ...n, props: n.props ?? {}, children: (n.children ?? []).map(cleanChild) });
const all = (n: PluginIRNode): PluginIRNode[] => [n, ...(n.children ?? []).flatMap(all)];
const hooks: PluginCompileHooks = {
  node(raw, { ids, report }) {
    const n = clean(raw);
    if (isDiagramRoot(n.type)) checkDiagramRoot(n, report);
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
    const layout = layoutFor(n, options.layout as GraphLayoutEngine | undefined, message => report('DIAGRAM_LAYOUT_FAILED', `<${n.type}> "${n.id}" could not be laid out (${message}); showing a simple grid instead. Check the edges and groups of this diagram`, n.source, 'warning'), viewport);
    if (layout) n.ext = { ...n.ext, diagram: { layout, structure: n.type === 'diagram:Sequence' ? sequenceStructure(n) : graphStructure(n) } };
    const index = diagramsIn(n).find(d => d.id === n.id);
    if (!index) return;
    for (const child of all(node)) {
      if (!child.type.startsWith('diagram:')) continue;
      const name = child.type.slice(8);
      const kind = isDiagramRoot(child.type) ? 'root' : name.endsWith('.Block') ? 'block' : name.endsWith('.Group') ? 'group' : name.endsWith('.Message') ? 'row' : links.has(child.type) ? 'edge' : 'content';
      const edge = index.edges.find(e => e.id === child.id);
      const include = kind === 'row' && edge ? [edge.from, edge.to] : index.groupsOf.get(child.id)?.slice(0, 1) ?? [];
      child.framing = { kind, ...(include.length ? { include } : {}) };
    }
  },
  effect(effect, ctx) {
    if (effect.name !== 'trace') { ctx.report('PLUGIN_EFFECT_UNKNOWN', `Unknown diagram effect ${effect.name}`, ctx.source); return; }
    const p = effect.payload as { ids?: unknown; mode?: unknown } | null;
    if (!p || !Array.isArray(p.ids) || !p.ids.every(id => typeof id === 'string') || !['ok', 'fail', 'skip'].includes(String(p.mode))) {
      ctx.report('TRACE_UNKNOWN', 'trace() needs a list of element ids and an ok / fail / skip mode', ctx.source); return;
    }
    const t = resolveTrace(ctx.roots.flatMap(r => diagramsIn(r as SceneNode)), p.ids as string[], p.mode as Trace['mode'], ctx.source, ctx.report);
    if (!t) return;
    const previous = ctx.data as { traces?: Trace[] } | undefined;
    return {
      data: { traces: [...previous?.traces ?? [], t] },
      targets: t.mode === 'skip' ? undefined : t.targets ?? t.nodes,
      references: [...t.nodes, ...t.edges.map(e => e.id), ...t.groups ?? [], ...t.errorGroups ?? [], ...t.targets ?? []],
    };
  },
  frame(ctx) {
    if (!ctx.roots.some(r => all(r).some(n => isDiagramRoot(n.type)))) return undefined;
    const traces = (ctx.data as { traces?: Trace[] } | undefined)?.traces ?? [];
    const previous = ctx.previousData as { states?: import('./state.ts').DiagramStates } | undefined;
    const states = advanceStates(previous?.states ?? {}, traces);
    const machines: Record<string, ReturnType<typeof machineStates>> = {};
    for (const node of ctx.roots.flatMap(all)) if (node.type === 'diagram:StateMachine') {
      const n = node as SceneNode;
      const props = resolveProps(n, ctx.state);
      const prev = ctx.previousState ? resolveProps(n, ctx.previousState).value : undefined;
      machines[n.id] = machineStates(graphStructure(n), props.value, prev);
    }
    return { traces, states, now: [...new Set(traces.filter(t => t.mode !== 'skip').flatMap(t => [...t.nodes, ...t.edges.map(e => e.id)]))], machines };
  },
};
export default definePlugin({
  id: 'diagram', title: 'Diagrams', version: '0.1.0', runtime: new URL('./runtime.tsx', import.meta.url), skill,
  components: Object.fromEntries(Object.entries(docs).map(([name, doc]) => [name, { doc, selfEvident: true, ...(required.has(name) ? { needsId: true } : {}) }])),
  legacyTypes: Object.fromEntries(Object.keys(docs).map(name => [name, `diagram:${name}`])),
  compile: hooks, schemas: { node: NodeData, step: FrameData },
});
