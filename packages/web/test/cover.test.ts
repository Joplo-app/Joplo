import { fixtureConfig as config } from '../../../scripts/test/fixtures.ts';
import { createZhCN } from '../src/i18n/zh-CN';
import { createEn } from '../src/i18n/en';
/**
 * 字幕、步骤标题条（D97，修订 D61）与场景封面：显示信息都是「IR + 当前位置」的纯函数。
 * 不变量：
 * - 跳到任意一步与一步步播放到那里，字幕、标题条与封面完全一致（只依赖 project / scenario / position / activeStep）；
 * - 字幕 = 这一步读出来的那句话（与 core spokenLine 同一规则）：narrate() > say()（带说话人）> 标题兜底；
 * - 说话人只出现在 say() 上，取这一步导演层的角色（与层级标签的头像一致）；没有角色的项目没有说话人；
 * - 封面、过渡卡：画面上已经是大字，没写旁白 / 台词时没有字幕，也不弹标题条；
 * - 封面时长由 pace.ts 的 stepDwell 逐步估算再求和（不写死数值）。
 */
import { describe, expect, it } from 'vitest';
import * as ui from '@joplo-app/plugin-ui';
import { explain, feature, flow, fork, layer, narrate, option, page, role, say, set, stream, Slot, $ } from '@joplo-app/kit';
import { jsx } from '@joplo-app/kit/jsx-runtime';
import { compile, spokenLine, stateAt, stepPlan, type AuthoringProject, type Project } from '@joplo-app/core';
import { speakerOf, spokenSubtitleFor, stepTitleFor, titleDwellMs, TITLE_DWELL_MS, TITLE_DWELL_MAX_MS } from '../src/player/subtitle-content';
import { approxDuration, coverFor, coverShown, dwellTexts, scenarioMs } from '../src/player/cover-content';
import { stepDwell } from '../src/runtime/pace';
import { stepCaption } from '../src/i18n/step-caption';

const zh = createZhCN();
const en = createEn();
const h = (type: unknown, props: Record<string, unknown> | null, ...children: unknown[]) => jsx(type, { ...(props ?? {}), ...(children.length ? { children } : {}) });
const F = (file: string) => ({ file: `/p/${file}`, source: `/p/${file}:1:1` });

/** 两个角色、两层（小雨的电脑 / 阿杰的手机）的露营故事；roles=false 时不声明角色也不分层。 */
function build(o: { roles?: boolean; description?: string; empty?: boolean; sayRole?: boolean } = {}): Project {
  const home = page({ title: '首页', layout: false }, h(ui.Stack, null, h(ui.Button, { id: 'send' }, '发送'), h(ui.Button, { id: 'accept' }, '我能去'), h(Slot, { name: 'main' })));
  const withRoles = o.roles !== false;
  const base = flow('小雨约上了阿杰', { start: '/', ...(o.description !== undefined ? { description: o.description } : {}) });
  const fl = o.empty
    ? base
    : base
        .card('周末一起去露营', { sub: '两个人，预算 500' })
        .click('send', '小雨把想法发给助手', explain('周六、两个人'))
        .system('回复', '几秒后，助手把行程单写好了', stream($.ui.reply, '周六晴，推荐白河营地。'), narrate('助手几秒就把行程排好了。'))
        .card('现在是阿杰', withRoles ? { role: 'ajie' } : {})
        .click('accept', '阿杰回复：我能去', say('我能去！'), set($.ui.accepted, true), fork('如果阿杰去不了', 'other'));
  const flx = o.sayRole ? fl.system('阿杰补一句', say('我带帐篷。', { role: 'ajie' })).system('助手确认', say('好的。')) : fl;
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
    scenarios: { happy: flx, other: flow('阿杰去不了', { start: '/' }).click('send', '发出去') },
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
  it("say(…, { role })：系统步骤也显示写明的那个人（D100，与朗读同一规则）；没写角色的系统步骤仍没有", () => {
    const q = build({ sayRole: true });
    expect(speakerOf(q, sid, 6)).toMatchObject({ id: 'ajie', name: '阿杰' });
    expect(spokenSubtitleFor(q.scenarios[sid], 6, null, zh, q)).toMatchObject({ text: '我带帐篷。', source: 'say', speaker: { name: '阿杰' } });
    expect(speakerOf(q, sid, 7)).toBeNull();
  });
  it('没有声明角色的项目：任何一步都没有说话人；场景不存在时为 null', () => {
    const q = build({ roles: false });
    for (let i = 0; i <= 5; i++) expect(speakerOf(q, sid, i)).toBeNull();
    expect(speakerOf(p, 'nope', 2)).toBeNull();
  });
});

describe('spokenSubtitleFor（D97 字幕 = 正在说的话）', () => {
  const p = build();
  const sc = p.scenarios[sid]!;
  it('封面（第 0 步）与没写旁白 / 台词的过渡卡没有字幕', () => {
    expect(spokenSubtitleFor(sc, 0, null, zh, p)).toBeNull();
    expect(spokenSubtitleFor(sc, 1, null, zh, p)).toBeNull();
    expect(spokenSubtitleFor(sc, 4, null, zh, p)).toBeNull();
  });
  it('没写旁白 / 台词：用标题兜底，没有说话人', () => {
    expect(spokenSubtitleFor(sc, 2, null, zh, p)).toEqual({ index: 2, text: '小雨把想法发给助手', source: 'caption', speaker: null });
  });
  it('narrate()：显示旁白，不显示标题', () => {
    expect(spokenSubtitleFor(sc, 3, null, zh, p)).toEqual({ index: 3, text: '助手几秒就把行程排好了。', source: 'narrate', speaker: null });
  });
  it('say()：显示台词，带这一步导演层的角色（与层级标签的头像一致）', () => {
    expect(spokenSubtitleFor(sc, 5, null, zh, p)).toMatchObject({ index: 5, text: '我能去！', source: 'say', speaker: { name: '阿杰' } });
    expect(speakerOf(p, sid, 5)?.name).toBe('阿杰');
  });
  it('播放中显示正在播放的一步；没有角色的项目与不传 project 时没有说话人', () => {
    expect(spokenSubtitleFor(sc, 4, 4, zh, p)).toMatchObject({ index: 5, source: 'say' });
    const q = build({ roles: false });
    expect(spokenSubtitleFor(q.scenarios[sid], 5, null, zh, q)!.speaker).toBeNull();
    expect(spokenSubtitleFor(sc, 5, null, zh)!.speaker).toBeNull();
  });
  it('字幕就是朗读的那句话（core spokenLine），开不开声音都一样', () => {
    for (let i = 1; i <= sc.steps.length; i++) {
      const step = sc.steps[i - 1]!;
      const sub = spokenSubtitleFor(sc, i, null, zh, p);
      if (sub) expect(sub.text).toBe(spokenLine(step, stepCaption(step, zh), null).text);
      else expect(step.kind).toBe('card');
    }
  });
  it('跳到任意一步与一步步走到那里一致（只依赖位置）', () => {
    for (let i = 0; i <= sc.steps.length; i++) {
      expect(spokenSubtitleFor(sc, stateAt(p, sid, i).position, null, zh, p)).toEqual(spokenSubtitleFor(sc, i, null, zh, p));
      expect(stepTitleFor(sc, stateAt(p, sid, i).position, null, null, zh)).toEqual(stepTitleFor(sc, i, null, null, zh));
    }
  });
});

describe('stepTitleFor（D97 左上角的步骤标题条）', () => {
  const p = build();
  const sc = p.scenarios[sid]!;
  it('封面与过渡卡不弹标题条（画面上已经是大字）', () => {
    expect(stepTitleFor(sc, 0, null, null, zh)).toBeNull();
    expect(stepTitleFor(sc, 1, null, null, zh)).toBeNull();
    expect(stepTitleFor(sc, 4, null, null, zh)).toBeNull();
  });
  it('步骤号 + 标题 + 说明；key 随步骤变化（变化即重新弹出）', () => {
    const t = stepTitleFor(sc, 2, null, null, zh)!;
    expect(t).toMatchObject({ index: 2, caption: '小雨把想法发给助手', explain: '周六、两个人', done: null, forks: [] });
    expect(stepTitleFor(sc, 3, null, null, zh)!.key).not.toBe(t.key);
    expect(stepTitleFor(sc, 2, null, null, zh)!.key).toBe(t.key);
  });
  it('分叉跟着这一步放进标题条', () => {
    expect(stepTitleFor(sc, 5, null, null, zh)!.forks).toEqual([{ label: '如果阿杰去不了', scenarioId: 'f.a.other', at: 0 }]);
  });
  it('场景完成：标题条是“场景完成 · 模拟成功”与结果说明；正在播放时不显示完成', () => {
    const done = stepTitleFor(sc, 5, null, { text: '两个人都知道了', outcome: 'success' }, zh)!;
    expect(done).toMatchObject({ explain: '两个人都知道了', done: { outcome: 'success' } });
    expect(done.caption).toContain(zh.player.scenarioComplete(''));
    expect(stepTitleFor(sc, 4, 4, { text: 'x', outcome: 'success' }, zh)!.done).toBeNull();
  });
  it('空场景：“初始状态”与说明', () => {
    const q = build({ empty: true });
    expect(stepTitleFor(q.scenarios[sid], 0, null, null, zh)).toMatchObject({ index: 0, caption: '初始状态', explain: '这个场景没有步骤，只展示初始状态' });
  });
  it('停留：基础 2.5s，说明越长越久，最多 5s', () => {
    expect(titleDwellMs(null)).toBe(0);
    expect(titleDwellMs(stepTitleFor(sc, 3, null, null, zh))).toBe(TITLE_DWELL_MS);
    const long = { ...stepTitleFor(sc, 2, null, null, zh)!, explain: '很'.repeat(200) };
    expect(titleDwellMs(long)).toBe(TITLE_DWELL_MAX_MS);
    expect(titleDwellMs(stepTitleFor(sc, 2, null, null, zh))).toBeGreaterThan(TITLE_DWELL_MS);
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
  it('每一步时间计划（stepPlan）之和，文字与演示控制器同一份：说明、explain、卡片副标题与要点、流式文字', () => {
    const p = build();
    const sc = p.scenarios[sid]!;
    // 一步 = 提交前的操作演示（leadMs）+ 停留；停留就是原来的 stepDwell
    const want = sc.steps.reduce((sum, st) => sum + stepPlan(p, st).leadMs + stepDwell({ texts: dwellTexts(st, zh), cameraMoved: st.shots.length > 0 || !!st.directorLayer, streams: st.effects.flatMap((e) => (e.type === 'stream' ? [e.value] : [])) }), 0);
    expect(sc.steps.some((st) => stepPlan(p, st).leadMs > 0)).toBe(true);
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
