/**
 * 字幕区的内容与高度（纯函数）：画面下方单独一块，不叠在画面上。
 * - 最多两行：第一行大字（≥ 20px）是本步说明，第二行小一号是 explain（没有就不显示）；各一行，超出省略，悬停看全文。
 *   字幕只用来点一句；作者的文字不截断、不改写，过长时由 check 提示（CAPTION_TOO_LONG / EXPLAIN_TOO_LONG）。
 * - 显示哪一步：正在播放的一步；否则是刚执行完的一步；第 0 步显示“初始状态”与场景描述。
 * - 右侧一个小标记：平时是“第 n / 共 m 步”；场景完成后是“场景完成 · 模拟成功”这类结果（悬停看结果说明），
 *   第二行没有 explain 时显示结果说明。步骤条不再有重复的说明与结果行。
 * - 高度按内容自适应（T-stage）：没有 explain 时只占一行，留出的空间还给舞台。
 */
import type { PlayState, Scenario } from '@joplo-app/core';

export const SUBTITLE_CAPTION_PX = 20;
export const SUBTITLE_EXPLAIN_PX = 16;
export const SUBTITLE_PAD_Y = 12;
const CAPTION_LINE = Math.ceil(SUBTITLE_CAPTION_PX * 1.35);
const EXPLAIN_LINE = Math.ceil(SUBTITLE_EXPLAIN_PX * 1.5);
const GAP = 2;

export type SubtitleBadge =
  | { kind: 'progress'; text: string }
  | { kind: 'done'; text: string; outcome: Scenario['mock']['outcome']; title: string };

export type SubtitleContent = {
  /** 第几步（0 = 初始状态）。 */
  index: number;
  kind: 'initial' | 'user' | 'system' | 'card';
  caption: string;
  explain: string | null;
  /** 行数上限：说明一行、explain 一行（合计最多两行）。 */
  captionLines: number;
  explainLines: number;
  /** 悬停显示的全文。 */
  title: string;
  badge: SubtitleBadge;
};

export function subtitleFor(scenario: Scenario | null | undefined, position: number, activeStep: number | null, completed: PlayState['completed'] = null): SubtitleContent | null {
  if (!scenario) return null;
  const total = scenario.steps.length;
  const index = activeStep !== null ? activeStep + 1 : Math.max(0, Math.min(position, total));
  const step = index > 0 ? scenario.steps[index - 1] : undefined;
  const caption = step ? step.caption : '初始状态';
  const done = activeStep === null && completed ? completed : null;
  const own = (step ? step.explain : (scenario.description ?? (total === 0 ? '这个场景没有步骤，只展示初始状态' : undefined)))?.trim() || null;
  const explain = own ?? (done?.text.trim() || null);
  const badge: SubtitleBadge = done
    ? { kind: 'done', text: `场景完成 · ${scenario.mock.label}`, outcome: scenario.mock.outcome, title: `${done.text}（这是${scenario.mock.label}的演示结果，不代表真实服务的返回）` }
    : { kind: 'progress', text: `第 ${index} / ${total} 步` };
  return { index, kind: step ? step.kind : 'initial', caption, explain, captionLines: 1, explainLines: explain ? 1 : 0, title: explain ? `${caption}\n${explain}` : caption, badge };
}

/** 字幕区的高度：没有 explain 时一行，有时两行；没有内容时与一行相同（版面不跳）。 */
export function subtitleHeight(content: SubtitleContent | null): number {
  const lines = CAPTION_LINE + (content?.explain ? GAP + EXPLAIN_LINE : 0);
  return 2 * SUBTITLE_PAD_Y + lines;
}
