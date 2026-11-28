import { afterAll, beforeAll, expect, test } from 'vitest';
import { cp, mkdtemp, rm, symlink, writeFile, realpath } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { tmpdir } from 'node:os';
import { tsImport } from 'tsx/esm/api';
import { loadAuthoring } from '../src/load.ts';
import { compile, findNode, Project, type SceneNode } from '../src/index.ts';
import { validate } from '../src/validate.ts';
import { stepPlan } from '../src/step-plan.ts';

let root: string;
let original: Project;
beforeAll(async () => {
  root = await realpath(await mkdtemp(join(tmpdir(), 'joplo-validate-')));
  await cp('examples/invite', root, { recursive: true, filter: s => !s.includes('node_modules') });
  await symlink(resolve('node_modules'), join(root, 'node_modules'));
  await writeFile(join(root, 'package.json'), JSON.stringify({ type: 'module' }));
  const loaded = await loadAuthoring(root, p => tsImport(p, { parentURL: import.meta.url, tsconfig: join(root, 'tsconfig.json') }));
  expect(loaded.diagnostics).toEqual([]);
  original = compile(loaded.authoring!, 'dev').project!;
});
afterAll(async () => { if (root) await rm(root, { recursive: true, force: true }); });
const fixture = () => structuredClone(original);
const a = 'invite.a-modal';
const scene = `${a}@/members`;
const src = 'routes/members/page.tsx:99:3';
function add(p: Project, node: Partial<SceneNode> = {}) {
  p.scenes[scene]!.root.children!.push({ id: 'loose', type: 'ui:Button', source: src, ...node });
}
function diagnostic(p: Project, code: string, at: string, mode: 'structure' | 'replay' | 'all' = 'all') {
  expect(validate(p, { mode }).diagnostics).toEqual(expect.arrayContaining([expect.objectContaining({ code, at })]));
}
test('原样 IR v2 无 error，所有诊断都有相对源位置', () => {
  const r = validate(fixture());
  expect(r.summary.error).toBe(0);
  expect(Object.values(r.verification).every(v => v === 'replay_ok')).toBe(true);
  expect(r.diagnostics.length).toBeGreaterThan(0);
  for (const d of r.diagnostics) expect(d.at).toMatch(/^(features|routes|layouts)\/.*:\d+:\d+$/);
});
test.each([
  ['UNBOUND_INTERACTIVE', {}],
  ['DISABLED_WITHOUT_REASON', { disabled: true }],
] as const)('%s 使用 node.source', (code, node) => { const p = fixture(); add(p, node); diagnostic(p, code, src); });
test.each([{ unmodeled: true }, { disabled: true, disabledReason: '暂不可用' }])('明确未建模或禁用的按钮无需步骤 %j', node => {
  const p = fixture(); add(p, node);
  expect(validate(p).diagnostics.filter(d => d.at === src)).toEqual([]);
});
test('布局在多个画面中出现，同一源位置仅诊断一次', () => {
  const p = fixture();
  for (const s of Object.values(p.scenes)) s.root.children!.push({ id: 'shared', type: 'ui:Button', source: 'layouts/app.tsx:100:5' });
  expect(validate(p).diagnostics.filter(d => d.at === 'layouts/app.tsx:100:5' && d.code === 'UNBOUND_INTERACTIVE')).toHaveLength(1);
});
test('页面/布局元素统计全部方案，堆叠元素只统计 from 方案', () => {
  const p = fixture();
  const as = p.scenarios['invite.a-modal.success']!;
  const bs = p.scenarios['invite.b-batch.partial']!;
  for (const s of Object.values(p.scenes)) s.root.children!.push({ id: 'shared', type: 'ui:Button', source: src });
  bs.steps[0]!.action = { type: 'click', target: 'shared' };
  expect(validate(p, { mode: 'structure', workId: a }).diagnostics.filter(d => d.at === src)).toEqual([]);
  findNode(p.scenes[scene]!, 'shared')!.node.from = a;
  diagnostic(p, 'UNBOUND_INTERACTIVE', src, 'structure');
  as.steps[0]!.action = { type: 'click', target: 'shared' };
  expect(validate(p, { mode: 'structure' }).diagnostics.filter(d => d.at === src)).toEqual([]);
});
test.each([
  ['expressed', 'EXPRESSED_WITHOUT_SCENARIO'],
  ['not_applicable', 'COVERAGE_WITHOUT_REASON'],
  ['excluded', 'COVERAGE_WITHOUT_REASON'],
  ['missing', 'CASE_NOT_COVERED'],
] as const)('coverage %s 定位 work.source', (status, code) => {
  const p = fixture();
  p.features.invite!.alternatives[a]!.coverage['invite.happy'] = { status, scenarioIds: [], basis: 'declared' };
  diagnostic(p, code, p.works[a]!.source!);
});
test('规则在任一相关画面找到元素即可；找不到使用 rule.source，级别 warning', () => {
  const p = fixture(); const rule = p.rules[`${a}.keep_input`]!;
  rule.elementIds = ['absent'];
  const d = validate(p).diagnostics.find(d => d.code === 'RULE_ELEMENT_NOT_FOUND');
  expect(d).toMatchObject({ severity: 'warning', at: rule.source });
  rule.elementIds = ['alert_send_error'];
  expect(validate(p).diagnostics.filter(d => d.code === 'RULE_ELEMENT_NOT_FOUND' && d.ref?.id === rule.id)).toEqual([]);
});
test('待确认 AI 假设与空步骤场景分别定位 rule/scenario.source，级别 info', () => {
  const p = fixture();
  const rule = p.rules[`${a}.keep_input`]!;
  const sc = p.scenarios[`${a}.denied`]!;
  const ds = validate(p).diagnostics;
  expect(ds).toEqual(expect.arrayContaining([
    expect.objectContaining({ code: 'PENDING_AI_ASSUMPTION', severity: 'info', at: rule.source }),
    expect.objectContaining({ code: 'EMPTY_SCENARIO', severity: 'info', at: sc.source }),
  ]));
});
test('回放由 player.replay 执行并补 step.source；structure 模式不回放', () => {
  const p = fixture(); const st = p.scenarios[`${a}.success`]!.steps[0]!;
  st.action = { type: 'click', target: 'absent' };
  diagnostic(p, 'MISSING_TARGET', st.source!, 'replay');
  expect(validate(p, { mode: 'structure' }).diagnostics.some(d => d.source === 'replay')).toBe(false);
  expect(validate(p, { mode: 'all' }).verification[a]).toBe('structure_ok');
});
test('空项目、无方案、无 pick、null 均受控', () => {
  expect(validate(Project.parse({ schemaVersion: 3, entryIds: [], name: '空', mode: 'dev' })).summary.error).toBe(0);
  const p = fixture(); p.features.invite!.pick = null;
  expect(validate(p).summary.error).toBe(0);
  const r = validate(null as unknown as Project);
  expect(r.summary.error).toBe(1);
  expect(r.diagnostics[0]?.at).toBe('joplo.config.ts:1:1');
});
test('仅校验指定方案；未知方案和无效模式是用法错误', () => {
  const p = fixture();
  const r = validate(p, { mode: 'all', workId: a });
  expect(Object.keys(r.verification)).toEqual([a]);
  expect(r.diagnostics.some(d => d.ref?.workId === 'invite.b-batch')).toBe(false);
  expect(() => validate(p, { mode: 'all', workId: 'absent' })).toThrow('Work does not exist');
  expect(() => validate(p, { mode: 'bad' as any })).toThrow('Invalid validation mode');
});
test('回放缺少初始画面时定位场景，而非第一步', () => {
  const p = fixture(); const sc = p.scenarios[`${a}.success`]!;
  sc.initial.sceneId = 'absent';
  const ds = validate(p, { mode: 'replay' }).diagnostics;
  expect(ds.find(d => d.ref?.id === sc.id)).toMatchObject({ at: sc.source, source: 'replay' });
});
test('条件禁用仍需原因，空白原因不能豁免未绑定按钮', () => {
  const p = fixture(); add(p, { disabled: { truthy: 'ui.loading' }, disabledReason: '   ' });
  diagnostic(p, 'DISABLED_WITHOUT_REASON', src); diagnostic(p, 'UNBOUND_INTERACTIVE', src);
});
test('只在其他方案存在的元素不能满足方案规则，功能规则可引用多个方案', () => {
  const p = fixture(); const r = p.rules[`${a}.keep_input`]!;
  r.elementIds = ['btn_batch'];
  diagnostic(p, 'RULE_ELEMENT_NOT_FOUND', r.source!);
  expect(validate(p).diagnostics.filter(d => d.code === 'RULE_ELEMENT_NOT_FOUND' && d.ref?.id === 'invite.admin_only')).toEqual([]);
});
test.each([
  ['记录键与 ID 不一致', (p: Project) => { p.works[a]!.id = 'wrong'; }, (p: Project) => p.works[a]!.source],
  ['孤立情况', (p: Project) => { p.cases['invite.happy']!.featureId = 'absent'; }, (p: Project) => p.cases['invite.happy']!.source],
  ['未知画面方案', (p: Project) => { p.scenes[scene]!.workId = 'absent'; }, (p: Project) => p.scenes[scene]!.root.source],
  ['未知场景情况', (p: Project) => { p.scenarios[`${a}.success`]!.caseIds.push('absent'); }, (p: Project) => p.scenarios[`${a}.success`]!.source],
  ['未知步骤规则', (p: Project) => { p.scenarios[`${a}.success`]!.steps[0]!.ruleIds.push('absent'); }, (p: Project) => p.scenarios[`${a}.success`]!.steps[0]!.source],
  ['未知覆盖场景', (p: Project) => { p.features.invite!.alternatives[a]!.coverage['invite.happy']!.scenarioIds.push('absent'); }, (p: Project) => p.works[a]!.source],
] as const)('IR v2 引用错误：%s，定位引用者源位置', (_name, change, source) => {
  const p = fixture(); change(p);
  expect(validate(p, { mode: 'structure' }).diagnostics).toEqual(expect.arrayContaining([expect.objectContaining({ severity: 'error', source: 'reference', at: source(p) })]));
});

test('caption diagnostics describe whitespace and retain the weighted length calculation', () => {
  const p = fixture();
  const step = p.scenarios[`${a}.success`]!.steps[0]!;
  step.caption = '中'.repeat(25) + ' \n\t';
  step.explain = 'a'.repeat(98) + ' \n\t';
  const ds = validate(p, { mode: 'structure' }).diagnostics;
  expect(ds.find(d => d.code === 'CAPTION_TOO_LONG')?.message).toContain('Caption length is 25 units');
  expect(ds.find(d => d.code === 'CAPTION_TOO_LONG')?.message).toContain('top-left step title');
  expect(ds.find(d => d.code === 'CAPTION_TOO_LONG')?.message).toContain('fallback subtitle');
  expect(ds.find(d => d.code === 'EXPLAIN_TOO_LONG')?.message).toContain('explain note length is 49 units');
  for (const code of ['CAPTION_TOO_LONG', 'EXPLAIN_TOO_LONG']) {
    expect(ds.find(d => d.code === code)?.message).toContain('whitespace is not counted');
  }
});

/** Exact 1× durations, without action lead-in, make the chapter budget boundaries explicit. */
function linearFixture(names = ['重复请求如何进入账本'], durations = names.map(() => 3000)): Project {
  return Project.parse({
    schemaVersion: 3, name: 'Reading and chapters', mode: 'dev', entryIds: ['film'],
    routes: { '/': { path: '/', title: 'Stage', layout: null } },
    works: { film: { id: 'film', key: 'film', title: '重复扣款如何避免', summary: 'Follow a duplicate request', sequencing: 'linear', source: 'works/film.tsx:1:1' } },
    scenes: { 'film@/': { id: 'film@/', workId: 'film', route: '/', name: 'Stage', root: { id: '_root', type: '#fragment' } } },
    scenarios: Object.fromEntries(names.map((name, i) => [`film.c${i}`, {
      id: `film.c${i}`, workId: 'film', name, source: `works/film.tsx:${i + 2}:1`,
      initial: { sceneId: 'film@/' }, mock: { label: 'Shown', outcome: 'success' },
      steps: Array.from({ length: Math.ceil(durations[i]! / 30_000) }, (_, j) => ({
        id: `film.c${i}.s${j}`, kind: 'system', action: { type: 'event', name: 'Observe' },
        caption: 'Read', systemLead: 0, hold: Math.min(30_000, durations[i]! - j * 30_000), source: `works/film.tsx:${10 + i * 10 + j}:3`,
      })),
    }])),
  });
}
const firstStep = (p: Project) => p.scenarios['film.c0']!.steps[0]!;
const diagnosticsFor = (p: Project, code: string) => validate(p, { mode: 'structure' }).diagnostics.filter(d => d.code === code);

test.each(['say', 'narrate'] as const)('%s uses the 10-second voice budget for CJK, Latin, mixed text and punctuation', fn => {
  const code = fn === 'say' ? 'SAY_TOO_LONG' : 'NARRATE_TOO_LONG';
  for (const [text, seconds] of [
    ['中'.repeat(43), undefined], ['中'.repeat(44), '10.1'], ['中'.repeat(80), '18.1'],
    ['a'.repeat(127), undefined], ['a'.repeat(128), '10.1'],
    ['中'.repeat(10) + 'a'.repeat(98), undefined], // exactly 10,000 ms
    ['中'.repeat(10) + 'a'.repeat(99), '10.1'],
    ['中'.repeat(43) + '，。! \n\t'.repeat(80), undefined],
  ] as const) {
    const p = linearFixture();
    const step = firstStep(p);
    step[fn] = text;
    const ds = diagnosticsFor(p, code);
    expect(ds, text).toHaveLength(seconds ? 1 : 0);
    if (seconds) {
      expect(ds[0]).toMatchObject({ severity: 'warning', at: step.source, ref: { kind: 'step', id: step.id, workId: 'film', stepId: step.id } });
      expect(ds[0]!.message).toContain(`estimated at ~${seconds} s`);
      expect(ds[0]!.message).toContain('≤ 10 s');
    }
  }
});

test.each(['say', 'narrate'] as const)('%s prefers bound voice duration, excludes pad and falls back when unmeasured', fn => {
  const p = linearFixture();
  const step = firstStep(p);
  const code = fn === 'say' ? 'SAY_TOO_LONG' : 'NARRATE_TOO_LONG';
  step[fn] = '中'.repeat(80);
  for (const durationMs of [9000, 10_000, 12_400]) {
    step.holdFor = { kind: 'voice', durationMs, durationKey: 'bound-voice', padMs: 3000 };
    const ds = diagnosticsFor(p, code);
    expect(ds).toHaveLength(durationMs > 10_000 ? 1 : 0);
    if (ds.length) expect(ds[0]!.message).toContain('measured at ~12.4 s');
  }
  step.holdFor = { kind: 'voice', padMs: 0 };
  expect(diagnosticsFor(p, code)[0]!.message).toContain('estimated at ~18.1 s');
  step[fn] = 'Short line';
  step.holdFor = { kind: 'voice', durationMs: 12_400, durationKey: 'bound-voice', padMs: 0 };
  expect(diagnosticsFor(p, code)[0]!.message).toContain('measured at ~12.4 s');
});

test('voice measurement belongs to the active narration; unrelated audio does not override it', () => {
  const p = linearFixture();
  const step = firstStep(p);
  step.say = '中'.repeat(80);
  step.narrate = 'Short narration';
  step.holdFor = { kind: 'voice', durationMs: 9000, durationKey: 'bound-narration', padMs: 0 };
  expect(diagnosticsFor(p, 'NARRATE_TOO_LONG')).toEqual([]);
  expect(diagnosticsFor(p, 'SAY_TOO_LONG')[0]!.message).toContain('estimated at ~18.1 s');
  step.holdFor = { kind: 'audio', audio: 'joplo-resource:music', durationMs: 20_000, durationKey: 'bound-music', padMs: 0 };
  expect(diagnosticsFor(p, 'NARRATE_TOO_LONG')).toEqual([]);
  expect(diagnosticsFor(p, 'SAY_TOO_LONG')[0]!.message).toContain('estimated at ~18.1 s');
  step.audio = step.holdFor.audio;
  expect(diagnosticsFor(p, 'NARRATE_TOO_LONG')[0]!.message).toContain('measured at ~20.0 s');
});

test.each([
  ['中'.repeat(68), false], ['中'.repeat(69), true],
  ['a'.repeat(127), false], ['a'.repeat(128), true],
])('reading budget has no 7-second cap and allows a 1.5-second margin (%s)', (text, short) => {
  const p = linearFixture();
  const step = firstStep(p);
  delete step.hold;
  step.caption = text + ' \n\t';
  const before = structuredClone(p);
  expect(diagnosticsFor(p, 'READING_BUDGET_SHORT')).toHaveLength(short ? 1 : 0);
  expect(stepPlan(p, step).dwellMs).toBe(7000);
  expect(p).toEqual(before);
});

test('card reading adds title, sub and every point, including repeated text, without counting caption again', () => {
  const p = linearFixture();
  const step = firstStep(p);
  delete step.hold;
  step.kind = 'card';
  step.action = { type: 'card', title: '中'.repeat(10), sub: '中'.repeat(30), points: Array(4).fill('中'.repeat(16)) };
  step.caption = step.action.title;
  const ds = diagnosticsFor(p, 'READING_BUDGET_SHORT');
  expect(ds).toHaveLength(1);
  expect(ds[0]).toMatchObject({ severity: 'info', at: step.source, ref: { kind: 'step', id: step.id, stepId: step.id, workId: 'film' } });
  expect(ds[0]!.message).toContain('needs about 13.0 s');
  expect(ds[0]!.message).toContain('visible for about 7.0 s');
  step.action = { type: 'card', title: '中'.repeat(80) };
  step.caption = 'Fallback caption';
  expect(diagnosticsFor(p, 'READING_BUDGET_SHORT')[0]!.message).toContain('needs about 10.0 s');
  expect(diagnosticsFor(p, 'READING_BUDGET_SHORT')[0]!.message).toContain('visible for about 3.0 s');
});

test('ordinary steps count visible caption, explain and active subtitle once, respecting narration and mute', () => {
  const p = linearFixture();
  const step = firstStep(p);
  delete step.hold;
  step.caption = '中'.repeat(60);
  expect(diagnosticsFor(p, 'READING_BUDGET_SHORT')).toEqual([]); // 7.5 s, rather than twice for the fallback subtitle
  step.caption = '中'.repeat(48);
  step.explain = '文'.repeat(20);
  expect(diagnosticsFor(p, 'READING_BUDGET_SHORT')).toEqual([]); // exactly 8.5 s
  step.narrate = '旁白';
  step.say = '话'.repeat(100);
  expect(diagnosticsFor(p, 'READING_BUDGET_SHORT')[0]!.message).toContain('needs about 8.8 s');
  step.mute = true;
  expect(diagnosticsFor(p, 'READING_BUDGET_SHORT')).toEqual([]);
  delete step.mute;
  delete step.narrate;
  step.say = '台词';
  expect(diagnosticsFor(p, 'READING_BUDGET_SHORT')[0]!.message).toContain('needs about 8.8 s');
});

test('reading respects explicit hold, narration, measured voice, pad and effect dwell, excluding pre-commit lead', () => {
  const p = linearFixture();
  const step = firstStep(p);
  step.caption = '中'.repeat(80);
  step.hold = 10_000;
  expect(diagnosticsFor(p, 'READING_BUDGET_SHORT')).toEqual([]);
  delete step.hold;
  step.narrate = step.caption;
  expect(diagnosticsFor(p, 'READING_BUDGET_SHORT')).toEqual([]);
  step.holdFor = { kind: 'voice', durationMs: 5000, durationKey: 'bound-voice', padMs: 0 };
  step.systemLead = 30_000;
  expect(diagnosticsFor(p, 'READING_BUDGET_SHORT')[0]!.message).toContain('visible for about 5.0 s');
  step.holdFor.padMs = 5000;
  expect(diagnosticsFor(p, 'READING_BUDGET_SHORT')).toEqual([]);
  step.holdFor.padMs = 0;
  step.effectHold = 10_000;
  expect(diagnosticsFor(p, 'READING_BUDGET_SHORT')).toEqual([]);
});

test.each([
  [[119_999], false], [[120_000], true], [[60_000, 60_000], true], [[40_000, 40_000, 40_000], false],
] as const)('chapter count uses the 120-second mainline boundary: %j', (durations, short) => {
  const p = linearFixture(durations.map((_, i) => `请求经过第 ${i + 1} 个阶段`), [...durations]);
  const ds = diagnosticsFor(p, 'CHAPTERS_TOO_FEW');
  expect(ds).toHaveLength(short ? 1 : 0);
  if (short) {
    expect(ds[0]).toMatchObject({ severity: 'info', at: p.works.film!.source, ref: { kind: 'work', id: 'film', workId: 'film' } });
    expect(ds[0]!.message).toContain('120 s at 1×');
    expect(ds[0]!.message).toContain('3–6 chapters of 25–60 s');
  }
});

test('chapter budget excludes drafts, independent flows and feature works', () => {
  const p = linearFixture(['简介', '总结'], [60_000, 60_000]);
  p.works.film!.draft = true;
  expect(diagnosticsFor(p, 'CHAPTERS_TOO_FEW')).toEqual([]);
  delete p.works.film!.draft;
  delete p.works.film!.sequencing;
  expect(diagnosticsFor(p, 'CHAPTERS_TOO_FEW')).toEqual([]);
  expect(diagnosticsFor(p, 'CHAPTER_TITLE_GENERIC')).toEqual([]);
  const feature = fixture();
  for (const work of Object.values(feature.works)) work.sequencing = 'linear';
  for (const sc of Object.values(feature.scenarios)) {
    sc.name = '简介';
    for (const step of sc.steps) step.hold = 30_000;
  }
  expect(diagnosticsFor(feature, 'CHAPTERS_TOO_FEW')).toEqual([]);
  expect(diagnosticsFor(feature, 'CHAPTER_TITLE_GENERIC')).toEqual([]);
});

test('optional chapters and their relays contribute neither mainline duration nor chapter count', () => {
  const p = linearFixture(['重复请求如何进入账本', '简介', '总结'], [3000, 120_000, 120_000]);
  p.scenarios['film.c1']!.autoplay = false;
  p.scenarios['film.c2']!.from = 'film.c1';
  expect(diagnosticsFor(p, 'CHAPTERS_TOO_FEW')).toEqual([]);
  expect(diagnosticsFor(p, 'CHAPTER_TITLE_GENERIC')).toEqual([]);
  p.scenarios['film.c0']!.steps = Array.from({ length: 4 }, (_, i) => ({ ...firstStep(p), id: `film.c0.s${i}`, hold: 30_000 }));
  expect(diagnosticsFor(p, 'CHAPTERS_TOO_FEW')[0]!.message).toContain('1 mainline chapters');
  delete p.scenarios['film.c1']!.autoplay;
  expect(diagnosticsFor(p, 'CHAPTERS_TOO_FEW')).toEqual([]); // all three chapters now play, including the relay
});

test.each(['简介', '原理', '总结', '概述', '背景', '引言', '结语', 'intro', 'introduction', 'overview', 'summary', 'conclusion'])('generic chapter groups recognize the exact placeholder %s', name => {
  const p = linearFixture([name, '简介']);
  const ds = diagnosticsFor(p, 'CHAPTER_TITLE_GENERIC');
  expect(ds).toHaveLength(1);
  expect(ds[0]).toMatchObject({ severity: 'info', at: p.works.film!.source, ref: { kind: 'work', id: 'film', workId: 'film' } });
  expect(ds[0]!.message).toContain(`"${name}"`);
  expect(ds[0]!.message).toContain('How the ledger blocks duplicate charges');
});

test.each([
  ['01 简介', '1. SUMMARY'], ['第1章 原理', '第 2 章 Introduction'], ['第一章 概述', '02、Conclusion'],
])('generic chapter names ignore optional numbering and case: %s / %s', (a, b) => {
  expect(diagnosticsFor(linearFixture([a, b]), 'CHAPTER_TITLE_GENERIC')).toHaveLength(1);
});

test.each([
  ['简介'], ['简介', '账本去重原理'], ['账本去重原理', '去重收益总结'],
  ['01 账本去重原理', '第2章 重复请求如何拒绝'], ['Introduction to the ledger', 'Deduplication summary'],
])('specific chapter names and a single generic title pass: %j', (...names) => {
  expect(diagnosticsFor(linearFixture(names), 'CHAPTER_TITLE_GENERIC')).toEqual([]);
});

test('chapter advice obeys work scope and is absent in replay-only validation', () => {
  const p = fixture();
  const film = linearFixture(['简介', '总结'], [60_000, 60_000]);
  p.entryIds.push('film');
  Object.assign(p.works, film.works);
  Object.assign(p.scenes, film.scenes);
  Object.assign(p.routes, film.routes);
  Object.assign(p.scenarios, film.scenarios);
  const codes = ['CHAPTERS_TOO_FEW', 'CHAPTER_TITLE_GENERIC'];
  expect(validate(p, { mode: 'structure', workId: a }).diagnostics.filter(d => codes.includes(d.code))).toEqual([]);
  expect(validate(p, { mode: 'structure', workId: 'film' }).diagnostics.filter(d => codes.includes(d.code))).toHaveLength(2);
  expect(validate(p, { mode: 'replay' }).diagnostics.filter(d => codes.includes(d.code))).toEqual([]);
});

test('invite and Joplo examples retain valid playback without chapter advice on feature works or drafts', async () => {
  const dir = resolve('examples/joplo');
  const loaded = await loadAuthoring(dir, p => tsImport(p, { parentURL: import.meta.url, tsconfig: join(dir, 'tsconfig.json') }));
  expect(loaded.diagnostics).toEqual([]);
  const projects = [fixture(), ...(['dev', 'publish'] as const).map(mode => {
    const result = compile(loaded.authoring!, mode);
    expect(result.diagnostics.filter(d => d.severity === 'error')).toEqual([]);
    return result.project!;
  })];
  for (const p of projects) {
    // Public IR uses shared stages; exercise its playback contract without asserting authoring ownership.
    const r = validate(p, { mode: p.mode === 'publish' ? 'replay' : 'all' });
    expect(r.summary.error).toBe(0);
    expect(Object.values(r.verification).every(v => v === 'replay_ok')).toBe(true);
    for (const d of validate(p, { mode: 'structure' }).diagnostics.filter(d => ['CHAPTERS_TOO_FEW', 'CHAPTER_TITLE_GENERIC'].includes(d.code))) {
      const work = p.works[d.ref!.workId!]!;
      expect(work.featureId).toBeUndefined();
      if (d.code === 'CHAPTERS_TOO_FEW') expect(work.draft).toBeUndefined();
    }
  }
}, 60_000);

test('STAGE_RAW_HTML_HEAVY flags static raw-div stages while sparing kinetic or expressive stages', () => {
  const p = fixture();
  const target = p.scenes[scene]!;
  const rawChildren = Array.from({ length: 18 }, (_, i) => ({ id: `d_${i}`, type: 'ui:div', source: 'routes/members/page.tsx:10:5' }));
  target.root = { id: 'root', type: 'ui:div', source: 'routes/members/page.tsx:5:3', children: rawChildren };
  const ds = validate(p, { mode: 'structure', workId: a }).diagnostics.filter(d => d.code === 'STAGE_RAW_HTML_HEAVY');
  expect(ds).toHaveLength(1);
  expect(ds[0]).toMatchObject({ severity: 'info', at: 'routes/members/page.tsx:5:3' });
  expect(ds[0]!.message).toContain('joplo-plugins/SKILL.md');

  // Adding a kinetic plugin property (for example content motion) clears the raw-HTML hint
  const animated = structuredClone(p);
  animated.scenes[scene]!.root.children![0]!.props = { motion: 'tok_0' };
  expect(validate(animated, { mode: 'structure', workId: a }).diagnostics.filter(d => d.code === 'STAGE_RAW_HTML_HEAVY')).toEqual([]);

  // Adding an expressive plugin component also clears the raw-HTML hint
  const rich = structuredClone(p);
  rich.scenes[scene]!.root.children![0] = { id: 'metric_0', type: 'ui:Stat', source: 'routes/members/page.tsx:10:5' };
  expect(validate(rich, { mode: 'structure', workId: a }).diagnostics.filter(d => d.code === 'STAGE_RAW_HTML_HEAVY')).toEqual([]);
});

test('WORK_TEXT_ONLY_STAGE flags multi-step layout-only card decks and ignores expressive or raw-HTML-flagged works', () => {
  const p = fixture();
  for (const s of Object.values(p.scenes).filter(sc => sc.workId === a)) {
    s.root = {
      id: 'stack', type: 'ui:Stack', source: 'features/invite/works/a-modal.tsx:8:5',
      children: Array.from({ length: 14 }, (_, i) => ({ id: `c_${i}`, type: i % 2 ? 'ui:Text' : 'ui:Card', source: 'features/invite/works/a-modal.tsx:10:7' })),
    };
  }
  for (const sc of Object.values(p.scenarios).filter(s => s.workId === a)) {
    sc.ext = undefined;
    sc.media = undefined;
    for (const st of sc.steps) { st.ext = undefined; st.media = undefined; }
  }
  const ds = validate(p, { mode: 'structure', workId: a }).diagnostics.filter(d => d.code === 'WORK_TEXT_ONLY_STAGE');
  expect(ds).toHaveLength(1);
  expect(ds[0]).toMatchObject({ severity: 'info', ref: { kind: 'work', id: a, workId: a } });
  expect(ds[0]!.message).toContain('npx joplo components');

  // Adding one expressive component in any stage clears WORK_TEXT_ONLY_STAGE
  const rich = structuredClone(p);
  rich.scenes[scene]!.root.children![0] = { id: 'cmp', type: 'ui:Compare', source: 'features/invite/works/a-modal.tsx:10:7' };
  expect(validate(rich, { mode: 'structure', workId: a }).diagnostics.filter(d => d.code === 'WORK_TEXT_ONLY_STAGE')).toEqual([]);
});
