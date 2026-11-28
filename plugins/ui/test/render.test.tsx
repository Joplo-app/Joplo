import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { $, flow, set } from '@joplo-app/kit';
import { applyPlayground, arbitrateAction, playgroundState, stateAt, type PlayState, type Project } from '@joplo-app/core';
import { I18nProvider } from '../../../packages/web/src/i18n/context';
import { Stage } from '../../../packages/web/src/renderer/Stage';
import { registerPluginRuntime } from '../../../packages/web/src/renderer/plugins';
import runtime from '../src/runtime.tsx';
import { Compare, Image, Text } from '../src/plugin.ts';
import { build, h, scenario } from './fixture.ts';

registerPluginRuntime(runtime);

function html(project: Project, state: PlayState, width = 1000, theme = 'sketch') {
  return renderToStaticMarkup(<I18nProvider explicit="en"><Stage project={project} state={state} theme={theme} mode="render"
    viewportOverride={{ width, height: 800 }} animate={false} /></I18nProvider>);
}
const tag = (out: string, id: string) => out.match(new RegExp('<[^>]+data-jid="' + id + '"[^>]*>'))?.[0];

describe('Compare in the stage', () => {
  const tree = (mode = 'auto') => h(Compare, { id: 'policy', mode, defaultValue: 'a', value: $.ui.pick },
    h(Compare.Side, { id: 'keep', value: 'a', label: 'Keep draft' }, h(Text, {}, 'Keep contents')),
    h(Compare.Side, { id: 'clear', value: 'b', label: 'Clear draft' }, h(Text, {}, 'Clear contents')));
  it.each([['auto', 767, true], ['auto', 768, false], ['toggle', 1300, true], ['side-by-side', 390, false]] as const)('renders %s at %i with requested visibility', (mode, width, stacked) => {
    const project = build(tree(mode), flow('Show', { start: '/' }).select('policy', 'b')).project!;
    const initial = html(project, stateAt(project, scenario, 0), width);
    const after = html(project, stateAt(project, scenario, 1), width);
    expect(initial).toContain('aria-pressed="true" data-jchoice="a"');
    expect(after).toContain('aria-pressed="true" data-jchoice="b"');
    expect(tag(initial, 'clear')?.includes('inert=""')).toBe(stacked);
    expect(tag(after, 'keep')?.includes('aria-hidden="true"')).toBe(stacked);
    expect(tag(after, 'clear')).not.toContain('inert');
    expect(tag(initial, 'keep')?.includes('grid-area:1 / 1')).toBe(stacked);
  });
  it('reads a bound value and dispatches a reversible native selection', () => {
    const project = build(tree('toggle'), flow('Show', { start: '/' }).system('Wait'), { ui: { pick: 'b' } }).project!;
    const timeline = stateAt(project, scenario, 0);
    expect(tag(html(project, timeline), 'keep')).toContain('inert');
    const result = arbitrateAction(project, timeline, { type: 'select', target: 'policy', value: 'a' });
    expect(result.kind).toBe('free');
    if (result.kind !== 'free') throw new Error('Expected local selection');
    const view = playgroundState(timeline, applyPlayground(null, result.effects));
    expect(view.ui.pick).toBe('a');
    expect(tag(html(project, view), 'clear')).toContain('inert');
    expect(timeline.ui.pick).toBe('b');
  });
});

it('renders a bound image source with its fit and omits anchors until pixels are available', () => {
  const svg = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="80" height="40"/>';
  const project = build(h(Image, { id: 'photo', src: $.ui.src, alt: 'Quota', fit: 'fill', w: 160, h: 100 },
    h(Image.Region, { id: 'quota', rect: [0, 0, 0.5, 1] })), flow('Show', { start: '/' }).system('Load', set($.ui.src, svg))).project!;
  const before = html(project, stateAt(project, scenario, 0));
  expect(before).not.toContain('<img');
  expect(tag(before, 'quota')).toBeUndefined();
  const loading = html(project, stateAt(project, scenario, 1));
  expect(loading).toContain('object-fit:fill');
  expect(loading).toContain('data:image/svg+xml');
  expect(tag(loading, 'quota')).toBeUndefined();
});
