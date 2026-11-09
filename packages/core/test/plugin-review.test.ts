import { trace as pluginTrace } from '@joplo-app/plugin-diagram/effects';
import { describe, expect, it } from 'vitest';
import { config, feature, flow, option, page, layer, trace, Slot } from '@joplo-app/kit';
import { jsx as h } from '@joplo-app/kit/jsx-runtime';
import { Diagram, StateMachine } from '@joplo-app/kit/ui';
import { definePlugin, pluginComponent, pluginEffect } from '@joplo-app/kit/plugin';
import { compile, type AuthoringProject } from '../src/compile.ts';
import { scopeProject } from '../src/scope.ts';
import { featureDiff } from '../src/feature-diff.ts';
import { localizeProject } from '../src/content-i18n.ts';
import legacy from './fixtures/legacy-diagram-publish.json';
const file = '/p/test.tsx';
const schema = { safeParse: () => ({ success: true }) };
function plugin(hooks: any, extra: any = {}) { return definePlugin({ id: 'probe', title: 'Probe', runtime: '/probe.js', components: { Item: { doc: 'item' } }, schemas: { node: schema, step: schema }, compile: hooks, ...extra }); }
function source(tree: any, plugins: any[] = [], effects: any[] = []): AuthoringProject {
  return { root: '/p', config: { ...config({ name: 'Test', plugins }), file }, layouts: {}, routes: { '/': { ...page({ title: 'Home' }, tree), file } }, features: { f: { def: { ...feature({ name: 'F', goal: 'g', cases: {}, pick: 'a' }), file }, options: { a: { ...option({ name: 'A', idea: 'i', on: {}, scenarios: { s: flow('S', { start: '/' }).system('One', ...effects).system('Two') } }), file } } } } };
}
describe('P1-A review regressions', () => {
  it('rechecks identities after derive, even if trusted code changes an external scene reference', async () => {
    const { PluginCompiler } = await import('../src/plugins/compiler.ts');
    const scene: any = { id: 'stage', optionId: null, route: '/', name: 'Stage', viewport: 'desktop', root: { id: 'root', type: 'probe:Item' } };
    const p = plugin({ derive() { scene.root.children = [{ id: 'same', type: 'ui:Text' }, { id: 'same', type: 'ui:Text' }]; } });
    const codes: string[] = [];
    new PluginCompiler([p], code => { codes.push(code); }).derive(scene);
    expect(codes).toContain('DUPLICATE_ID');
  });
  it('keeps kit compatibility markers identical to the published plugin factories', () => {
    expect(trace('a', 'b')).toEqual(pluginTrace('a', 'b'));
    expect(trace.fail('a', 'b')).toEqual(pluginTrace.fail('a', 'b'));
    expect(trace.skip('a')).toEqual(pluginTrace.skip('a'));
  });
  it.each(['node', 'derive', 'effect', 'frame'])('diagnoses rejected async %s hooks without unhandled rejection', async hook => {
    const p = plugin({ [hook]: async () => { throw new Error('async hook'); } });
    const result = compile(source(h(pluginComponent(p, 'Item'), {}), [p], hook === 'effect' ? [pluginEffect('probe', 'x', null)] : []), 'publish');
    await Promise.resolve();
    expect(result.project).toBeNull();
    expect(result.diagnostics.map(d => d.code)).toContain('PLUGIN_HOOK_FAILED');
  });
  it.each([NaN, Infinity, () => 1, new Array(2)])('rejects non-JSON slot output %s', value => {
    const p = plugin({ frame: () => ({ value }) });
    const r = compile(source(h(pluginComponent(p, 'Item'), {}), [p]), 'publish');
    expect(r.project).toBeNull();
    expect(r.diagnostics.map(d => d.code)).toContain('PLUGIN_DATA_INVALID');
  });
  it.each(['dev', 'publish'] as const)('rejects cyclic slot data before recursive processing (%s)', mode => {
    const p = plugin({ frame() { const cycle: any = {}; cycle.self = cycle; return cycle; } });
    const result = compile(source(h(pluginComponent(p, 'Item'), {}), [p]), mode);
    expect(result.project).toBeNull();
    expect(result.diagnostics.map(d => d.code)).toContain('PLUGIN_DATA_INVALID');
  });
  it('rejects cyclic normalized props before the core property conversion', () => {
    const p = plugin({ node(n: any) { const value: any = {}; value.self = value; return { ...n, props: { value } }; } });
    const r = compile(source(h(pluginComponent(p, 'Item'), {}), [p]), 'publish');
    expect(r.project).toBeNull();
    expect(r.diagnostics.map(d => d.code)).toContain('PLUGIN_DATA_INVALID');
  });
  it.each([
    { node: () => ({ type: null, props: null }) },
    { effect: () => ({ targets: 1, references: 1 }) },
  ])('diagnoses malformed hook results before consumption', hooks => {
    const p = plugin(hooks);
    const result = compile(source(h(pluginComponent(p, 'Item'), {}), [p], hooks.effect ? [pluginEffect('probe', 'x', null)] : []), 'dev');
    expect(result.project).toBeNull();
    expect(result.diagnostics.map(d => d.code)).toContain('PLUGIN_DATA_INVALID');
  });
  it.each([
    { frame(ctx: any) { ctx.state.data.injected = 'hook'; return {}; } },
    { derive(n: any) { n.children = [{ id: 'same', type: 'ui:Text' }, { id: 'same', type: 'ui:Text' }]; } },
    { derive(n: any) { n.ext = { other: { unchecked: true } }; } },
  ])('isolates live state, identity and other namespaces', hooks => {
    const p = plugin(hooks);
    const result = compile(source(h(pluginComponent(p, 'Item'), {}), [p]), 'publish');
    expect(result.project).toBeNull();
    expect(result.diagnostics.map(d => d.code)).toContain('PLUGIN_HOOK_FAILED');
  });
  it('removes omitted contributions from both the node tree and every derived slot', () => {
    const s = source(h(Diagram, { id: 'd', children: [h(Diagram.Node, { id: 'public', label: 'Public' }), h(Slot, { name: 'nodes' })] }));
    s.features.g = { def: { ...feature({ name: 'Secret feature', goal: 'secret', cases: {}, pick: 'a' }), file }, options: { a: { ...option({ name: 'Secret', idea: 'secret', on: { '/': { nodes: h(Diagram.Node, { id: 'secret', label: 'SECRET-LABEL', description: 'SECRET-DESCRIPTION' }) } }, scenarios: { s: flow('Secret', { start: '/' }).system('Secret') } }), file } } };
    for (const mode of ['dev', 'publish', 'review'] as const) {
      const result = compile(s, mode);
      expect(result.diagnostics).toEqual([]);
      const scoped = scopeProject(result.project!, ['f.a.s']).project;
      expect(JSON.stringify(scoped)).not.toMatch(/SECRET-LABEL|SECRET-DESCRIPTION|"secret"/);
      expect(JSON.stringify(result.project)).toContain('SECRET-LABEL');
    }
  });
  it('projects scenario and step snapshots for omitted stages, leaving no omitted id/text anywhere', () => {
    const s = source(h(Diagram, { id: 'public_graph', children: [h(Diagram.Node, { id: 'public' })] }));
    s.routes['/private'] = { ...page({ title: 'Private', layout: false }, h(StateMachine, { id: 'secret_machine', value: 'secret_state', children: h(StateMachine.State, { id: 'secret_state', label: 'SECRET-STATE-LABEL' }) })), file };
    const r = compile(s, 'publish');
    expect(r.diagnostics).toEqual([]);
    expect(JSON.stringify(r.project!.scenarios['f.a.s']!.ext)).toContain('secret_state');
    const scoped = scopeProject(r.project!, ['f.a.s']).project;
    expect(JSON.stringify(scoped)).not.toMatch(/secret_state|secret_machine|SECRET-STATE-LABEL/);
  });
  it('projects arbitrary plugin node/initial/step caches by declared ownership, not component names', () => {
    const rows = (root: any): any[] => [ ...(root.props?.label ? [{ element: root.id, text: root.props.label }] : []), ...(root.children ?? []).flatMap(rows) ];
    const rule = { path: ['rows'], kind: 'items', references: [['element']] };
    const p = plugin({ derive: (node: any) => ({ data: { rows: rows(node) } }), frame: ({ scenes }: any) => ({ byScene: Object.fromEntries(scenes.map((s: any) => [s.id, { rows: rows(s.root) }])) }) }, {
      data: { node: { text: [['rows', '*', 'text']], scope: [rule] }, step: { text: [['byScene', '*', 'rows', '*', 'text']], scope: [{ path: ['byScene'], kind: 'map', domain: 'scene', children: [rule] }] } },
    });
    const s = source(h(pluginComponent(p, 'Item'), { id: 'root', children: [h('ui:Text', { id: 'public', label: 'Public' }), h(Slot, { name: 'foreign' })] }), [p]);
    s.features.g = { def: { ...feature({ name: 'G', goal: 'g', cases: {}, pick: 'a' }), file }, options: { a: { ...option({ name: 'G', idea: 'g', on: { '/': { foreign: h('ui:Text', { id: 'cut', label: 'SECRET-CACHE-LABEL', children: 'SECRET-CACHE-LABEL' }) } }, scenarios: { s: flow('G', { start: '/' }).system('G') } }), file } } };
    const r = compile(s, 'publish');
    expect(r.diagnostics).toEqual([]);
    expect(JSON.stringify(r.project!.scenarios['f.a.s']!.ext)).toContain('SECRET-CACHE-LABEL');
    const scoped = scopeProject(r.project!, ['f.a.s']).project;
    expect(JSON.stringify(scoped)).not.toMatch(/"cut"|SECRET-CACHE-LABEL/);
    expect(JSON.stringify(scoped)).toContain('Public');
  });
  it('fails closed for undeclared projection instead of publishing an unknown cache', () => {
    const p = plugin({ derive: () => ({ data: { label: 'Cached content' } }) });
    const r = compile(source(h(pluginComponent(p, 'Item'), {}), [p]), 'publish');
    expect(() => scopeProject(r.project!, ['f.a.s'])).toThrow(/without a scope projection/);
  });
  it('keys same-id state machines by stage, preserving legal cross-page ids', () => {
    const machine = (ids: string[], value: string) => h(StateMachine, { id: 'machine', value, children: ids.map(id => h(StateMachine.State, { id, label: id })) });
    const s = source(machine(['a', 'b'], 'a'));
    s.routes['/other'] = { ...page({ title: 'Other' }, machine(['x', 'y'], 'y')), file };
    s.features.f!.options.a!.layers = { left: layer('Left', machine(['a', 'b'], 'a')), right: layer('Right', machine(['x', 'y'], 'y')) };
    const r = compile(s, 'dev');
    expect(r.diagnostics).toEqual([]);
    const frame = r.project!.scenarios['f.a.s']!.ext!.diagram as any;
    expect(frame.scenes['f.a@/'].machines.machine.current).toBe('a');
    expect(frame.scenes['f.a@/other'].machines.machine.current).toBe('y');
    expect(frame.scenes['f.a~left'].machines.machine.current).toBe('a');
    expect(frame.scenes['f.a~right'].machines.machine.current).toBe('y');
  });
  it('translates only declared slot text, preserves ids, and retains translations', () => {
    const p = plugin({ derive: () => ({ data: { label: 'Only plugin label', id: 'Only plugin label' } }), frame: () => ({ label: 'Frame label' }) }, { data: { node: { text: [['label']] }, step: { text: [['label']] } } });
    const s = source(h(pluginComponent(p, 'Item'), {}), [p]);
    s.config.locales = ['en', 'zh-CN']; s.locales = { 'zh-CN': { 'Only plugin label': '插件标签', 'Frame label': '帧标签' } };
    const r = compile(s, 'publish');
    expect(r.diagnostics).toEqual([]);
    const localized = localizeProject(r.project!, 'zh-CN');
    expect(localized.scenes['@/']!.root.ext!.probe).toEqual({ label: '插件标签', id: 'Only plugin label' });
    expect(localized.scenarios['f.a.s']!.ext!.probe).toEqual({ label: '帧标签' });
    expect(localized.scenarios['f.a.s']!.steps[0]!.ext!.probe).toEqual({ label: '帧标签' });
  });
  it('compares initial plugin snapshots', () => {
    let label = 'before';
    const p = plugin({ frame: ({ position }: any) => ({ label: position ? 'same' : label }) });
    const s = source(h(pluginComponent(p, 'Item'), {}), [p]);
    const before = compile(s, 'publish').project!; label = 'after';
    const after = compile(s, 'publish').project!;
    expect(featureDiff(before, after).scenarios[0]).toMatchObject({ status: 'modified', reasons: ['initial-state'] });
  });
  it('can compare a genuine b817425 Diagram publish IR with itself', () => {
    expect(featureDiff(legacy, legacy).status).toBe('unchanged');
    const privateIR = structuredClone(legacy) as any;
    Object.values(privateIR.scenes).forEach((s: any) => { s.root.note = 'private'; });
    expect(() => featureDiff(privateIR, legacy)).toThrow(/Private authoring data/);
    const bad = structuredClone(legacy) as any;
    Object.values(bad.scenes).forEach((s: any) => { s.root.layout.privateNote = 'private'; });
    expect(() => featureDiff(bad, legacy)).toThrow(/Invalid public/);
  });
});
