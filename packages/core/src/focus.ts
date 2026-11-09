/**
 * 叙事焦点（D70）：每一步观众该看哪里（焦点对象），以及用什么形式呈现。纯函数，与 cameraAt 同级：
 * 看板、发布站（含嵌入、评审）、renderStep 截图、视频录制、check 都读这一份。
 *
 * 焦点对象（subject）按优先级：
 *   cover   第 0 步：场景封面；
 *   card    过渡卡就是焦点本身；
 *   作者写的：shot / trace / spotlight / highlight / numbered / callout / mark 的目标（source = explicit）；
 *   默认推导（source = auto）：
 *     scene    换页、导演换层：整个新画面就是焦点（先看全局）；
 *     elements 用户操作 = 被操作的元素（呈现就是鼠标与点击波纹）；系统步骤 = 本步新出现或变化的元素，以及插件效果引用的元素（D98，插件自己表现变化，不加脉冲）；
 *     toast    画面里没变，只弹了 Toast；
 *   caption  画面上没有新东西，只看字幕（source = none）。
 *
 * 呈现：作者写的提示原样给出；默认只有“结果揭晓”（reveal）：本步新出现或变化、观众容易错过的元素轻轻脉冲一次，
 * 不移动镜头、不压暗、不拦截点击。克制规则：弹窗 / 抽屉自带遮罩不提示；自行显示变化的元素 自己会突出变化；
 * 一次变化超过 REVEAL_MAX 处不提示（整块都变了，让观众自己看）；作者写了任何焦点时不加默认提示；换页、换层不提示；
 * 同一个元素连续变化、或往同一个容器里连续追加（终端、聊天记录一行行出现）时，只在第一次提示。
 * config({ autoFocus: false }) 关掉默认呈现（reveal 恒为空）；焦点对象仍照常推导，check 用它判断“长时间没有焦点”。
 */
import { DIRECTOR_LAYER, PAGE_LAYER, childWidth, pluginSpec, type PluginTable } from './catalog.ts';
import { layoutRegions, applyStep, cameraAt, initialState, isNodeDisabled, isSelfVisible, layersOf, resolveProps, sceneWidth, type PlayState } from './player.ts';
import type { Callout, Project, Scene, SceneNode, Step } from './schema.ts';

export const HOLD_MIN_SECONDS = 0.5;
export const HOLD_MAX_SECONDS = 30;
/** 默认揭晓最多提示几处；更多时不提示。 */
export const REVEAL_MAX = 3;
/** 自带遮罩、出现时本身就是焦点的浮层：默认揭晓不再画提示。 */
/** 自己会突出本步变化的组件（D56）。 */
export type FocusSubject = 'cover' | 'card' | 'scene' | 'elements' | 'toast' | 'caption';
export type FocusState = {
  /** 观众此刻该看的东西。 */
  subject: FocusSubject;
  /** explicit = 作者写的；auto = 默认规则推导；none = 没有焦点（只有字幕）。 */
  source: 'explicit' | 'auto' | 'none';
  /** 焦点元素（subject = elements 时；按作者顺序，默认推导时操作目标在前）。 */
  targets: string[];
  /** 这一步之后导演所在的层（没有层级时是 @page）。 */
  layer: string;
  /** 作者写的提示（只作用于这一步）。 */
  spotlight: string[];
  highlight: string[];
  numbered: string[];
  callouts: Callout[];
  /** 默认的结果揭晓：要轻轻提示一次的元素（autoFocus 关闭、作者写了焦点、变化太多时为空）。 */
  reveal: string[];
  /** 自动播放时至少停留的毫秒数（hold，未按速度缩放）；0 = 只按阅读节奏。 */
  holdMs: number;
};

const EMPTY = (layer: string, subject: FocusSubject = 'caption'): FocusState => ({ subject, source: 'none', targets: [], layer, spotlight: [], highlight: [], numbered: [], callouts: [], reveal: [], holdMs: 0 });

type Vis = Pick<PlayState, 'ui' | 'data' | 'inputs'>;

/**
 * 画面里此刻可见的元素 id（与 isNodeVisible 同一套规则：when、浮层 opened、断点、layout 收起），一次自上而下算完。
 */
export function visibleIds(scene: Scene, state: Vis, width: number = sceneWidth(scene)): Set<string> {
  const out = new Set<string>();
  const ps = state as PlayState;
  const rec = (n: SceneNode, w: number, shell: { node: SceneNode; width: number } | null) => {
    if (!isSelfVisible(n, ps, w)) return;
    const sh = n.traits?.layout ? { node: n, width: w } : shell;
    if (sh && n.traits?.region) {
      if (layoutRegions(sh.node, state, sh.width)[n.traits.region]?.collapsed) return;
    }
    out.add(n.id);
    const cw = childWidth(n, w, resolveProps(n, state));
    for (const c of n.children ?? []) rec(c, cw, sh);
  };
  rec(scene.root, width, null);
  return out;
}

/** 本步新出现或变化的元素（最外层；文字变化记在包含它的元素上），按树的顺序。 */
/** appended = 这一步新出现（不是原有元素的内容变化）。 */
type Hit = { id: string; type: string; selfEvident?: boolean; parent: string | null; appended: boolean };
function changedElements(scene: Scene, before: PlayState, after: PlayState, plugins: PluginTable): Hit[] {
  const vb = visibleIds(scene, before);
  const va = visibleIds(scene, after);
  const hits: Hit[] = [];
  const parents = new Map<string, string | null>();
  const add = (n: SceneNode | null, appended: boolean) => { if (n && !hits.some((h) => h.id === n.id)) hits.push({ id: n.id, type: n.type, selfEvident: n.traits?.selfEvident || pluginSpec(plugins, n.type)?.selfEvident, parent: parents.get(n.id) ?? null, appended: appended && n.type !== '#text' }); };
  const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
  const rec = (n: SceneNode, parent: SceneNode | null) => {
    parents.set(n.id, parent?.id ?? null);
    if (!va.has(n.id)) return;
    const owner = n.type === '#text' ? parent : n;
    if (!vb.has(n.id)) { add(owner, owner === n); return; } // 整棵新出现：只记最外层
    if (!same(resolveProps(n, before), resolveProps(n, after)) || isNodeDisabled(n, before) !== isNodeDisabled(n, after)) add(owner, false);
    for (const c of n.children ?? []) rec(c, n.type === '#text' ? parent : n);
  };
  rec(scene.root, null);
  // 只留最外层：祖先已经在列表里的去掉
  const inside = (id: string, anc: string) => { const a = findIn(scene.root, anc); return !!a && a.id !== id && !!findIn(a, id); };
  return hits.filter((h) => !hits.some((o) => o.id !== h.id && inside(h.id, o.id)));
}

function findIn(node: SceneNode, id: string): SceneNode | null {
  if (node.id === id) return node;
  for (const c of node.children ?? []) {
    const f = findIn(c, id);
    if (f) return f;
  }
  return null;
}

/** 作者写在这一步上的焦点目标（按出现顺序去重）：镜头（这一步导演层的）、调用链、提示、气泡、标注。 */
function explicitTargets(step: Step, layer: string): { targets: string[]; wholeLayer: boolean } {
  const out: string[] = [];
  const add = (id: string) => { if (!out.includes(id)) out.push(id); };
  let wholeLayer = false;
  for (const s of step.shots ?? []) {
    if (s.layer !== layer && s.layer !== DIRECTOR_LAYER) continue;
    if (!s.targets.length) wholeLayer = true;
    s.targets.forEach(add);
  }
  // trace 的焦点对象与镜头目标相同（D69 的 Trace.targets：时序图是消息那一行；旧 IR 没有时按 nodes）
  (step.focusTargets ?? []).forEach(add);
  for (const c of step.cues ?? []) c.targets.forEach(add);
  for (const c of step.callouts ?? []) add(c.target);
  for (const m of step.marks ?? []) add(m.target);
  return { targets: out, wholeLayer };
}

/** 这一层（或路径页面）在第 position 步之后显示的画面。 */
function shownScene(project: Project, scenarioId: string, position: number, state: PlayState | null): { layer: string; scene: Scene | undefined } {
  const layers = layersOf(project, scenarioId);
  if (!layers.length) return { layer: PAGE_LAYER, scene: state ? project.scenes[state.sceneId] : undefined };
  const layer = cameraAt(project, scenarioId, position).directorLayer;
  return { layer, scene: project.scenes[(layers.find((l) => l.id === layer) ?? layers[0]!).sceneId] };
}

const timelines = new WeakMap<Project, Map<string, FocusState[]>>();

/** 整个场景每个位置（0..步数）的焦点；按项目对象缓存（热更新换了项目对象就重新算）。 */
export function focusTimeline(project: Project, scenarioId: string): FocusState[] {
  let byScenario = timelines.get(project);
  if (!byScenario) timelines.set(project, (byScenario = new Map()));
  const hit = byScenario.get(scenarioId);
  if (hit) return hit;
  const sc = project.scenarios[scenarioId];
  const out: FocusState[] = [];
  if (!sc) {
    byScenario.set(scenarioId, out);
    return out;
  }
  const auto = project.autoFocus !== false;
  // 逐步回放（与 stateAt 同一个 applyStep）；回放失败之后的位置没有状态，只给作者写的焦点
  const states: (PlayState | null)[] = [];
  let s: PlayState | null = null;
  try { s = initialState(project, scenarioId); } catch { s = null; }
  states.push(s);
  for (let i = 0; i < sc.steps.length; i++) {
    if (s) {
      try { s = applyStep(project, sc, s); } catch { s = null; }
    }
    states.push(s);
  }
  out.push(EMPTY(shownScene(project, scenarioId, 0, states[0] ?? null).layer, 'cover'));
  /** 上一步变化过的元素与它们所在的容器（连续性：同一处连续变化只在第一次提示）。 */
  let prevChanged = new Set<string>();
  for (let k = 1; k <= sc.steps.length; k++) {
    const lastChanged = prevChanged;
    prevChanged = new Set();
    const step = sc.steps[k - 1]!;
    const before = states[k - 1] ?? null;
    const after = states[k] ?? null;
    const { layer, scene } = shownScene(project, scenarioId, k, after);
    const f = EMPTY(layer);
    f.holdMs = step.hold ?? 0;
    for (const c of step.cues ?? []) {
      const list = c.kind === 'spotlight' ? f.spotlight : c.kind === 'highlight' ? f.highlight : f.numbered;
      for (const id of c.targets) if (!list.includes(id)) list.push(id);
    }
    f.callouts = (step.callouts ?? []).map((c) => ({ ...c }));
    out.push(f);
    if (step.kind === 'card') {
      f.subject = 'card';
      continue;
    }
    const ex = explicitTargets(step, layer);
    if (ex.targets.length || ex.wholeLayer) {
      Object.assign(f, { subject: ex.targets.length ? 'elements' : 'scene', source: 'explicit', targets: ex.targets });
      continue;
    }
    const actionTarget = 'target' in step.action ? step.action.target : null;
    if (!before || !after) {
      if (actionTarget) Object.assign(f, { subject: 'elements', source: 'auto', targets: [actionTarget] });
      continue;
    }
    // 换页、导演换层：整个新画面就是焦点（用户操作仍然看被操作的元素）
    const prevLayer = shownScene(project, scenarioId, k - 1, before).layer;
    const newView = layersOf(project, scenarioId).length ? prevLayer !== layer : before.sceneId !== after.sceneId;
    if (newView) {
      Object.assign(f, actionTarget && step.kind === 'user' ? { subject: 'elements', source: 'auto', targets: [actionTarget] } : { subject: 'scene', source: 'auto' });
      continue;
    }
    // 本步新出现或变化的元素；用户自己操作的元素（及其内部）不算，鼠标已经在那里
    const target = actionTarget && scene ? findIn(scene.root, actionTarget) : null;
    const hits = scene ? changedElements(scene, before, after, project.plugins).filter((h) => !(target && findIn(target, h.id))) : [];
    for (const h of hits) { prevChanged.add(h.id); if (h.appended && h.parent) prevChanged.add(`^${h.parent}`); }
    const targets = [...(actionTarget ? [actionTarget] : []), ...hits.map((h) => h.id)];
    // 插件效果改的是插件自己的画面（编辑器打字、3D、镜头……），状态里看不出来：它引用的元素就是这一步的焦点对象（D98）。
    // 插件自己表现变化，不加默认脉冲（reveal 只来自 hits）。
    for (const id of step.references ?? []) if (!targets.includes(id)) targets.push(id);
    if (targets.length) Object.assign(f, { subject: 'elements', source: 'auto', targets });
    else if (after.toasts.length) Object.assign(f, { subject: 'toast', source: 'auto' });
    // 连续性：同一个元素上一步刚变过；或者往上一步刚追加过的同一个容器里再追加（终端、聊天记录一行行出现）。
    // 观众已经在看那里，不再重复提示
    const repeated = (h: Hit) => lastChanged.has(h.id) || (h.appended && !!h.parent && lastChanged.has(`^${h.parent}`));
    const shown = hits.filter((h) => !h.selfEvident && !repeated(h));
    if (auto && shown.length <= REVEAL_MAX) f.reveal = shown.map((h) => h.id);
  }
  byScenario.set(scenarioId, out);
  return out;
}

/**
 * 焦点提示的目标是否“在镜头里”（集成 0.2.8：D69 取景 × D70 焦点的组合规则）。编译器决定要不要给提示补整层镜头、
 * check 的 FOCUS_CONFLICT 都用它。在镜头里 =
 * - 镜头目标本身，或它的子元素；
 * - 镜头目标是图表元素时，它的最内层父分组：D69 的取景一定带上这个分组（至少标题），分组框与标题也不随焦点外调暗；
 * - 镜头目标是时序图的消息时，它两端的参与者：取景带上它们的头部。
 * 同一分组里的兄弟节点不算（取景可能只带分组标题，而且焦点外的兄弟元素会被调暗）。
 */
export function inShotFrame(root: SceneNode, id: string, frameTargets: readonly string[]): boolean {
  if (frameTargets.includes(id)) return true;
  for (const f of frameTargets) {
    const n = findIn(root, f);
    if (n && findIn(n, id)) return true;
  }
  for (const f of frameTargets) if (findIn(root, f)?.framing?.include?.includes(id)) return true;
  return false;
}

/**
 * 第 position 步之后的焦点（0 = 封面；越界夹到 0..步数）。纯函数：只由 IR 与位置决定，跳转、前后翻、回放结果相同。
 * 返回新对象，调用方可以随意修改。
 */
export function focusAt(project: Project, scenarioId: string | null | undefined, position: number): FocusState {
  const tl = scenarioId ? focusTimeline(project, scenarioId) : [];
  if (!tl.length) return EMPTY(PAGE_LAYER);
  const k = Math.max(0, Math.min(tl.length - 1, Number.isFinite(position) ? Math.trunc(position) : 0));
  return structuredClone(tl[k]!);
}

/** 自动播放时这一步至少停留多久（毫秒，已按速度缩放；0 = 没写 hold）。 */
export function holdMsOf(step: Pick<Step, 'hold' | 'effectHold'> | undefined, speed = 1): number {
  // 作者的 hold 与插件效果时长（D98）取较大值
  const ms = Math.max(step?.hold ?? 0, step?.effectHold ?? 0);
  return ms > 0 ? Math.round(ms / (speed > 0 ? speed : 1)) : 0;
}

/** 媒体锚点（配乐跳转、接力）按每步推进的时长：作者 hold（缺省 3000）与效果时长（D98）取较大值，未按速度缩放。 */
export function stepAnchorMs(step: Pick<Step, 'hold' | 'effectHold'>): number {
  return Math.max(step.hold ?? 3000, step.effectHold ?? 0);
}
