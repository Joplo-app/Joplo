import { compileStage, renderStage } from '../../content/test/plugin-stage.tsx';
import { $, callout, chapter, highlight, set, shot, spotlight } from '@joplo-app/kit';
import { jsx } from '@joplo-app/kit/jsx-runtime';
import { expect, it } from 'vitest';
import diagram, { TimeLanes } from '../src/plugin.ts';

const auth = { id: 'auth', lane: 'Gateway', start: -10, end: 30, label: 'Authorize', status: 'ok' };
const read = { id: 'read', lane: 'Storage', start: 10, end: 90, status: 'warn' };
const instant = { id: 'tick', lane: 'Gateway', start: 90, end: 90 };
const spans = [auth, read, instant];
const domain = [-10, 90];
function build(props: Record<string, unknown>, script = chapter('Timing').system('Look')) {
  return compileStage(diagram, jsx(TimeLanes, { id: 'waterfall', spans, domain, ...props }), { data: { spans, domain } }, script);
}
const bar = (html: string, id: string) => html.match(new RegExp(`<div[^>]*data-jid="${id}"[^>]*>`))?.[0];

it.each(['literal', 'bound'])('compiles all four focus effects onto the visible %s span', mode => {
  const r = build(mode === 'literal' ? {} : { spans: $.data.spans, spanIds: ['auth'] },
    chapter('Timing').system('Highlight', highlight('auth')).system('Explain', callout('auth', 'First 40 ms'))
      .system('Isolate', spotlight('auth')).system('Zoom', shot('auth')));
  expect(r.diagnostics.filter(d => d.severity === 'error')).toEqual([]);
  const steps = r.project!.scenarios['demo.show']!.steps;
  expect(steps[0]!.cues).toContainEqual({ kind: 'highlight', targets: ['auth'] });
  expect(steps[1]!.callouts).toContainEqual({ target: 'auth', text: 'First 40 ms' });
  expect(steps[2]!.cues).toContainEqual({ kind: 'spotlight', targets: ['auth'] });
  expect(steps[3]!.shots).toContainEqual(expect.objectContaining({ targets: ['auth'] }));
  const html = renderStage(r.project!, 4);
  expect(html.match(/data-jid="auth"/g)).toHaveLength(1);
  expect(bar(html, 'auth')).toMatch(/left:0%;width:40%/);
  expect(bar(html, 'read')).toMatch(/left:20%;width:80%/);
  expect(bar(html, 'tick')).toMatch(/left:100%;width:1px/);
  expect(html).toContain('Authorize · Gateway · -10–30 ms · ok');
  expect(html.indexOf('>Gateway<')).toBeLessThan(html.indexOf('>Storage<'));
});

it('recomputes geometry from the bound domain and spans, even when seeking directly', () => {
  const changed = { ...auth, end: 10 };
  const r = build({ domain: $.data.domain, spans: $.data.spans, unit: 's' },
    chapter('Timing').system('Expand', set($.data.domain, [-10, 190]), set($.data.spans, [changed])));
  expect(r.diagnostics.filter(d => d.severity === 'error')).toEqual([]);
  const html = renderStage(r.project!, 1);
  expect(bar(html, 'auth')).toMatch(/left:0%;width:10%/);
  expect(bar(html, 'read')).toBeUndefined();
  expect(html).toContain('-10–10 s');
  expect(renderStage(r.project!, 0)).toContain('-10–30 s');
});

it('separates concurrent intervals on one lane and reuses rows at touching endpoints', () => {
  const r = build({ spans: [auth, { ...auth, id: 'overlap', start: 20 }, { ...auth, id: 'next', start: 30, end: 90 }] });
  const html = renderStage(r.project!, 0);
  expect(bar(html, 'auth')).toContain('top:2px');
  expect(bar(html, 'overlap')).toContain('top:34px');
  expect(bar(html, 'next')).toContain('top:2px');
});

it.each([
  [{ domain: [0, 0] }, 'greater'], [{ domain: [3, -3] }, 'greater'], [{ domain: [1] }, 'domain'],
  [{ domain: [0, 1e20] }, 'domain'], [{ domain: [0, Infinity] }, 'domain'],
  [{ spans: [{ ...auth, start: 31 }] }, 'end >= start'], [{ spans: [{ ...auth, end: 91 }] }, 'inside domain'],
  [{ spans: [{ ...auth, start: -11 }] }, 'inside domain'], [{ spans: [{ ...auth, end: NaN }] }, 'end'],
  [{ spans: [{ ...auth, start: '0' }] }, 'start'], [{ spans: [auth, auth] }, 'duplicate id'],
  [{ spans: [{ ...auth, lane: ' ' }] }, 'lane'], [{ spans: [{ ...auth, status: 'bad' }] }, 'status'],
  [{ spanIds: ['x', 'x'] }, 'spanIds'], [{ spans: { id: 'auth' } }, 'spans'],
])('reports invalid authored data %o', (props, message) => {
  expect(build(props).diagnostics).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'TIME_LANES_INVALID', message: expect.stringContaining(message) })]));
});

it('diagnoses bad bound intervals and cross-element ID collisions on the step that introduces them', () => {
  const r = build({ spans: $.data.spans }, chapter('Timing')
    .system('Outside', set($.data.spans, [{ ...auth, end: 500 }]))
    .system('Collision', set($.data.spans, [{ ...auth, id: 'waterfall' }])));
  const issues = r.diagnostics.filter(d => d.code === 'TIME_LANES_INVALID').map(d => d.message);
  expect(issues.some(s => /position 1.*inside domain/.test(s))).toBe(true);
  expect(issues.some(s => /position 2.*waterfall.*already belongs/.test(s))).toBe(true);
  const valid = build({ spans: $.data.spans });
  const html = renderStage(valid.project!, 0, { spans: [auth, auth] });
  expect(html).toContain('role="status"');
  expect(html).toContain('duplicate id');
  expect(bar(html, 'auth')).toBeUndefined();
});

it('reserves a bound ID before it appears and renders its anchor only while present', () => {
  const r = build({ spans: $.data.spans, spanIds: ['retry'] }, chapter('Timing')
    .system('Retry', set($.data.spans, [{ ...auth, id: 'retry' }]), shot('retry'))
    .system('Clear', set($.data.spans, [])));
  expect(r.diagnostics.filter(d => d.severity === 'error')).toEqual([]);
  expect(bar(renderStage(r.project!, 0), 'retry')).toBeUndefined();
  expect(bar(renderStage(r.project!, 1), 'retry')).toMatch(/width:40%/);
  expect(bar(renderStage(r.project!, 2), 'retry')).toBeUndefined();
});

it('reports static collisions with other elements through the normal stage ID check', () => {
  expect(build({ spans: [{ ...auth, id: 'waterfall' }] }).diagnostics.map(d => d.code)).toContain('DUPLICATE_ID');
});
