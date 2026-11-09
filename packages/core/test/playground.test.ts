import { describe, expect, it } from 'vitest';
import { $, config, feature, flow, free, option, page, set, go } from '@joplo-app/kit';
import { jsx } from '@joplo-app/kit/jsx-runtime';
import { definePlugin } from '@joplo-app/kit/plugin';
import { compile, stateAt, type AuthoringProject } from '../src/index.ts';
import { actionMatches, actionIndex, arbitrateAction, applyPlayground, playgroundState } from '../src/playground.ts';

export function source(): AuthoringProject {
  const file = '/test/demo.tsx';
  return { root: '/test', config: { ...config({ name: 'Playground' }), file }, layouts: {},
    routes: { '/': { ...page({ title: 'Home' }, jsx('div', { children: [
      jsx('Button', { id: 'next', children: 'Next' }), jsx('Button', { id: 'other', children: 'Other' }),
      jsx('Switch', { id: 'lamp', checked: $.data.lamp }), jsx('TextInput', { id: 'name', value: $.ui.name }),
      jsx('div', { id: 'drop', children: 'Drop here' }),
    ].map(n => ({ ...n, type: n.type.startsWith('ui:') ? n.type : `ui:${n.type}` })) })), file } },
    features: { f: { def: { ...feature({ name: 'F', goal: 'G', cases: {}, pick: 'a' }), file }, options: {
      a: { ...option({ name: 'A', idea: 'I', state: { data: { lamp: true }, ui: { name: '' } },
        free: { next: free.click('next', set($.ui.free, true)), lamp: free.toggle('lamp', false, set($.ui.clicked, true)) },
        scenarios: { main: flow('Main').click('next', set($.ui.script, true)).type('name', 'Ada'), other: flow('Other').click('other', set($.ui.other, true)) },
      }), file },
    } } },
  };
}
const project = () => { const r = compile(source(), 'dev'); expect(r.diagnostics.filter(d => d.severity === 'error')).toEqual([]); return r.project!; };

describe('D88 pure input arbitration and separate playground', () => {
  it('matches type, target and value, never advances type/toggle on a bare click', () => {
    expect(actionMatches({ type: 'type', target: 'name', value: 'Ada' }, { type: 'click', target: 'name' })).toBe(false);
    expect(actionMatches({ type: 'type', target: 'name', value: 'Ada' }, { type: 'type', target: 'name', value: 'A' })).toBe(false);
    expect(actionMatches({ type: 'toggle', target: 'lamp', value: false }, { type: 'toggle', target: 'lamp', value: true })).toBe(false);
  });
  it('pauses without executing, then prioritizes next step over cross-scene and free reactions', () => {
    const p = project(), s = stateAt(p, 'f.a.main', 0), input = { type: 'click' as const, target: 'next' };
    expect(arbitrateAction(p, s, input, { playing: true }).kind).toBe('pause');
    expect(arbitrateAction(p, s, input).kind).toBe('advance');
    expect(s.position).toBe(0); expect(s.ui).toEqual({ name: '' });
  });
  it('offers only another reachable scenario of this option, before free/native behavior', () => {
    const p = project(), s = stateAt(p, 'f.a.main', 0);
    const verdict = arbitrateAction(p, s, { type: 'click', target: 'other' });
    expect(verdict).toMatchObject({ kind: 'switch', candidates: [{ scenarioId: 'f.a.other', position: 0 }] });
    p.scenarios['f.a.other']!.steps[0]!.effects.push({ type: 'navigate', sceneId: 'missing' });
    // Entry itself is before the step; an invalid replay prefix is excluded.
    p.scenarios['f.a.other']!.steps.unshift({ ...p.scenarios['f.a.other']!.steps[0]!, id: 'broken', action: { type: 'event', name: 'broken' } });
    expect(actionIndex(p, 'f.a').some(e => e.scenarioId === 'f.a.other' && e.position > 0)).toBe(false);
  });
  it('keeps native writes and declared reactions out of replay, and discards by dropping the layer', () => {
    const p = project(), s = stateAt(p, 'f.a.main', 0), original = structuredClone(s);
    const v = arbitrateAction(p, s, { type: 'toggle', target: 'lamp', value: false });
    expect(v.kind).toBe('free'); if (v.kind !== 'free') throw new Error('expected free');
    const layer = applyPlayground(null, v.effects);
    const view = playgroundState(s, layer);
    expect(view.data.lamp).toBe(false); expect(view.ui.clicked).toBe(true);
    expect(s).toEqual(original); expect(playgroundState(s, null)).toEqual(original);
    expect(stateAt(p, s.scenarioId, 1)).toEqual({ ...original, position: 1, ui: { name: '', script: true } });
  });
  it('checks free reaction targets and rejects timeline-only effects', () => {
    const s = source(); s.features.f!.options.a!.free = { invalid: free.click('missing', go('/')) };
    const codes = compile(s, 'dev').diagnostics.map(d => d.code);
    expect(codes).toContain('FREE_TARGET_MISSING'); expect(codes).toContain('FREE_EFFECT_INVALID');
  });
  it('matches drag endpoints, hover dwell and scroll positions with explicit tolerances', () => {
    expect(actionMatches({ type: 'drag', target: 'next', to: 'drop' }, { type: 'drag', target: 'next', to: 'drop' })).toBe(true);
    expect(actionMatches({ type: 'drag', target: 'next', to: 'drop' }, { type: 'drag', target: 'next', to: 'other' })).toBe(false);
    expect(actionMatches({ type: 'hover', target: 'next', ms: 500 }, { type: 'hover', target: 'next', ms: 499 })).toBe(false);
    expect(actionMatches({ type: 'hover', target: 'next', ms: 500 }, { type: 'hover', target: 'next', ms: 500 })).toBe(true);
    expect(actionMatches({ type: 'scroll', target: 'drop', to: { x: 0, y: 200 } }, { type: 'scroll', target: 'drop', to: { x: 0, y: 205 } })).toBe(true);
  });
  it('compiles new actions and a second plugin action to data; validates endpoints and payloads', () => {
    const s = source(); s.config.plugins = [definePlugin({ id: 'probe', title: 'Probe', runtime: '/probe.js', components: {},
      actions: { rotate: { caption: 'Rotate {label}', durationMs: 800, fields: { angle: { type: 'number', min: 0, max: 360, tolerance: 2 } } } },
    })];
    s.features.f!.options.a!.scenarios.main = flow('Gestures').drag('next', 'drop').hover('next', 500).scroll('drop', { x: 0, y: 200 }).act('probe:rotate', 'drop', { angle: 90 });
    const r = compile(s, 'publish'); expect(r.diagnostics.filter(d => d.severity === 'error')).toEqual([]);
    expect(r.project!.plugins!.probe!.actions!.rotate!.durationMs).toBe(800);
    expect(stateAt(r.project!, 'f.a.main', 4).position).toBe(4);
    const spec = r.project!.plugins!.probe!.actions!.rotate!;
    expect(actionMatches({ type: 'plugin', name: 'probe:rotate', target: 'drop', data: { angle: 90 } }, { type: 'plugin', name: 'probe:rotate', target: 'drop', data: { angle: 91 } }, spec)).toBe(true);
    s.features.f!.options.a!.scenarios.main = flow('Invalid').drag('next', 'missing').act('probe:rotate', 'drop', { angle: 900 });
    const codes = compile(s, 'dev').diagnostics.map(d => d.code);
    expect(codes).toContain('ACTION_DESTINATION_MISSING'); expect(codes).toContain('ACTION_DATA_INVALID');
  });
});

describe('D88 end-to-end projection', () => {
  it('prunes free reactions outside retained stages and retains gesture destinations', async () => {
    const {scopeProject,stepRefs} = await import('../src/scope.ts');
    const s=source(); const file='/test/private.tsx';
    s.routes['/private']={...page({title:'Private'},jsx('div',{children:jsx('ui:Button',{id:'secret',children:'Private control'})})),file};
    s.features.f!.options.a!.free!.secret=free.click('secret',set($.ui.secret,'Do not publish this'));
    const p=compile(s,'publish').project!; const scoped=scopeProject(p,['f.a.main']).project;
    expect(scoped.options['f.a']!.free!.secret).toBeUndefined();
    expect(JSON.stringify(scoped)).not.toContain('Do not publish this');
    expect(actionIndex(scoped,'f.a').every(e=>e.scenarioId==='f.a.main')).toBe(true);
    expect(stepRefs({...p.scenarios['f.a.main']!.steps[0]!,action:{type:'drag',target:'next',to:'drop'}})).toEqual(['next','drop']);
  });
  it('localizes free match values and visible effects together, without translating IDs or coordinates', async () => {
    const {collectMessages,localizeProject} = await import('../src/content-i18n.ts');
    const s=source(); s.config.locales=['en','zh-CN'];
    s.locales={'zh-CN':{'Alice input':'爱丽丝输入','Exploration name':'体验名称','Profile shown':'已显示资料'}};
    s.features.f!.options.a!.free!.input=free.type('name','Alice input',set($.ui.name,'Exploration name'));
    const p=compile(s,'dev').project!;
    expect(collectMessages(p).map(m=>m.text)).toContain('Exploration name');
    const q=localizeProject(p,'zh-CN');
    expect(q.options['f.a']!.free!.input!.action).toEqual({type:'type',target:'name',value:'爱丽丝输入'});
    expect(q.options['f.a']!.free!.input!.effects).toEqual([{type:'set',path:'ui.name',value:'体验名称'}]);
  });
  it('feature-diff reports free reactions and plugin matching-contract changes at scenario level', async () => {
    const {featureDiff} = await import('../src/feature-diff.ts');
    const s=source(); const p=compile(s,'publish').project!; const q=structuredClone(p);
    q.options['f.a']!.free!.next!.effects=[{type:'set',path:'ui.free',value:false}];
    expect(featureDiff(p,q).scenarios.find(s=>s.after==='f.a.main')?.reasons).toContain('free-reactions');
    const plugin=definePlugin({id:'probe',title:'Probe',runtime:'/probe.js',components:{},actions:{rotate:{caption:'Rotate {label}',durationMs:800,fields:{angle:{type:'number',tolerance:2}}}}});
    s.config.plugins=[plugin];s.features.f!.options.a!.scenarios.main=flow('Rotate').act('probe:rotate','drop',{angle:90});
    const before=compile(s,'publish').project!;const after=structuredClone(before);after.plugins!.probe!.actions!.rotate!.fields.angle!.tolerance=8;
    expect(featureDiff(before,after).scenarios.find(s=>s.after==='f.a.main')?.reasons).toContain('action-contracts');
  });
});
