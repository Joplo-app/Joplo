import { stepCaption, mockLabel } from '../i18n/step-caption';
import { en, type Dictionary } from '../i18n/en';
/**
 * 字幕与步骤标题条的内容（纯函数，D97，修订 D61）：只由「IR + 当前位置」推导，跳到任意一步与一步步播放到那里完全一致。
 *
 * 字幕（spokenSubtitleFor）= 这一步“正在说的话”，浮在画面底部正中：
 * - 与朗读同一规则（core spokenLine）：narrate() > say()（带说话人）> 标题兜底；
 * - 过渡卡、场景封面画面上已经是大字：只有写了 narrate / say 才有字幕；
 * - 显示哪一步：正在播放的一步，否则是刚执行完的一步；第 0 步（封面）没有字幕。
 *
 * 步骤标题条（stepTitleFor）= 这一步叫什么、为什么，左上角弹出再收成小圆点：
 * - 标题（caption）+ 说明（explain）；场景完成后是“场景完成 · 模拟成功”与结果说明；
 * - 分叉（↳ 另一条路）跟着这一步放在标题条里；
 * - key 变化时重新弹出（同一步不重复弹）。
 */
import { cameraAt, forksOf, layersOf, roleOf, roleOfScene, spokenLine, type PlayState, type Project, type RoleInfo, type Scenario } from '@joplo-app/core/runtime';

export const SUBTITLE_PX = 17;
/** 说话人的头像直径与名字字号。 */
export const SUBTITLE_AVATAR_PX = 20;
export const SUBTITLE_SPEAKER_PX = 13;
export const TITLE_CAPTION_PX = 15;
export const TITLE_EXPLAIN_PX = 13;
/** 标题条展开后的停留（引擎时间，毫秒）：说明越长停得越久，最多 TITLE_DWELL_MAX_MS。 */
export const TITLE_DWELL_MS = 2500;
export const TITLE_DWELL_MAX_MS = 5000;

export type SpokenSubtitle = {
  /** 第几步（1 起）。 */
  index: number;
  text: string;
  /** narrate = 旁白；say = 角色台词；caption = 没写旁白 / 台词时用标题兜底。 */
  source: 'narrate' | 'say' | 'caption';
  /** 说话人：只有 say() 且这一步导演层声明了角色时才有。 */
  speaker: RoleInfo | null;
};

export type StepTitle = {
  /** 变化即重新弹出。 */
  key: string;
  /** 第几步（0 = 没有步骤的场景）。 */
  index: number;
  caption: string;
  explain: string | null;
  done: { text: string; outcome: Scenario['mock']['outcome']; title: string } | null;
  forks: Scenario['steps'][number]['forks'];
};

/** 显示哪一步：正在播放的一步，否则是刚执行完的一步（夹在 0…总步数）。 */
export const shownIndex = (scenario: Scenario, position: number, activeStep: number | null) =>
  activeStep !== null ? activeStep + 1 : Math.max(0, Math.min(position, scenario.steps.length));

/**
 * 第 index 步（1 起）的说话人：只有用户操作才有，取这一步之后导演所在层的画面的角色
 * （cameraAt 的 directorLayer → 这层的画面 → roleOfScene，与层级标签上的头像同一来源）。没有层级或角色时为 null。
 */
export function speakerOf(project: Project, scenarioId: string, index: number): RoleInfo | null {
  const step = project.scenarios[scenarioId]?.steps[index - 1];
  // say(…, { role }) 写明了是谁（D100）：与朗读（core speakerRoleAt）同一规则
  if (step?.say && step.sayRole) return roleOf(project, project.scenarios[scenarioId]?.optionId, step.sayRole);
  if (!step || step.kind !== 'user') return null;
  const layer = cameraAt(project, scenarioId, index).directorLayer;
  const sceneId = layersOf(project, scenarioId).find((l) => l.id === layer)?.sceneId;
  return roleOfScene(project, sceneId);
}

export function spokenSubtitleFor(scenario: Scenario | null | undefined, position: number, activeStep: number | null, i18n: Dictionary = en, project?: Project | null): SpokenSubtitle | null {
  if (!scenario) return null;
  const index = shownIndex(scenario, position, activeStep);
  const step = index > 0 ? scenario.steps[index - 1] : undefined;
  if (!step) return null;
  const source: SpokenSubtitle['source'] = step.narrate?.trim() ? 'narrate' : step.say?.trim() ? 'say' : 'caption';
  // 过渡卡：画面上已经是大字，只有旁白 / 台词才上字幕
  if (step.kind === 'card' && source === 'caption') return null;
  const speaker = source === 'say' && project ? speakerOf(project, scenario.id, index) : null;
  const text = spokenLine(step, stepCaption(step, i18n), speaker?.id ?? null).text;
  return text ? { index, text, source, speaker } : null;
}

export function stepTitleFor(scenario: Scenario | null | undefined, position: number, activeStep: number | null, completed: PlayState['completed'] = null, i18n: Dictionary = en): StepTitle | null {
  if (!scenario) return null;
  const total = scenario.steps.length;
  const index = shownIndex(scenario, position, activeStep);
  const done = activeStep === null && completed ? completed : null;
  if (done)
    return {
      key: `${scenario.id}:done`, index, caption: i18n.player.scenarioComplete(mockLabel(scenario.mock, i18n)), explain: done.text.trim() || null,
      done: { text: done.text, outcome: scenario.mock.outcome, title: i18n.player.demoResultDisclaimer(done.text, mockLabel(scenario.mock, i18n)) }, forks: [],
    };
  if (total === 0)
    return { key: `${scenario.id}:empty`, index: 0, caption: i18n.player.initialState, explain: (scenario.description ?? '').trim() || i18n.player.thisScenarioHasNoStepsAndOnlyShowsIts, done: null, forks: [] };
  const step = index > 0 ? scenario.steps[index - 1] : undefined;
  // 封面、过渡卡：画面上已经是大字，不弹标题条
  if (!step || step.kind === 'card') return null;
  return { key: `${scenario.id}:${index}`, index, caption: stepCaption(step, i18n), explain: step.explain?.trim() || null, done: null, forks: forksOf(step) };
}

/** 标题条停留多久（引擎时间）：基础 2.5s，说明每 12 个字多停 1s，最多 5s。 */
export function titleDwellMs(title: StepTitle | null): number {
  if (!title) return 0;
  const extra = title.explain ? ([...title.explain].length / 12) * 1000 : 0;
  return Math.min(TITLE_DWELL_MAX_MS, Math.round(TITLE_DWELL_MS + extra));
}
