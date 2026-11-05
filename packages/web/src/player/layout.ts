/**
 * 演示页布局（D55，纯函数）：断点、播放坞宽度、时间线格子、层级标签。
 *
 * 断点（design/png/34-窄屏收起规则.png 的 ①–④；⑤–⑦ 在阶段 4）：
 *   ≥ 1440：全部展开（顶栏按钮带文字、左栏 276、当前步宽 280、缩放带“适应”）；
 *   < 1440：顶栏「检查 / 外观 / 导出」只剩图标、左栏 240（情况标题最多两行）、当前步宽 200、缩放只剩 − +。
 * 任何宽度都不出现页面滚动：时间线放不下时在自己的一行里横向滚动（隐藏滚动条，当前步自动滚到可见）。
 */
import { textW } from './controls-fit';

export const BOARD_WIDE = 1440;

export type BoardLayout = { wide: boolean; navWidth: number; topLabels: boolean; currentStepW: number; zoomLabel: boolean };

export function boardLayout(viewportW: number): BoardLayout {
  const wide = Number.isFinite(viewportW) && viewportW >= BOARD_WIDE;
  return { wide, navWidth: wide ? 276 : 240, topLabels: wide, currentStepW: wide ? 280 : 200, zoomLabel: wide };
}

/** 播放坞的尺寸（与 PlayerPage 的 Dock 一致）。 */
export const DOCK = { padX: 12, gap: 6, btn: 34, chip: 34, chipGap: 4, timelinePadX: 6, zoomBtn: 28 } as const;

/** 播放坞的总宽度：⟲ ‹ 播放 › │ 时间线（0、当前步、visible 个其余格子）│ 速度 ▾ 缩放。 */
export function dockWidth(L: BoardLayout, playLabel: string, speeds: readonly number[], visible: number): number {
  const play = 16 * 2 + 16 + 6 + textW(playLabel, 14);
  const timeline = DOCK.timelinePadX * 2 + DOCK.chip + L.currentStepW + visible * DOCK.chip + (visible + 1) * DOCK.chipGap;
  const widest = speeds.reduce((a, v) => Math.max(a, textW(`${v}×`, 13)), 0);
  const speed = speeds.length ? 10 * 2 + widest + 4 + 14 : 0;
  const zoom = 4 * 2 + DOCK.zoomBtn * 2 + 2 * 2 + (L.zoomLabel ? textW('适应', 12) + 8 : 0);
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
  label: string;
  /** 悬停提示：“序号 · 说明”，系统步骤“序号 · 系统 · 说明”。 */
  tip: string;
  /** 自动播放正在执行这一步。 */
  playing: boolean;
};

/** 时间线格子。shownIndex = 当前位置（0 = 初始）；activeStep = 正在执行的步骤（播放中），优先。 */
export function timelineChips(steps: readonly { caption: string; kind: 'user' | 'system' }[], position: number, activeStep: number | null): TimelineChip[] {
  const shown = activeStep !== null ? activeStep + 1 : position;
  const chip = (index: number, label: string, system: boolean, tip: string): TimelineChip => ({
    index,
    stepIndex: index - 1,
    state: index === shown ? 'current' : index < shown ? 'done' : 'todo',
    system,
    label,
    tip,
    playing: activeStep !== null && activeStep === index - 1,
  });
  return [chip(0, '初始', false, '0 · 初始状态'), ...steps.map((s, i) => chip(i + 1, s.caption, s.kind === 'system', `${i + 1} · ${s.kind === 'system' ? '系统 · ' : ''}${s.caption}`))];
}

export type LayerTab = { id: string; title: string; active: boolean; camera: boolean };

/** 层级标签（D55，取代 D46 的“导演跟随时不高亮”）：正在看的那层与舞台连成一片；导演跟随时它带摄像机图标。 */
export function layerTabs(layers: readonly { id: string; title: string }[], viewLayer: string, director: boolean): LayerTab[] {
  return layers.map((l) => ({ id: l.id, title: l.title, active: l.id === viewLayer, camera: director && l.id === viewLayer }));
}
