import { fixtureConfig as config } from '../../../scripts/test/fixtures.ts';
import { describe, expect, it } from 'vitest';
import { $, done, feature, flow, free, go, mock, page, response, rule, set, toast, uses, work, type JNode } from '@joplo-app/kit';
import { jsx } from '@joplo-app/kit/jsx-runtime';
import { compile, stateAt, type AuthoringProject } from '../src/index.ts';
import { applyPlayground, arbitrateAction, playgroundState } from '../src/playground.ts';

/** 写法 v2 第二步：系统响应写一次（mock / response），剧本按切片选结果，接管时用第一个结果（docs/plans/authoring-v2.md I5）。 */
const ui = (type: string, props: Record<string, unknown>) => jsx(`ui:${type}`, props as never) as JNode;
const file = '/test/demo.tsx';

const sendInvite = mock('sendInvite', {
  ok: response('Request succeeded (mock)', 'Sent', set($.ui.sending, false), set($.ui.open, false), toast.success('Invite sent'), done('Invite sent')),
  timeout: response('Request timed out (mock)', 'Failed, input kept', set($.ui.sending, false), set($.ui.error, 'Timeout'), uses('keep')),
});
const openSettings = mock('openSettings', { ok: response('Loaded', go('/settings')) });

type Opts = { home?: JNode[]; scenarios?: Record<string, ReturnType<typeof flow>>; free?: Parameters<typeof work>[0]['free'] };
function source(o: Opts = {}): AuthoringProject {
  const home = o.home ?? [
    ui('Button', { id: 'send', onClick: [set($.ui.sending, true), set($.ui.error, ''), sendInvite], children: 'Send' }),
    ui('Button', { id: 'load', onClick: openSettings, children: 'Load' }),
    ui('Button', { id: 'peek', onClick: openSettings, children: 'Peek' }),
    ui('Button', { id: 'plain', children: 'Plain' }),
  ];
  return {
    root: '/test', config: { ...config({ name: 'Mocks' }), file }, layouts: {},
    routes: {
      '/': { ...page({ title: 'Home' }, jsx('div', { children: home })), file },
      '/settings': { ...page({ title: 'Settings' }, jsx('div', { children: [ui('Button', { id: 'save', children: 'Save' })] })), file },
    },
    features: { f: { def: { ...feature({ name: 'F', goal: 'G', cases: {}, rules: { keep: rule('Keep the input') }, pick: 'a' }), file }, works: {
      a: { ...work({ title: 'A', summary: 'S', state: { ui: { sending: false, open: true, error: '' } },
        ...(o.free ? { free: o.free } : {}),
        scenarios: o.scenarios ?? {
          success: flow('Success').click('send', 'Send it'),
          retry: flow('Retry', { api: { sendInvite: ['timeout', 'ok'] } }).click('send', 'Send it').click('send', 'Retry'),
          load: flow('Load').click('load', 'Load').click('save', 'Save'),
        },
      }), file },
    } } },
  };
}
const build = (s: AuthoringProject) => compile(s, 'dev');
const ok = (s: AuthoringProject = source()) => {
  const r = build(s);
  expect(r.diagnostics.filter(d => d.severity === 'error')).toEqual([]);
  return r.project!;
};
const codes = (s: AuthoringProject) => build(s).diagnostics.map(d => d.code);
const strip = (steps: unknown) => JSON.parse(JSON.stringify(steps, (k, v) => (k === 'id' || k === 'source' ? undefined : v)));

describe('mock / response: system responses written once', () => {
  it('expands a click that calls a mock into the same steps as a hand-written .system()', () => {
    const auto = ok().scenarios['f.a.success']!.steps;
    const hand = ok(source({
      home: [ui('Button', { id: 'send', onClick: [set($.ui.sending, true), set($.ui.error, '')], children: 'Send' }), ui('Button', { id: 'load', children: 'Load' })],
      scenarios: { success: flow('Success').click('send', 'Send it')
        .system('Request succeeded (mock)', 'Sent', set($.ui.sending, false), set($.ui.open, false), toast.success('Invite sent'), done('Invite sent')) },
    })).scenarios['f.a.success']!.steps;
    expect(auto).toHaveLength(2);
    expect(strip(auto)).toEqual(strip(hand));
    expect(auto[1]!.source).toMatch(/mock-response\.test\.ts:\d+:\d+$/);
  });

  it('picks outcomes in order from flow({ api }), one per call', () => {
    const p = ok();
    const steps = p.scenarios['f.a.retry']!.steps;
    expect(steps.map(s => s.action.type === 'event' ? s.action.name : s.action.type)).toEqual(['click', 'Request timed out (mock)', 'click', 'Request succeeded (mock)']);
    expect(steps[1]!.ruleIds).toEqual(['f.keep']);
    expect(stateAt(p, 'f.a.retry', 2).ui.error).toBe('Timeout');
    expect(stateAt(p, 'f.a.retry', 4).ui.open).toBe(false);
  });

  it('tracks the page through a response that navigates', () => {
    const p = ok();
    expect(p.scenarios['f.a.load']!.steps.map(s => s.action.type)).toEqual(['click', 'event', 'click']);
    expect(stateAt(p, 'f.a.load', 2).sceneId).toBe('f.a@/settings');
  });

  it('also expands a mock written in a step, without an element event', () => {
    const p = ok(source({ scenarios: { s: flow('S').click('plain', 'Plain', sendInvite) } }));
    expect(p.scenarios['f.a.s']!.steps.map(s => s.kind)).toEqual(['user', 'system']);
  });

  it('gives the viewer the first outcome when they take over: local effects only', () => {
    const p = ok();
    const reaction = Object.values(p.works['f.a']!.free ?? {}).find(r => 'target' in r.action && r.action.target === 'send');
    expect(reaction!.effects).toEqual([
      { type: 'set', path: 'ui.sending', value: true }, { type: 'set', path: 'ui.error', value: '' },
      { type: 'set', path: 'ui.sending', value: false }, { type: 'set', path: 'ui.open', value: false }, { type: 'toast', text: 'Invite sent', tone: 'success' },
    ]);
    // peek 不在任何剧本里：观众点它走本地反应，响应里的 go() 在本地层换页面
    const s = stateAt(p, 'f.a.success', 2);
    const v = arbitrateAction(p, s, { type: 'click', target: 'peek' });
    if (v.kind !== 'free') throw new Error(`expected free, got ${v.kind}`);
    expect(playgroundState(s, applyPlayground(null, v.effects)).sceneId).toBe('f.a@/settings');
  });

  it('warns about an outcome no slice demonstrates', () => {
    const r = build(source({ scenarios: { success: flow('Success').click('send', 'Send it'), load: flow('Load').click('load', 'Load') } }));
    expect(r.diagnostics.filter(d => d.severity === 'error')).toEqual([]);
    const unused = r.diagnostics.filter(d => d.code === 'MOCK_OUTCOME_UNUSED');
    expect(unused).toHaveLength(1);
    expect(unused[0]).toMatchObject({ severity: 'warning' });
    expect(unused[0]!.message).toContain('timeout');
  });

  it('rejects outcome lists that do not match the calls exactly once each', () => {
    expect(codes(source({ scenarios: { s: flow('S', { api: { sendInvite: ['timeout'] } }).click('send').click('send') } }))).toContain('MOCK_OUTCOMES_EXHAUSTED');
    expect(codes(source({ scenarios: { s: flow('S', { api: { sendInvite: ['timeout', 'ok'] } }).click('send') } }))).toContain('MOCK_OUTCOMES_LEFTOVER');
    expect(codes(source({ scenarios: { s: flow('S', { api: { nothing: ['ok'] } }).click('send') } }))).toContain('MOCK_OUTCOMES_LEFTOVER');
    expect(codes(source({ scenarios: { s: flow('S', { api: { sendInvite: ['lost'] } }).click('send') } }))).toContain('MOCK_OUTCOME_UNKNOWN');
    expect(codes(source({ scenarios: { s: flow('S', { api: { sendInvite: 'ok' } as never }).click('send') } }))).toContain('FLOW_API_INVALID');
  });

  it('rejects invalid and conflicting mocks', () => {
    const empty = mock('empty', {});
    expect(codes(source({ scenarios: { s: flow('S').click('plain', empty) } }))).toContain('MOCK_INVALID');
    const nested = mock('nested', { ok: response('Outer', sendInvite) });
    expect(codes(source({ scenarios: { s: flow('S').click('plain', nested) } }))).toContain('MOCK_INVALID');
    const other = mock('sendInvite', { ok: response('Different') });
    expect(codes(source({ scenarios: { s: flow('S').click('send').click('plain', other) } }))).toContain('MOCK_CONFLICT');
    expect(codes(source({ free: { x: free.click('plain', sendInvite) } }))).toContain('FREE_EFFECT_INVALID');
  });
});
