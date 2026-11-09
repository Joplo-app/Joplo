import { fixtureConfig as config } from '../../../scripts/test/fixtures.ts';
import { createZhCN } from '../src/i18n/zh-CN';
import { createEn } from '../src/i18n/en';
/**
 * D61 第一批（字幕、说话人、场景封面）：显示信息都是「IR + 当前位置」的纯函数。
 * 不变量：
 * - 跳到任意一步与一步步播放到那里，字幕与封面完全一致（只依赖 project / scenario / position / activeStep）；
 * - 说话人只出现在用户操作上，取这一步导演层的角色（与层级标签的头像一致）；系统事件与没有角色的项目没有说话人；
 * - 第 0 步（至少一步、没在播放）是封面；字幕区此时只有进度「0 / m」，高度与一行相同；
 * - 过渡卡那一步，字幕不重复卡片标题，只留进度；
 * - 封面时长由 pace.ts 的 stepDwell 逐步估算再求和（不写死数值）。
 */
import { describe, expect, it } from 'vitest';
import * as ui from '@joplo-app/plugin-ui';
import { explain, feature, flow, fork, layer, option, page, role, set, stream, Slot, $ } from '@joplo-app/kit';
import { jsx } from '@joplo-app/kit/jsx-runtime';
import { compile, stateAt, type AuthoringProject, type Project } from '@joplo-app/core';
import { speakerOf, subtitleFor, subtitleHeight } from '../src/player/subtitle-content';
import { approxDuration, coverFor, coverShown, dwellTexts, scenarioMs } from '../src/player/cover-content';
import { stepDwell } from '../src/runtime/pace';
import { stepCaption } from '../src/i18n/step-caption';

const zh = createZhCN();
const en = createEn();
const h = (type: unknown, props: Record<string, unknown> | null, ...children: unknown[]) => jsx(type, { ...(props ?? {}), ...(children.length ? { children } : {}) });
const F = (file: string) => ({ file: `/p/${file}`, source: `/p/${file}:1:1` });

/** 两个角色、两层（小雨的电脑 / 阿杰的手机）的露营故事；roles=false 时不声明角色也不分层。 */
function build(o: { roles?: boolean; description?: string; empty?: boolean } = {}): Project {
  const home = page({ title: '首页', layout: false }, h(ui.Stack, null, h(ui.Button, { id: 'send' }, '发送'), h(ui.Button, { id: 'accept' }, '我能去'), h(Slot, { name: 'main' })));
  const withRoles = o.roles !== false;
  const base = flow('小雨约上了阿杰', { start: '/', ...(o.description !== undefined ? { description: o.description } : {}) });
  const fl = o.empty
    ? base
    : base
        .card('周末一起去露营', { sub: '两个人，预算 500' })
        .click('send', '小雨把想法发给助手', explain('周六、两个人'))
        .system('回复', '几秒后，助手把行程单写好了', stream($.ui.reply, '周六晴，推荐白河营地。'))
        .card('现在是阿杰', withRoles ? { role: 'ajie' } : {})
        .click('accept', '阿杰回复：我能去', set($.ui.accepted, true), fork('如果阿杰去不了', 'other'));
  const opt = option({
    name: 'A · 对话',
    idea: 'i',
    on: {},
    state: { ui: { reply: '', accepted: false } },
    ...(withRoles
      ? {
          layers: {
            xiaoyu: layer('小雨的电脑', h(ui.Stack, null, h(ui.Button, { id: 'send' }, '发送'), h(ui.Text, { id: 'reply' }, $.ui.reply)), { role: 'xiaoyu' }),
            ajie: layer('阿杰的手机', h(ui.Stack, null, h(ui.Button, { id: 'accept' }, '我能去')), { role: 'ajie', viewport: 'mobile' }),
          },
        }
      : {}),
    scenarios: { happy: fl, other: flow('阿杰去不了', { start: '/' }).click('send', '发出去') },
  });
  const src: AuthoringProject = {
    root: '/p',
    config: { ...config({ name: 'T', home: '/' }), ...F('joplo.config.ts') },
    layouts: {},
    routes: { '/': { ...home, ...F('routes/page.tsx') } },
    features: {
      f: {
        def: { ...feature({ name: '一起规划露营', goal: 'g', cases: {}, ...(withRoles ? { roles: { xiaoyu: role('小雨', { desc: '发起人' }), ajie: role('阿杰', { desc: '被拉进来的朋友', color: '#1971C2' }) } } : {}), pick: 'a' } as never), ...F('features/f/feature.ts') },
        options: { a: { ...opt, ...F('features/f/options/a.tsx') } },
      },
    },
  };
  const r = compile(src, 'dev');
  expect(r.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
  return r.project!;
}
const sid = 'f.a.happy';

describe('speakerOf（字幕里的说话人）', () => {
  const p = build();
  it('用户操作：取这一步导演层的角色；系统事件、过渡卡、第 0 步没有说话人', () => {
    expect(speakerOf(p, sid, 0)).toBeNull();
    expect(speakerOf(p, sid, 1)).toBeNull(); // 过渡卡
    expect(speakerOf(p, sid, 2)).toMatchObject({ id: 'xiaoyu', name: '小雨' });
    expect(speakerOf(p, sid, 3)).toBeNull(); // 系统事件
    expect(speakerOf(p, sid, 5)).toMatchObject({ id: 'ajie', name: '阿杰', color: '#1971C2' });
  });
  it('没有声明角色的项目：任何一步都没有说话人；场景不存在时为 null', () => {
    const q = build({ roles: false });
    for (let i = 0; i <= 5; i++) expect(speakerOf(q, sid, i)).toBeNull();
    expect(speakerOf(p, 'nope', 2)).toBeNull();
  });
});

describe('subtitleFor（D61 字幕内容）', () => {
  const p = build();
  const sc = p.scenarios[sid]!;
  it('第 0 步是封面：没有说明，只有进度 0 / m；高度与一行相同', () => {
    const s = subtitleFor(sc, 0, null, null, zh, p)!;
    expect(s).toMatchObject({ index: 0, kind: 'cover', caption: '', explain: null, speaker: null, badge: { kind: 'progress', text: '0 / 5' } });
    expect(subtitleHeight(s)).toBe(subtitleHeight(null));
  });
  it('用户操作带说话人与 explain；进度是「n / m」，读屏标签是完整的“第 n / m 步”', () => {
    const s = subtitleFor(sc, 2, null, null, zh, p)!;
    expect(s).toMatchObject({ kind: 'user', caption: '小雨把想法发给助手', explain: '周六、两个人', speaker: { name: '小雨' }, badge: { kind: 'progress', text: '2 / 5', label: '第 2 / 5 步' } });
    expect(subtitleHeight(s)).toBeGreaterThan(subtitleHeight(null));
  });
  it('系统事件：没有说话人（只有小圆点，由组件按 kind 画）', () => {
    expect(subtitleFor(sc, 3, null, null, zh, p)).toMatchObject({ kind: 'system', caption: '几秒后，助手把行程单写好了', speaker: null });
  });
  it('播放中显示正在播放的一步（说话人也跟着这一步）', () => {
    expect(subtitleFor(sc, 4, 4, null, zh, p)).toMatchObject({ index: 5, kind: 'user', speaker: { name: '阿杰' } });
  });
  it('过渡卡：字幕不重复卡片标题，只留进度；一行高；悬停仍是卡片标题', () => {
    const s = subtitleFor(sc, 4, null, null, zh, p)!;
    expect(s).toMatchObject({ kind: 'card', caption: '', explain: null, speaker: null, title: '现在是阿杰', badge: { text: '4 / 5' } });
    expect(subtitleHeight(s)).toBe(subtitleHeight(null));
  });
  it('分叉标签保留在内容里', () => {
    expect(subtitleFor(sc, 5, null, null, zh, p)!.forks).toEqual([{ label: '如果阿杰去不了', scenarioId: 'f.a.other', at: 0 }]);
  });
  it('场景完成：结果标记取代进度；第二行是结果说明；正在播放时不显示完成', () => {
    const done = subtitleFor(sc, 5, null, { text: '两个人都知道了', outcome: 'success' }, zh, p)!;
    expect(done.badge).toMatchObject({ kind: 'done', outcome: 'success' });
    expect(done.explain).toBe('两个人都知道了');
    expect(subtitleFor(sc, 4, 4, { text: 'x', outcome: 'success' }, zh, p)!.badge.kind).toBe('progress');
  });
  it('停在最后一张过渡卡上完成：没有标题，只有结果说明（一行），不会空出第一行', () => {
    const q = { ...sc, steps: sc.steps.slice(0, 4) };
    const s = subtitleFor(q, 4, null, { text: '两个人都知道了', outcome: 'success' }, zh, p)!;
    expect(s).toMatchObject({ kind: 'card', caption: '', explain: '两个人都知道了' });
    expect(subtitleHeight(s)).toBe(subtitleHeight(null));
  });
  it('没有角色的项目：字幕里没有说话人；不传 project 时也没有', () => {
    const q = build({ roles: false });
    expect(subtitleFor(q.scenarios[sid], 2, null, null, zh, q)!.speaker).toBeNull();
    expect(subtitleFor(sc, 2, null, null, zh)!.speaker).toBeNull();
  });
  it('空场景：没有封面，仍是“初始状态”与说明', () => {
    const q = build({ empty: true });
    expect(subtitleFor(q.scenarios[sid], 0, null, null, zh, q)).toMatchObject({ kind: 'empty', caption: '初始状态', explain: '这个场景没有步骤，只展示初始状态' });
  });
  it('跳到任意一步与一步步走到那里一致（只依赖位置）', () => {
    for (let i = 0; i <= sc.steps.length; i++) {
      const jump = subtitleFor(sc, i, null, null, zh, p);
      const walked = subtitleFor(sc, stateAt(p, sid, i).position, null, null, zh, p);
      expect(walked).toEqual(jump);
    }
  });
});

describe('coverFor / coverShown（场景封面）', () => {
  it('功能名 · 方案名、flow 标题与 description、步数、估算时长、出场角色（按功能里的顺序）', () => {
    const p = build({ description: '小雨一句话，阿杰在手机上确认' });
    const c = coverFor(p, sid, zh)!;
    expect(c).toMatchObject({ feature: '一起规划露营', option: 'A · 对话', title: '小雨约上了阿杰', description: '小雨一句话，阿杰在手机上确认', steps: 5 });
    expect(c.roles.map((r) => r.name)).toEqual(['小雨', '阿杰']);
    expect(c.ms).toBe(scenarioMs(p, p.scenarios[sid]!, zh));
  });
  it('没有 description 时说明退回功能目标（D67：默认就说清“解决什么”）；没有角色时 roles 为空', () => {
    const p = build({ roles: false });
    const c = coverFor(p, sid, zh)!;
    expect(c).toMatchObject({ description: 'g', descriptionFrom: 'goal' });
    expect(c.roles).toEqual([]);
    expect(coverFor(build({ description: '  ' }), sid, zh)).toMatchObject({ description: 'g', descriptionFrom: 'goal' });
    expect(coverFor(build({ description: '小雨一句话' }), sid, zh)).toMatchObject({ description: '小雨一句话', descriptionFrom: 'flow' });
    // 手工构造的 IR 里 goal 为空串时（旧数据）不显示说明
    const blank = build({ roles: false });
    blank.features.f!.goal = '';
    expect(coverFor(blank, sid, zh)).toMatchObject({ description: null, descriptionFrom: null });
  });
  it('空场景与不存在的场景没有封面', () => {
    const p = build({ empty: true });
    expect(coverFor(p, sid, zh)).toBeNull();
    expect(coverFor(p, 'nope', zh)).toBeNull();
  });
  it('只在「至少一步、位置 0、没在播放、没有正在执行的一步」时显示', () => {
    const p = build();
    const sc = p.scenarios[sid]!;
    expect(coverShown(sc, 0, false, null)).toBe(true);
    expect(coverShown(sc, 1, false, null)).toBe(false);
    expect(coverShown(sc, 0, true, null)).toBe(false);
    expect(coverShown(sc, 0, false, 0)).toBe(false);
    expect(coverShown(build({ empty: true }).scenarios[sid], 0, false, null)).toBe(false);
    expect(coverShown(null, 0, false, null)).toBe(false);
  });
});

describe('scenarioMs / approxDuration（「约 M 秒」）', () => {
  it('逐步调用 stepDwell 再求和（与演示控制器用同一份文字：说明、explain、卡片副标题与要点、流式文字）', () => {
    const p = build();
    const sc = p.scenarios[sid]!;
    const want = sc.steps.reduce((sum, st) => sum + stepDwell({ texts: dwellTexts(st, zh), cameraMoved: st.shots.length > 0 || !!st.directorLayer, streams: st.effects.flatMap((e) => (e.type === 'stream' ? [e.value] : [])) }), 0);
    expect(scenarioMs(p, sc, zh)).toBe(want);
    expect(dwellTexts(sc.steps[0]!, zh)).toEqual([stepCaption(sc.steps[0]!, zh), sc.steps[0]!.explain, '两个人，预算 500']);
    expect(scenarioMs(p, { ...sc, steps: [] }, zh)).toBe(0);
  });
  it('取整：10 秒以内按秒向上取整，之后按 5 秒取整；满一分钟按分钟（四舍五入）', () => {
    expect(approxDuration(3000)).toEqual({ unit: 's', value: 3 });
    expect(approxDuration(9100)).toEqual({ unit: 's', value: 10 });
    expect(approxDuration(31200)).toEqual({ unit: 's', value: 30 });
    expect(approxDuration(33000)).toEqual({ unit: 's', value: 35 });
    expect(approxDuration(58000)).toEqual({ unit: 's', value: 60 });
    expect(approxDuration(64000)).toEqual({ unit: 'min', value: 1 });
    expect(approxDuration(150000)).toEqual({ unit: 'min', value: 3 });
    expect(approxDuration(0)).toEqual({ unit: 's', value: 0 });
  });
  it('封面的文案进词典（中英文示例）', () => {
    expect(zh.player.coverSteps(5)).toBe('约 5 步');
    expect(zh.player.coverDuration({ unit: 's', value: 30 })).toBe('约 30 秒');
    expect(zh.player.coverDuration({ unit: 'min', value: 2 })).toBe('约 2 分钟');
    expect(en.player.coverSteps(1)).toBe('About 1 step');
    expect(en.player.coverDuration({ unit: 's', value: 30 })).toBe('About 30 sec');
    expect(en.player.coverStart).toBe('Start');
  });
});
