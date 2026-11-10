import '../../../scripts/test/render-fixtures.ts';
import { fixtureConfig as config } from '../../../scripts/test/fixtures.ts';
import { expect, it } from 'vitest';
import { createElement, useState } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { feature, flow, work, page } from '@joplo-app/kit';
import { Text } from '@joplo-app/plugin-ui';
import { definePlugin, defineRuntime, pluginComponent } from '@joplo-app/kit/plugin';
import { jsx } from '@joplo-app/kit/jsx-runtime';
import { compile, stateAt } from '@joplo-app/core';
import { Stage } from '../src/renderer/Stage';
import { registerPluginRuntime } from '../src/renderer/plugins';

it.each([false, true])('renders React containers with working hooks and host children (nested selection: %s)', nested => {
  const p = definePlugin({ id: 'container', title: 'Container', runtime: '/container.js', components: { Box: { doc: 'box' } } });
  registerPluginRuntime(defineRuntime({ id: p.id, components: { Box: { react: ({ ctx }) => {
    const [label] = useState('shared-react');
    return <section {...ctx.node.attrs} data-test={label}>{ctx.renderChildren(nested ? ctx.node.children[0]?.children : undefined)}</section>;
  } } } }));
  const file = '/p/test.tsx';
  const child = jsx(Text, { id: 'child', children: 'Rendered by host' });
  const tree = jsx(pluginComponent(p, 'Box'), { id: 'box', children: nested ? jsx('div', { children: child }) : child });
  const r = compile({ root: '/p', config: { ...config({ name: 'Test', plugins: [p] }), file }, layouts: {}, routes: { '/': { ...page({ title: 'Page' }, tree), file } }, features: { f: { def: { ...feature({ name: 'F', goal: 'g', cases: {}, pick: 'a' }), file }, works: { a: { ...work({ title: 'A', summary: 'i', on: {}, scenarios: { s: flow('S', { start: '/' }).system('One') } }), file } } } } }, 'dev');
  expect(r.diagnostics).toEqual([]);
  const project = r.project!;
  const html = renderToStaticMarkup(createElement(Stage, { project, state: stateAt(project, 'f.a.s', 0), theme: 'sketch', mode: 'render', animate: false }));
  expect(html).toContain('data-test="shared-react"');
  expect(html).toMatch(/<section[^>]*data-jid="box"[^>]*>[\s\S]*data-jid="child"[\s\S]*Rendered by host[\s\S]*<\/section>/);
});
