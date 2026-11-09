import { fixtureConfig as config } from '../../../../scripts/test/fixtures.ts';
/** 评审版与评审清单的测试夹具：两个功能（f 有 A/B 两个方案，选定 A；g 没有选定），带功能级与方案级规则、AI 假设、问题、备注、取舍。 */
import { explain, feature, flow, option, page, question, rule, uses } from '@joplo-app/kit';
import { jsx } from '@joplo-app/kit/jsx-runtime';
import * as ui from '@joplo-app/plugin-ui';
import type { AuthoringProject } from '../../src/index.ts';

const h = (type: unknown, props: Record<string, unknown> | null, ...children: unknown[]) => jsx(type, { ...(props ?? {}), ...(children.length ? { children } : {}) });
const at = (file: string) => ({ file: `/p/${file}`, source: `/p/${file}:2:3` });

export const SECRET = {
  featureRule: 'FEATURE_RULE_TEXT_admins_only',
  optionRule: 'OPTION_RULE_TEXT_keep_input',
  assumption: 'AI_ASSUMPTION_TEXT_retry_three_times',
  bRule: 'B_OPTION_RULE_TEXT_batch',
  gRule: 'G_FEATURE_RULE_TEXT_audit',
  featureQuestion: 'FEATURE_QUESTION_TEXT_duplicate',
  optionQuestion: 'OPTION_QUESTION_TEXT_limit',
  caseTitle: 'CASE_TITLE_TEXT_happy',
  note: 'NOTE_TEXT_entry_point',
  tradeoff: 'TRADEOFF_TEXT_short_path',
  focus: 'FOCUS_TEXT_entry',
  constraint: 'CONSTRAINT_TEXT_revocable',
};

export function reviewSource(): AuthoringProject {
  const home = page({ title: 'Home', layout: false }, h(ui.Stack, { id: 'home' }, h(ui.Button, { id: 'go', note: SECRET.note }, 'Go'), h(ui.TextInput, { id: 'email', label: 'Email' }), h(ui.Text, null, 'plain')));
  const a = option({
    name: 'A modal', idea: 'Invite in place', focus: SECRET.focus, tradeoffs: [SECRET.tradeoff, 'second'],
    rules: { keep: rule(SECRET.optionRule, { cases: ['happy'], elements: ['email'] }), retry: rule(SECRET.assumption, { origin: 'ai_assumption' }) },
    questions: { limit: question(SECRET.optionQuestion, { severity: 'blocker' }) },
    scenarios: { main: flow('Main', { start: '/', cases: ['happy'] }).click('go', uses('keep', 'admins'), explain('Why this matters')).type('email', 'a@b.c', 'Type email') },
  });
  const b = option({
    name: 'B batch', idea: 'Invite many',
    rules: { batch: rule(SECRET.bRule) },
    scenarios: { only: flow('Batch', { start: '/' }).click('go') },
  });
  const g = option({ name: 'Audit log', idea: 'Show history', scenarios: { view: flow('View', { start: '/' }).click('go') } });
  return {
    root: '/p',
    config: { ...config({ name: 'Review fixture', home: '/' }), ...at('joplo.config.ts') },
    layouts: {},
    routes: { '/': { ...home, ...at('routes/page.tsx') } },
    features: {
      f: {
        def: { ...feature({ name: 'Invite', goal: 'Invite members', constraints: { revocable: SECRET.constraint }, cases: { happy: { title: SECRET.caseTitle } }, rules: { admins: rule(SECRET.featureRule, { origin: 'user', status: 'confirmed', elements: ['go'] }) }, questions: { dup: question(SECRET.featureQuestion, { severity: 'minor' }) }, pick: 'a' }), ...at('features/f/feature.ts') },
        options: { a: { ...a, ...at('features/f/options/a.tsx') }, b: { ...b, ...at('features/f/options/b.tsx') } },
      },
      g: {
        def: { ...feature({ name: 'Audit', goal: 'See history', cases: {}, rules: { audit: rule(SECRET.gRule) } }), ...at('features/g/feature.ts') },
        options: { a: { ...g, ...at('features/g/options/a.tsx') } },
      },
    },
  };
}

