import { fixtureConfig as config } from '../../../scripts/test/fixtures.ts';
import { describe, expect, it } from 'vitest';
import { $, done, feature, flow, free, go, page, rule, set, toast, uses, work, type JNode } from '@joplo-app/kit';
import { jsx } from '@joplo-app/kit/jsx-runtime';
import { compile, scopeProject, stateAt, type AuthoringProject } from '../src/index.ts';
import { applyPlayground, arbitrateAction, playgroundState, shownSceneOf } from '../src/playground.ts';

/** 写法 v2 第一步：元素自带 onClick，剧本和观众接管走同一份效果（docs/plans/authoring-v2.md I1–I3）。 */
const ui = (type: string, props: Record<string, unknown>) => jsx(`ui:${type}`, props as never) as JNode;
const file = '/test/demo.tsx';

type Opts = {
  home?: JNode[]; settings?: JNode[];
  scenarios?: Record<string, ReturnType<typeof flow>>;
  free?: Parameters<typeof work>[0]['free'];
};
function source(o: Opts = {}): AuthoringProject {
  const home = o.home ?? [
    ui('Button', { id: 'open', onClick: [set($.ui.open, true), uses('r1')], children: 'Open' }),
    ui('Button', { id: 'to_settings', onClick: go('/settings'), children: 'Settings' }),
    ui('Button', { id: 'help', onClick: [set($.ui.help, true), go('/settings')], children: 'Help' }),
    ui('Button', { id: 'logo', onClick: go('/'), children: 'Logo' }),
    ui('Button', { id: 'plain', children: 'Plain' }),
  ];
  const settings = o.settings ?? [
    ui('Button', { id: 'save', onClick: toast('Saved'), children: 'Save' }),
    ui('Button', { id: 'logo', onClick: go('/'), children: 'Logo' }),
  ];
  return {
    root: '/test', config: { ...config({ name: 'Events' }), file }, layouts: {},
    routes: {
      '/': { ...page({ title: 'Home' }, jsx('div', { children: home })), file },
      '/settings': { ...page({ title: 'Settings' }, jsx('div', { children: settings })), file },
    },
    features: { f: { def: { ...feature({ name: 'F', goal: 'G', cases: {}, rules: { r1: rule('Opening is allowed') }, pick: 'a' }), file }, works: {
      a: { ...work({ title: 'A', summary: 'S', state: { ui: { open: false, help: false } },
        ...(o.free ? { free: o.free } : {}),
        scenarios: o.scenarios ?? {
          main: flow('Main').click('open', 'Open it').click('to_settings', 'Go to settings').click('save', 'Save'),
          idle: flow('Idle').click('logo', 'Logo').click('plain', 'Plain'),
        },
      }), file },
    } } },
  };
}
const build = (s: AuthoringProject, mode: 'dev' | 'publish' = 'dev') => compile(s, mode);
const ok = (s: AuthoringProject = source(), mode: 'dev' | 'publish' = 'dev') => {
  const r = build(s, mode);
  expect(r.diagnostics.filter(d => d.severity === 'error')).toEqual([]);
  return r.project!;
};
const codes = (s: AuthoringProject) => build(s).diagnostics.map(d => d.code);

describe('element events: one source of behavior for script and takeover', () => {
  it('merges the element onClick into the scripted click, before the step’s own effects', () => {
    const p = ok();
    const [open, toSettings, save] = p.scenarios['f.a.main']!.steps;
    expect(open!.effects).toEqual([{ type: 'set', path: 'ui.open', value: true }]);
    expect(open!.ruleIds).toEqual(['f.r1']);
    expect(toSettings!.effects).toEqual([{ type: 'navigate', sceneId: 'f.a@/settings' }]);
    // 页面跟踪看得到元素事件里的 go()：下一步的目标在 /settings 上
    expect(save!.effects).toEqual([{ type: 'toast', text: 'Saved', tone: 'info' }]);
    expect(stateAt(p, 'f.a.main', 2).sceneId).toBe('f.a@/settings');
    expect(stateAt(p, 'f.a.main', 1).ui.open).toBe(true);
  });

  it('keeps the event out of the IR node props', () => {
    const p = ok();
    const open = JSON.stringify(p.scenes['f.a@/']!.root);
    expect(open).not.toContain('onClick');
    expect(open).not.toContain('"kind":"effect"');
  });

  it('generates a local reaction per element so the viewer can use it after taking over', () => {
    const p = ok();
    const free = Object.values(p.works['f.a']!.free ?? {});
    const help = free.find(r => 'target' in r.action && r.action.target === 'help');
    expect(help).toMatchObject({ action: { type: 'click', target: 'help' }, effects: [{ type: 'set', path: 'ui.help', value: true }, { type: 'navigate', sceneId: 'f.a@/settings' }] });
    // uses() 只是规则关联，不进本地层
    const open = free.find(r => 'target' in r.action && r.action.target === 'open');
    expect(open!.effects).toEqual([{ type: 'set', path: 'ui.open', value: true }]);
    // 没有事件的元素不生成本地反应
    expect(free.some(r => 'target' in r.action && r.action.target === 'plain')).toBe(false);
  });

  it('navigates in the local layer only; the timeline never moves and dropping the layer restores it', () => {
    const p = ok(), s = stateAt(p, 'f.a.idle', 0), before = structuredClone(s);
    const v = arbitrateAction(p, s, { type: 'click', target: 'help' });
    expect(v.kind).toBe('free'); if (v.kind !== 'free') throw new Error('expected free');
    const layer = applyPlayground(null, v.effects);
    const view = playgroundState(s, layer);
    expect(view.sceneId).toBe('f.a@/settings');
    expect(view.ui.help).toBe(true);
    expect(shownSceneOf(s, layer, null)).toBe('f.a@/settings');
    expect(s).toEqual(before);
    expect(shownSceneOf(s, null, null)).toBe('f.a@/');
    expect(playgroundState(s, null)).toBe(s);
  });

  it('does not advance the script from a page the viewer only reached locally', () => {
    const p = ok(), s = stateAt(p, 'f.a.idle', 0);
    const first = arbitrateAction(p, s, { type: 'click', target: 'help' });
    if (first.kind !== 'free') throw new Error('expected free');
    const layer = applyPlayground(null, first.effects);
    // 下一步是点 logo；logo 两个页面都有。本地层在 /settings 上时，点它只是本地返回首页，不推进时间线
    const v = arbitrateAction(p, s, { type: 'click', target: 'logo' }, { layer, sceneId: shownSceneOf(s, layer, null) });
    expect(v).toMatchObject({ kind: 'free', effects: [{ type: 'navigate', sceneId: 'f.a@/' }] });
    // 在时间线所在的页面上照常推进
    expect(arbitrateAction(p, s, { type: 'click', target: 'logo' }).kind).toBe('advance');
  });

  it('a reported layer scene stays authoritative over local navigation', () => {
    const p = ok(), s = stateAt(p, 'f.a.idle', 0);
    const layer = applyPlayground(null, [{ type: 'navigate', sceneId: 'f.a@/settings' }]);
    expect(shownSceneOf(s, layer, 'some~layer')).toBe('some~layer');
    expect(shownSceneOf(s, layer, s.sceneId)).toBe('f.a@/settings');
  });

  it('keeps the scene reached only through a local reaction in a scoped publication', () => {
    const p = ok(source(), 'publish');
    const help = Object.values(p.works['f.a']!.free ?? {}).find(r => 'target' in r.action && r.action.target === 'help');
    expect(help!.effects).toContainEqual({ type: 'navigate', sceneId: '@/settings' });
    const scoped = scopeProject(p, ['f.a.idle']).project;
    expect(scoped.scenes['@/settings']).toBeTruthy();
    const kept = Object.values(scoped.works['f.a']!.free ?? {}).find(r => 'target' in r.action && r.action.target === 'help');
    expect(kept!.effects).toContainEqual({ type: 'navigate', sceneId: '@/settings' });
  });

  it('warns when a step repeats a write the element already makes', () => {
    const s = source({ scenarios: { main: flow('Main').click('open', 'Open it', set($.ui.open, true)) } });
    const r = build(s);
    expect(r.diagnostics.filter(d => d.severity === 'error')).toEqual([]);
    expect(r.diagnostics.find(d => d.code === 'STEP_REPEATS_EVENT')).toMatchObject({ severity: 'warning' });
  });

  it('rejects events on elements that cannot be clicked, unsupported events and non-local effects', () => {
    expect(codes(source({ home: [jsx('div', { id: 'box', onClick: set($.ui.open, true), children: 'Box' }) as JNode] , scenarios: {} }))).toContain('EVENT_NOT_INTERACTIVE');
    expect(codes(source({ home: [ui('Button', { id: 'b', onHover: set($.ui.open, true), children: 'B' })], scenarios: {} }))).toContain('EVENT_UNSUPPORTED');
    expect(codes(source({ home: [ui('Button', { id: 'b', onClick: done('Finished'), children: 'B' })], scenarios: {} }))).toContain('EVENT_EFFECT_INVALID');
    expect(codes(source({ home: [ui('Button', { id: 'b', onClick: go('/nowhere'), children: 'B' })], scenarios: {} }))).toContain('UNKNOWN_ROUTE');
    expect(codes(source({ home: [ui('Button', { id: 'b', onClick: 'open()', children: 'B' })], scenarios: {} }))).toContain('EVENT_EFFECT_INVALID');
  });

  it('rejects the same id with different events on two pages, and a hand-written free reaction for it', () => {
    const conflict = source({ settings: [ui('Button', { id: 'logo', onClick: go('/settings'), children: 'Logo' })], scenarios: {} });
    expect(codes(conflict)).toContain('EVENT_CONFLICT');
    expect(codes(source({ free: { x: free.click('open', set($.ui.other, true)) } }))).toContain('FREE_EVENT_CONFLICT');
  });
});
