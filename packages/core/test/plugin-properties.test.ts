import { fixtureConfig as config } from '../../../scripts/test/fixtures.ts';
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { feature, flow, layer, work, page, set, $ } from '@joplo-app/kit';
import { definePlugin, pluginComponent, pluginEffect, type PluginDef } from '@joplo-app/kit/plugin';
import { jsx } from '@joplo-app/kit/jsx-runtime';
import { compile, projectThemes, stateAt, cameraAt, type AuthoringProject } from '../src/index.ts';

const probe = (): PluginDef => definePlugin({
  id: 'probe', title: 'Second property/theme provider', runtime: '/probe.js', components: {},
  properties: { badge: { type: 'string', nonempty: true, attribute: 'data-jp-probe-badge' }, priority: { type: 'number', min: 0, max: 5, attribute: 'data-jp-probe-priority' }, pinned: { type: 'boolean' } },
  themes: { night: ':root { --jp-ink: #ddeeff; --jp-stroke: clean; } [data-jp-probe-badge] { outline: 1px solid red; }' },
  compile: { effect() { return { writes: [{ path: 'ui.probe.ready', value: true }], directorTarget: 'node', references: ['node'] }; } },
});
function source(p: PluginDef, props: Record<string, unknown> = {}, effect = pluginEffect(p.id, 'show', null)): AuthoringProject {
  const file = '/p/test.tsx';
  return { root: '/p', config: { ...config({ name: 'Generic', theme: 'probe:night', plugins: [p] }), file }, layouts: {},
    routes: { '/': { ...page({ title: 'Home' }, jsx('div', { children: 'home' })), file } },
    features: { f: { def: { ...feature({ name: 'F', goal: 'G', cases: {}, pick: 'a' }), file }, works: { a: { ...work({ title: 'A', summary: 'I',
      layers: { first: layer('First', jsx('div', { children: 'first' })), second: layer('Second', jsx('div', { id: 'node', ...props })) },
      scenarios: { second: flow('Second', { from: 'first' }).system('Still', set($.ui.next, 1)), first: flow('First', { start: '/' }).system('Write', effect) },
    }), file } } } } };
}
const codes = (r: ReturnType<typeof compile>) => r.diagnostics.map(d => d.code);

describe('universal plugin properties and themes', () => {
  it('validates a second provider on ordinary host elements and publishes only data', () => {
    const p = probe();
    const r = compile(source(p, { badge: 'on', priority: 0, pinned: false }), 'publish');
    expect(r.diagnostics).toEqual([]);
    const project = JSON.parse(JSON.stringify(r.project));
    expect(project.scenes['f.a~second'].root.props).toMatchObject({ badge: 'on', priority: 0, pinned: false });
    expect(project.plugins.probe.properties).toEqual(p.properties);
    expect(projectThemes(project)['probe:night']).toBe(p.themes!.night);
    expect(JSON.stringify(project)).not.toMatch(/probe\.js|compile|schemas/);
    p.compile!.effect = () => { throw new Error('Player may never execute authoring hooks'); };
    expect(stateAt(project, 'f.a.first', 1).ui.probe).toEqual({ ready: true });
    expect(stateAt(project, 'f.a.second', 0).ui.probe).toEqual({ ready: true });
    expect(cameraAt(project, 'f.a.first', 1).directorLayer).toBe('second');
    expect(project.scenarios['f.a.first'].steps[0].shots).toEqual([]);
    expect(project.scenarios['f.a.second'].initial.layer).toBe('second');
  });
  it.each([{ badge: '' }, { badge: $.ui.x }, { priority: -1 }, { priority: 6 }, { priority: NaN }, { pinned: 'yes' }])('rejects invalid literal values %j', props => {
    expect(codes(compile(source(probe(), props), 'dev'))).toContain('PLUGIN_PROPERTY_INVALID');
  });
  it('validates properties introduced by another component plugin too', () => {
    const p = probe();
    p.components.Item = { doc: 'container' };
    const s = source(p);
    s.features.f!.works.a!.layers!.second!.tree = jsx(pluginComponent(p, 'Item'), { id: 'node', priority: 9 });
    expect(codes(compile(s, 'dev'))).toContain('PLUGIN_PROPERTY_INVALID');
  });
  it.each(['data-jid', 'onclick', 'data-jp-other-badge'])('cannot overwrite host/other plugin anchors with %s', attribute => {
    const p = probe(); p.properties!.badge!.attribute = attribute;
    expect(codes(compile(source(p), 'dev'))).toContain('PLUGIN_PROPERTY_INVALID');
  });
  it('rejects duplicate properties from unrelated plugins', () => {
    const p = probe(); const s = source(p);
    s.config.plugins!.push(definePlugin({ id: 'other', title: 'Other', runtime: '/other.js', components: {}, properties: { badge: { type: 'boolean' } } }));
    expect(codes(compile(s, 'dev'))).toContain('PLUGIN_PROPERTY_CONFLICT');
  });
  it('namespaces themes and rejects malformed declarations', () => {
    const p = probe(); p.themes!['bad/name'] = 'body {}';
    expect(codes(compile(source(p), 'dev'))).toContain('PLUGIN_THEME_INVALID');
  });
  it('checks JSON writes before replay, including undefined nested values', () => {
    const p = probe(); p.compile!.effect = () => ({ writes: [{ path: 'ui.probe.value', value: { bad: undefined } }] });
    expect(codes(compile(source(p), 'dev'))).toContain('PLUGIN_DATA_INVALID');
  });
  it('accepts ordinary numeric/hyphenated state path segments', () => {
    const p = probe(); p.compile!.effect = () => ({ writes: [{ path: 'ui.item-list.0', value: 3 }] });
    const r = compile(source(p), 'dev');
    expect(r.diagnostics).toEqual([]);
    expect(stateAt(r.project!, 'f.a.first', 1).ui['item-list']).toEqual({ '0': 3 });
  });
  it('checks properties after component normalization', () => {
    const p = probe(); p.components.Item = { doc: 'item' };
    p.compile!.node = node => ({ ...node, props: { ...node.props, priority: 9 } });
    const s = source(p); s.features.f!.works.a!.layers!.second!.tree = jsx(pluginComponent(p, 'Item'), { id: 'node' });
    expect(codes(compile(s, 'dev'))).toContain('PLUGIN_PROPERTY_INVALID');
  });
  it.each(['ui.__proto__.x', 'ui.constructor.x', 'document.body', 'ui'])('rejects unsafe/non-state write path %s', path => {
    const p = probe(); p.compile!.effect = () => ({ writes: [{ path, value: true }] });
    expect(codes(compile(source(p), 'dev'))).toContain('PLUGIN_DATA_INVALID');
  });
});

it('keeps explainer semantics out of the engine, renderer and player, including plugin host modules', () => {
  const files = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap(e => e.isDirectory() ? files(join(dir, e.name)) : /\.(ts|tsx|css)$/.test(e.name) ? [join(dir, e.name)] : []);
  const forbidden = /\bCanvas\b|\bcamera\(|__camera|CAMERA_(?:UNKNOWN|INVALID)|data-jcanvas|data-jmotion|data-jp-content-|\b(?:motionDelay|motionMs|canvasFrame|CanvasCamera)\b|props\??\.motion(?:Delay|Ms)?\b/;
  const hits = ['packages/core/src', 'packages/web/src/renderer', 'packages/web/src/player'].flatMap(files).filter(f => forbidden.test(readFileSync(f, 'utf8')));
  expect(hits).toEqual([]);
  for (const file of ['packages/core/src/player.ts', 'packages/core/src/focus.ts']) expect(readFileSync(file, 'utf8')).not.toMatch(/from ['"].*(?:plugin-content|plugins\/compiler)/);
});
