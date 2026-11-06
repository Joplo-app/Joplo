import { en, type Dictionary } from '../i18n/en';
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
import { textW, buttonW, collapseToFit, rowWidth, type Group } from './controls-fit';

export const BOARD_WIDE = 1440;

export const BOARD_RAIL = 1100;
export const BOARD_COMPACT = 900;

export type BoardLayout = { wide: boolean; navWidth: number; topLabels: boolean; currentStepW: number; zoomLabel: boolean; rail: boolean; compactTimeline: boolean; explainInTip: boolean; languageIconOnly: boolean };

export function boardLayout(viewportW: number, i18n: Dictionary = en, nativeName = 'English'): BoardLayout {
  const w = Number.isFinite(viewportW) ? viewportW : 0;
  const wide = w >= BOARD_WIDE;
  const rail = w < BOARD_RAIL;
  const compact = w < BOARD_COMPACT;
  const top = topbarCollapse(w, i18n, nativeName);
  const layout: BoardLayout = { wide, navWidth: wide ? 276 : rail ? 56 : 240, topLabels: wide && top.collapsed.size <= 1, currentStepW: wide ? 280 : 200, zoomLabel: wide, rail, compactTimeline: compact, explainInTip: compact, languageIconOnly: top.collapsed.has('language') };
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
  const widest = speeds.reduce((a, v) => Math.max(a, textW(`${v}×`, 13)), 0);
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
export function timelineChips(steps: readonly { caption: string; kind: 'user' | 'system' | 'card'; forks?: readonly { label: string }[] }[], position: number, activeStep: number | null, dwell: Dwell | null = null, paused = false, i18n: Dictionary = en): TimelineChip[] {
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
  return [chip(0, i18n.player.initial, false, i18n.player.initialStateTip), ...steps.map((s, i) => ({ ...chip(i + 1, s.caption, s.kind === 'system', `${i + 1} · ${s.kind === 'system' ? i18n.player.system2 : s.kind === 'card' ? i18n.player.transitionPrefix : ''}${s.caption}${s.forks?.length ? ` · 分叉：${s.forks.map(f => f.label).join('、')}` : ''}`), ...(s.forks?.length ? { fork: true } : {}), ...(s.kind === 'card' ? { card: true } : {}) }))];
}

export type LayerTab = { id: string; title: string; active: boolean; camera: boolean; /** 这一层是谁的画面（D56）。 */ role?: { id: string; name: string; color: string } | null };

/** 层级标签（D55，取代 D46 的“导演跟随时不高亮”）：正在看的那层与舞台连成一片；导演跟随时它带摄像机图标。 */
export function layerTabs(layers: readonly { id: string; title: string; role?: { id: string; name: string; color: string } | null }[], viewLayer: string, director: boolean): LayerTab[] {
  return layers.map((l) => ({ id: l.id, title: l.title, active: l.id === viewLayer, camera: director && l.id === viewLayer, ...(l.role ? { role: l.role } : {}) }));
}

/** Text is measured from the active dictionary. Language collapses before existing actions. */
export function topbarCollapse(viewportW: number, i18n: Dictionary = en, nativeName = 'English'): { collapsed: Set<string>; width: number } {
  const fixed = Math.min(840, Math.max(100, viewportW - 4 * 32 - 48));
  const groups: Group[] = [
    { id: 'language', full: buttonW(nativeName), collapsed: 32 },
    { id: 'inspect', full: buttonW(i18n.player.inspect), collapsed: 32 },
    { id: 'appearance', full: buttonW(i18n.player.appearance) + 100, collapsed: 32 },
    { id: 'export', full: buttonW(i18n.player.export), collapsed: 32 },
  ];
  const collapsed = viewportW < BOARD_WIDE ? new Set(groups.map((g) => g.id)) : collapseToFit(viewportW, fixed, groups);
  return { collapsed, width: rowWidth(fixed, groups, collapsed) };
}
