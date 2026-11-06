import { stepCaption, mockLabel } from '../i18n/step-caption';
import { en, type Dictionary } from '../i18n/en';
/**
 * 字幕区的内容与高度（纯函数，D61）：画面下方单独一块，不叠在画面上；只由「IR + 当前位置」推导，
 * 跳到任意一步与一步步播放到那里完全一致。
 * - 最多两行，居中：第一行是本步说明（≥ 20px），第二行小一号是 explain（没有就不显示）；各一行，超出省略，悬停看全文。
 *   作者的文字不截断、不改写，过长时由 check 提示（CAPTION_TOO_LONG / EXPLAIN_TOO_LONG）。
 * - 显示哪一步：正在播放的一步；否则是刚执行完的一步。
 * - 用户操作：有角色时前面是说话人（这一步导演层的角色，与层级标签的头像一致）；系统事件不显示说话人，由组件画小圆点。
 * - 第 0 步是场景封面（kind = cover）：字幕只留进度「0 / m」；空场景（没有步骤）没有封面，仍是“初始状态”。
 * - 过渡卡（kind = card）：不重复卡片标题，只留进度（场景完成时第二行是结果说明，挪到第一行显示）。
 * - 右侧：平时是弱化的进度「n / m」（读屏用完整的“第 n / 共 m 步”）；场景完成后是“场景完成 · 模拟成功”这类结果。
 * - 高度按内容自适应：只有一行时与没有内容时一样高（版面不跳）。
 */
import { cameraAt, forksOf, layersOf, roleOfScene, type PlayState, type Project, type RoleInfo, type Scenario } from '@joplo-app/core';

export const SUBTITLE_CAPTION_PX = 22;
export const SUBTITLE_EXPLAIN_PX = 16;
/** 说话人的头像直径与名字字号（名字比说明小一号）。 */
export const SUBTITLE_AVATAR_PX = 22;
export const SUBTITLE_SPEAKER_PX = 15;
export const SUBTITLE_PROGRESS_PX = 12;
export const SUBTITLE_PAD_Y = 13;
const CAPTION_LINE = Math.ceil(SUBTITLE_CAPTION_PX * 1.35);
const EXPLAIN_LINE = Math.ceil(SUBTITLE_EXPLAIN_PX * 1.5);
const GAP = 4;

export type SubtitleBadge =
  | { kind: 'progress'; text: string; /** 读屏与悬停：完整的“第 n / 共 m 步”。 */ label: string }
  | { kind: 'done'; text: string; outcome: Scenario['mock']['outcome']; title: string };

export type SubtitleContent = {
  /** 第几步（0 = 封面 / 初始状态）。 */
  index: number;
  /** cover = 第 0 步的场景封面；empty = 没有步骤的场景。 */
  kind: 'cover' | 'empty' | 'user' | 'system' | 'card';
  /** 第一行；封面与过渡卡为空字符串（不重复卡片标题）。 */
  caption: string;
  explain: string | null;
  /** 说话人：只有用户操作、且这一步导演层声明了角色时才有。 */
  speaker: RoleInfo | null;
  /** 行数上限：说明一行、explain 一行（合计最多两行）。 */
  captionLines: number;
  explainLines: number;
  /** 悬停显示的全文。 */
  title: string;
  badge: SubtitleBadge;
  forks: Scenario['steps'][number]['forks'];
};

/**
 * 第 index 步（1 起）字幕里的说话人：只有用户操作才有，取这一步之后导演所在层的画面的角色
 * （cameraAt 的 directorLayer → 这层的画面 → roleOfScene，与层级标签上的头像同一来源）。没有层级或角色时为 null。
 */
export function speakerOf(project: Project, scenarioId: string, index: number): RoleInfo | null {
  const step = project.scenarios[scenarioId]?.steps[index - 1];
  if (!step || step.kind !== 'user') return null;
  const layer = cameraAt(project, scenarioId, index).directorLayer;
  const sceneId = layersOf(project, scenarioId).find((l) => l.id === layer)?.sceneId;
  return roleOfScene(project, sceneId);
}

export function subtitleFor(scenario: Scenario | null | undefined, position: number, activeStep: number | null, completed: PlayState['completed'] = null, i18n: Dictionary = en, project?: Project | null): SubtitleContent | null {
  if (!scenario) return null;
  const total = scenario.steps.length;
  const index = activeStep !== null ? activeStep + 1 : Math.max(0, Math.min(position, total));
  const step = index > 0 ? scenario.steps[index - 1] : undefined;
  const kind: SubtitleContent['kind'] = step ? step.kind : total === 0 ? 'empty' : 'cover';
  const full = step ? stepCaption(step, i18n) : kind === 'empty' ? i18n.player.initialState : '';
  // 过渡卡、封面：画面上已经是大字，字幕不重复
  const caption = kind === 'card' || kind === 'cover' ? '' : full;
  const done = activeStep === null && completed ? completed : null;
  const own = (kind === 'empty' ? ((scenario.description ?? '').trim() || i18n.player.thisScenarioHasNoStepsAndOnlyShowsIts) : kind === 'user' || kind === 'system' ? step?.explain : undefined)?.trim() || null;
  const explain = own ?? (done?.text.trim() || null);
  const badge: SubtitleBadge = done
    ? { kind: 'done', text: i18n.player.scenarioComplete(mockLabel(scenario.mock, i18n)), outcome: scenario.mock.outcome, title: i18n.player.demoResultDisclaimer(done.text, mockLabel(scenario.mock, i18n)) }
    : { kind: 'progress', text: `${i18n.player.number(index)} / ${i18n.player.number(total)}`, label: i18n.player.stepProgress(index, total) };
  const speaker = project && step ? speakerOf(project, scenario.id, index) : null;
  const title = [full, explain].filter(Boolean).join('\n');
  return { forks: forksOf(step), index, kind, caption, explain, speaker, captionLines: caption ? 1 : 0, explainLines: explain ? 1 : 0, title, badge };
}

/** 字幕区的高度：只有一行（说明或结果说明）时与没有内容时相同；说明与 explain 都有时两行。 */
export function subtitleHeight(content: SubtitleContent | null): number {
  const two = !!(content?.caption && content.explain);
  return 2 * SUBTITLE_PAD_Y + CAPTION_LINE + (two ? GAP + EXPLAIN_LINE : 0);
}
