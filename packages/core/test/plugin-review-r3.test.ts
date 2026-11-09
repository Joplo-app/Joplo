import { describe, expect, it } from 'vitest';
import { config, feature, flow, option, page } from '@joplo-app/kit';
import { jsx as h } from '@joplo-app/kit/jsx-runtime';
import { definePlugin, pluginComponent, pluginEffect } from '@joplo-app/kit/plugin';
import { compile, type AuthoringProject } from '../src/compile.ts';
import { featureDiff, readPublicProject } from '../src/feature-diff.ts';
import { materialize } from '../src/plugins/data.ts';

const file = '/p/test.tsx:1:1';
const schema = { safeParse: () => ({ success: true }) };
function source(hooks: any, effect = false): AuthoringProject {
  const p = definePlugin({ id: 'probe', title: 'Probe', runtime: '/probe.js', components: { Item: { doc: 'item' } }, schemas: { node: schema, step: schema }, compile: hooks });
  return {
    root: '/p', config: { ...config({ name: 'Depth', plugins: [p] }), file }, layouts: {},
    routes: { '/': { ...page({ title: 'Home' }, h(pluginComponent(p, 'Item'), { id: 'item' })), file } },
    features: { f: { def: { ...feature({ name: 'F', goal: 'g', cases: {}, pick: 'a' }), file }, options: { a: { ...option({ name: 'A', idea: 'i', on: {}, scenarios: { s: flow('S', { start: '/' }).system('One', ...(effect ? [pluginEffect('probe', 'x', null)] : [])) } }), file } } } },
  };
}
function dag(depth: number) {
  const all: any[] = [{}];
  for (let i = 1; i <= depth; i++) all.push({ prev: all[i - 1] });
  return { all, root: all[depth] };
}
function chain(depth: number): unknown {
  let value: unknown = 'leaf';
  for (let i = 0; i < depth; i++) value = { prev: value };
  return value;
}
function maxDepth(value: unknown): number {
  return value && typeof value === 'object' && Object.keys(value).length ? 1 + Math.max(...Object.values(value).map(maxDepth)) : 0;
}
function expectTree(value: unknown, seen = new Set<object>()): void {
  if (!value || typeof value !== 'object') return;
  expect(seen.has(value), 'the materialized JSON tree must have no aliases or cycles').toBe(false);
  seen.add(value);
  for (const child of Object.values(value)) expectTree(child, seen);
}

describe('R3 materialization follows final JSON paths', () => {
  it.each(['hook', 'authoring', 'json'] as const)('rejects the shallow-first 150-level DAG in %s mode', mode => {
    expect(() => materialize(dag(150), mode)).toThrow(/depth <= 100/);
  });
  it.each(['hook', 'authoring', 'json'] as const)('expands valid shared references into independent copies in %s mode', mode => {
    const shared = { label: 'Shared', nested: { count: 1 } };
    const input = { first: shared, second: shared, list: [shared, shared] };
    const copy = materialize(input, mode);
    expect(copy).toEqual(JSON.parse(JSON.stringify(input)));
    expectTree(copy);
    copy.first.nested.count = 2;
    expect(copy.second.nested.count).toBe(1);
    expect(shared.nested.count).toBe(1);
  });
  it('captures source descriptors once while expanding repeated references', () => {
    let captures = 0;
    const shared = new Proxy({ value: { label: 'Stable' } }, { ownKeys(target) { captures++; return Reflect.ownKeys(target); } });
    const copy = materialize({ a: shared, b: shared });
    expectTree(copy);
    expect(captures).toBe(1);
    expect(copy.a).toEqual(copy.b);
  });
  it('checks the primitive leaf at the exact depth boundary too', () => {
    expect(maxDepth(materialize(chain(100), 'json'))).toBe(100);
    expect(() => materialize(chain(101), 'json')).toThrow(/depth <= 100/);
  });
  it('rejects cycles while allowing a shallow DAG', () => {
    const cycle: any = {}; cycle.prev = cycle;
    expect(() => materialize(cycle, 'json')).toThrow(/acyclic/);
    const copy = materialize(dag(8), 'json');
    expectTree(copy);
    expect(copy).toEqual(JSON.parse(JSON.stringify(dag(8))));
  });
});

describe('R3 successful publish IR is readable after serialization', () => {
  it.each(['node', 'derive', 'effect', 'frame'])('diagnoses excessive shared depth from a %s hook before publication', hook => {
    const value = dag(150);
    const hooks = { [hook]: (node: any) => hook === 'node' ? { ...node, props: { value } } : hook === 'frame' ? value : { data: value } };
    const r = compile(source(hooks, hook === 'effect'), 'publish');
    expect(r.project).toBeNull();
    expect(r.diagnostics.map(d => d.code)).toContain('PLUGIN_DATA_INVALID');
  });
  it('round-trips a supported DAG and can diff the published data against itself', () => {
    const r = compile(source({ frame: () => dag(8) }), 'publish');
    expect(r.diagnostics).toEqual([]);
    expect(r.project).not.toBeNull();
    expectTree(r.project!.scenarios['f.a.s']!.ext!.probe);
    const published = JSON.parse(JSON.stringify(r.project));
    expect(() => readPublicProject(published)).not.toThrow();
    expect(featureDiff(published, published).status).toBe('unchanged');
  });
  it('allows a complete publish tree whose deepest primitive is at depth 100', () => {
    const r = compile(source({ frame: () => ({ root: chain(93) }) }), 'publish');
    expect(r.diagnostics).toEqual([]);
    expect(r.project).not.toBeNull();
    const published = JSON.parse(JSON.stringify(r.project));
    expect(maxDepth(published)).toBe(100);
    expect(() => readPublicProject(published)).not.toThrow();
    expect(featureDiff(published, published).status).toBe('unchanged');
  });
  it('includes the IR envelope when enforcing the depth limit before success', () => {
    const r = compile(source({ frame: () => ({ root: chain(94) }) }), 'publish');
    expect(r.project).toBeNull();
    expect(r.diagnostics.map(d => d.code)).toContain('PLUGIN_DATA_INVALID');
  });
});
