import { afterAll, beforeAll, expect, test } from 'vitest';
import { cp, mkdtemp, rm, symlink, writeFile, realpath } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { tmpdir } from 'node:os';
import { tsImport } from 'tsx/esm/api';
import { loadAuthoring } from '../src/load.ts';
import { compile, findNode, Project, type SceneNode } from '../src/index.ts';
import { validate } from '../src/validate.ts';

let root: string;
let original: Project;
beforeAll(async () => {
  root = await realpath(await mkdtemp(join(tmpdir(), 'joplo-validate-')));
  await cp('examples/invite', root, { recursive: true });
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
  p.scenes[scene]!.root.children!.push({ id: 'loose', type: 'Button', source: src, ...node });
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
  for (const s of Object.values(p.scenes)) s.root.children!.push({ id: 'shared', type: 'Button', source: 'layouts/app.tsx:100:5' });
  expect(validate(p).diagnostics.filter(d => d.at === 'layouts/app.tsx:100:5' && d.code === 'UNBOUND_INTERACTIVE')).toHaveLength(1);
});
test('页面/布局元素统计全部方案，堆叠元素只统计 from 方案', () => {
  const p = fixture();
  const as = p.scenarios['invite.a-modal.success']!;
  const bs = p.scenarios['invite.b-batch.partial']!;
  for (const s of Object.values(p.scenes)) s.root.children!.push({ id: 'shared', type: 'Button', source: src });
  bs.steps[0]!.action = { type: 'click', target: 'shared' };
  expect(validate(p, { mode: 'structure', optionId: a }).diagnostics.filter(d => d.at === src)).toEqual([]);
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
] as const)('coverage %s 定位 option.source', (status, code) => {
  const p = fixture();
  p.options[a]!.coverage['invite.happy'] = { status, scenarioIds: [], basis: 'declared' };
  diagnostic(p, code, p.options[a]!.source!);
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
  expect(validate(Project.parse({ schemaVersion: 2, name: '空', mode: 'dev' })).summary.error).toBe(0);
  const p = fixture(); p.features.invite!.pick = null;
  expect(validate(p).summary.error).toBe(0);
  const r = validate(null as unknown as Project);
  expect(r.summary.error).toBe(1);
  expect(r.diagnostics[0]?.at).toBe('joplo.config.ts:1:1');
});
test('仅校验指定方案；未知方案和无效模式是用法错误', () => {
  const p = fixture();
  const r = validate(p, { mode: 'all', optionId: a });
  expect(Object.keys(r.verification)).toEqual([a]);
  expect(r.diagnostics.some(d => d.ref?.optionId === 'invite.b-batch')).toBe(false);
  expect(() => validate(p, { mode: 'all', optionId: 'absent' })).toThrow('Option does not exist');
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
  ['记录键与 ID 不一致', (p: Project) => { p.options[a]!.id = 'wrong'; }, (p: Project) => p.options[a]!.source],
  ['孤立情况', (p: Project) => { p.cases['invite.happy']!.featureId = 'absent'; }, (p: Project) => p.cases['invite.happy']!.source],
  ['未知画面方案', (p: Project) => { p.scenes[scene]!.optionId = 'absent'; }, (p: Project) => p.scenes[scene]!.root.source],
  ['未知场景情况', (p: Project) => { p.scenarios[`${a}.success`]!.caseIds.push('absent'); }, (p: Project) => p.scenarios[`${a}.success`]!.source],
  ['未知步骤规则', (p: Project) => { p.scenarios[`${a}.success`]!.steps[0]!.ruleIds.push('absent'); }, (p: Project) => p.scenarios[`${a}.success`]!.steps[0]!.source],
  ['未知覆盖场景', (p: Project) => { p.options[a]!.coverage['invite.happy']!.scenarioIds.push('absent'); }, (p: Project) => p.options[a]!.source],
] as const)('IR v2 引用错误：%s，定位引用者源位置', (_name, change, source) => {
  const p = fixture(); change(p);
  expect(validate(p, { mode: 'structure' }).diagnostics).toEqual(expect.arrayContaining([expect.objectContaining({ severity: 'error', source: 'reference', at: source(p) })]));
});
