/**
 * 演示页控件区的尺寸规范与“按宽度收起”（T-polish，纯函数）。
 *
 * 尺寸规范：控件高度 32 / 36，圆角 6（分段控件外框 8，全屏控制条为胶囊），间距 4 的倍数，
 * 字号 12 / 14 / 16 / 20，图标 16。所有控件文字不换行（white-space: nowrap）。
 *
 * 全屏控制条宽度不够时按优先级收起（数组顺序即优先级）：
 *   ① 上一步 / 播放 / 下一步 → 只有图标（带悬停提示）；② 速度 → 下拉菜单；③ 层级切换 → 下拉菜单。
 *   任何宽度下都不会出现竖排文字：收到最后仍放不下时，控件区横向裁切而不是换行。
 * 非全屏的演示页布局（D55：播放坞、时间线、顶栏按断点收起）见 layout.ts。
 */
export const CTRL = { sm: 32, md: 36, gap: 8, padX: 12, icon: 16, iconGap: 4, font: 14, small: 12 } as const;

/** 文字宽度估算：中日韩字符按字号宽，其余按 0.6 个字号。 */
export function textW(s: string, px: number = CTRL.font): number {
  let w = 0;
  for (const ch of s) w += (ch.codePointAt(0) ?? 0) > 0x2e80 ? px : px * 0.6;
  return Math.ceil(w);
}

/** 带图标与文字的按钮宽度；iconOnly 时是正方形。 */
export const buttonW = (label: string, h: number = CTRL.md, iconOnly = false, withIcon = true) =>
  iconOnly ? h : CTRL.padX * 2 + (withIcon ? CTRL.icon + CTRL.iconGap : 0) + textW(label);
/** 分段控件宽度：外框内边距 4，每项左右 12。 */
export const segmentedW = (labels: string[]) => 8 + labels.reduce((a, l) => a + 24 + textW(l), 0) + 2 * (labels.length - 1);

export type Group = { id: string; full: number; collapsed: number };

/**
 * 按优先级依次收起，直到 fixed + 各组宽度 + 间距 ≤ avail；返回收起的组。
 * 全部收起仍放不下时返回全部（由容器横向裁切，不换行）。
 */
export function rowWidth(fixed: number, groups: Group[], collapsed: Set<string>, gap: number = CTRL.gap, fixedCount = 0): number {
  return fixed + groups.reduce((a, g) => a + (collapsed.has(g.id) ? g.collapsed : g.full), 0) + gap * Math.max(0, fixedCount + groups.length - 1);
}

export function collapseToFit(avail: number, fixed: number, groups: Group[], gap: number = CTRL.gap, fixedCount = 0): Set<string> {
  const out = new Set<string>();
  for (const g of groups) {
    if (rowWidth(fixed, groups, out, gap, fixedCount) <= avail) break;
    out.add(g.id);
  }
  return out;
}

export type PlayLabels = { prev: string; play: string; next: string };
export const PLAY_LABELS = (playLabel: string): PlayLabels => ({ prev: '上一步', play: playLabel, next: '下一步' });

/** 播放控制三件套（上一步、播放、下一步）的展开 / 收起宽度。 */
export function navGroup(h: number, playLabel: string): Group {
  return { id: 'nav', full: buttonW('上一步', h) + Math.max(96, buttonW(playLabel, h)) + buttonW('下一步', h) + 2 * CTRL.gap, collapsed: 3 * h + 2 * CTRL.gap };
}
export const speedGroup = (speeds: readonly number[], menuW: number): Group => ({ id: 'speed', full: segmentedW(speeds.map((v) => `${v}×`)), collapsed: menuW });
export const layersGroup = (titles: string[], h: number): Group => ({
  id: 'layers',
  full: segmentedW(titles),
  collapsed: CTRL.padX * 2 + textW(`层级：${titles.reduce((a, t) => (textW(t) > textW(a) ? t : a), '')}`) + CTRL.icon + CTRL.iconGap + 0 * h,
});
export const directorW = (on: boolean, layerTitle: string) => buttonW(on ? `导演 · ${layerTitle}` : '导演已暂停', CTRL.sm);

/** 全屏控制条（胶囊，内边距 8）：三件套、速度、层级切换、导演标签、退出全屏。 */
export function fullscreenBarCollapse(avail: number, playLabel: string, speeds: readonly number[], titles: string[], director: boolean, layerTitle: string): Set<string> {
  // 胶囊左右内边距 8 + 退出全屏按钮 + 分隔线（每条 1px + 左右 4px） + 导演标签
  const seps = titles.length > 1 ? 2 : 1;
  const fixed = 16 + CTRL.sm + seps * 9 + (titles.length > 1 ? directorW(director, layerTitle) : 0);
  const groups = [navGroup(CTRL.sm, playLabel), speedGroup(speeds, CTRL.sm), ...(titles.length > 1 ? [layersGroup(titles, CTRL.sm)] : [])];
  return collapseToFit(avail, fixed, groups, CTRL.gap, titles.length > 1 ? 2 : 1);
}
