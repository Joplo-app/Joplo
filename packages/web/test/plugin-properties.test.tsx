import '../../../scripts/test/render-fixtures.ts';
import { fixtureConfig as config } from '../../../scripts/test/fixtures.ts';
import { expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { feature, flow, work, page } from '@joplo-app/kit';
import { Text } from '@joplo-app/plugin-ui';
import { definePlugin, defineRuntime, pluginComponent } from '@joplo-app/kit/plugin';
import { jsx } from '@joplo-app/kit/jsx-runtime';
import { compile, projectThemes, stateAt } from '@joplo-app/core';
import { Stage } from '../src/renderer/Stage';
import { registerPluginRuntime } from '../src/renderer/plugins';
import { allThemesCss } from '../src/renderer/themes';

it('carries second-plugin properties onto host DOM and child anchors, with scoped plugin theme CSS', () => {
  const p = definePlugin({ id: 'labels', title: 'Labels', runtime: '/labels.js',
    components: { Box: { doc: 'test container' } }, properties: { badge: { type: 'string', attribute: 'data-jp-labels-badge' }, weight: { type: 'number', attribute: 'data-jp-labels-weight' } },
    themes: { orange: ':root { --jp-accent: #ff8800; } [data-jp-labels-badge] { color: red; }' },
  });
  registerPluginRuntime(defineRuntime({ id: p.id, components: { Box: { react: ({ ctx }) => <section {...ctx.node.attrs} data-child={ctx.node.children[0]?.attrs['data-jp-labels-badge']}>{ctx.renderChildren()}</section> } } }));
  const file = '/p/test.tsx';
  const tree = jsx(pluginComponent(p, 'Box'), { id: 'box', badge: 'parent', children: jsx(Text, { id: 'text', badge: 'child', weight: 0, children: 'One' }) });
  const r = compile({ root: '/p', config: { ...config({ name: 'Test', theme: 'labels:orange', plugins: [p] }), file }, layouts: {}, routes: { '/': { ...page({ title: 'Page' }, tree), file } }, features: { f: { def: { ...feature({ name: 'F', goal: 'g', cases: {}, pick: 'a' }), file }, works: { a: { ...work({ title: 'A', summary: 'i', scenarios: { s: flow('S', { start: '/' }) } }), file } } } } }, 'dev');
  expect(r.diagnostics).toEqual([]);
  const project = r.project!;
  const html = renderToStaticMarkup(<Stage project={project} state={stateAt(project, 'f.a.s', 0)} theme="labels:orange" mode="render" animate={false} />);
  expect(html).toContain('data-jp-labels-badge="parent"');
  expect(html).toContain('data-child="child"');
  expect(html).toMatch(/data-jp-labels-badge="child"[^>]*data-jp-labels-weight="0"[^>]*data-jid="text"/);
  expect(allThemesCss(projectThemes(project))).toContain('[data-theme="labels:orange"]');
  expect(allThemesCss(projectThemes(project))).toContain('[data-jp-labels-badge]');
});
