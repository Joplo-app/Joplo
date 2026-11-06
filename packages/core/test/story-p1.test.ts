import { describe, expect, it } from 'vitest';
import { $, config, feature, flow, fork, layer, mark, option, page, push, set, stream, type Flow } from '@joplo-app/kit';
import * as ui from '@joplo-app/kit/ui';
import { jsx } from '@joplo-app/kit/jsx-runtime';
import { applyStep, changedAt, commonPrefix, compile, forksAt, initialState, keyboardActionOf, marksAt, replay, stateAt, type AuthoringProject } from '../src/index.ts';

const h = (type: unknown, props: Record<string, unknown> = {}, ...children: unknown[]) => jsx(type, { ...props, children });
function build(steps: (f: Flow) => Flow = f => f.press('⌘K', set($.data.trip.status, 'shared'), mark('share', { note: '生成完才能分享' }), fork('另一条路', 'alt')).system('结束'), layers = true) {
  const tree = h(ui.Stack, {}, h(ui.Button, { id: 'share', when: $.ui.visible }, '分享'), h(ui.Email, { from: '助手', to: '阿杰', subject: '行程有更新', time: '周五' }, h(ui.Text, {}, '正文')), h(ui.DataCard, { title: '行程', value: $.data.trip }), h(ui.StateFlow, { value: $.data.trip.status, states: ['draft', 'shared'] }));
  const src: AuthoringProject = { root: '/p', config: { ...config({ name: '测试' }), file: '/p/joplo.config.ts' }, layouts: {}, routes: { '/': { ...page({ title: '首页', layout: false }, tree), file: '/p/routes/page.tsx' } }, features: { f: { def: { ...feature({ name: '功能', goal: '目标', cases: {}, pick: 'a' }), file: '/p/features/f/feature.ts' }, options: { a: { ...option({ name: '方案', idea: '说明', state: { ui: { visible: false }, data: { trip: { status: 'draft', budget: 500 }, rows: [] } }, ...(layers ? { layers: { main: layer('主层', tree), other: layer('另一层', h(ui.Text, { id: 'elsewhere' }, '其他')) } } : {}), scenarios: { happy: steps(flow('主线', { start: '/' })), alt: flow('分支', { start: '/' }).press('⌘K', set($.data.trip.status, 'shared')).press('Esc'), empty: flow('空场景', { start: '/' }) } }), file: '/p/features/f/options/a.tsx' } } } } };
  return { dev: compile(src, 'dev'), publish: compile(src, 'publish') };
}
const sid = 'f.a.happy';
describe('D56 P1 编译与纯函数', () => {
  it('press 无需目标，普通用户步骤，自动字幕、效果与逐步回放一致', () => {
    const p = build().dev.project!;
    expect(p).not.toBeNull();
    const sc = p.scenarios[sid]!;
    expect(sc.steps[0]).toMatchObject({ kind: 'user', action: { type: 'press', keys: '⌘K' }, caption: '按下 ⌘K' });
    expect(replay(p, sid).diagnostics).toEqual([]);
    expect(keyboardActionOf(sc.steps[0])).toEqual({ type: 'press', keys: '⌘K' });
    expect(keyboardActionOf(sc.steps[1])).toBeNull();
    expect(keyboardActionOf(undefined)).toBeNull();
    let s = initialState(p, sid);
    for (let i = 0; i < sc.steps.length; i++) { s = applyStep(p, sc, s); expect(s).toEqual(stateAt(p, sid, i + 1)); }
  });
  it('公共前缀只比较动作与业务效果，忽略字幕/分叉/标注；对象键顺序无关，效果顺序有意义', () => {
    const p = build().dev.project!;
    const a = p.scenarios[sid]!.steps, b = p.scenarios['f.a.alt']!.steps;
    expect(commonPrefix(a, b)).toBe(1);
    expect(commonPrefix([], b)).toBe(0);
    expect(commonPrefix(a, [{ ...b[0]!, effects: [{ type: 'set', path: 'data.trip.status', value: 'draft' }] }])).toBe(0);
    expect(commonPrefix([{ ...a[0]!, effects: [{ type: 'set', path: 'data.trip', value: { a: 1, b: 2 } }] }], [{ ...a[0]!, effects: [{ type: 'set', path: 'data.trip', value: { b: 2, a: 1 } }] }])).toBe(1);
    expect(forksAt(p, sid, 1)).toEqual([{ label: '另一条路', scenarioId: 'f.a.alt', at: 1 }]);
    expect(forksAt(p, sid, 0)).toEqual([]);
    expect(forksAt(p, sid, 2)).toEqual([]);
  });
  it('marksAt 仅返回本步，默认 circle；隐藏目标仍合法，其他层也可引用', () => {
    const p = build(f => f.press('Enter', mark('share'), mark('elsewhere', { kind: 'arrow', note: '' })).press('Esc')).dev.project!;
    expect(marksAt(p, sid, 1)).toEqual([{ target: 'share', kind: 'circle' }, { target: 'elsewhere', kind: 'arrow' }]);
    for (const pos of [0, 2, 99]) expect(marksAt(p, sid, pos)).toEqual([]);
    expect(marksAt(p, 'f.a.empty', 0)).toEqual([]);
  });
  it('changedAt 深比较最终状态，展开对象叶子，数组整体比较，去掉无实际变化/同一步改回原值的路径', () => {
    const p = build(f => f.press('Enter', set($.data.trip, { status: 'shared', budget: 500 }), push($.data.rows, '营地'), set($.ui.visible, true), set($.ui.visible, false)).system('未变化')).dev.project!;
    expect(changedAt(p, sid, 0)).toEqual([]);
    expect(changedAt(p, sid, 1)).toEqual([{ path: 'data.rows', before: [], after: ['营地'] }, { path: 'data.trip.status', before: 'draft', after: 'shared' }]);
    expect(changedAt(p, sid, 2)).toEqual([]);
    expect(changedAt(p, 'f.a.empty', 0)).toEqual([]);
  });
  it('空按键有确定字幕、不影响状态；流式值变化照常计入 changedAt', () => {
    const p = build(f => f.press('').press('Enter', stream($.ui.reply, ''))).dev.project!;
    expect(p.scenarios[sid]!.steps[0]!.caption).toBe('按下按键');
    expect(changedAt(p, sid, 1)).toEqual([]);
    expect(changedAt(p, sid, 2)).toEqual([{ path: 'ui.reply', before: undefined, after: '' }]);
  });
  it('发布保留分叉/标注/按键/组件绑定，去掉源码信息', () => {
    const p = build().publish.project!;
    expect(p.scenarios[sid]!.steps[0]).toMatchObject({ forks: [{ label: '另一条路', scenarioId: 'f.a.alt', at: 1 }], marks: [{ target: 'share', kind: 'circle', note: '生成完才能分享' }], action: { type: 'press', keys: '⌘K' } });
    expect(p.scenarios['f.a.alt']).toBeDefined();
    expect(JSON.stringify(p)).not.toContain('"source":');
    expect(JSON.stringify(p)).toContain('$data.trip');
  });
});

describe('引用诊断带源码位置', () => {
  for (const target of ['absent', 'happy', '']) it(`错误分叉 ${target || '空'} → FORK_UNKNOWN`, () => {
    const d = build(f => f.press('Enter', fork('如果', target))).dev.diagnostics.find(d => d.code === 'FORK_UNKNOWN');
    expect(d?.at).toMatch(/story-p1.test.ts:\d+:\d+$/);
  });
  for (const target of ['absent', '']) it(`错误标注 ${target || '空'} → MARK_UNKNOWN`, () => {
    const d = build(f => f.press('Enter', mark(target))).dev.diagnostics.find(d => d.code === 'MARK_UNKNOWN');
    expect(d?.at).toMatch(/story-p1.test.ts:\d+:\d+$/);
  });
  it('空分叉标签省略；无层级时只在这一步的路径页面解析标注', () => {
    const p = build(f => f.press('Enter', fork('', 'alt')), false).dev.project!;
    expect(forksAt(p, sid, 1)).toEqual([]);
    expect(build(f => f.press('Enter', mark('elsewhere')), false).dev.diagnostics.map(d => d.code)).toContain('MARK_UNKNOWN');
  });
});

it('一步可有多个分叉，目标无前缀为 0；空场景的目标位置始终为 0', () => {
  const p = build(f => f.press('Enter', fork('另一条路', 'alt'), fork('只看初始画面', 'empty'))).dev.project!;
  expect(forksAt(p, sid, 1)).toEqual([{ label: '另一条路', scenarioId: 'f.a.alt', at: 0 }, { label: '只看初始画面', scenarioId: 'f.a.empty', at: 0 }]);
});
it('四种标注、空 note 的归一化在发布模式保留；非法类型由 schema 拒绝', () => {
  const ok = build(f => f.press('Enter', mark('share', { kind: 'circle' }), mark('share', { kind: 'underline' }), mark('share', { kind: 'box' }), mark('share', { kind: 'arrow', note: '  ' }))).publish;
  expect(ok.diagnostics).toEqual([]);
  expect(marksAt(ok.project!, sid, 1).map(m => m.kind)).toEqual(['circle', 'underline', 'box', 'arrow']);
  expect(build(f => f.press('Enter', mark('share', { kind: 'invalid' as 'circle' }))).dev.diagnostics.map(d => d.code)).toContain('INVALID_SCHEMA');
});
it('输入值也在变化路径里，删除对象字段与数组变化可比较，按效果顺序计算最终值', () => {
  const p = build(f => f.press('Enter', set($.data.trip, { status: 'draft' }), set($.data.rows, ['白河']), set($.inputs.prompt, '露营'))).dev.project!;
  expect(changedAt(p, sid, 1)).toEqual([{ path: 'data.rows', before: [], after: ['白河'] }, { path: 'data.trip.budget', before: 500, after: undefined }, { path: 'inputs.prompt', before: undefined, after: '露营' }]);
  const st = p.scenarios[sid]!.steps[0]!;
  expect(commonPrefix([st], [{ ...st, effects: [...st.effects].reverse() }])).toBe(0);
  expect(commonPrefix([st], [st])).toBe(1);
});
