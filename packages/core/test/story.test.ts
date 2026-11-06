/**
 * 演示的表达能力（D56）：过渡卡 card()、角色 role() + layer({ role })、流式输出 stream()。
 * 不变量：
 * - 过渡卡是一步：不需要目标、不改变状态（除非带效果），停在它上面时 cardAt 返回卡片；
 * - 换人的过渡卡之后，导演在这个人的层级（没写 shot 时）；
 * - stream 在状态上等同 set：任何位置的状态与直接 set 一致，跳到哪一步都是全文；
 * - 角色引用写错时 check 报 ROLE_UNKNOWN；发布站保留角色和卡片（它们是演示内容）。
 */
import { describe, expect, it } from 'vitest';
import * as ui from '@joplo-app/kit/ui';
import { config, feature, flow, layer, option, page, role, set, stream, Slot, $ } from '@joplo-app/kit';
import { jsx } from '@joplo-app/kit/jsx-runtime';
import { ROLE_COLORS, cameraAt, cardAt, compile, replay, roleOf, roleOfScene, stateAt, streamsOf, type AuthoringProject } from '../src/index.ts';

const h = (type: unknown, props: Record<string, unknown> | null, ...children: unknown[]) => jsx(type, { ...(props ?? {}), ...(children.length ? { children } : {}) });
const F = (file: string) => ({ file: `/p/${file}`, source: `/p/${file}:1:1` });

function build(o: { steps?: (f: ReturnType<typeof flow>) => ReturnType<typeof flow>; roles?: unknown; layerRole?: string } = {}) {
  const home = page({ title: '首页', layout: false }, h(ui.Stack, null, h(Slot, { name: 'main' })));
  const fl = (o.steps ??
    ((f) =>
      f
        .card('周末一起去露营', { sub: '两个人，预算 500' })
        .click('send', stream($.ui.reply, '周六晴，推荐白河营地。'))
        .card('现在是阿杰', { role: 'ajie' })
        .click('accept', set($.ui.accepted, true))
        .card('出发前一天', set($.ui.weather, 'rain'))
        .card('这个方案确认了', { points: ['行程可以分享', '天气变了会提醒'] })))(flow('一起规划', { start: '/' }));
  const opt = option({
    name: 'A',
    idea: 'i',
    on: {},
    state: { ui: { reply: '', accepted: false, weather: 'sunny' } },
    layers: {
      xiaoyu: layer('小雨的电脑', h(ui.Stack, null, h(ui.Button, { id: 'send' }, '发送'), h(ui.Text, { id: 'reply' }, $.ui.reply)), { role: 'xiaoyu' }),
      ajie: layer('阿杰的手机', h(ui.Stack, null, h(ui.Button, { id: 'accept' }, '我能去')), { role: o.layerRole ?? 'ajie', viewport: 'mobile' }),
    },
    scenarios: { happy: fl },
  });
  const roles = o.roles ?? { xiaoyu: role('小雨', { desc: '发起人' }), ajie: role('阿杰', { desc: '被拉进来的朋友', color: '#123456' }) };
  const src: AuthoringProject = {
    root: '/p',
    config: { ...config({ name: 'T', home: '/' }), ...F('joplo.config.ts') },
    layouts: {},
    routes: { '/': { ...home, ...F('routes/page.tsx') } },
    features: { f: { def: { ...feature({ name: 'F', goal: 'g', cases: {}, roles: roles as never, pick: 'a' }), ...F('features/f/feature.ts') }, options: { a: { ...opt, ...F('features/f/options/a.tsx') } } } },
  };
  return { dev: compile(src, 'dev'), publish: compile(src, 'publish') };
}
const sid = 'f.a.happy';
const errors = (r: ReturnType<typeof compile>) => r.diagnostics.filter((d) => d.severity === 'error');

describe('过渡卡 card()', () => {
  it('编译成 kind=card 的一步：字幕默认是标题，sub / points / role 写进 action，效果照常', () => {
    const { dev } = build();
    expect(errors(dev)).toEqual([]);
    const steps = dev.project!.scenarios[sid]!.steps;
    expect(steps.map((s) => s.kind)).toEqual(['card', 'user', 'card', 'user', 'card', 'card']);
    expect(steps[0]!.action).toEqual({ type: 'card', title: '周末一起去露营', sub: '两个人，预算 500' });
    expect(steps[0]!.caption).toBe('周末一起去露营');
    expect(steps[2]!.action).toEqual({ type: 'card', title: '现在是阿杰', role: 'ajie' });
    expect(steps[4]!.effects).toEqual([{ type: 'set', path: 'ui.weather', value: 'rain' }]);
    expect(steps[5]!.action).toMatchObject({ points: ['行程可以分享', '天气变了会提醒'] });
    expect(steps[0]!.source).toMatch(/story\.test\.ts:\d+:\d+$/);
  });

  it('可以回放到底；停在卡片上时 cardAt 返回它，其余位置为 null', () => {
    const { dev } = build();
    const p = dev.project!;
    expect(replay(p, sid).diagnostics).toEqual([]);
    expect(cardAt(p, sid, 0)).toBeNull();
    expect(cardAt(p, sid, 1)?.title).toBe('周末一起去露营');
    expect(cardAt(p, sid, 2)).toBeNull();
    expect(cardAt(p, sid, 3)?.role).toBe('ajie');
    expect(stateAt(p, sid, 5).ui.weather).toBe('rain');
  });

  it('换人的卡片之后导演在这个人的层级；之后的操作步骤照常跟随操作目标', () => {
    const p = build().dev.project!;
    expect(p.scenarios[sid]!.steps[2]!.directorLayer).toBe('ajie');
    expect(cameraAt(p, sid, 2).directorLayer).toBe('xiaoyu');
    expect(cameraAt(p, sid, 3).directorLayer).toBe('ajie');
    // 普通卡片不换层
    expect(p.scenarios[sid]!.steps[4]!.directorLayer).toBeNull();
  });
});

describe('角色 role()', () => {
  it('feature.roles 写成 { 键: role() } 时带 id、desc 与颜色（没写颜色按顺序取）；层级记录 role', () => {
    const p = build().dev.project!;
    expect(p.features.f!.roles).toEqual([
      { id: 'xiaoyu', name: '小雨', desc: '发起人', color: ROLE_COLORS[0] },
      { id: 'ajie', name: '阿杰', desc: '被拉进来的朋友', color: '#123456' },
    ]);
    expect(p.options['f.a']!.layers.ajie!.role).toBe('ajie');
    expect(roleOfScene(p, p.options['f.a']!.layers.ajie!.sceneId)?.name).toBe('阿杰');
    expect(roleOfScene(p, '@/')).toBeNull();
    expect(roleOf(p, 'f.a', 'nobody')).toBeNull();
  });

  it('旧写法（名字数组）仍可编译，但不能被引用：引用时报 ROLE_UNKNOWN', () => {
    const { dev } = build({ roles: ['小雨', '阿杰'] });
    expect(errors(dev).map((d) => d.code)).toContain('ROLE_UNKNOWN');
    const ok = build({ roles: ['小雨'], steps: (f) => f.card('开场') });
    // 层级仍引用了 role，所以照样报错；名字数组本身合法
    expect(errors(ok.dev).every((d) => d.code === 'ROLE_UNKNOWN')).toBe(true);
  });

  it('层级或卡片引用不存在的角色时报 ROLE_UNKNOWN，并指向源码', () => {
    const a = build({ layerRole: 'ajay' });
    expect(errors(a.dev).find((d) => d.code === 'ROLE_UNKNOWN')?.message).toContain('ajay');
    const b = build({ steps: (f) => f.card('换人', { role: 'nobody' }) });
    const d = errors(b.dev).find((x) => x.code === 'ROLE_UNKNOWN');
    expect(d?.message).toContain('nobody');
    expect(d?.at).toMatch(/story\.test\.ts:\d+:\d+$/);
  });

  it('发布站保留角色、层级角色和卡片', () => {
    const p = build().publish.project!;
    expect(p.features.f!.roles.map((r) => r.id)).toEqual(['xiaoyu', 'ajie']);
    expect(p.options['f.a']!.layers.ajie!.role).toBe('ajie');
    expect(p.scenarios[sid]!.steps[2]!.action).toMatchObject({ type: 'card', role: 'ajie' });
  });
});

describe('流式输出 stream()', () => {
  it('编译成 stream 效果；状态上等同 set，跳到之后任何一步都是全文', () => {
    const p = build().dev.project!;
    const step = p.scenarios[sid]!.steps[1]!;
    expect(step.effects).toEqual([{ type: 'stream', path: 'ui.reply', value: '周六晴，推荐白河营地。' }]);
    expect(streamsOf(step)).toEqual([{ path: 'ui.reply', value: '周六晴，推荐白河营地。' }]);
    expect(streamsOf(p.scenarios[sid]!.steps[0])).toEqual([]);
    expect(stateAt(p, sid, 1).ui.reply).toBe('');
    for (const k of [2, 3, 6]) expect(stateAt(p, sid, k).ui.reply).toBe('周六晴，推荐白河营地。');
  });
});
