/**
 * 0.2.5 复测（X3）发现的问题：.back() 之后的画面推算、done 的结局、disabledReason 绑定状态。
 */
import { describe, expect, it } from 'vitest';
import { $, config, done, feature, flow, go, mark, option, page, set, shot, type Flow } from '@joplo-app/kit';
import * as ui from '@joplo-app/kit/ui';
import { jsx } from '@joplo-app/kit/jsx-runtime';
import { compile, explainClick, initialState, replay, stateAt, validate, type AuthoringProject } from '../src/index.ts';

const h = (type: unknown, props: Record<string, unknown> = {}, ...children: unknown[]) => jsx(type, { ...props, children });
const home = h(ui.Stack, {}, h(ui.Title, { id: 'home_title' }, '首页'), h(ui.Button, { id: 'open' }, '打开详情'), h(ui.Button, { id: 'again' }, '再来'));
const detail = h(ui.Stack, {}, h(ui.Title, { id: 'detail_title' }, '详情'));

function project(scenarios: Record<string, Flow>, opts: { tree?: unknown; state?: Record<string, unknown> } = {}): AuthoringProject {
  return {
    root: '/p',
    config: { ...config({ name: '测试' }), file: '/p/joplo.config.ts' },
    layouts: {},
    routes: {
      '/': { ...page({ title: '首页', layout: false }, (opts.tree ?? home) as never), file: '/p/routes/page.tsx' },
      '/detail': { ...page({ title: '详情', layout: false }, detail), file: '/p/routes/detail/page.tsx' },
    },
    features: { f: { def: { ...feature({ name: '功能', goal: '目标', cases: {}, pick: 'a' }), file: '/p/features/f/feature.ts' }, options: { a: { ...option({ name: '方案', idea: '说明', ...(opts.state ? { state: opts.state as never } : {}), scenarios }), file: '/p/features/f/options/a.tsx' } } } },
  };
}
const codes = (src: AuthoringProject) => compile(src, 'dev').diagnostics.map((d) => d.code);

describe('.back() 之后的当前画面', () => {
  it('返回后的步骤里 mark 当前页面的元素不报 MARK_UNKNOWN', () => {
    const src = project({ happy: flow('返回', { start: '/' }).click('open', go('/detail')).back(mark('home_title')).click('again', done('完成')) });
    expect(codes(src)).not.toContain('MARK_UNKNOWN');
    const p = compile(src, 'dev').project!;
    expect(p.scenarios['f.a.happy']!.steps[1]!.marks).toEqual([{ target: 'home_title', kind: 'circle' }]);
    expect(replay(p, 'f.a.happy').diagnostics).toEqual([]);
  });
  it('返回后的 shot 与自动字幕都按返回后的页面解析', () => {
    const src = project({ happy: flow('返回', { start: '/' }).click('open', go('/detail')).back().click('again', shot('home_title'), done('完成')) });
    const r = compile(src, 'dev');
    expect(r.diagnostics.map((d) => d.code)).not.toContain('SHOT_UNKNOWN');
    expect(r.project!.scenarios['f.a.happy']!.steps[2]!.caption).toBe('Click “再来”');
  });
  it('多次 go 再 back：回到上一页而不是起点；返回后 mark 上一页没有的元素仍报 MARK_UNKNOWN', () => {
    // 首页 → 详情 → 首页 → back 回到详情：详情页元素可以标注
    expect(codes(project({ deep: flow('两层', { start: '/' }).click('open', go('/detail')).system('再跳', go('/')).back(mark('detail_title')).system('结束', done('完成')) }))).not.toContain('MARK_UNKNOWN');
    // 首页 → 详情 → back 回到首页：详情页元素不在当前画面
    const d = compile(project({ wrong: flow('返回后标详情', { start: '/' }).click('open', go('/detail')).back(mark('detail_title')).system('结束', done('完成')) }), 'dev').diagnostics.filter((x) => x.code === 'MARK_UNKNOWN');
    expect(d).toHaveLength(1);
    expect(d[0]!.message).toContain('mark("detail_title")');
  });
  it('其他 mark 诊断不变：不存在的目标仍报错', () => {
    expect(codes(project({ happy: flow('x', { start: '/' }).system('标', mark('nope')) }))).toContain('MARK_UNKNOWN');
  });
});

describe('done 的结局', () => {
  const sc = (src: AuthoringProject, id = 'f.a.happy') => compile(src, 'dev').project!.scenarios[id]!;
  it("done('…', 'failure') 让场景的模拟结果是失败", () => {
    const s = sc(project({ happy: flow('失败', { start: '/' }).click('open', done('没能发送', 'failure')) }));
    expect(s.mock).toEqual({ label: 'Mock failure', outcome: 'failure', auto: true });
  });
  it("done('…', 'cancelled') 是 other；默认仍是 success", () => {
    expect(sc(project({ happy: flow('取消', { start: '/' }).click('open', done('用户取消', 'cancelled')) })).mock.outcome).toBe('other');
    expect(sc(project({ happy: flow('成功', { start: '/' }).click('open', done('完成')) })).mock).toEqual({ label: 'Mock success', outcome: 'success', auto: true });
    expect(sc(project({ happy: flow('没有 done', { start: '/' }).click('open') })).mock.outcome).toBe('success');
  });
  it('flow 的 outcome / mock 优先；与 done 冲突时给 OUTCOME_MISMATCH 警告', () => {
    const src = project({ happy: flow('冲突', { start: '/', outcome: 'success' }).click('open', done('失败了', 'failure')) });
    expect(sc(src).mock.outcome).toBe('success');
    const w = compile(src, 'dev').diagnostics.find((d) => d.code === 'OUTCOME_MISMATCH');
    expect(w?.severity).toBe('warning');
    expect(w?.message).toContain("outcome: 'failure'");
    expect(sc(project({ happy: flow('拒绝', { start: '/', outcome: 'denied', mock: '模拟无权限' }).click('open', done('没有权限', 'failure')) })).mock).toEqual({ label: '模拟无权限', outcome: 'denied' });
    expect(codes(project({ happy: flow('一致', { start: '/', outcome: 'failure' }).click('open', done('失败', 'failure')) }))).not.toContain('OUTCOME_MISMATCH');
  });
});

describe('disabledReason', () => {
  const src = (reason: unknown = $.ui.why, disabled: unknown = $.ui.sending) => project(
    { happy: flow('x', { start: '/' }).click('again', set($.ui.sending, true)).click('again', set($.ui.sending, false)).click('open', done('完成')) },
    { tree: h(ui.Stack, {}, h(ui.Button, { id: 'open', disabled, disabledReason: reason }, '发送'), h(ui.Button, { id: 'again' }, '再来')), state: { ui: { sending: false, why: '正在发送…' } } },
  );
  it('可以绑定状态：编译成绑定，点击被禁用的元素时读出当前状态', () => {
    const r = compile(src(), 'dev');
    expect(r.diagnostics.map((d) => d.code)).not.toContain('DISABLED_WITHOUT_REASON');
    const p = r.project!;
    expect(p.scenes[Object.keys(p.scenes).find((k) => k.endsWith('/') || p.scenes[k]!.route === '/')!]!.root.children![0]!.disabledReason).toBe('$ui.why');
    const st = stateAt(p, 'f.a.happy', 1);
    expect(explainClick(p, st, 'open')).toEqual({ kind: 'disabled', reason: '正在发送…' });
  });
  it('字面量照旧', () => {
    const p = compile(src('只有管理员可以', true), 'dev').project!;
    expect(explainClick(p, initialState(p, 'f.a.happy'), 'open')).toEqual({ kind: 'disabled', reason: '只有管理员可以' });
  });
  it('绑定的值为空时退回默认说明（reason: null）', () => {
    const p = compile(src($.ui.missing, true), 'dev').project!;
    expect(explainClick(p, initialState(p, 'f.a.happy'), 'open')).toEqual({ kind: 'disabled', reason: null });
  });
  it('不是字符串也不是绑定：INVALID_DISABLED_REASON 指明写法；缺少原因的提示给出写法', () => {
    const bad = compile(src(42), 'dev').diagnostics.find((d) => d.code === 'INVALID_DISABLED_REASON');
    expect(bad?.message).toMatch(/disabledReason="/);
    expect(bad?.message).toContain('$.ui.');
    const p = compile(src(null, true), 'dev').project!; // null：不写原因（undefined 会用默认参数）
    const missing = validate(p).diagnostics.find((d) => d.code === 'DISABLED_WITHOUT_REASON');
    expect(missing?.message).toContain('disabledReason="');
    expect(missing?.message).toContain('disabledReason={$.ui.');
  });
});
