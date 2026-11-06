/**
 * D67 叙事质量与 PM 视角（不新增作者概念，只用现有的 goal / roles / cases / flow）：
 * - 阅读节奏的纯函数在 core（web 原样 re-export），outline 与 check 用同一份估算；
 * - outline：功能的目标、角色、情况（维度 / 优先级 / expected）与各方案的覆盖，场景的步数、估算时长、开场 / 收尾卡；
 * - check 新提示：DESCRIPTION_TOO_LONG（封面说明）、CARD_TEXT_TOO_LONG（过渡卡）、SCENARIO_TOO_LONG（单个场景太长）、
 *   HAPPY_PATH_ONLY（只有顺利路径）；CASE_NOT_COVERED 的说明带上优先级与 expected；Indicator 的 disabled 不要求 disabledReason。
 */
import { describe, expect, it } from 'vitest';
import * as ui from '@joplo-app/kit/ui';
import { config, feature, flow, go, option, page, set, $, type CaseDef, type Flow } from '@joplo-app/kit';
import { jsx } from '@joplo-app/kit/jsx-runtime';
import { CARD_POINTS_MAX, DESCRIPTION_MAX, SCENARIO_MS_MAX, compile, outline, replay, scenarioEstimateMs, stateAt, stepDwell, validate, type AuthoringProject } from '../src/index.ts';
import * as webPace from '../../web/src/runtime/pace.ts';

const h = (type: unknown, props: Record<string, unknown> | null, ...children: unknown[]) => jsx(type, { ...(props ?? {}), ...(children.length ? { children } : {}) });
const F = (file: string) => ({ file: `/p/${file}`, source: `/p/${file}:1:1` });

function build(o: { cases?: Record<string, CaseDef>; scenarios?: Record<string, Flow>; extra?: unknown[]; roles?: string[]; pick?: string } = {}) {
  const home = page({ title: 'Home', layout: false }, h(ui.Stack, null, h(ui.Button, { id: 'go' }, 'Go'), h(ui.TextInput, { id: 'email', label: 'Email' }), ...(o.extra ?? [])));
  const opt = option({
    name: 'A · Modal',
    idea: 'i',
    state: { ui: { done: false } },
    scenarios: o.scenarios ?? { happy: flow('Send', { start: '/', cases: ['happy'] }).click('go', set($.ui.done, true)) },
  });
  const src: AuthoringProject = {
    root: '/p',
    config: { ...config({ name: 'T', home: '/' }), ...F('joplo.config.ts') },
    layouts: {},
    routes: { '/': { ...home, ...F('routes/page.tsx') } },
    features: { f: { def: { ...feature({ name: 'Invite', goal: 'Admins invite teammates so the team can start today', roles: o.roles, cases: o.cases ?? { happy: 'Happy', denied: { title: 'No permission', dimension: 'permission', priority: 'high', expected: 'Explain why' } }, pick: o.pick ?? 'a' }), ...F('features/f/feature.ts') }, options: { a: { ...opt, ...F('features/f/options/a.tsx') } } } },
  };
  const dev = compile(src, 'dev');
  expect(dev.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
  return dev.project!;
}
const codes = (p: ReturnType<typeof build>, code: string) => validate(p).diagnostics.filter((d) => d.code === code);

describe('阅读节奏在 core，web 原样 re-export', () => {
  it('同一个函数与常量（数值不变）', () => {
    expect(webPace.stepDwell).toBe(stepDwell);
    expect(webPace.MIN_DWELL).toBe(3000);
    expect(webPace.MS_PER_CHAR).toBe(125);
    expect(webPace.CAMERA_MS).toBe(700);
    expect(webPace.CAMERA_EASE).toEqual([0.16, 1, 0.3, 1]);
  });
  it('scenarioEstimateMs = 每一步 stepDwell 之和（说明 + explain + 过渡卡的副标题与要点）', () => {
    const p = build({ scenarios: { happy: flow('S', { start: '/', cases: ['happy'] }).card('Opening', { sub: 'why it matters' }).click('go', 'Send it') } });
    const sc = p.scenarios['f.a.happy']!;
    expect(scenarioEstimateMs(sc)).toBe(stepDwell({ texts: ['Opening', 'why it matters'] }) + stepDwell({ texts: ['Send it'] }));
    expect(scenarioEstimateMs({ ...sc, steps: [] })).toBe(0);
  });
});

describe('outline', () => {
  it('功能：目标、角色（旧的名字数组也算）、情况的维度 / 优先级 / expected 与各方案的覆盖', () => {
    const p = build({ roles: ['Admin', 'Invitee'] });
    const o = outline(p);
    expect(o.name).toBe('T');
    const f = o.features[0]!;
    expect(f).toMatchObject({ id: 'f', name: 'Invite', goal: 'Admins invite teammates so the team can start today', roles: ['Admin', 'Invitee'], pick: 'f.a' });
    expect(f.cases).toEqual([
      { id: 'f.happy', key: 'happy', title: 'Happy', dimension: 'main', priority: 'medium', expected: '', coverage: { 'f.a': 'expressed' } },
      { id: 'f.denied', key: 'denied', title: 'No permission', dimension: 'permission', priority: 'high', expected: 'Explain why', coverage: { 'f.a': 'missing' } },
    ]);
  });
  it('方案与场景：步数、估算时长、开场 / 收尾卡、结局、情况；总时长是场景之和', () => {
    const p = build({ scenarios: {
      happy: flow('Send', { start: '/', cases: ['happy'], description: 'Short' }).card('Why').click('go').card('Done', { points: ['a', 'b'] }),
      denied: flow('Denied', { start: '/', cases: ['denied'], outcome: 'denied' }).click('go'),
    } });
    const opt = outline(p).features[0]!.options[0]!;
    expect(opt).toMatchObject({ id: 'f.a', key: 'a', name: 'A · Modal', picked: true, missing: 0, undecided: 0 });
    const [happy, denied] = opt.scenarios;
    expect(happy).toMatchObject({ id: 'f.a.happy', key: 'happy', name: 'Send', description: 'Short', steps: 3, cards: 2, opening: true, ending: true, outcome: 'success', caseIds: ['f.happy'] });
    expect(denied).toMatchObject({ steps: 1, cards: 0, opening: false, ending: false, outcome: 'denied' });
    expect(happy!.ms).toBe(scenarioEstimateMs(p.scenarios['f.a.happy']!));
    expect(opt.ms).toBe(happy!.ms + denied!.ms);
  });
  it('只看一个方案；不存在的方案报 USAGE；发布 IR 没有情况时 cases 为空也不崩溃', () => {
    const p = build();
    expect(outline(p, { optionId: 'f.a' }).features).toHaveLength(1);
    expect(() => outline(p, { optionId: 'f.zz' })).toThrow(/Option does not exist/);
    const pub = structuredClone(p);
    pub.cases = {};
    pub.features.f!.caseIds = [];
    expect(outline(pub).features[0]!.cases).toEqual([]);
  });
});

describe('check：叙事与覆盖的新提示', () => {
  it(`DESCRIPTION_TOO_LONG：flow 的 description（封面说明）超过 ${DESCRIPTION_MAX} 字时 warning，定位到 flow`, () => {
    const ok = build({ scenarios: { happy: flow('S', { start: '/', cases: ['happy'], description: '字'.repeat(DESCRIPTION_MAX) }).click('go') } });
    expect(codes(ok, 'DESCRIPTION_TOO_LONG')).toEqual([]);
    const long = build({ scenarios: { happy: flow('S', { start: '/', cases: ['happy'], description: '字'.repeat(DESCRIPTION_MAX + 1) }).click('go') } });
    const d = codes(long, 'DESCRIPTION_TOO_LONG');
    expect(d).toHaveLength(1);
    expect(d[0]).toMatchObject({ severity: 'warning', ref: { kind: 'scenario', id: 'f.a.happy' } });
    expect(d[0]!.at).toMatch(/narrative\.test\.ts:\d+:\d+$/);
  });
  it('CARD_TEXT_TOO_LONG：过渡卡的副标题、要点过长或要点过多时 info；正常的卡片不提示', () => {
    const fine = build({ scenarios: { happy: flow('S', { start: '/', cases: ['happy'] }).card('Why', { sub: '字'.repeat(48), points: ['字'.repeat(24), 'b', 'c', 'd'] }).click('go') } });
    expect(codes(fine, 'CARD_TEXT_TOO_LONG')).toEqual([]);
    for (const card of [{ sub: '字'.repeat(49) }, { points: ['字'.repeat(25)] }, { points: Array.from({ length: CARD_POINTS_MAX + 1 }, (_, i) => `p${i}`) }]) {
      const p = build({ scenarios: { happy: flow('S', { start: '/', cases: ['happy'] }).card('Why', card).click('go') } });
      const d = codes(p, 'CARD_TEXT_TOO_LONG');
      expect(d, JSON.stringify(card)).toHaveLength(1);
      expect(d[0]).toMatchObject({ severity: 'info', ref: { kind: 'step', id: 'f.a.happy#1' } });
    }
  });
  it(`SCENARIO_TOO_LONG：估算超过 ${SCENARIO_MS_MAX / 1000} 秒时 info（一个场景讲一件事）`, () => {
    const many = (n: number) => { let f = flow('Long', { start: '/', cases: ['happy'] }); for (let i = 0; i < n; i++) f = f.click('go'); return f; };
    const per = stepDwell({ texts: ['Click “Go”'] });
    const fits = Math.floor(SCENARIO_MS_MAX / per);
    expect(codes(build({ scenarios: { happy: many(fits) } }), 'SCENARIO_TOO_LONG')).toEqual([]);
    const d = codes(build({ scenarios: { happy: many(fits + 1) } }), 'SCENARIO_TOO_LONG');
    expect(d).toHaveLength(1);
    expect(d[0]).toMatchObject({ severity: 'info', ref: { kind: 'scenario', id: 'f.a.happy' } });
  });
  it('HAPPY_PATH_ONLY：功能只声明了 main 情况、且所有场景都成功时 info 一次；有任何异常情况或失败结局时不提示', () => {
    const happyOnly = build({ cases: { happy: 'Happy', again: 'Second happy path' }, scenarios: { happy: flow('S', { start: '/', cases: ['happy'] }).click('go'), again: flow('S2', { start: '/', cases: ['again'] }).click('go') } });
    const d = codes(happyOnly, 'HAPPY_PATH_ONLY');
    expect(d).toHaveLength(1);
    expect(d[0]).toMatchObject({ severity: 'info', ref: { kind: 'feature', id: 'f' }, at: 'features/f/feature.ts:1:1' });
    expect(codes(build(), 'HAPPY_PATH_ONLY')).toEqual([]); // 有 permission 情况（缺失时由 CASE_NOT_COVERED 提示）
    expect(codes(build({ cases: { happy: 'Happy' }, scenarios: { happy: flow('S', { start: '/', cases: ['happy'], outcome: 'failure' }).click('go') } }), 'HAPPY_PATH_ONLY')).toEqual([]);
    expect(codes(build({ cases: {}, scenarios: {} }), 'HAPPY_PATH_ONLY')).toEqual([]); // 还没有场景：不提示
  });
  it('CASE_NOT_COVERED 的说明带上优先级与 expected（PM 视角：缺的是哪条验收结果）', () => {
    const d = codes(build(), 'CASE_NOT_COVERED');
    expect(d).toHaveLength(1);
    expect(d[0]!.message).toBe('Case is not yet Covered: f.denied No permission (high priority; expected: Explain why)');
    const plain = codes(build({ cases: { happy: 'Happy', later: 'Later' } }), 'CASE_NOT_COVERED');
    expect(plain[0]!.message).toBe('Case is not yet Covered: f.later Later');
  });
  it('Indicator 的 disabled 只是隐藏角标，不要求 disabledReason', () => {
    const p = build({ extra: [h(ui.Indicator, { label: '3', disabled: true }, h(ui.Text, null, 'Inbox'))] });
    expect(codes(p, 'DISABLED_WITHOUT_REASON')).toEqual([]);
  });
});

describe('发布 IR 里的 go() 跳转（D68 修复）', () => {
  it('选定方案里 go() 到另一个路径：发布 IR 回放通过；dev 里跳到别的方案的画面仍报 MISSING_SCENE', () => {
    const home = page({ title: 'Home', layout: false }, h(ui.Stack, null, h(ui.Button, { id: 'go' }, 'Go')));
    const done = page({ title: 'Done', layout: false }, h(ui.Text, null, 'Done'));
    const opt = option({ name: 'A', idea: 'i', scenarios: { happy: flow('S', { start: '/' }).click('go', go('/done')) } });
    const src: AuthoringProject = {
      root: '/p', config: { ...config({ name: 'T', home: '/' }), ...F('joplo.config.ts') }, layouts: {},
      routes: { '/': { ...home, ...F('routes/page.tsx') }, '/done': { ...done, ...F('routes/done/page.tsx') } },
      features: { f: { def: { ...feature({ name: 'F', goal: 'g', cases: {}, pick: 'a' }), ...F('features/f/feature.ts') }, options: { a: { ...opt, ...F('features/f/options/a.tsx') } } } },
    };
    const pub = compile(src, 'publish').project!;
    expect(pub.scenarios['f.a.happy']!.steps[0]!.effects).toEqual([{ type: 'navigate', sceneId: '@/done' }]);
    expect(replay(pub, 'f.a.happy').diagnostics).toEqual([]);
    expect(stateAt(pub, 'f.a.happy', 1).sceneId).toBe('@/done');
    const dev = compile(src, 'dev').project!;
    expect(replay(dev, 'f.a.happy').diagnostics).toEqual([]);
    const wrong = structuredClone(dev);
    wrong.scenarios['f.a.happy']!.steps[0]!.effects = [{ type: 'navigate', sceneId: '@/done' }];
    expect(replay(wrong, 'f.a.happy').diagnostics.map((d) => d.code)).toEqual(['MISSING_SCENE']);
  });
});
