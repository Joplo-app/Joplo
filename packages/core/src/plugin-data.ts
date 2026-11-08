/** Pure IR operations for declared plugin data. No plugin callback is executed here. */
import type { PluginDataSpec, PluginScopeRule } from '@joplo-app/kit/plugin';
import type { Project, SceneNode } from './schema.ts';
import { JoploError } from './result.ts';
type Table = Record<string, { data?: PluginDataSpec }> | undefined;
const obj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
function atPath(value: unknown, path: readonly string[], transform: (v: unknown) => unknown): unknown {
  if (!path.length) return transform(value);
  const [key, ...rest] = path;
  if (Array.isArray(value)) return value.map((v, i) => key === '*' || key === String(i) ? atPath(v, rest, transform) : v);
  if (obj(value)) return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, key === '*' || key === k ? atPath(v, rest, transform) : v]));
  return value;
}
function values(value: unknown, path: readonly string[]): unknown[] {
  const out: unknown[] = [];
  atPath(value, path, v => { out.push(v); return v; });
  return out;
}
export function mapSlotTexts(ext: Record<string, unknown> | undefined, plugins: Table, slot: 'node' | 'step', visit: (s: string) => string): Record<string, unknown> | undefined {
  if (!ext) return ext;
  return Object.fromEntries(Object.entries(ext).map(([id, value]) => [id, (plugins?.[id]?.data?.[slot]?.text ?? []).reduce((v, path) => atPath(v, path, s => typeof s === 'string' ? visit(s) : s), value)]));
}
export function scopePluginData(project: Project): Project {
  const ids = new Map<string, Set<string>>();
  const collect = (n: SceneNode, set: Set<string>) => { set.add(n.id); n.children?.forEach(c => collect(c, set)); };
  for (const scene of Object.values(project.scenes)) { const set = new Set<string>(); collect(scene.root, set); ids.set(scene.id, set); }
  const union = new Set([...ids.values()].flatMap(x => [...x]));
  const rules = (value: unknown, specs: readonly PluginScopeRule[], scene?: string): unknown => specs.reduce((data, rule) => atPath(data, rule.path, v => {
    const allowed = rule.domain === 'scene' ? new Set(ids.keys()) : scene ? ids.get(scene) ?? new Set<string>() : union;
    const keep = (id: unknown) => typeof id !== 'string' || allowed.has(rule.prefix && id.startsWith(rule.prefix) ? id.slice(rule.prefix.length) : id);
    if (rule.kind === 'reference') return keep(v) ? v : null;
    if (rule.kind === 'map' && obj(v)) return Object.fromEntries(Object.entries(v).filter(([k]) => keep(k)).map(([k, item]) => [k, rules(item, rule.children ?? [], rule.domain === 'scene' ? k : scene)]));
    if (rule.kind === 'values' && Array.isArray(v)) return v.filter(keep);
    if (rule.kind === 'items' && Array.isArray(v)) return v.filter(item => (rule.references ?? [['id']]).every(path => values(item, path).every(keep))).map(item => rules(item, rule.children ?? [], scene));
    return v;
  }), value);
  const ext = (input: Record<string, unknown> | undefined, slot: 'node' | 'step', scene?: string) => {
    if (!input) return input;
    return Object.fromEntries(Object.entries(input).map(([id, value]) => {
      const spec = project.plugins?.[id]?.data?.[slot]?.scope;
      if (!spec) throw new JoploError('PLUGIN_SCOPE_UNSUPPORTED', `Plugin ${id} has ${slot} data without a scope projection; declare its scope rules before sharing a subset`);
      return [id, spec === 'global' ? value : rules(value, spec, scene)];
    }));
  };
  const node = (n: SceneNode, scene: string): SceneNode => ({ ...n, ...(n.ext ? { ext: ext(n.ext, 'node', scene) } : {}), ...(n.children ? { children: n.children.map(c => node(c, scene)) } : {}) });
  return {
    ...project,
    scenes: Object.fromEntries(Object.entries(project.scenes).map(([id, scene]) => [id, { ...scene, root: node(scene.root, id) }])),
    scenarios: Object.fromEntries(Object.entries(project.scenarios).map(([id, sc]) => [id, { ...sc, ...(sc.ext ? { ext: ext(sc.ext, 'step') } : {}), steps: sc.steps.map(st => ({ ...st, ...(st.ext ? { ext: ext(st.ext, 'step') } : {}) })) }])),
  };
}
