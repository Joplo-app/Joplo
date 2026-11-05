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
export function noticeView(n: Notice | null | undefined): NoticeView | null {
  if (!n) return null;
  switch (n.kind) {
    case 'out_of_order':
      return { icon: 'next', text: n.text, back: true, flashTarget: true };
    case 'uncovered':
      return { icon: 'uncovered', text: n.text, back: false, flashTarget: true };
    case 'disabled':
      return { icon: 'disabled', text: n.text, back: false, flashTarget: true };
    case 'error':
      return { icon: 'error', text: n.text, back: false, flashTarget: false };
    case 'selected':
      return { icon: 'ok', text: n.text, back: false, flashTarget: false };
    default:
      return { icon: 'info', text: n.text, back: false, flashTarget: false };
  }
}

/** 快捷键面板（按 ?）：所有快捷键在一处；按钮的悬停提示里也写着对应快捷键。 */
export const SHORTCUTS: { group: string; items: { label: string; keys: string }[] }[] = [
  {
    group: '播放',
    items: [
      { label: '播放 / 暂停', keys: '空格' },
      { label: '上一步 / 下一步', keys: '← →' },
      { label: '回到开头', keys: 'Home' },
      { label: '场景完成后看下一个情况', keys: 'Enter' },
    ],
  },
  {
    group: '画面',
    items: [
      { label: '全屏（Esc 退出）', keys: 'F' },
      { label: '检查元素', keys: '按住 ⌥' },
      { label: '缩放 / 平移', keys: '滚轮 · 拖动' },
    ],
  },
  {
    group: '其他',
    items: [
      { label: '外观', keys: 'T' },
      { label: '展开收起的左栏（窄屏）', keys: '[' },
      { label: '快捷键', keys: '?' },
    ],
  },
];

/** 标签页标题：“功能 · 项目”；编译出错加 ✕；导出中写进度。 */
export function tabTitle(o: { feature: string | null; project: string | null; error?: boolean; exporting?: string | null }): string {
  if (!o.feature && !o.project) return 'Joplo · 看板';
  const name = o.feature ?? o.project ?? 'Joplo';
  if (o.exporting) return `${name} · 导出中 ${o.exporting}`;
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
