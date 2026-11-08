/** Node-side plugin host. Callbacks never enter IR or the player. */
import type { JNode } from '@joplo-app/kit/node';
import { PLUGIN_API_VERSION, type PluginDef, type PluginEffectDef, type PluginReport } from '@joplo-app/kit/plugin';
import standard from '@joplo-app/plugin-diagram';
import { initialState, applyStep, type PlayState } from '../player.ts';
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
      this.info[p.id] = { id: p.id, title: p.title, ...(p.version ? { version: p.version } : {}), components: Object.fromEntries(Object.entries(p.components).map(([name, c]) => [name, { ...(c?.interactive ? { interactive: true } : {}), ...(c?.parent ? { parent: c.parent } : {}), ...(c?.needsId ? { needsId: true } : {}), ...(c?.selfEvident ? { selfEvident: true } : {}) }])) };
    }
  }
  private run<T>(p: PluginDef, hook: string, at: string | undefined, fn: () => T): T | undefined {
    try { return fn(); } catch (e) { this.report('PLUGIN_HOOK_FAILED', `Plugin ${p.id} ${hook}: ${e instanceof Error ? e.message : String(e)}`, at); return undefined; }
  }
  node(node: JNode, ids: ReadonlyMap<string, string | undefined>): JNode {
    const p = this.defs.get(node.type.split(':')[0]!);
    if (!p) {
      for (const def of this.defs.values()) if (def.legacyTypes?.[node.type]) this.report('PLUGIN_LEGACY_TYPE', `Legacy component ${node.type}: recompile with the current kit; use ${def.legacyTypes[node.type]} in IR`, node.source);
      return node;
    }
    return this.run(p, 'node', node.source, () => p.compile?.node?.(node, { ids, report: this.report })) ?? node;
  }
  derive(scene: Scene): void {
    const visit = (node: SceneNode) => {
      const p = this.defs.get(node.type.split(':')[0]!);
      if (p?.compile?.derive) {
        this.run(p, 'derive', node.source, () => p.compile!.derive!(node, { viewport: scene.viewport, report: this.report, options: this.options.pluginOptions?.[p.id] ?? { layout: this.options.layout } }));
        this.checkData(p, 'node', node.ext?.[p.id], node.source);
      }
      for (const c of node.children ?? []) visit(c);
    };
    visit(scene.root);
  }
  effect(effect: PluginEffectDef, roots: readonly SceneNode[], data: unknown, source?: string) {
    const p = this.defs.get(effect.plugin);
    if (!p?.compile?.effect) { this.report('PLUGIN_EFFECT_UNKNOWN', `Plugin ${effect.plugin} has no effect compiler for ${effect.name}`, source); return undefined; }
    return this.run(p, 'effect', source, () => p.compile!.effect!(effect, { roots, data, source, report: this.report }));
  }
  frames(project: Project): void {
    for (const sc of Object.values(project.scenarios)) {
      const roots = Object.values(project.scenes).filter(s => s.optionId === sc.optionId || s.optionId == null).map(s => s.root);
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
            const value = this.run(p, 'frame', target.source, () => p.compile!.frame!({ roots, state, previousState, data: target.ext?.[p.id], previousData: previousData[p.id], position: i, report: this.report }));
            if (value !== undefined) ext[p.id] = value;
          }
          this.checkData(p, 'step', ext[p.id], target.source);
        }
        if (Object.keys(ext).length) target.ext = ext;
        previousData = ext;
        previousState = state;
      }
    }
  }
  private checkData(p: PluginDef, slot: 'node' | 'step', value: unknown, at?: string): void {
    if (value === undefined) return;
    this.run(p, `${slot} schema`, at, () => {
      const schema = p.schemas?.[slot];
      if (!schema) { this.report('PLUGIN_DATA_INVALID', `Plugin ${p.id} writes ${slot} data without a schema`, at); return; }
      const r = schema.safeParse(value);
      if (r && !r.success) this.report('PLUGIN_DATA_INVALID', `Plugin ${p.id} ${slot}: ${r.error?.message ?? 'invalid data'}`, at);
    });
  }
}
