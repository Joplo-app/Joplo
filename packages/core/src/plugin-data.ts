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
function values(value: unknown, path: readonly string[], required: boolean): unknown[] {
  if (!path.length) return [value];
  const [key, ...rest] = path;
  if (Array.isArray(value) || obj(value)) {
    if (key === '*') return Object.values(value).flatMap(v => values(v, rest, required));
    if (Object.hasOwn(value, key!)) return values((value as Record<string, unknown>)[key!], rest, required);
  }
  if (required) throw new JoploError('PLUGIN_SCOPE_UNSUPPORTED', 'Missing scene identity in a stage ownership path');
  return [];
}
/** Shared path projection for slot text and declared component display properties. */
export function mapTextPaths(value: unknown, paths: readonly (readonly string[])[], visit: (s: string) => string): unknown {
  return paths.reduce((v, path) => atPath(v, path, s => typeof s === 'string' ? visit(s) : s), value);
}
export function mapSlotTexts(ext: Record<string, unknown> | undefined, plugins: Table, slot: 'node' | 'step', visit: (s: string) => string): Record<string, unknown> | undefined {
  if (!ext) return ext;
  return Object.fromEntries(Object.entries(ext).map(([id, value]) => [id, mapTextPaths(value, plugins?.[id]?.data?.[slot]?.text ?? [], visit)]));
}
export function scopePluginData(project: Project): Project {
  const ids = new Map<string, Set<string>>();
  const collect = (n: SceneNode, set: Set<string>) => { set.add(n.id); n.children?.forEach(c => collect(c, set)); };
  for (const scene of Object.values(project.scenes)) { const set = new Set<string>(); collect(scene.root, set); ids.set(scene.id, set); }
  const unsupported = (message: string): never => { throw new JoploError('PLUGIN_SCOPE_UNSUPPORTED', message); };
  const rules = (value: unknown, specs: readonly PluginScopeRule[], scene?: string): unknown => specs.reduce((data, rule) => atPath(data, rule.path, v => {
    const allowed = rule.domain === 'scene' ? new Set(ids.keys()) : scene && ids.get(scene);
    if (!allowed) return unsupported('Element scope projection requires an unambiguous owning stage; declare a scene-domain map or items parent');
    const identity = (id: unknown): string => {
      if (typeof id !== 'string' || !id) return unsupported('Scope projection requires a nonempty scene/element identity');
      const normalized = rule.prefix && id.startsWith(rule.prefix) ? id.slice(rule.prefix.length) : id;
      if (!normalized) return unsupported('Scope projection requires a nonempty scene/element identity after removing its prefix');
      return normalized;
    };
    const keep = (id: unknown) => allowed.has(identity(id));
    if (rule.kind === 'reference') return v === null || keep(v) ? v : null;
    if (rule.kind === 'map' && obj(v)) return Object.fromEntries(Object.entries(v).filter(([k]) => keep(k)).map(([k, item]) => [k, rules(item, rule.children ?? [], rule.domain === 'scene' ? identity(k) : scene)]));
    if (rule.kind === 'values' && Array.isArray(v)) return v.filter(keep);
    if (rule.kind === 'items' && Array.isArray(v)) return v.flatMap(item => {
      const refs = (rule.references ?? [['id']]).map(path => values(item, path, rule.domain === 'scene'));
      const identities = refs.flat().map(identity);
      if (!identities.length) return unsupported('Scope items must declare their scene/element identity');
      if (rule.domain === 'scene') {
        if (refs.some(matches => !matches.length) || new Set(identities).size !== 1) return unsupported('Scene-domain items require exactly one owning stage');
        const owner = identities[0]!;
        return allowed.has(owner) ? [rules(item, rule.children ?? [], owner)] : [];
      }
      return identities.every(id => allowed.has(id)) ? [rules(item, rule.children ?? [], scene)] : [];
    });
    return unsupported(`Invalid ${rule.kind} scope data for scene/element projection`);
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
