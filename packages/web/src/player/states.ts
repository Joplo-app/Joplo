import { translate } from '../i18n/messages';
import { en, type Dictionary } from '../i18n/en';
/**
 * 演示页的状态与细节（D55「细节与状态 v1」，纯函数，看板与发布站共用）：
 * 点错位置的提示、快捷键面板的内容、标签页标题与 favicon 状态点。
 */
import type { Notice } from '../runtime/demo';

export type NoticeView = { icon: 'next' | 'uncovered' | 'disabled' | 'info' | 'error' | 'ok'; text: string; back: boolean; flashTarget: boolean };

/**
 * 点错位置（沿用 notice.kind）：画面顶部居中一条轻提示，目标闪一下，3 秒后消失。
 * 顺序不对 → “按当前场景，下一步是：…”（带「回到演示」）；没有覆盖 → 虚线圆；现在不可用 → 禁止符号。
 */
export function noticeView(n: Notice | null | undefined, i18n: Dictionary = en): NoticeView | null {
  if (!n) return null;
  switch (n.kind) {
    case 'out_of_order':
      return { icon: 'next', text: translate(n.text, i18n), back: true, flashTarget: true };
    case 'uncovered':
      return { icon: 'uncovered', text: translate(n.text, i18n), back: false, flashTarget: true };
    case 'disabled':
      return { icon: 'disabled', text: translate(n.text, i18n), back: false, flashTarget: true };
    case 'error':
      return { icon: 'error', text: translate(n.text, i18n), back: false, flashTarget: false };
    case 'selected':
      return { icon: 'ok', text: translate(n.text, i18n), back: false, flashTarget: false };
    default:
      return { icon: 'info', text: translate(n.text, i18n), back: false, flashTarget: false };
  }
}

/** 快捷键面板（按 ?）：所有快捷键在一处；按钮的悬停提示里也写着对应快捷键。 */
export const SHORTCUTS = (i18n: Dictionary = en): { group: string; items: { label: string; keys: string }[] }[] => ([
  {
    group: i18n.player.play,
    items: [
      { label: i18n.player.playPause, keys: i18n.player.space },
      { label: i18n.player.previousNextStep, keys: '← →' },
      { label: i18n.player.goToStart, keys: 'Home' },
      { label: i18n.player.viewNextCaseAfterScenarioCompletes, keys: 'Enter' },
    ],
  },
  {
    group: i18n.player.stage,
    items: [
      { label: i18n.player.fullscreenEscToExit, keys: 'F' },
      { label: i18n.player.inspect, keys: i18n.player.hold },
      { label: i18n.player.zoomPan, keys: i18n.player.scrollDrag },
    ],
  },
  {
    group: i18n.player.other,
    items: [
      { label: i18n.player.appearance, keys: 'T' },
      { label: i18n.player.expandCollapsedSidebarNarrowScreens, keys: '[' },
      { label: i18n.player.keyboardShortcuts, keys: '?' },
    ],
  },
]);

/** 标签页标题：“功能 · 项目”；编译出错加 ✕；导出中写进度。 */
export function tabTitle(o: { feature: string | null; project: string | null; error?: boolean; exporting?: string | null }, i18n: Dictionary = en): string {
  if (!o.feature && !o.project) return i18n.player.joploBoard;
  const name = o.feature ?? o.project ?? 'Joplo';
  if (o.exporting) return i18n.player.exporting(name, o.exporting);
  const base = o.feature && o.project ? `${o.feature} · ${o.project}` : name;
  return o.error ? `✕ ${base}` : base;
}

/** favicon：Joplo 标志；出错时右下角红点，导出中黄点（白边，小尺寸也看得清）。 */
export function faviconHref(dot: 'error' | 'busy' | null): string {
  const mark =
    '<rect x="4" y="4" width="120" height="120" rx="30" fill="#FFD23F"/><circle cx="40" cy="40" r="9" fill="#1E1E1E"/><circle cx="87" cy="40" r="9" fill="#1E1E1E"/>' +
    '<path d="M93 60 V72 Q93 100 63 100 Q41 100 31 82" fill="none" stroke="#1E1E1E" stroke-width="11" stroke-linecap="round"/>';
  const badge = dot ? `<circle data-dot="${dot}" cx="100" cy="100" r="26" fill="${dot === 'error' ? '#C8402F' : '#E0AE00'}" stroke="#FFFFFF" stroke-width="8"/>` : '';
  return `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128">${mark}${badge}</svg>`)}`;
}
