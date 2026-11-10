/**
 * 一步的时间计划（纯函数）：演示控制器、封面“约 M 秒”、`joplo outline`、check 的时长告警、配乐锚点与媒体检查共用这一份。
 *
 * 时间一律是引擎毫秒（1×）：倍速由引擎时钟统一缩放，这里不出现速度。
 * 一步 = 提交之前演示这次操作（leadMs：鼠标移动、波纹、手势 / 逐字输入）+ 提交之后停留（dwellMs，与朗读取较长者）。
 *
 * 只在运行时才知道的两项不在计划里：切层 / 把目标框进画面的引导（看观众当时在哪一层、镜头在哪），
 * 以及朗读的真实时长（计划里是 voiceMs 估算；自动播放以真实读完为准）。
 */
import { pluginActionSpec } from './actions.ts';
import { CAMERA_MS, stepDwell, voiceMs } from './pace.ts';
import { streamPlan } from './player.ts';
import type { Project, Step } from './schema.ts';

/** 操作演示各段的时长（引擎毫秒）。 */
export const ACTION_TIMING = {
  cursorMove: 550,
  ripple: 260,
  typeChar: 45,
  selectHold: 420,
  toggleHold: 200,
  systemHold: 900,
  /** 拖动、滚动，以及没有声明 durationMs 的插件动作。 */
  gesture: 800,
  afterStep: 300,
  reducedStep: 450,
  quickStep: 300,
  /** 先切层 / 取景再移动鼠标：等新画面淡入、镜头到位。 */
  layerSwitch: CAMERA_MS + 150,
} as const;

export type StepPlan = {
  /** 提交之前：鼠标移到目标。 */
  cursorMs: number;
  /** 提交之前：按下的波纹（没有目标的操作是它的固定停顿）。 */
  rippleMs: number;
  /** 提交之前：手势本身（逐字输入、拖动、悬停、滚动、插件动作、系统事件停顿）。 */
  gestureMs: number;
  /** 提交之前合计 = cursorMs + rippleMs + gestureMs。 */
  leadMs: number;
  /** 提交之后的收尾（鼠标停一下）；算在 dwellMs 里面。 */
  settleMs: number;
  /** 提交之后至少停留：作者 hold、插件效果时长、阅读 / 镜头 / 流式输出中最长的，不短于 settleMs。 */
  dwellMs: number;
  /** 朗读估算（narrate ?? say，含换气）；没有为 0。 */
  voiceMs: number;
  /** 这一步合计 = leadMs + max(dwellMs, voiceMs)。 */
  totalMs: number;
};

export type StepPlanOptions = {
  /** 停留时要读的文字；缺省为 stepTexts(step)（英文兜底字幕）。界面传当前语言的字幕。 */
  texts?: (string | null | undefined)[];
  /** 减少动态效果：不移动鼠标、不逐字输入，每步一个固定的短停顿。 */
  reduced?: boolean;
  /** 演示时移动鼠标（缺省 true）；观众自己点出来的这一步之后接的系统事件为 false。 */
  cursor?: boolean;
  /** 已经用提交前的状态算好的流式输出时长（D100）；缺省按整段重新出估算。 */
  streamMs?: number;
};

/** 一步停留时要读的文字：说明、explain，过渡卡再加副标题与要点。 */
export function stepTexts(step: Pick<Step, 'caption' | 'explain' | 'action'>): (string | undefined)[] {
  return [step.caption, step.explain, ...(step.action.type === 'card' ? [step.action.sub, ...(step.action.points ?? [])] : [])];
}

export function stepPlan(project: Pick<Project, 'plugins'>, step: Step, o: StepPlanOptions = {}): StepPlan {
  const T = ACTION_TIMING;
  const a = step.action;
  const reduced = !!o.reduced;
  const cursor = o.cursor !== false;
  let cursorMs = 0, rippleMs = 0, gestureMs = 0;
  if (a.type === 'card') {
    // 过渡卡：直接提交，停留由 dwell 负责
  } else if (a.type === 'press') gestureMs = reduced ? T.reducedStep : T.selectHold;
  else if (step.kind === 'system' || a.type === 'event') gestureMs = step.systemLead ?? (reduced ? T.reducedStep : T.systemHold);
  else if (reduced) gestureMs = T.reducedStep;
  else if ('target' in a) {
    cursorMs = cursor ? T.cursorMove : 0;
    rippleMs = T.ripple;
    if (a.type === 'drag' || a.type === 'scroll') gestureMs = T.gesture;
    else if (a.type === 'hover') gestureMs = a.ms;
    else if (a.type === 'plugin') gestureMs = pluginActionSpec(project, a.name)?.durationMs ?? T.gesture;
    else if (a.type === 'type') gestureMs = [...a.value].length * T.typeChar;
    else if (a.type === 'select') gestureMs = T.selectHold;
    else if (a.type === 'toggle') gestureMs = T.toggleHold;
  } else rippleMs = T.ripple;

  const settleMs = cursor && !reduced ? T.afterStep : 0;
  const streamMs = o.streamMs ?? Math.max(0, ...streamPlan(step, null).map((x) => x.ms));
  const read = reduced
    ? T.reducedStep
    : stepDwell({ texts: o.texts ?? stepTexts(step), paced: step.hold !== undefined, cameraMoved: step.shots.length > 0 || !!step.directorLayer, streamMs });
  // hold 是看的时间，不是动画：减少动态效果时同样保留
  const dwellMs = Math.max(step.hold ?? 0, step.effectHold ?? 0, read, settleMs);
  const voice = voiceMs(step.mute ? undefined : step.narrate ?? step.say);
  const leadMs = cursorMs + rippleMs + gestureMs;
  return { cursorMs, rippleMs, gestureMs, leadMs, settleMs, dwellMs, voiceMs: voice, totalMs: leadMs + Math.max(dwellMs, voice) };
}

/** 一个场景按 1× 自动播放大约多久（毫秒）：每一步 stepPlan 的合计之和。 */
export function scenarioPlanMs(project: Pick<Project, 'plugins'>, steps: readonly Step[], texts?: (step: Step) => (string | null | undefined)[]): number {
  return steps.reduce((sum, step) => sum + stepPlan(project, step, texts ? { texts: texts(step) } : {}).totalMs, 0);
}

/**
 * 两次提交之间的时间（引擎毫秒，1×）：第 index 步（0 起；-1 = 场景开始）提交之后，到下一步提交（最后一步之后 = 到场景播完）。
 * 配乐快照按它推进：快照记录的是每一步提交那一刻的状态。
 */
export function commitGapMs(project: Pick<Project, 'plugins'>, steps: readonly Step[], index: number): number {
  const prev = index >= 0 ? steps[index] : undefined;
  const next = steps[index + 1];
  const after = prev ? (() => { const p = stepPlan(project, prev); return Math.max(p.dwellMs, p.voiceMs); })() : 0;
  return after + (next ? stepPlan(project, next).leadMs : 0);
}
