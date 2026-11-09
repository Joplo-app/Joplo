import { stepCaption } from '../i18n/step-caption';
import { en, type Dictionary } from '../i18n/en';
import type { LayerIcon } from '@joplo-app/core/runtime';
/**
 * 演示页布局（D55，纯函数）：断点、播放坞宽度、时间线格子、层级标签。
 *
 * 断点（design/png/34-窄屏收起规则.png）：
 *   ≥ 1440：全部展开（顶栏按钮带文字、左栏 276、当前步宽 280、缩放带“适应”）；
 *   < 1440：① 顶栏「检查 / 外观 / 导出」只剩图标、② 左栏 240（情况标题最多两行）、③ 当前步宽 200、④ 缩放只剩 − +；
 *   < 1100：⑤ 左栏收成 56px 的竖条（方案只剩字母、情况只剩状态图标）；点竖条或按 [ 浮出完整左栏，选完自动收回；
 *   < 900：⑥ 时间线只剩当前步和总数（“1 / 5”），点一下弹出全部步骤；⑦ 字幕的 explain 收进悬停。
 * 任何宽度都不出现页面滚动：时间线放不下时在自己的一行里横向滚动（隐藏滚动条，当前步自动滚到可见）。
 */
import { textW, collapseToFit, rowWidth, type Group } from './controls-fit';

export const BOARD_WIDE = 1440;

export const BOARD_RAIL = 1100;
export const BOARD_COMPACT = 900;

export type BoardLayout = { wide: boolean; navWidth: number; topLabels: boolean; currentStepW: number; zoomLabel: boolean; rail: boolean; compactTimeline: boolean; explainInTip: boolean; languageIconOnly: boolean };

export function boardLayout(viewportW: number, i18n: Dictionary = en, nativeName = 'English', measurements?: TopbarMeasurements): BoardLayout {
  const w = Number.isFinite(viewportW) ? viewportW : 0;
  const wide = w >= BOARD_WIDE;
  const rail = w < BOARD_RAIL;
  const compact = w < BOARD_COMPACT;
  const top = measurements ? topbarCollapse(w, measurements) : null;
  const layout: BoardLayout = { wide, navWidth: wide ? 276 : rail ? 56 : 240, topLabels: wide && (!top || [...top.collapsed].every((id) => id === 'language')), currentStepW: wide ? 280 : 200, zoomLabel: wide, rail, compactTimeline: compact, explainInTip: compact, languageIconOnly: !wide || !!top?.collapsed.has('language') };
  const longest = [i18n.player.play, i18n.player.pause, i18n.player.resume, i18n.player.replay].sort((a,b) => textW(b) - textW(a))[0]!;
  const available = w - layout.navWidth - 32;
  if (dockWidth(layout, longest, [0.5,1,1.5,2], 0, i18n) > available) layout.zoomLabel = false;
  while (layout.currentStepW > 100 && dockWidth(layout, longest, [0.5,1,1.5,2], 0, i18n) > available) layout.currentStepW -= 20;
  if (dockWidth(layout, longest, [0.5,1,1.5,2], 0, i18n) > available) layout.compactTimeline = true;
  return layout;
}

/** 播放坞的尺寸（与 PlayerPage 的 Dock 一致）。 */
export const DOCK = { padX: 12, gap: 6, btn: 34, chip: 34, chipGap: 4, timelinePadX: 6, zoomBtn: 28 } as const;

/** 播放坞的总宽度：⟲ ‹ 播放 › │ 时间线（0、当前步、visible 个其余格子）│ 速度 ▾ 缩放。 */
export function dockWidth(L: BoardLayout, playLabel: string, speeds: readonly number[], visible: number, i18n: Dictionary = en): number {
  const play = 16 * 2 + 16 + 6 + textW(playLabel, 14);
  const timeline = DOCK.timelinePadX * 2 + DOCK.chip + L.currentStepW + visible * DOCK.chip + (visible + 1) * DOCK.chipGap;
  const widest = speeds.reduce((a, v) => Math.max(a, textW(i18n.player.speedValue(v), 13)), 0);
  const speed = speeds.length ? 10 * 2 + widest + 4 + 14 : 0;
  const zoom = 4 * 2 + DOCK.zoomBtn * 2 + 2 * 2 + (L.zoomLabel ? textW(i18n.player.fit, 12) + 8 : 0);
  const items = [DOCK.btn, DOCK.btn, play, DOCK.btn, 1, timeline, 1, speed, zoom].filter((w) => w > 0);
  return DOCK.padX * 2 + items.reduce((a, w) => a + w, 0) + DOCK.gap * (items.length - 1);
}

export type TimelineChip = {
  /** 序号：0 = 初始状态，i = 第 i 步。 */
  index: number;
  /** 传给 clickStepChip 的参数（序号 − 1）。 */
  stepIndex: number;
  state: 'done' | 'current' | 'todo';
  system: boolean;
  /** 过渡卡（D56）。 */
  card?: boolean;
  fork?: boolean;
  label: string;
  /** 悬停提示：“序号 · 说明”，系统步骤“序号 · 系统 · 说明”。 */
  tip: string;
  /** 自动播放正在执行这一步。 */
  playing: boolean;
  /** 自动播放停留在这一步（离下一步还有多久）：从左往右填深黄；暂停时停住。 */
  dwell?: { ms: number; elapsed: number; paused: boolean };
};

export type Dwell = { position: number; ms: number; elapsed: number };

/** 时间线格子。shownIndex = 当前位置（0 = 初始）；activeStep = 正在执行的步骤（播放中），优先。 */
export function timelineChips(steps: readonly { captionAuto?: import('@joplo-app/core').Step['captionAuto']; caption: string; kind: 'user' | 'system' | 'card'; forks?: readonly { label: string }[] }[], position: number, activeStep: number | null, dwell: Dwell | null = null, paused = false, i18n: Dictionary = en): TimelineChip[] {
  const shown = activeStep !== null ? activeStep + 1 : position;
  const chip = (index: number, label: string, system: boolean, tip: string): TimelineChip => ({
    index,
    stepIndex: index - 1,
    state: index === shown ? 'current' : index < shown ? 'done' : 'todo',
    system,
    label,
    tip,
    playing: activeStep !== null && activeStep === index - 1,
    ...(dwell && activeStep === null && dwell.position === index && index === shown ? { dwell: { ms: dwell.ms, elapsed: dwell.elapsed, paused } } : {}),
  });
  return [chip(0, i18n.player.initial, false, i18n.player.initialStateTip), ...steps.map((s, i) => ({ ...chip(i + 1, stepCaption(s, i18n), s.kind === 'system', `${i18n.player.number(i + 1)} · ${s.kind === 'system' ? i18n.player.systemPrefix : s.kind === 'card' ? i18n.player.transitionPrefix : ''}${stepCaption(s, i18n)}${s.forks?.length ? i18n.player.forkSummary(i18n.player.list(s.forks.map(f => f.label))) : ''}`), ...(s.forks?.length ? { fork: true } : {}), ...(s.kind === 'card' ? { card: true } : {}) }))];
}

export type LayerTab = { id: string; title: string; active: boolean; camera: boolean; /** 这一层是谁的画面（D56）。 */ role?: { id: string; name: string; color: string } | null; /** 预设图标（layersOf 已补默认）。 */ icon?: LayerIcon };

/** 层级标签（D55，取代 D46 的“导演跟随时不高亮”）：正在看的那层与舞台连成一片；导演跟随时它带摄像机图标。 */
export function layerTabs(layers: readonly { id: string; title: string; role?: { id: string; name: string; color: string } | null; icon?: LayerIcon }[], viewLayer: string, director: boolean): LayerTab[] {
  return layers.map((l) => ({ id: l.id, title: l.title, active: l.id === viewLayer, camera: director && l.id === viewLayer, ...(l.role ? { role: l.role } : {}), ...(l.icon ? { icon: l.icon } : {}) }));
}

/** 一个层级标签在标签栏里的位置：平时（left / width）与悬停展开时（openLeft / openWidth），z 为叠放层级。 */
export type BookmarkTab = { left: number; width: number; openLeft: number; openWidth: number; z: number };

/**
 * 层级标签放不下时像书签（纯函数）。widths 是各标签的自然宽度，available 是标签栏宽度。
 * - 放得下：按自然宽度依次排开；
 * - 放不下：当前层保持完整（最多占六成），其余平分剩余宽度（本来就短的不拉长），每个不窄于 min；
 * - 还放不下：其余标签叠起来，后一个盖住前一个的右半（当前层之后那一处不叠，免得被当前层盖住）；
 * - 悬停展开为自然宽度，盖在邻居上面，别的标签不动；靠右的向左展开。任何情况都不越过标签栏。
 * available ≤ 0（还没测出宽度）时按自然宽度排开。
 */
export function bookmarkTabs(widths: readonly number[], active: number, available: number, gap: number, min = 44): BookmarkTab[] {
  const n = widths.length;
  if (!n) return [];
  const a = active >= 0 && active < n ? active : -1;
  const z = (i: number) => (i === a ? n + 1 : i + 1);
  const total = widths.reduce((s, w) => s + w, 0) + gap * (n - 1);
  if (available <= 0 || total <= available) {
    let x = 0;
    return widths.map((w, i) => {
      const t = { left: x, width: w, openLeft: x, openWidth: w, z: z(i) };
      x += w + gap;
      return t;
    });
  }
  const slots = [...widths];
  if (a >= 0) slots[a] = Math.min(widths[a]!, n === 1 ? available : available * 0.6);
  // 其余标签平分剩余宽度：从短到长，短的拿自然宽度，长的拿均分值
  const others = widths.map((_, i) => i).filter((i) => i !== a).sort((x, y) => widths[x]! - widths[y]!);
  let rest = available - (a >= 0 ? slots[a]! : 0) - gap * (n - 1);
  others.forEach((i, k) => {
    const share = rest / (others.length - k);
    slots[i] = Math.max(Math.min(widths[i]!, share), Math.min(min, widths[i]!));
    rest -= slots[i]!;
  });
  // 仍然超出：除了当前层之后那一处，每处接缝平均叠进去一点
  const used = slots.reduce((s, w) => s + w, 0) + gap * (n - 1);
  const seams = n - 1 - (a >= 0 && a < n - 1 ? 1 : 0);
  const overlap = used > available && seams > 0 ? (used - available) / seams : 0;
  let x = 0;
  return slots.map((w, i) => {
    const left = Math.max(0, Math.min(x, available - Math.min(w, available)));
    const width = Math.min(w, available - left);
    x = left + width + gap - (i === a ? 0 : overlap);
    const openWidth = Math.min(widths[i]!, available);
    const openLeft = openWidth <= width ? left : Math.max(0, Math.min(left, available - openWidth));
    return { left, width, openLeft, openWidth: Math.max(openWidth, width), z: z(i) };
  });
}

/** Geometry comes from the rendered brand, breadcrumbs and full action contents. */
export type TopbarMeasurements = { fixed: number; groups: Group[] };
type ActionWidth = { full: number; collapsed: number };
export type TopbarContents = {
  brand: number; breadcrumbs: readonly number[]; language?: ActionWidth; inspect?: ActionWidth; appearance?: ActionWidth; export?: ActionWidth; copyLink?: ActionWidth;
  fullscreen?: number; otherActions?: readonly number[]; gap?: number; padding?: number; divider?: number;
};
export function topbarMeasurements(content: TopbarContents): TopbarMeasurements {
  const groups: Group[] = [];
  for (const id of ['language','inspect','appearance','export','copyLink'] as const) if (content[id]) groups.push({ id, ...content[id] });
  const gap = content.gap ?? 12;
  const other = [...(content.otherActions ?? []), ...(content.fullscreen ? [content.fullscreen] : [])];
  const leftCount = (content.brand ? 1 : 0) + (content.breadcrumbs.length ? 2 : 0);
  const rightCount = groups.length + other.length;
  const fixed = 2 * (content.padding ?? 16) + content.brand + content.breadcrumbs.reduce((a,w) => a+w,0)
    + (content.breadcrumbs.length ? content.divider ?? 1 : 0) + other.reduce((a,w) => a+w,0)
    + gap * (Math.max(0,leftCount + (rightCount ? 1 : 0) - 1) + Math.max(0,rightCount-1));
  return { fixed, groups };
}
export function topbarCollapse(viewportW: number, measurements: TopbarMeasurements): { collapsed: Set<string>; width: number } {
  const { fixed, groups } = measurements;
  const collapsed = viewportW < BOARD_WIDE ? new Set(groups.map((g) => g.id)) : collapseToFit(viewportW, fixed, groups, 0);
  return { collapsed, width: rowWidth(fixed, groups, collapsed, 0) };
}
