import { expect, test } from 'vitest';
import { readFile } from 'node:fs/promises';
import { Project } from '../src/schema.ts';
import { validate } from '../src/validate.ts';
import { findNode } from '../src/player.ts';
async function fixture() {
  return Project.parse(
    JSON.parse(await readFile('examples/invite/project.joplo.json', 'utf8')),
  );
}
test.each([
  [
    'feature case backlink',
    (p: Project): unknown => p.features.feat_invite!.caseIds.push('absent'),
  ],
  [
    'feature option backlink',
    (p: Project): unknown => (p.options.opt_a!.featureId = 'absent'),
  ],
  [
    'coverage case',
    (p: Project): unknown =>
      (p.options.opt_a!.coverage.absent = {
        status: 'missing',
        scenarioIds: [],
      }),
  ],
  [
    'coverage scenario',
    (p: Project): unknown =>
      p.options.opt_a!.coverage.case_happy!.scenarioIds.push('absent'),
  ],
  [
    'rule feature',
    (p: Project): unknown => (p.rules.rule_admin_only!.featureId = 'absent'),
  ],
  [
    'rule option',
    (p: Project): unknown => (p.rules.rule_admin_only!.optionId = 'absent'),
  ],
  [
    'rule case',
    (p: Project): unknown => p.rules.rule_admin_only!.caseIds.push('absent'),
  ],
  [
    'rule step',
    (p: Project): unknown => p.rules.rule_admin_only!.stepIds.push('absent'),
  ],
  [
    'rule element',
    (p: Project): unknown =>
      p.rules.rule_admin_only!.elementRefs.push('scene_a_members#absent'),
  ],
  [
    'scene option',
    (p: Project): unknown => (p.scenes.scene_a_members!.optionId = 'absent'),
  ],
  [
    'scenario option',
    (p: Project): unknown => (p.scenarios.sc_a_success!.optionId = 'absent'),
  ],
  [
    'scenario initial scene',
    (p: Project): unknown =>
      (p.scenarios.sc_a_success!.initial.sceneId = 'absent'),
  ],
  [
    'scenario case',
    (p: Project): unknown => p.scenarios.sc_a_success!.caseIds.push('absent'),
  ],
  [
    'navigate scene',
    (p: Project): unknown =>
      p.scenarios.sc_a_success!.steps[0]!.effects.push({
        type: 'navigate',
        sceneId: 'absent',
      }),
  ],
  [
    'step rule',
    (p: Project): unknown =>
      p.scenarios.sc_a_success!.steps[0]!.ruleIds.push('absent'),
  ],
  [
    'duplicate node',
    (p: Project): unknown =>
      p.scenes.scene_a_members!.root.children!.push({
        id: 'btn_invite',
        type: 'Text',
      }),
  ],
  [
    'duplicate step',
    (p: Project): unknown =>
      (p.scenarios.sc_a_failure!.steps[0]!.id =
        p.scenarios.sc_a_success!.steps[0]!.id),
  ],
  [
    'record key mismatch',
    (p: Project): unknown => (p.cases.case_happy!.id = 'another'),
  ],
] as const)('引用错误 %s', async (_name, change) => {
  const p = await fixture();
  change(p);
  expect(
    validate(p, { mode: 'structure' }).diagnostics.some(
      (d) => d.source === 'reference' && d.severity === 'error',
    ),
  ).toBe(true);
});
test('结构告警与 info，评论不重挂', async () => {
  const p = await fixture();
  p.scenes.scene_a_members!.root.children!.push({
    id: 'loose',
    type: 'Button',
    disabled: true,
  });
  delete p.options.opt_a!.coverage.case_expired;
  p.options.opt_a!.coverage.case_happy = {
    status: 'expressed',
    scenarioIds: [],
  };
  p.options.opt_a!.coverage.case_revoked = {
    status: 'excluded',
    scenarioIds: [],
  };
  p.comments.c = {
    id: 'c',
    target: { kind: 'element', id: 'scene_a_members#missing' },
    text: '原位置',
    author: 'user',
    revision: 1,
    createdAt: 'now',
    status: 'open',
    replies: [],
  };
  const old = structuredClone(p.comments.c);
  const r = validate(p, { mode: 'all' });
  expect(r.summary.error).toBe(0);
  expect(r.diagnostics.map((d) => d.code)).toEqual(
    expect.arrayContaining([
      'UNBOUND_INTERACTIVE',
      'DISABLED_WITHOUT_REASON',
      'CASE_NOT_COVERED',
      'EXPRESSED_WITHOUT_SCENARIO',
      'COVERAGE_WITHOUT_REASON',
      'COMMENT_TARGET_MISSING',
      'PENDING_AI_ASSUMPTION',
      'EMPTY_SCENARIO',
    ]),
  );
  expect(p.comments.c).toEqual(old);
  expect(r.verification.opt_a).toBe('replay_ok');
});
test('回放失败可定位，unchecked 不谎报成功', async () => {
  const p = await fixture();
  p.scenarios.sc_a_success!.steps[0]!.action = {
    type: 'click',
    target: 'absent',
  };
  const r = validate(p, { mode: 'replay' });
  expect(
    r.diagnostics.some((d) => d.source === 'replay' && d.severity === 'error'),
  ).toBe(true);
  expect(r.verification.opt_a).toBe('structure_ok');
  delete p.scenes.scene_a_members;
  expect(validate(p, { mode: 'all' }).verification.opt_a).toBe('unchecked');
});
test('方案隔离引用即使对象存在也报错', async () => {
  const p = await fixture();
  p.options.opt_b = { ...p.options.opt_a!, id: 'opt_b', coverage: {} };
  p.features.feat_invite!.optionIds.push('opt_b');
  p.scenes.scene_b = {
    ...p.scenes.scene_a_members!,
    id: 'scene_b',
    optionId: 'opt_b',
  };
  p.scenarios.sc_a_success!.initial.sceneId = 'scene_b';
  p.options.opt_b.coverage.case_happy = {
    status: 'expressed',
    scenarioIds: ['sc_a_success'],
  };
  expect(validate(p, { mode: 'all' }).summary.error).toBeGreaterThan(1);
});
