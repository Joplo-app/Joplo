import { pluginEffect } from '@joplo-app/kit/plugin';

/**
 * 聚焦图表里的一个或多个数据项（柱子、数据点、泳道、热力行/格、桑基节点），其余项自动退暗。
 * 传 null 清除聚焦、恢复全览。
 *   focusDatum('payoff', 'delta_mem')
 *   focusDatum('heat', 'row:Rust')
 *   focusDatum('payoff', null)
 */
export const focusDatum = (chart: string, targets: string | readonly string[] | null) =>
  pluginEffect('viz', 'focus', {
    chart,
    targets: targets === null ? null : typeof targets === 'string' ? [targets] : [...targets],
  });

/**
 * 渐进揭示折线图、瀑布图或散点图到指定位置（x 轴标签、数值索引或节点 id）。传 null 显示全部。
 *   revealTo('trend', '5 月')
 *   revealTo('trend', '9 月')
 */
export const revealTo = (chart: string, cutoff: number | string | null) =>
  pluginEffect('viz', 'reveal', { chart, cutoff });

/**
 * 把当前步骤该图表的解析数值锁定为后续对比的基线（写入编译期 step.ext.viz.baselines）。
 *   pinBaseline('payoff')
 */
export const pinBaseline = (chart: string) =>
  pluginEffect('viz', 'pinBaseline', { chart });

/**
 * 移动时间泳道或趋势图上的时间游标（Playhead Cursor）。传 null 隐藏游标。
 *   setCursor('lanes', 6.9, { label: '6.9 月' })
 *   setCursor('lanes', 6.9, '6.9 月')
 */
export const setCursor = (
  chart: string,
  value: number | string | null,
  opts: string | { label?: string } = {},
) => {
  const label = typeof opts === 'string' ? opts : opts.label;
  return pluginEffect('viz', 'cursor', { chart, value, ...(label !== undefined ? { label } : {}) });
};
