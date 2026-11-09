import { fixtureConfig as config } from '../../../scripts/test/fixtures.ts';
import { z } from 'zod';
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { feature, flow, option, page } from '@joplo-app/kit'; import { trace } from '@joplo-app/plugin-diagram';
import { definePlugin, pluginComponent, pluginEffect } from '@joplo-app/kit/plugin';
import { jsx } from '@joplo-app/kit/jsx-runtime';
import { Diagram } from '@joplo-app/plugin-diagram';
import { compile, type AuthoringProject } from '../src/compile.ts';

const h = (type: unknown, props: Record<string, unknown> = {}) => jsx(type, props);
function source(tree: any, plugins: any[] = [], effects: any[] = []): AuthoringProject {
  const file = '/p/test.tsx';
  return { root: '/p', config: { ...config({ name: 'Test', plugins }), file }, layouts: {}, routes: { '/': { ...page({ title: 'Home' }, tree), file } }, features: { f: { def: { ...feature({ name: 'F', goal: 'g', cases: {}, pick: 'a' }), file }, options: { a: { ...option({ name: 'A', idea: 'i', on: {}, scenarios: { s: flow('S', { start: '/' }).system('One', ...effects).system('Two') } }), file } } } } };
}

describe('plugin API v2', () => {
  it('runs normalization, derivation and effect lowering; stores only validated data', () => {
    const p = definePlugin({ id: 'probe', title: 'Probe', runtime: '/probe.js', schemas: { node: z.object({ measured: z.number() }), step: z.object({ value: z.number() }) }, components: { Item: { doc: 'item', needsId: true, selfEvident: true } }, compile: {
      node(n) { return { ...n, props: { ...n.props, label: 'normalized' } }; },
      derive() { return { data: { measured: 12 } }; },
      effect(e) { return { data: { value: e.payload }, targets: ['item'], references: ['item'] }; },
    } });
    const r = compile(source(h(pluginComponent(p, 'Item'), { id: 'item' }), [p], [pluginEffect('probe', 'show', 7)]), 'dev');
    expect(r.diagnostics).toEqual([]);
    expect(r.project?.scenes['f.a@/']?.root).toMatchObject({ props: { label: 'normalized' }, ext: { probe: { measured: 12 } } });
    expect(r.project?.scenarios['f.a.s']?.steps[0]).toMatchObject({ ext: { probe: { value: 7 } }, shots: [{ layer: '@page', targets: ['item'] }] });
    expect(JSON.stringify(r.project)).not.toContain('/probe.js');
  });
  it('converts hook failures into source diagnostics', () => {
    const p = definePlugin({ id: 'broken', title: 'Broken', runtime: '/broken.js', components: { Item: { doc: 'item' } }, compile: { node() { throw new Error('bad node'); } } });
    expect(() => compile(source(h(pluginComponent(p, 'Item')), [p]), 'dev')).not.toThrow();
    expect(compile(source(h(pluginComponent(p, 'Item')), [p]), 'dev').diagnostics.some(d => d.code === 'PLUGIN_HOOK_FAILED')).toBe(true);
  });
  it('enables the standard plugin and precomputes trace state at each step', () => {
    const tree = h(Diagram, { id: 'd', children: [h(Diagram.Node, { id: 'a' }), h(Diagram.Node, { id: 'b' }), h(Diagram.Edge, { from: 'a', to: 'b' })] });
    const r = compile(source(tree, [], [trace('a', 'b')]), 'dev');
    expect(r.diagnostics).toEqual([]);
    expect(r.project?.scenes['f.a@/']?.root.type).toBe('diagram:Diagram');
    const steps = r.project?.scenarios['f.a.s']?.steps;
    expect(steps?.[0]?.ext?.diagram).toMatchObject({ scenes: { 'f.a@/': { states: { a: { state: 'active' }, 'a->b': { state: 'active' } } } } });
    expect(steps?.[1]?.ext?.diagram).toMatchObject({ scenes: { 'f.a@/': { states: { a: { state: 'ok' } } } } });
  });
});

it('keeps content-family code out of core and the rendering host', () => {
  const files = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap(e => e.isDirectory() ? files(join(dir, e.name)) : /\.tsx?$/.test(e.name) ? [join(dir, e.name)] : []);
  const forbidden = /\b(?:Diagram|StateMachine|Sequence|diagramStateAt|resolveTrace|DIAGRAM_[A-Z_]+)\b/;
  const hits = ['packages/core/src', 'packages/web/src/renderer'].flatMap(files).filter(f => forbidden.test(readFileSync(f, 'utf8')));
  expect(hits).toEqual([]);
});

describe('plugin boundaries and data-only playback', () => {
  const graph = (children: unknown[] = []) => h(Diagram, { id: 'd', children: [h(Diagram.Node, { id: 'a', label: null }), h(Diagram.Node, { id: 'b', children: [] }), ...children] });
  it.each(['node', 'derive', 'effect', 'frame'] as const)('%s exceptions become diagnostics at author source', hook => {
    const p = definePlugin({ id: 'bad', title: 'Bad', runtime: '/bad.js', components: { Item: { doc: 'item' } }, compile: { [hook]: () => { throw new Error(`broken ${hook}`); } } });
    const tree = { ...h(pluginComponent(p, 'Item'), { id: 'item' }), source: '/p/test.tsx:9:3' };
    const r = compile(source(tree, [p], hook === 'effect' ? [pluginEffect('bad', 'show', null)] : []), 'dev');
    expect(r.project).toBeNull();
    expect(r.diagnostics.some(d => d.code === 'PLUGIN_HOOK_FAILED' && d.message.includes(hook))).toBe(true);
    if (hook === 'node' || hook === 'derive') expect(r.diagnostics.find(d => d.code === 'PLUGIN_HOOK_FAILED')?.at).toBe('test.tsx:9:3');
  });
  it('validates plugin schemas and catches schema exceptions', () => {
    for (const throwing of [false, true]) {
      const p = definePlugin({ id: 'bad', title: 'Bad', runtime: '/bad.js', components: { Item: { doc: 'item' } }, compile: { derive() { return { data: null }; } }, schemas: { node: { safeParse() { if (throwing) throw new Error('broken schema'); return { success: false, error: { message: 'expected measured geometry' } }; } } } });
      expect(compile(source(h(pluginComponent(p, 'Item')), [p]), 'dev').diagnostics.map(d => d.code)).toContain(throwing ? 'PLUGIN_HOOK_FAILED' : 'PLUGIN_DATA_INVALID');
    }
  });
  it('handles null, empty arrays, missing/duplicate ids and unknown/empty trace input without crashing', () => {
    const cases: [unknown, any[], string][] = [
      [h(Diagram, { children: [h(Diagram.Node, { id: null, label: null })] }), [], 'MISSING_ID'],
      [graph([h(Diagram.Node, { id: 'a' })]), [], 'DUPLICATE_ID'],
      [graph([h(Diagram.Edge, { from: null, to: [] })]), [], 'UNKNOWN_DIAGRAM_NODE'],
      [graph(), [trace('missing')], 'TRACE_UNKNOWN'],
      [graph(), [trace()], 'TRACE_UNKNOWN'],
      [graph(), [trace(null as never)], 'TRACE_UNKNOWN'],
    ];
    for (const [tree, effects, code] of cases) {
      const r = compile(source(tree, [], effects), 'dev');
      expect(r.diagnostics.map(d => d.code)).toContain(code);
      expect(r.project).toBeNull();
    }
    expect(compile(source(h(Diagram, { children: [] })), 'dev').project).not.toBeNull();
  });
  it('deduplicates generated connection ids while preserving explicit duplicate-id errors', () => {
    const r = compile(source(graph([h(Diagram.Edge, { from: 'a', to: 'b' }), h(Diagram.Edge, { from: 'a', to: 'b' })])), 'dev');
    expect(r.diagnostics).toEqual([]);
    expect(r.project!.scenes['f.a@/']!.root.children!.map(n => n.id)).toEqual(['a', 'b', 'a->b', 'a->b~2']);
    const bad = compile(source(graph([h(Diagram.Edge, { id: 'edge', from: 'a', to: 'b' }), h(Diagram.Edge, { id: 'edge', from: 'a', to: 'b' })])), 'dev');
    expect(bad.diagnostics.map(d => d.code)).toContain('DUPLICATE_ID');
  });
  it('plays JSON-roundtripped IR after all compiler hooks have become unavailable', async () => {
    const { stateAt, explainClick, cameraAt } = await import('../src/player.ts');
    const { focusAt } = await import('../src/focus.ts');
    let calls = 0;
    const p = definePlugin({ id: 'count', title: 'Count', runtime: '/count.js', schemas: { step: z.object({ ready: z.boolean() }) }, components: { Item: { doc: 'item', selfEvident: true } }, compile: { frame() { calls++; return { ready: true }; } } });
    const r = compile(source(graph([h(Diagram.Edge, { from: 'a', to: 'b' })]), [p], [trace.fail('a', 'b')]), 'dev');
    const project = JSON.parse(JSON.stringify(r.project));
    const n = calls;
    p.compile!.frame = () => { throw new Error('browser must not call me'); };
    const state = stateAt(project, 'f.a.s', 1);
    expect(explainClick(project, state, 'a').kind).toBe('static');
    expect(cameraAt(project, 'f.a.s', 1).perLayer['@page']).toEqual(['a', 'b']);
    expect(focusAt(project, 'f.a.s', 1).targets).toEqual(['a', 'b']);
    expect(project.scenarios['f.a.s'].steps[0].ext.diagram.scenes['f.a@/'].states.b.state).toBe('error');
    expect(calls).toBe(n);
  });

});

it('browser drawing modules do not import compile-time state or layout engines', () => {
  for (const file of ['runtime.tsx', 'render-layout.ts']) {
    const source = readFileSync(`plugins/diagram/src/${file}`, 'utf8');
    expect(source).not.toMatch(/^import (?!type).*from ['"]\.\/(?:state|machine|compile|elk)['"]/m);
    expect(source).not.toMatch(/(?:diagramStateAt|advanceStates|machineStates|layoutFor|elkLayout)\s*\(/);
  }
});
