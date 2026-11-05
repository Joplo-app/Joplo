/**
 * 字幕区的内容（纯函数）：画面下方单独一块，不叠在画面上。
 * - 最多两行：第一行大字（≥ 20px）是本步说明，第二行小一号是 explain（没有就不显示）；各一行，超出省略，悬停看全文。
 *   字幕只用来点一句；作者的文字不截断、不改写，过长时由 check 提示（CAPTION_TOO_LONG / EXPLAIN_TOO_LONG）。
 * - 显示哪一步：正在播放的一步；否则是刚执行完的一步；第 0 步显示“初始状态”与场景描述。
 * 步骤条不再重复显示说明（只显示第几步、下一步与结果），画面上也不再有底部字幕与解说卡。
 */
import type { Scenario } from '@tokenroll/joplo-core';

export const SUBTITLE_CAPTION_PX = 22;
export const SUBTITLE_EXPLAIN_PX = 16;

export type SubtitleContent = {
  /** 第几步（0 = 初始状态）。 */
  index: number;
  kind: 'initial' | 'user' | 'system';
  caption: string;
  explain: string | null;
  /** 行数上限：说明一行、explain 一行（合计最多两行）。 */
  captionLines: number;
  explainLines: number;
  /** 悬停显示的全文。 */
  title: string;
};

export function subtitleFor(scenario: Scenario | null | undefined, position: number, activeStep: number | null): SubtitleContent | null {
  if (!scenario) return null;
  const index = activeStep !== null ? activeStep + 1 : Math.max(0, Math.min(position, scenario.steps.length));
  const step = index > 0 ? scenario.steps[index - 1] : undefined;
  const caption = step ? step.caption : '初始状态';
  const explain = (step ? step.explain : scenario.description)?.trim() || null;
  return {
    index,
    kind: step ? step.kind : 'initial',
    caption,
    explain,
    captionLines: 1,
    explainLines: explain ? 1 : 0,
    title: explain ? `${caption}\n${explain}` : caption,
  };
}
