import { fixtureConfig as config } from '../../../scripts/test/fixtures.ts';
import { describe, expect, it } from 'vitest';
import { $, feature, flow, option, page, Slot } from '@joplo-app/kit';
import { jsx as h } from '@joplo-app/kit/jsx-runtime';
import { definePlugin, pluginComponent, pluginEffect, type PluginScopeRule } from '@joplo-app/kit/plugin';
import { compile, type AuthoringProject } from '../src/compile.ts';
import { scopeProject } from '../src/scope.ts';

const file = '/p/test.tsx:1:1';
const schema = { safeParse: () => ({ success: true }) };
function plugin(hooks: any, extra: any = {}) {
  return definePlugin({ id: 'probe', title: 'Probe', runtime: '/probe.js', components: { Item: { doc: 'item' } }, schemas: { node: schema, step: schema }, compile: hooks, ...extra });
}
function source(p: ReturnType<typeof plugin>, effects: any[] = []): AuthoringProject {
  return {
    root: '/p', config: { ...config({ name: 'Test', plugins: [p] }), file }, layouts: {},
    routes: { '/': { ...page({ title: 'Home' }, h(pluginComponent(p, 'Item'), { id: 'public', label: 'Public', children: h(Slot, { name: 'contrib' }) })), file } },
    features: { f: { def: { ...feature({ name: 'F', goal: 'g', cases: {}, pick: 'a' }), file }, options: { a: { ...option({ name: 'A', idea: 'i', on: {}, scenarios: { s: flow('S', { start: '/' }).system('One', ...effects).system('Two') } }), file } } } },
  };
}
const rows = (root: any): any[] => [...(root.props?.label ? [{ id: root.id, text: root.props.label }] : []), ...(root.children ?? []).flatMap(rows)];
function stageSource(p: ReturnType<typeof plugin>) {
  const s = source(p);
  s.routes['/other'] = { ...page({ title: 'Other' }, h('ui:Text', { id: 'secret', label: 'ALLOWED-TEXT' })), file };
  s.features.h = { def: { ...feature({ name: 'H', goal: 'h', cases: {}, pick: 'a' }), file }, options: { a: { ...option({ name: 'H', idea: 'h', on: {}, scenarios: { s: flow('Other', { start: '/other' }).system('Other') } }), file } } };
  s.features.g = { def: { ...feature({ name: 'G', goal: 'g', cases: {}, pick: 'a' }), file }, options: { a: { ...option({ name: 'G', idea: 'g', on: { '/': { contrib: h('ui:Text', { id: 'secret', label: 'OMITTED-SECRET-TEXT', children: h('ui:Text', { id: 'omitted_only', label: 'OMITTED-ONLY-TEXT' }) }) } }, scenarios: { s: flow('Private', { start: '/' }).system('Private') } }), file } } };
  return s;
}

describe('R2-1 stage ownership in scope projection', () => {
  it.each(['dev', 'publish', 'review'] as const)('projects scene-domain items using each stage, across the whole IR (%s)', mode => {
    const p = plugin({ frame: ({ scenes }: any) => ({ stages: scenes.map((s: any) => ({ id: s.id, rows: rows(s.root) })) }) }, {
      data: { step: { scope: [{ path: ['stages'], kind: 'items', domain: 'scene', children: [{ path: ['rows'], kind: 'items' }] }] } },
    });
    const r = compile(stageSource(p), mode);
    expect(r.diagnostics).toEqual([]);
    expect(JSON.stringify(r.project)).toContain('OMITTED-SECRET-TEXT');
    const scoped = scopeProject(r.project!, ['f.a.s', 'h.a.s']).project;
    expect(JSON.stringify(scoped)).not.toMatch(/OMITTED-SECRET-TEXT|OMITTED-ONLY-TEXT|omitted_only/);
    expect(JSON.stringify(scoped)).toContain('ALLOWED-TEXT');
    for (const sc of Object.values(scoped.scenarios)) for (const value of [sc.ext, ...sc.steps.map(st => st.ext)]) {
      for (const stage of (value!.probe as any).stages) {
        expect(stage.rows).toEqual(rows(scoped.scenes[stage.id]!.root));
      }
    }
  });
  it.each(['items', 'map'] as const)('propagates prefixed scene identities for %s', kind => {
    const p = plugin({ frame: ({ scenes }: any) => ({ stages: kind === 'items' ? scenes.map((s: any) => ({ owner: { stage: `stage:${s.id}` }, rows: rows(s.root) })) : Object.fromEntries(scenes.map((s: any) => [`stage:${s.id}`, { rows: rows(s.root) }])) }) }, {
      data: { step: { scope: [{ path: ['stages'], kind, domain: 'scene', prefix: 'stage:', references: [['owner', 'stage']], children: [{ path: ['rows'], kind: 'items' }] }] } },
    });
    const r = compile(stageSource(p), 'publish');
    expect(r.diagnostics).toEqual([]);
    const scoped = scopeProject(r.project!, ['f.a.s', 'h.a.s']).project;
    expect(JSON.stringify(scoped)).not.toContain('OMITTED-SECRET-TEXT');
    expect(JSON.stringify(scoped)).toContain('ALLOWED-TEXT');
    expect(JSON.stringify(scoped.scenarios['h.a.s']!.ext)).toContain('ALLOWED-TEXT');
  });
  it.each(['missing', 'null', 'multiple', 'partial-path', 'empty-references', 'unscoped-elements'])('fails closed when stage ownership is %s', variant => {
    const rule: PluginScopeRule = variant === 'unscoped-elements' ? { path: ['stages'], kind: 'items' } : {
      path: ['stages'], kind: 'items', domain: 'scene',
      ...(variant === 'multiple' ? { references: [['owners', '*']] } : variant === 'partial-path' ? { references: [['owners', '*', 'id']] } : variant === 'empty-references' ? { references: [] } : {}),
      children: [{ path: ['rows'], kind: 'items' }],
    };
    const p = plugin({ frame: ({ scenes }: any) => ({ stages: [{
      ...(variant === 'null' ? { id: null } : variant === 'multiple' ? { owners: scenes.map((s: any) => s.id) } : variant === 'partial-path' ? { owners: [{ id: scenes[0].id }, {}] } : variant === 'empty-references' ? { id: scenes[0].id } : variant === 'unscoped-elements' ? { id: 'secret' } : {}),
      rows: [{ id: 'secret', text: 'OMITTED-SECRET-TEXT' }],
    }] }) }, { data: { step: { scope: [rule] } } });
    const r = compile(stageSource(p), 'publish');
    expect(r.diagnostics).toEqual([]);
    expect(() => scopeProject(r.project!, ['f.a.s', 'h.a.s'])).toThrow(/stage|scene/i);
  });
});

describe('R2-2 stable hook output before validation', () => {
  it.each(['props', 'type'])('rejects changing node %s accessors before the core consumes them', field => {
    let reads = 0;
    const p = plugin({ node(n: any) {
      return Object.defineProperty({ ...n }, field, { enumerable: true, get: () => field === 'props' ? (++reads < 3 ? {} : null) : (++reads === 1 ? 'probe:Item' : Symbol('broken')) });
    } });
    const r = compile(source(p), 'publish');
    expect(r.project).toBeNull();
    expect(r.diagnostics.map(d => d.code)).toContain('PLUGIN_DATA_INVALID');
    expect(reads).toBe(0);
  });
  it.each(['node', 'derive', 'effect', 'frame'])('rejects nested accessors in %s outputs without executing them', hook => {
    let reads = 0;
    const value = Object.defineProperty({}, 'label', { enumerable: true, get() { reads++; return 'unstable'; } });
    const p = plugin({ [hook]: (n: any) => hook === 'node' ? { ...n, props: { value } } : hook === 'frame' ? { value } : { data: { value } } });
    const r = compile(source(p, hook === 'effect' ? [pluginEffect('probe', 'x', null)] : []), 'publish');
    expect(r.project).toBeNull();
    expect(r.diagnostics.map(d => d.code)).toContain('PLUGIN_DATA_INVALID');
    expect(reads).toBe(0);
  });
  it.each(['derive', 'effect', 'frame'])('never invokes %s output toJSON methods', hook => {
    let calls = 0;
    const value = { label: 'safe', toJSON() { calls++; return { label: 'different' }; } };
    const p = plugin({ [hook]: () => hook === 'frame' ? value : { data: value } });
    const r = compile(source(p, hook === 'effect' ? [pluginEffect('probe', 'x', null)] : []), 'publish');
    expect(r.project).toBeNull();
    expect(r.diagnostics.map(d => d.code)).toContain('PLUGIN_DATA_INVALID');
    expect(calls).toBe(0);
  });
  it('captures authoring bindings as stable values while preserving normal normalization', () => {
    const p = plugin({ node: (n: any) => ({ ...n, props: { ...n.props, label: $.data.title } }) });
    const s = source(p); s.features.f!.options.a!.state = { data: { title: 'Bound title' } };
    const r = compile(s, 'publish');
    expect(r.diagnostics).toEqual([]);
    expect(r.project!.scenes['@/']!.root.props!.label).toBe('$data.title');
  });
  it.each(['node', 'derive', 'effect', 'frame'])('rejects an accessor named then in %s without running it', hook => {
    let reads = 0;
    const p = plugin({ [hook]: (n: any) => Object.defineProperty(hook === 'node' ? { ...n } : {}, 'then', { enumerable: true, get() { reads++; return undefined; } }) });
    const r = compile(source(p, hook === 'effect' ? [pluginEffect('probe', 'x', null)] : []), 'publish');
    expect(r.project).toBeNull();
    expect(r.diagnostics.map(d => d.code)).toContain('PLUGIN_DATA_INVALID');
    expect(reads).toBe(0);
  });
  it.each(['node', 'derive', 'effect', 'frame'])('diagnoses an unreadable %s output without escaping the boundary', hook => {
    const error = { toString() { throw new Error('unreadable error'); } };
    const p = plugin({ [hook]: () => new Proxy({}, { ownKeys() { throw error; } }) });
    const r = compile(source(p, hook === 'effect' ? [pluginEffect('probe', 'x', null)] : []), 'publish');
    expect(r.project).toBeNull();
    expect(r.diagnostics.map(d => d.code)).toContain('PLUGIN_DATA_INVALID');
  });
});

describe('R2-3 validate the final slot even when frame abstains', () => {
  it('keeps schema-owned slot fields intact during publication metadata stripping', () => {
    const value = { source: 'public provenance' };
    const check = { safeParse: (v: any) => ({ success: v.source === value.source }) };
    const p = plugin({ derive: () => ({ data: value }), frame: () => value }, { schemas: { node: check, step: check } });
    const r = compile(source(p), 'publish');
    expect(r.diagnostics).toEqual([]);
    for (const sc of Object.values(r.project!.scenes)) expect(sc.root.ext!.probe).toEqual(value);
    const sc = r.project!.scenarios['f.a.s']!;
    for (const ext of [sc.ext, ...sc.steps.map(st => st.ext)]) expect(ext!.probe).toEqual(value);
  });
  it.each(['reject', 'missing', 'accept', 'replace'])('checks effect slot with %s schema/frame result', variant => {
    const seen: unknown[] = [];
    const p = plugin({ effect: () => ({ data: { WRONG: 'bad' } }), frame: ({ position }: any) => variant === 'replace' && position === 1 ? { good: true } : undefined }, {
      schemas: variant === 'missing' ? {} : { step: { safeParse(value: unknown) { seen.push(value); return { success: variant === 'accept' || variant === 'replace' && (value as any).good === true }; } } },
    });
    const r = compile(source(p, [pluginEffect('probe', 'x', null)]), 'publish');
    if (variant === 'reject' || variant === 'missing') {
      expect(r.project).toBeNull();
      expect(r.diagnostics.map(d => d.code)).toContain('PLUGIN_DATA_INVALID');
      if (variant === 'reject') expect(seen).toEqual([{ WRONG: 'bad' }]);
    } else {
      expect(r.diagnostics).toEqual([]);
      const value = variant === 'accept' ? { WRONG: 'bad' } : { good: true };
      expect(seen).toEqual([value]);
      expect(r.project!.scenarios['f.a.s']!.steps[0]!.ext!.probe).toEqual(value);
    }
  });
});
