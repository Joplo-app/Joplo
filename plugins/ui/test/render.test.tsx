import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { $, flow, set } from '@joplo-app/kit';
import { applyPlayground, arbitrateAction, playgroundState, stateAt, type PlayState, type Project } from '@joplo-app/core';
import { I18nProvider } from '../../../packages/web/src/i18n/context';
import { Stage } from '../../../packages/web/src/renderer/Stage';
import { registerPluginRuntime } from '../../../packages/web/src/renderer/plugins';
import runtime from '../src/runtime.tsx';
import { Compare, Image, RatioBar, Text } from '../src/plugin.ts';
import { build, h, scenario } from './fixture.ts';

registerPluginRuntime(runtime);

function html(project: Project, state: PlayState, width = 1000, theme = 'sketch') {
  return renderToStaticMarkup(<I18nProvider explicit="en"><Stage project={project} state={state} theme={theme} mode="render"
    viewportOverride={{ width, height: 800 }} animate={false} /></I18nProvider>);
}
const tag = (out: string, id: string) => out.match(new RegExp('<[^>]+data-jid="' + id + '"[^>]*>'))?.[0];

describe('RatioBar in the stage', () => {
  const props = { id: 'ratio', labels: ['Used', 'Reserved'], remainderLabel: 'Available', unit: 'GB', height: 24 };
  it.each(['sketch', 'clean', 'nord'])('renders the denominator, explicit remainder, colors and threshold in %s', theme => {
    const project = build(h(RatioBar, { ...props, total: 200, left: 35, right: 25, colors: ['red', 'blue', 'green'], threshold: 80 })).project!;
    const out = html(project, stateAt(project, scenario, 0), 1000, theme);
    for (const text of ['Used 35GB / 200GB', 'Reserved 25GB / 200GB', 'Available 140GB / 200GB', 'Threshold 80GB', 'width:17.5%', 'width:12.5%', 'width:70%', 'left:40%', 'height:24px', '--jp-danger', '--jp-info', '--jp-ok']) expect(out).toContain(text);
  });
  it('updates all numeric bindings at a scripted state change', () => {
    const project = build(h(RatioBar, { ...props, total: $.data.total, left: $.ui.used, right: $.data.right, threshold: $.ui.limit }),
      flow('Show', { start: '/' }).system('Resize', set($.data.total, 200), set($.ui.used, 20), set($.data.right, 40), set($.ui.limit, 50)),
      { ui: { used: 35, limit: 80 }, data: { total: 100, right: 25 } }).project!;
    expect(html(project, stateAt(project, scenario, 0))).toContain('Available 40GB / 100GB');
    const out = html(project, stateAt(project, scenario, 1));
    for (const text of ['Available 140GB / 200GB', 'width:10%', 'width:20%', 'width:70%', 'left:25%']) expect(out).toContain(text);
  });
  it('distinguishes omitted optional counts from invalid or missing live data', () => {
    const project = build(h(RatioBar, { ...props, total: 100, left: 0 })).project!;
    const out = html(project, stateAt(project, scenario, 0));
    expect(out).toContain('Available 100GB / 100GB');
    expect(out).not.toContain('Reserved');
    for (const right of [undefined, -1, 110]) {
      const bound = build(h(RatioBar, { ...props, total: 100, left: 10, right: $.ui.right }), undefined, { ui: right === undefined ? {} : { right } }).project!;
      expect(html(bound, stateAt(bound, scenario, 0))).not.toContain('<figcaption');
    }
  });
});

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
