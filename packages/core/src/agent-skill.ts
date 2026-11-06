/**
 * Agent 技能的唯一模板（D64）：
 * - 仓库根目录的官方技能 `skills/<name>/SKILL.md`（`npx skills add Joplo-app/Joplo` 安装），
 * - `joplo skill install` 写进项目的 `.claude/skills/<name>/SKILL.md` 与 AGENTS.md 托管段，
 * - `joplo skill`（无主题）总览开头的心智模型与起步顺序，
 * 都由这里生成。版本标记与哈希由 CLI 加上（packages/cli/src/skill.ts，需要 node:crypto）。
 * 原则：薄技能——只放心智模型、起步顺序和最常见的坑，具体 API 指向 `npx joplo skill <主题>`（与项目安装的版本一致）。
 */

/** 心智模型：所有入口最先读到的几句话。 */
export const MENTAL_MODEL = [
  'Joplo is a player for pre-declared scenarios, not a free-form app prototype.',
  'Inputs show the sample value typed by the current step (read-only); viewers cannot type their own.',
  'Clicking the highlighted element plays the next declared step; other clicks only show a hint.',
  'Results and errors come from scenario effects (set, toast, done), not from real logic or a backend.',
  'Options (A/B) and cases (edge cases) are compared in the local board; only the picked option is published.',
] as const;

/** 推荐的起步顺序（X2：先做最小的一条正常流程 + 一条错误恢复流程，在看板里确认交互模型后再扩展）。 */
export const START_ORDER = [
  'Read npx joplo skill authoring; read cases before asking the user about edge cases; demo and components as needed.',
  'Plan before coding (npx joplo skill story): audience, one to three points, one line per scenario (Given → When → Then, how it opens and ends; a case\'s expected is its Then); show the plan to the user. A demo is a story, not a feature tour.',
  'With minimal code, write one happy path and one error-and-recovery scenario.',
  'Run npx joplo check, then npx joplo dev; confirm typing, clicks, and layers really behave as intended in the board.',
  'Extend to every option and every case agreed with the user; run check until 0 errors.',
  'Give the user the board URL and a short list of what to check, then wait for their feedback.',
] as const;

/** 最常见的坑：一句话 + 详细主题。 */
export const PITFALLS = [
  ['when takes a condition, not a boolean: when={eq($.ui.mode, \'code\')}, never when={mode === \'code\'}; for values known while writing use {flag && <X/>}', 'authoring'],
  ['Only catalog components and the listed HTML tags exist; <br/> is UNKNOWN_COMPONENT, so write \'Line 1\\nLine 2\' inside <Text>', 'components'],
  ['Every interactive element needs a flow step, disabled={true} with disabledReason, or unmodeled; otherwise check warns UNBOUND_INTERACTIVE', 'check'],
  ['No onClick or other function props: behavior lives in flow steps (.click/.type/.select) and effects (set, push, go, done)', 'authoring'],
  ['Full-height layouts squeeze tables and forms: rows exist in the DOM but are cut off on screen; show 5–8 rows or move the table to its own layer', 'demo'],
  ['Deep links use short params ?o=&c=&s=&step=&l= (l is the layer key and pins that layer, so later steps stop switching layers; layer= is ignored); wait for rendering before screenshots', 'demo'],
  ['Rules you assume stay origin ai_assumption, status pending; never mark them confirmed for the user', 'cases'],
  ['Never share or deploy without the user\'s go-ahead; free share links expire after 1 hour', 'publish'],
] as const satisfies readonly (readonly [string, string])[];

/** 中文触发词：技能 description 里的匹配文本，不是 CLI 界面文案（english-output 测试的白名单）。 */
const ZH_JOPLO = '功能原型、可交互演示、方案对比、给产品 / 设计 / 评审看的演示';
const ZH_FEEDBACK = '评审有结论了、按评审意见修改演示';

export type AgentSkill = { name: string; description: string; body: string };

const JOPLO_DESCRIPTION = `Build clickable, replayable feature demos with Joplo (scripted scenarios in TSX, viewed in a local board) when the user wants a feature prototype, an interactive or clickable demo, an A/B comparison of options or edge cases, or a demo for product, design, or review (${ZH_JOPLO}), including in a repo without joplo.config.ts.`;
const FEEDBACK_DESCRIPTION = `Apply Joplo review results when reviewers have commented on or decided about a Joplo review link and the user says the review has conclusions or asks to update the demo as reviewed (${ZH_FEEDBACK}); pulls decisions with npx joplo feedback and writes them back into the source.`;

const list = (items: readonly string[]) => items.map((s, i) => `${i + 1}. ${s}`);

function joploBody(): string {
  return [
    '# Joplo',
    '',
    ...MENTAL_MODEL,
    '',
    '## When to use',
    '- The user wants to think a feature through before building it: a prototype, clickable demo, A/B options, edge cases, or a walkthrough for product, design, or review.',
    '- Not for production UI code, real backends, or demos where viewers type free input.',
    '',
    '## Workflow',
    '1. No joplo.config.ts yet: npx joplo@latest init <dir>, or npx joplo@latest init . for the current directory, then npm install there (versions are pinned). Agent and Git files (.git, .gitignore, .agents, .claude, AGENTS.md, skills-lock.json) do not count as content; other existing files need init . --keep, which only adds missing files. init skips these skills when the same version is already installed and never overwrites edited ones. In an existing Joplo project, use its installed npx joplo.',
    ...list(START_ORDER).map(line => line.replace(/^(\d+)/, (_, n: string) => String(Number(n) + 1))),
    `${START_ORDER.length + 2}. After the user agrees: npx joplo share --format json (picked options), or npx joplo share --review for reviewers comparing every option. Apply review results with the joplo-feedback skill.`,
    '',
    '## Common pitfalls',
    ...PITFALLS.map(([text, topic]) => `- ${text}. See npx joplo skill ${topic}.`),
    '',
    'Exact APIs: npx joplo skill <topic> prints guidance matching the installed version (authoring, story, demo, components, cases, check, selection, publish). Run npx joplo skill for the overview; npx joplo components <Name> shows props and an example.',
    'After the user Alt+clicks a board element, run npx joplo selection and edit only that location.',
    'Pin these skills to a release: npx skills add https://github.com/Joplo-app/Joplo/tree/v<version> (Joplo-app/Joplo@v<version> does not work).',
  ].join('\n');
}

function feedbackBody(): string {
  return [
    '# Joplo review feedback',
    '',
    'Reviewers open the review link from npx joplo share --review, compare every option, comment, and the owner decides. Decisions come back to you; apply them to the source.',
    '',
    '## When to use',
    '- The user says the review has conclusions, or asks you to update the Joplo demo according to the review.',
    '- Requires a project that was shared (.joplo/cloud.json) or a share id from the user.',
    '',
    '## Steps',
    '1. npx joplo feedback --format json. It reads the review share in .joplo/cloud.json, else the main share; pass --share <id> for another. data.decisions are decisions not yet applied (id, kind, featureId, targetId, note); data.comments are unresolved comments with scenario, step, stepId, and element.',
    '2. Apply each decision to the source:',
    '   - pick: set pick in features/<feature>/feature.ts to the option file name (targetId without the "<feature>." prefix).',
    '   - confirm_rule: set that rule to origin: \'user\', status: \'confirmed\'.',
    '   - reject_rule: rewrite the rule as the note says. If the note does not say what to do instead, set status: \'conflict\' and ask the user; do not guess.',
    '   - answer: delete the question and add a rule stating the answer with origin: \'user\', status: \'confirmed\'.',
    '   - Comments are discussion input only; change the source from a comment only when the user asks.',
    '3. npx joplo check until 0 errors.',
    '4. Republish when the user wants: npx joplo share --review --format json updates the review version (every option); npx joplo share --format json publishes picked options only.',
    '5. npx joplo feedback --applied <decision ids, comma-separated> --ref <git commit sha>. Mark only decisions you actually wrote back.',
    '',
    'AUTH_REQUIRED or AUTH_EXPIRED (exit 3): ask the user to run npx joplo login in their own terminal; never log in or out for them.',
    'Details: npx joplo skill publish (Review and feedback).',
  ].join('\n');
}

/** 官方技能与 `joplo skill install` 共用的两个技能（顺序即写入顺序）。 */
export function agentSkills(): AgentSkill[] {
  return [
    { name: 'joplo', description: JOPLO_DESCRIPTION, body: joploBody() },
    { name: 'joplo-feedback', description: FEEDBACK_DESCRIPTION, body: feedbackBody() },
  ];
}

/** SKILL.md 正文（不含版本标记）：frontmatter + 正文，以换行结尾。 */
export function skillMarkdown(skill: AgentSkill): string {
  return `---\nname: ${skill.name}\ndescription: ${skill.description}\n---\n${skill.body}\n`;
}

/** AGENTS.md 托管段（不含起止标记）：心智模型、起步顺序、最常见的坑，细节指向主题。 */
export function agentsBlock(): string {
  return [
    '## Joplo',
    'This project designs features as Joplo demos (joplo.config.ts). Read npx joplo skill first, then the relevant topics: authoring for pages/options/scenarios, story for planning a demo and writing captions, components, cases before asking about edge cases, demo for layers, shots, traces, and captions.',
    `Mental model: ${MENTAL_MODEL.slice(0, 4).join(' ')}`,
    `Start: ${START_ORDER.map((s, i) => `(${i + 1}) ${s}`).join(' ')}`,
    'Pitfalls:',
    ...PITFALLS.slice(0, 6).map(([text, topic]) => `- ${text} (npx joplo skill ${topic}).`),
    'After editing, run npx joplo check. After a board selection, run npx joplo selection and edit only that location. Review results: npx joplo feedback (npx joplo skill publish).',
  ].join('\n');
}
