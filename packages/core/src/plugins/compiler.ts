import { jsonData, snapshot, object, strings, syncResult, authoringData, materialize, errorMessage } from './data.ts';
/** Node-side plugin host. Callbacks never enter IR or the player. */
import { isNode, type JNode } from '@joplo-app/kit/node';
import { PLUGIN_API_VERSION, type PluginDef, type PluginEffectDef, type PluginReport } from '@joplo-app/kit/plugin';
import standard from '@joplo-app/plugin-diagram';
import { initialState, applyStep, resolveProps, type PlayState } from '../player.ts';
import type { Scene, SceneNode, Project } from '../schema.ts';
import type { PluginInfo } from '../catalog.ts';
import type { GraphLayoutEngine } from '@joplo-app/plugin-diagram/model';

export const standardPlugins: readonly PluginDef[] = [standard];
export type CompileOptions = { layout?: GraphLayoutEngine; pluginOptions?: Record<string, Record<string, unknown>> };
export function enabledPlugins(configured: unknown): unknown[] {
  return [...standardPlugins, ...(Array.isArray(configured) ? configured : [])];
}
export class PluginCompiler {
  readonly defs = new Map<string, PluginDef>();
  readonly info: Record<string, PluginInfo> = {};
  constructor(configured: unknown, private report: PluginReport, source?: string, private options: CompileOptions = {}) {
    if (configured !== undefined && !Array.isArray(configured)) report('PLUGIN_INVALID', 'config({ plugins }) must be a list of plugins', source);
    for (const raw of enabledPlugins(configured)) {
      const p = raw as PluginDef | null;
      if (!p || typeof p !== 'object' || p.kind !== 'plugin' || typeof p.id !== 'string' || !p.components || typeof p.components !== 'object' || Array.isArray(p.components)) { report('PLUGIN_INVALID', 'config({ plugins }) entries must be made with definePlugin', source); continue; }
      if (this.defs.has(p.id)) { report('PLUGIN_DUPLICATE', `Plugin ${p.id} is enabled twice in config({ plugins })`, source); continue; }
      if (p.apiVersion !== 1 && p.apiVersion !== PLUGIN_API_VERSION) { report('PLUGIN_INVALID', `Plugin ${p.id} targets API ${p.apiVersion}; supported: 1, ${PLUGIN_API_VERSION}`, source); continue; }
      this.defs.set(p.id, p);
      this.info[p.id] = { ...(p.data ? { data: this.envelope(p, p.data, source) as PluginInfo['data'] } : {}), id: p.id, title: p.title, ...(p.version ? { version: p.version } : {}), components: Object.fromEntries(Object.entries(p.components).map(([name, c]) => [name, { ...(c?.interactive ? { interactive: true } : {}), ...(c?.parent ? { parent: c.parent } : {}), ...(c?.needsId ? { needsId: true } : {}), ...(c?.selfEvident ? { selfEvident: true } : {}) }])) };
    }
  }
  private run<T>(p: PluginDef, hook: string, at: string | undefined, fn: () => T): T | undefined {
    try { return fn(); } catch (e) { this.report('PLUGIN_HOOK_FAILED', `Plugin ${p.id} ${hook}: ${errorMessage(e)}`, at); return undefined; }
  }
  private output<T>(p: PluginDef, value: T, at?: string, authoring = false): T | undefined {
    const synchronous = syncResult(value);
    try { return materialize(synchronous, authoring ? 'authoring' : 'hook'); }
    catch (e) { this.report('PLUGIN_DATA_INVALID', `Plugin ${p.id}: ${errorMessage(e)}`, at); return undefined; }
  }
  node(node: JNode, ids: ReadonlyMap<string, string | undefined>): JNode {
    const p = this.defs.get(node.type.split(':')[0]!);
    if (!p) {
      for (const def of this.defs.values()) if (def.legacyTypes?.[node.type]) this.report('PLUGIN_LEGACY_TYPE', `Legacy component ${node.type}: recompile with the current kit; use ${def.legacyTypes[node.type]} in IR`, node.source);
      return node;
    }
    const result = this.run(p, 'node', node.source, () => {
      const n = this.output(p, p.compile?.node?.(snapshot(node), { ids: new Map(ids), report: this.report }), node.source, true);
      if (n === undefined) return node;
      if (!isNode(n) || typeof n.type !== 'string' || !object(n.props)) {
        this.report('PLUGIN_DATA_INVALID', `Plugin ${p.id} node must return a node with string type and object props`, node.source); return node;
      }
      try { authoringData(n.props); } catch { this.invalid(p, node.source); return node; }
      // Only this node's type/props can be normalized; children already have checked identities.
      return { ...node, type: n.type, props: n.props };
    });
    return result ?? node;
  }
  derive(scene: Scene): void {
    const visit = (node: SceneNode) => {
      const p = this.defs.get(node.type.split(':')[0]!);
      if (p?.compile?.derive) {
        this.run(p, 'derive', node.source, () => {
          const result = this.output(p, p.compile!.derive!(snapshot(node), { viewport: scene.viewport, report: this.report, options: snapshot(this.options.pluginOptions?.[p.id] ?? { layout: this.options.layout }) }), node.source);
          if (result === undefined) return;
          if (!object(result) || Object.keys(result).some(k => k !== 'data' && k !== 'framing')) { this.invalid(p, node.source); return; }
          if (result.data !== undefined) {
            const data = this.checkData(p, 'node', result.data, node.source);
            if (data !== undefined) node.ext = { ...node.ext, [p.id]: data };
          }
          if (result.framing !== undefined) {
            const nodes = new Map<string, SceneNode>();
            const collect = (n: SceneNode) => { nodes.set(n.id, n); n.children?.forEach(collect); }; collect(node);
            const framing = this.envelope(p, result.framing, node.source);
            if (!object(framing) || Object.entries(framing).some(([id, f]) => !nodes.has(id) || !object(f) || Object.keys(f).some(k => k !== 'include' && k !== 'kind') || f.include !== undefined && !strings(f.include) || f.kind !== undefined && !['root', 'group', 'block', 'content', 'edge', 'row'].includes(String(f.kind)))) { this.invalid(p, node.source); return; }
            for (const [id, frame] of Object.entries(framing)) nodes.get(id)!.framing = frame as SceneNode['framing'];
          }
        });
      }
      for (const c of node.children ?? []) visit(c);
    };
    visit(scene.root);
    // Identities are stage-local and remain an invariant after every derivation pass.
    const ids = new Set<string>();
    const checkIdentity = (n: SceneNode) => {
      if (typeof n.id !== 'string' || !n.id) this.report('MISSING_ID', 'Derived node requires a nonempty id', n.source);
      else if (ids.has(n.id)) this.report('DUPLICATE_ID', `Duplicate id "${n.id}" after plugin derivation in ${scene.id}`, n.source);
      ids.add(n.id);
      for (const child of n.children ?? []) checkIdentity(child);
    };
    checkIdentity(scene.root);
  }
  effect(effect: PluginEffectDef, scenes: readonly Scene[], data: unknown, source?: string) {
    const p = this.defs.get(effect.plugin);
    if (!p?.compile?.effect) { this.report('PLUGIN_EFFECT_UNKNOWN', `Plugin ${effect.plugin} has no effect compiler for ${effect.name}`, source); return undefined; }
    return this.run(p, 'effect', source, () => {
      const result = this.output(p, p.compile!.effect!(snapshot(effect), { roots: snapshot(scenes.map(s => s.root)), scenes: snapshot(scenes.map(s => ({ id: s.id, root: s.root }))), data: snapshot(data), source, report: this.report }), source);
      if (result === undefined) return;
      if (!object(result) || Object.keys(result).some(k => !['data', 'targets', 'references'].includes(k)) || result.targets !== undefined && !strings(result.targets) || result.references !== undefined && !strings(result.references)) { this.invalid(p, source); return; }
      const value = result.data === undefined ? undefined : this.envelope(p, result.data, source);
      return { ...(value !== undefined ? { data: value } : {}), ...(result.targets ? { targets: [...result.targets] } : {}), ...(result.references ? { references: [...result.references] } : {}) };
    });
  }
  frames(project: Project): void {
    for (const sc of Object.values(project.scenarios)) {
      const scenes = Object.values(project.scenes).filter(s => s.optionId === sc.optionId || s.optionId == null).map(s => ({ id: s.id, root: s.root }));
      const roots = scenes.map(s => s.root);
      let previousState: PlayState | undefined;
      let state = initialState(project, sc.id);
      let previousData: Record<string, unknown> = {};
      for (let i = 0; i <= sc.steps.length; i++) {
        if (i) {
          try { state = applyStep(project, sc, state); }
          catch { /* Invalid author steps are diagnosed by replay/check; compilation must still return IR. */ }
        }
        const target = i ? sc.steps[i - 1]! : sc;
        const ext = { ...target.ext };
        for (const p of this.defs.values()) {
          if (p.compile?.frame) {
            const value = this.run(p, 'frame', target.source, () => this.output(p, p.compile!.frame!({ roots: snapshot(roots), scenes: snapshot(scenes), state: snapshot(state), previousState: snapshot(previousState), resolveProps: (node, previous) => resolveProps(node, snapshot(previous && previousState ? previousState : state)), data: snapshot(target.ext?.[p.id]), previousData: snapshot(previousData[p.id]), position: i, report: this.report }), target.source));
            if (value !== undefined) ext[p.id] = value;
          }
        }
        // Validate every final slot, including effect data left unchanged by an abstaining frame.
        const validated: Record<string, unknown> = {};
        for (const [id, value] of Object.entries(ext)) {
          const p = this.defs.get(id);
          if (!p) { this.report('PLUGIN_DATA_INVALID', `Unregistered plugin slot ${id}`, target.source); continue; }
          const data = this.checkData(p, 'step', value, target.source);
          if (data !== undefined) validated[id] = data;
        }
        if (Object.keys(validated).length) target.ext = validated;
        else delete target.ext;
        previousData = validated;
        previousState = state;
      }
    }
  }
  private invalid(p: PluginDef, at?: string) { this.report('PLUGIN_DATA_INVALID', `Plugin ${p.id}: invalid hook output envelope`, at); }
  private envelope(p: PluginDef, value: unknown, at?: string): unknown {
    try { return jsonData(value); } catch (e) { this.report('PLUGIN_DATA_INVALID', `Plugin ${p.id}: ${errorMessage(e)}`, at); return undefined; }
  }
  private checkData(p: PluginDef, slot: 'node' | 'step', value: unknown, at?: string): unknown {
    if (value === undefined) return;
    const data = this.envelope(p, value, at);
    if (data === undefined) return;
    return this.run(p, `${slot} schema`, at, () => {
      const schema = p.schemas?.[slot];
      if (!schema) { this.report('PLUGIN_DATA_INVALID', `Plugin ${p.id} writes ${slot} data without a schema`, at); return; }
      const r = syncResult(schema.safeParse(snapshot(data)));
      if (!r || r.success !== true) { this.report('PLUGIN_DATA_INVALID', `Plugin ${p.id} ${slot}: ${r?.error?.message ?? 'invalid data'}`, at); return; }
      return data;
    });
  }
}
