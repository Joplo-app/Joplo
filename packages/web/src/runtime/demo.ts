import { scrollTarget, scrollPoint } from '../renderer/scroll-state';
import { en, type Dictionary } from '../i18n/en';
import { stepCaption, selectionLabel } from '../i18n/step-caption';
import type { BoardDictionary } from '../i18n/board/en';
import { reference } from '../i18n/messages';
import { type Text } from '../i18n/messages';
import { m } from '../i18n/messages';
/**
 * 演示控制器（看板与发布站共用）。手动体验、逐步查看、自动播放只通过 @joplo-app/core 的
 * applyStep / stateAt / explainClick 推进状态；本文件只负责动画编排（鼠标、波纹、逐字输入、系统事件停留）和提示。
 *
 * 不变量：
 * - 业务状态 state 只有三种来源：initialState / stateAt / applyStep（浏览视图的静态画面除外，它不能推进）。
 *   动画中的“示例输入”是 preview，不写入 state；被取消的动画不会推进状态。
 * - 点击的含义只由 core 的 explainClick 决定。
 * - 时长使用固定逻辑时钟（暂停时不流逝），不依赖网络或随机延迟。
 * - 界面显示的“第 k 步”与上一步/下一步一致：动画进行中（含暂停）显示的是尚未提交的第 k 步。
 * - 选中：每次写接口返回后，界面显示的选中 = .joplo/selection.json 的内容。写入被拒绝时以服务端返回的
 *   current（被拒绝时为 null）为准并明确提示；网络失败时回滚到上一次确认的选中。
 * - 热更新（setProject）保持功能、方案、场景、位置（越界夹到合法范围）、视图与选中。
 */
import { EngineClock, gesturePoint, gestureProgress } from './clock';
import { actionIndex, arbitrateAction, applyPlayground, pluginActionSpec, type Playground, type ActionEntry, type Action } from '@joplo-app/core/runtime';
/** 手动单步之后时钟再走多久（引擎时间）：覆盖 content camera 默认 1.2s 的补间与 0.9s 的元素飞行。 */
export const VISUAL_SETTLE_MS = 1200;
import { dwellTexts } from '../player/cover-content';
import { VOICE_BREATH_MS, speakerRoleAt, spokenLine } from '@joplo-app/core/runtime';
import type { Narration, Narrator, NarrationSource } from './voice';
import { ACTION_TIMING, stepPlan, orderedFeatures, streamPlan, type StreamPlan, explainClick, applyStep, getScenario, nodeLabel, findNode, layersOf, layersWithNode, replay, stateAt, type PlayState, type Project, type Scenario, type Selection, type Step } from '@joplo-app/core/runtime';
import { browseSceneId, browseState, optionsOf, scenariosOf, playSequence } from './views';
import { SelectionWriteback } from './selection-sync';

/** stage = 播放场景；browse = 静态画面（方案还没有覆盖某个情况时，展示方案的页面，不能推进）。 */
export type View = 'stage' | 'browse';

export type Notice =
  | { kind: 'disabled'; nodeId: string; text: Text }
  | { kind: 'uncovered'; nodeId: string; text: Text }
  | { kind: 'out_of_order'; nodeId: string; text: Text }
  | { kind: 'info'; text: Text }
  | { kind: 'switched'; text: Text }
  | { kind: 'selected'; text: Text }
  | { kind: 'error'; text: Text };

export type SelectionSync = { status: 'idle' | 'pending' | 'ok' } | { status: 'error'; message: Text };

/** 浏览器提交给服务端的选中（服务端补全 at / label / route）。 */
export type SelectionInput = { optionId: string | null; scenarioId: string | null; position: number; sceneId: string; nodeId: string | null; stepId?: string | null };
export type SelectionWriteResult = { ok: true; selection: Selection | null } | { ok: false; message: Text; current?: Selection | null };
export type SelectionWriter = (input: SelectionInput | null) => Promise<SelectionWriteResult>;

export type Snapshot = {
  project: Project | null;
  version: number | null;
  home: string | null;
  featureId: string | null;
  optionId: string | null;
  scenarioId: string | null;
  view: View;
  /** 浏览视图的画面（`@<路径>`）。 */
  browseSceneId: string | null;
  state: PlayState | null;
  playground: Playground | null;
  freeMode: boolean;
  switchPrompt: ActionEntry[] | null;
  gesture: { action: Action; progress: number } | null;
  playing: boolean;
  paused: boolean;
  busy: boolean;
  /** 正在播放动画的步骤下标。 */
  activeStep: number | null;
  ripple: { x: number; y: number; key: number } | null;
  preview: { nodeId: string; text: string } | null;
  systemEvent: Text | null;
  notice: Notice | null;
  selection: Selection | null;
  /** 回放失败时的说明。 */
  playbackError: Text | null;
  cursorVisible: boolean;
  selectionSync: SelectionSync;
  /** 状态被“跳转”时递增：舞台据此直接移除旧 Toast，不播放退出动画。 */
  epoch: number;
  /**
   * 状态被替换（跳转、重置、换章、从头播放）时递增；逐步提交、接力的下一章、暂停 → 继续与丢弃自由体验都不变（D92）。
   * 配乐据此决定接着播还是按快照重新定位。写入点：set（同一次更新里同时换了 epoch 与 state）。
   */
  seek: number;
  /** 观众在舞台上的输入次数（点、按键、拖动按下，D92 R6）。写入点：stageInput → Stage 的 inputs → 插件 frame.inputs；变化时插件先落定展示。 */
  inputs: number;
  /**
   * 有层级的方案（T-layers）：下一步的操作目标不在当前显示的层里时，先切到包含它的层（导演跟随时），
   * 再移动鼠标；这一步提交后清空，之后由 cameraAt 决定导演层。
   */
  leadLayer: string | null;
  /**
   * 用户操作的目标此刻不在画面里（镜头推近在别处、在画面外或被滚动区遮住）时，先让镜头把它一起框进来，
   * 再移动鼠标，保证观众看得到点击和输入；这一步提交后清空，之后由这一步自己的镜头决定。
   */
  leadFrame: string | null;
  /** 连续播放时两章之间：接下来放哪个场景、还剩几秒（mobile_watch）。 */
  upNext: { scenarioId: string; left: number } | null;
  /**
   * 自动播放停在第 position 步（D55）：总共停 ms，开始公布时已过去 elapsed；时间线据此画进度（暂停时停住）。
   * 不在停留中（手动、执行动画中、停止后）为 null。
   */
  dwell: { position: number; ms: number; elapsed: number } | null;
  /**
   * 流式输出（D56）：播放（自动或下一步）刚提交第 position 步时，这一步 stream 的文字逐字出现，speed 是当时的速度。
   * 任何别的方式改变状态（跳转、上一步、重置、热更新）都清空它，所以跳到某一步时直接显示全文。
   * plan（D100）：提交时用提交前的状态算好的出字计划（接着往后写时原有的字不重出；pace: 'voice' 跟着朗读出字）。
   * voice：这一步的朗读读到哪了（0–1；没在读这一步、或不知道时为 null），pace: 'voice' 的字优先对齐它，没有时按估算时长。
   */
  streamAt: { position: number; speed: number; plan: StreamPlan[]; voice: () => number | null } | null;
  /**
   * 朗读（D74）：第 position 步正在读（source：音频 / 浏览器朗读）；waiting = 画面停留已到、还在等声音读完。
   * 读完、被取消（跳转、上一步、手动下一步、停止）时为 null。
   */
  /** fallback：选了声音来源、这一步却用浏览器朗读（没有音频、额度不够），字幕区标“浏览器朗读”。 */
  narration: { position: number; source: NarrationSource; waiting: boolean; fallback?: boolean } | null;
};

const presentationActions = new WeakMap<Action, Action>();
function presentAction(action: Action, progress: number) {
  let data = presentationActions.get(action);
  if (!data) {
    data = structuredClone(action);
    if ('data' in data) Object.freeze(data.data);
    if ('to' in data && typeof data.to === 'object') Object.freeze(data.to);
    Object.freeze(data); presentationActions.set(action, data);
  }
  return Object.freeze({ action: data, progress });
}

/** 操作演示各段的时长：core 的 ACTION_TIMING（时间计划 stepPlan 与封面、outline、配乐锚点共用同一份）。 */
export const TIMING = ACTION_TIMING;

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** 元素是否完整地在舞台里看得见：不超出舞台，也不被裁切它的祖先（滚动区等）遮住（留 2px 余量）。 */
function fullyVisible(el: HTMLElement, root: HTMLElement): boolean {
  const r = el.getBoundingClientRect();
  if (r.width === 0 && r.height === 0) return false;
  const inside = (c: DOMRect) => r.left >= c.left - 2 && r.top >= c.top - 2 && r.right <= c.right + 2 && r.bottom <= c.bottom + 2;
  if (!inside(root.getBoundingClientRect())) return false;
  for (let p = el.parentElement; p && p !== root; p = p.parentElement) {
    const cs = getComputedStyle(p);
    if ((cs.overflowX !== 'visible' || cs.overflowY !== 'visible') && !inside(p.getBoundingClientRect())) return false;
  }
  return true;
}

const boardRef = reference<BoardDictionary>();

export class DemoController {
  private snap: Snapshot = {
    project: null,
    version: null,
    home: null,
    featureId: null,
    optionId: null,
    scenarioId: null,
    view: 'stage',
    browseSceneId: null,
    state: null,
    playground: null,
    freeMode: false,
    switchPrompt: null,
    gesture: null,
    playing: false,
    paused: false,
    dwell: null,
    streamAt: null,
    narration: null,
    busy: false,
    activeStep: null,
    ripple: null,
    preview: null,
    systemEvent: null,
    notice: null,
    selection: null,
    playbackError: null,
    cursorVisible: false,
    selectionSync: { status: 'idle' },
    epoch: 0,
    leadLayer: null,
    leadFrame: null,
    upNext: null,
    seek: 0,
    inputs: 0,
  };
  private listeners = new Set<() => void>();
  private gen = 0;
  private cancelWaiters: (() => void)[] = [];
  readonly clock = new EngineClock();
  private indexes = new Map<string, ActionEntry[]>();
  /** 已开始动画、尚未提交的步骤下标。 */
  private inflight: { index: number } | null = null;
  private stageEl: HTMLElement | null = null;
  private cursorEl: HTMLElement | null = null;
  private cursorPos = { x: 760, y: 560 };
  private noticeTimer: ReturnType<typeof setTimeout> | null = null;
  private rippleKey = 0;
  /** 播放速度（0.5 / 1 / 1.5，T-director2）：缩放动画与停留时长；镜头过渡与连线小点一圈不缩放。 */
  private playbackSpeed = 1;
  get speed() { return this.playbackSpeed; }
  set speed(value: number) { this.tickClock(); this.playbackSpeed = Number.isFinite(value) && value > 0 ? value : 1; this.tickClock(); }
  /** 最近一次提交的时刻（引擎时间）：停留时长从这里算起。 */
  private committedAt = 0;
  reducedMotion = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;

  i18n: Dictionary = en;
  /** 朗读（D74）：看板 / 发布站注入；为 null 或未开启时不读。 */
  narrator: Narrator | null = null;
  private narrating: Narration | null = null;

  /** 选中同步（审阅）：与播放调度无关，单独一个协作者；它只经这几个入口读写控制器。 */
  private readonly selection: SelectionWriteback;
  constructor(writer: SelectionWriter | null = null) {
    this.selection = new SelectionWriteback(writer, {
      snapshot: () => this.snap,
      patch: (patch) => this.set(patch),
      shownSceneId: () => this.shownSceneId(),
      scenario: () => this.scenario(),
      setScenario: (id, position) => this.setScenario(id, position),
      stop: () => this.stop(),
      clearNoticeLater: (ms) => this.autoClear(ms),
    });
  }

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };
  getSnapshot = () => this.snap;

  private tickClock(now = performance.now()) {
    const running = (this.snap.playing || this.snap.busy) && !this.snap.paused;
    this.clock.update(now, { running, speed: this.speed, paused: this.snap.paused });
    if (running) this.scheduleFrame();
  }
  /**
   * 引擎时钟唯一的帧驱动：时钟在走（播放或执行中、且没暂停）时每个显示帧采样一次，停了就不再排下一帧。
   * 等待（wait）、朗读、配乐、逐帧呈现器都只订阅 / 读取时钟，不各自轮询推进它。
   * rAF 与显示刷新对齐；页面在后台时 rAF 不触发，用一个 250ms 的定时器兜底（谁先到用谁），时间照常流逝、不会回来时一次跳一大段。
   */
  private frame: { raf: number | null; timer: ReturnType<typeof setTimeout> } | null = null;
  private scheduleFrame() {
    if (this.frame) return;
    const run = () => {
      const f = this.frame;
      if (!f) return;
      this.frame = null;
      if (f.raf !== null) cancelAnimationFrame(f.raf);
      clearTimeout(f.timer);
      this.tickClock();
    };
    const hasRaf = typeof requestAnimationFrame === 'function';
    this.frame = { raf: hasRaf ? requestAnimationFrame(run) : null, timer: setTimeout(run, hasRaf ? 250 : 16) };
  }
  /** Media and visual demonstrations sample the same clock and the same step anchor. */
  mediaElapsed(now = performance.now()): number { this.tickClock(now); return this.clock.getSnapshot().elapsedMs; }

  private set(patch: Partial<Snapshot>, sampleClock = true) {
    if (sampleClock) this.mediaElapsed();
    if (patch.epoch !== undefined && patch.state !== undefined) patch = { ...patch, seek: this.snap.seek + 1 };
    if (patch.state !== undefined && (patch.state?.position !== this.snap.state?.position || patch.state?.sceneId !== this.snap.state?.sceneId) || patch.scenarioId !== undefined && patch.scenarioId !== this.snap.scenarioId) this.clock.mark();
    // 状态被替换但不是播放提交的：不再逐字输出（跳到某一步直接显示全文）
    if (patch.state !== undefined && patch.streamAt === undefined && patch.state !== this.snap.state) patch = { ...patch, streamAt: null };
    this.snap = { ...this.snap, ...patch };
    if (sampleClock) this.tickClock();
    if (typeof window !== 'undefined') {
      const w = window as unknown as Record<string, unknown>;
      w.__JOPLO_STATE__ = this.snap.view === 'stage' ? this.snap.state : null;
      w.__JOPLO_UI__ = {
        playing: this.snap.playing,
        paused: this.snap.paused,
        busy: this.snap.busy,
        view: this.snap.view,
        featureId: this.snap.featureId,
        optionId: this.snap.optionId,
        scenarioId: this.snap.scenarioId,
        activeStep: this.snap.activeStep,
        version: this.snap.version,
      };
    }
    for (const l of this.listeners) l();
  }

  // ---------- 注册 DOM ----------
  setStageEl = (el: HTMLElement | null) => {
    this.stageEl = el;
  };
  /** 演示页 / 录制页报告当前显示的画面（有层级时是某一层的画面）与是否导演跟随。 */
  setStageView = (sceneId: string | null, director: boolean) => {
    this.stageView = { sceneId, director };
  };
  private stageView: { sceneId: string | null; director: boolean } = { sceneId: null, director: true };
  /** 用户正在看的画面：报告的层级画面（存在时），否则是状态里的路径画面。 */
  private shownSceneId(): string | null {
    const p = this.snap.project;
    const st = this.snap.state;
    if (!p || !st) return null;
    const v = this.stageView.sceneId;
    return v && p.scenes[v] && this.snap.view === 'stage' ? v : st.sceneId;
  }
  setCursorEl = (el: HTMLElement | null) => {
    this.cursorEl = el;
    if (el) el.style.transform = `translate(${this.cursorPos.x}px, ${this.cursorPos.y}px)`;
  };

  // ---------- 查询 ----------
  scenario(): Scenario | null {
    const { project, scenarioId } = this.snap;
    return project && scenarioId ? (project.scenarios[scenarioId] ?? null) : null;
  }
  /** 当前位置的下一步（尚未执行）。 */
  nextStep(): Step | null {
    const sc = this.scenario();
    const st = this.snap.state;
    if (this.snap.view !== 'stage' || !sc || !st || st.completed) return null;
    return sc.steps[st.position] ?? null;
  }

  // ---------- 项目加载与热更新 ----------
  /** 载入（或热更新）项目：保持功能、方案、场景、位置（越界夹到合法范围）、视图与选中。 */
  setProject(project: Project, version: number, home: string | null = null) {
    this.stop();
    this.indexes.clear();
    const prev = this.snap;
    const features = orderedFeatures(project).map(f => f.id);
    let featureId = prev.featureId && project.features[prev.featureId] ? prev.featureId : null;
    let optionId = prev.optionId && project.options[prev.optionId] ? prev.optionId : null;
    if (optionId && featureId && project.options[optionId]!.featureId !== featureId) optionId = null;
    if (!featureId) featureId = optionId ? project.options[optionId]!.featureId : (features.find((f) => optionsOf(project, f).length > 0) ?? features[0] ?? null);
    if (!optionId && featureId) {
      const f = project.features[featureId]!;
      optionId = f.pick && project.options[f.pick] ? f.pick : (optionsOf(project, featureId)[0]?.id ?? null);
    }
    let scenarioId = prev.scenarioId && project.scenarios[prev.scenarioId]?.optionId === optionId ? prev.scenarioId : null;
    if (!scenarioId && optionId) scenarioId = scenariosOf(project, optionId)[0]?.id ?? null;

    const homeRoute = home && project.routes[home] ? home : (Object.keys(project.routes).sort()[0] ?? null);
    let browse = prev.browseSceneId && project.scenes[prev.browseSceneId] ? prev.browseSceneId : null;
    if (!browse && homeRoute) browse = browseSceneId(project, homeRoute);
    let view: View = prev.version === null ? 'stage' : prev.view;
    if (view === 'stage' && !scenarioId) view = 'browse';

    let state: PlayState | null = null;
    let playbackError: Text | null = null;
    if (view === 'browse' && browse) state = browseState(project, browse);
    else if (scenarioId) {
      const sc = project.scenarios[scenarioId]!;
      const want = Math.max(0, Math.min(prev.scenarioId === scenarioId && prev.state && prev.view === 'stage' ? prev.state.position : 0, sc.steps.length));
      const r = this.safeStateAt(project, scenarioId, want);
      state = r.state;
      playbackError = r.error;
    }
    this.set({ project, version, home: homeRoute, featureId, optionId, scenarioId, view, browseSceneId: browse, state, playbackError, preview: null, ripple: null, systemEvent: null, activeStep: null });
    this.selection.revalidate();
  }

  private safeStateAt(project: Project, scenarioId: string, position: number): { state: PlayState | null; error: Text | null } {
    try {
      return { state: stateAt(project, scenarioId, position), error: null };
    } catch (e) {
      const r = replay(project, scenarioId);
      const msg = r.diagnostics[0]?.message ?? (e instanceof Error ? e.message : String(e));
      try {
        return { state: stateAt(project, scenarioId, Math.min(position, r.reached)), error: m.player.replayFailedAtStep(r.reached + 1, msg) };
      } catch {
        return { state: null, error: m.player.couldNotStartScenario(msg) };
      }
    }
  }

  // ---------- 模式、视图、功能、方案、场景 ----------
  setView(view: View) {
    const p = this.snap.project;
    if (!p || view === this.snap.view) return;
    this.stop();
    if (view === 'browse') {
      const id = this.snap.browseSceneId ?? (this.snap.home ? browseSceneId(p, this.snap.home) : null);
      if (!id) return this.info(m.player.thisProjectHasNoRoutesYet);
      this.set({ view, browseSceneId: id, state: browseState(p, id), playbackError: null, epoch: this.snap.epoch + 1 });
    } else {
      const sc = this.scenario();
      if (!sc) return this.info(m.player.thisOptionHasNoDemoScenariosYet);
      const r = this.safeStateAt(p, sc.id, 0);
      this.set({ view, state: r.state, playbackError: r.error, epoch: this.snap.epoch + 1 });
    }
  }

  /** 静态展示某个画面（方案没有覆盖当前情况时展示方案的页面）；不能推进，也不改变当前方案。 */
  preview(sceneId: string) {
    const p = this.snap.project;
    if (!p || !p.scenes[sceneId]) return;
    this.stop();
    this.set({ view: 'browse', browseSceneId: sceneId, scenarioId: null, state: browseState(p, sceneId), playbackError: null, epoch: this.snap.epoch + 1, notice: null });
  }

  /** 浏览某个路径（发布视图 `@<路径>`）。 */
  browse(route: string) {
    const p = this.snap.project;
    if (!p) return;
    const id = browseSceneId(p, route);
    if (!id) return this.info(m.player.routeHasNoStageToBrowse(route));
    this.stop();
    this.set({ view: 'browse', browseSceneId: id, state: browseState(p, id), playbackError: null, epoch: this.snap.epoch + 1, notice: null });
  }

  setFeature(featureId: string) {
    const p = this.snap.project;
    if (!p || !p.features[featureId]) return;
    const f = p.features[featureId]!;
    const opt = f.pick && p.options[f.pick] ? f.pick : (optionsOf(p, featureId)[0]?.id ?? null);
    this.stop();
    this.set({ featureId });
    if (opt) this.setOption(opt);
    else this.set({ optionId: null, scenarioId: null });
  }

  /** 切换方案：播放它的第一个场景；没有场景时静态展示它的页面。 */
  setOption(optionId: string) {
    const p = this.snap.project;
    if (!p || !p.options[optionId]) return;
    this.stop();
    const first = scenariosOf(p, optionId)[0] ?? null;
    const featureId = p.options[optionId]!.featureId;
    if (!first) {
      this.set({ featureId, optionId, scenarioId: null });
      const scene = Object.values(p.scenes).find((s) => s.optionId === optionId);
      if (scene) this.preview(scene.id);
      return;
    }
    const st = this.safeStateAt(p, first.id, 0);
    this.set({ featureId, optionId, scenarioId: first.id, view: 'stage', state: st.state, playbackError: st.error, epoch: this.snap.epoch + 1, notice: null });
  }

  /** 播放某个场景的某个位置。quiet：由链接 / 左栏直接定位时不弹“已切换”提示。 */
  setScenario(scenarioId: string, position = 0, opts: { quiet?: boolean } = {}) {
    const p = this.snap.project;
    if (!p || !p.scenarios[scenarioId]) return;
    this.stop();
    this.clock.mark();
    const sc = p.scenarios[scenarioId]!;
    const r = this.safeStateAt(p, scenarioId, Math.max(0, Math.min(position, sc.steps.length)));
    const featureId = p.options[sc.optionId]?.featureId ?? this.snap.featureId;
    this.set({ featureId, scenarioId, optionId: sc.optionId, view: 'stage', state: r.state, playbackError: r.error, epoch: this.snap.epoch + 1, notice: opts.quiet ? null : { kind: 'switched', text: m.player.switchedToDataReset(sc.name) } });
    if (!opts.quiet) this.autoClear();
  }

  // ---------- 逐步查看 ----------
  reset() {
    this.goto(0, m.player.resetToScenarioInitialState);
  }

  prev() {
    const st = this.snap.state;
    if (!st || this.snap.view !== 'stage') return;
    if (this.snap.playing && !this.snap.paused) {
      // 像视频：播放中后退一步后接着播——先停在退回的那一步上（停留、朗读），再往下走
      const fast = this.fast;
      const back = !this.inflight && st.position > 0;
      this.stop();
      if (back) this.goto(st.position - 1);
      void this.play({ fast: fast ?? undefined, hold: true });
      return;
    }
    if (this.inflight) {
      // 界面正显示尚未提交的第 k 步（position = k-1）：取消它即回到第 k-1 步，字幕同步回退。
      this.stop();
      this.set({ notice: null });
      return;
    }
    this.stop();
    if (st.position === 0) return this.info(m.player.alreadyAtInitialState);
    this.goto(st.position - 1);
  }

  goto(position: number, message?: Text) {
    const p = this.snap.project;
    const sc = this.scenario();
    if (!p || !sc || this.snap.view !== 'stage') return;
    this.stop();
    this.clock.mark();
    const r = this.safeStateAt(p, sc.id, Math.max(0, Math.min(position, sc.steps.length)));
    this.set({ state: r.state, playbackError: r.error, epoch: this.snap.epoch + 1, notice: message ? { kind: 'info', text: message } : null });
    if (message) this.autoClear();
  }

  async next() {
    const sc = this.scenario();
    const st = this.snap.state;
    if (!sc || !st || this.snap.view !== 'stage') return;
    if (this.snap.playing && !this.snap.paused) {
      // 像视频：播放中快进一步后接着播。动画进行中 = 立即完成这一步并停留；停留中 = 跳过剩余停留，开始下一步。
      // 最后一步的停留中快进 = 播完（不从头重播）。
      const fast = this.fast;
      if (this.inflight) {
        this.finishInflight(sc);
        if (!this.snap.playbackError) void this.play({ fast: fast ?? undefined, hold: true });
        return;
      }
      this.stop();
      if (st.completed || st.position >= sc.steps.length) return;
      void this.play({ fast: fast ?? undefined });
      return;
    }
    if (this.inflight) {
      // 正在播放某一步的动画：立即完成这一步。
      this.finishInflight(sc);
      return;
    }
    this.stop();
    if (st.completed || st.position >= sc.steps.length) return this.info(sc.steps.length === 0 ? m.player.thisScenarioHasNoStepsAndOnlyShowsIts2 : m.player.scenarioCompleteResetOrSwitchScenarios);
    const gen = this.gen;
    this.set({ busy: true });
    await this.runStep(sc, gen, { moveCursor: true });
    // 手动单步也把这一步的画面过渡走完（D97）：镜头补间、元素飞行按引擎时间走，比操作动画长；时钟一停就会卡在半路。
    // 收尾期间再按下一步会 stop()（gen 变化）并立刻执行下一步。reduced motion 没有过渡，不等。
    if (gen === this.gen && !this.reducedMotion) await this.wait(VISUAL_SETTLE_MS, gen);
    if (gen === this.gen) this.set({ busy: false });
  }

  // ---------- 自动播放 ----------
  togglePlay() {
    if (!this.snap.playing) void this.play();
    else if (this.snap.paused) this.resume();
    else this.pause();
  }

  /**
   * 自动播放。opts.fromStart：从第 0 步开始；opts.fast(i)：第 i 步快速带过（约 300ms，不移动鼠标、不逐字输入），
   * 用于“只重放这一层”时跳过这一层没有变化的步骤。
   * opts.hold：先在当前这一步上停留（并朗读）再往下走——播放中按 ← → 跳步后接着播时用；到了最后一步就停在那里，不从头重播。
   */
  async play(opts: { fromStart?: boolean; fast?: (index: number) => boolean; hold?: boolean } = {}) {
    const p = this.snap.project;
    let sc = this.scenario();
    if (!p || !sc || !this.snap.state || this.snap.view !== 'stage') return;
    this.stop();
    if (sc.steps.length === 0) return this.info(m.player.thisScenarioHasNoStepsAndOnlyShowsIts2);
    if (opts.fromStart || (!opts.hold && (this.snap.state.completed || this.snap.state.position >= sc.steps.length))) {
      const r = this.safeStateAt(p, sc.id, 0);
      this.set({ state: r.state, playbackError: r.error, epoch: this.snap.epoch + 1 });
    }
    this.fast = opts.fast ?? null;
    const gen = this.gen;
    this.set({ playing: true, paused: false, busy: true, cursorVisible: !this.reducedMotion, notice: null });
    const at = this.snap.state.position;
    if (opts.hold && at > 0) {
      this.committedAt = this.clock.time;
      this.narrate(sc, at);
      if (!(await this.dwellOn(sc, at - 1, gen))) return;
    }
    let next: string | null = null;
    for (;;) {
      while (gen === this.gen) {
        const st = this.snap.state;
        if (!st || st.completed || st.position >= sc.steps.length) break;
        const index = st.position;
        const quick = !!this.fast?.(index);
        const ok = quick ? await this.runQuick(sc, gen) : await this.runStep(sc, gen, { moveCursor: true });
        if (!ok || gen !== this.gen) return;
        if (!quick && !(await this.dwellOn(sc, index, gen))) return;
      }
      this.fast = null;
      if (gen !== this.gen) return;
      // 连续播放（mobile_watch）：自动播放把一个场景放完时，接着放下一个场景；手动一步步看、最后一个场景、被停止时不跳
      const end = this.snap.state;
      next = end && (end.completed || end.position >= sc.steps.length) ? (this.autoNext?.(sc.id) ?? null) : null;
      const following: Scenario | undefined = next ? this.snap.project?.scenarios[next] : undefined;
      if (!next || !following) {
        this.set({ playing: false, paused: false, busy: false, dwell: null });
        return;
      }
      // 接力（D92）：flow({ from }) 接着这一章的下一章一镜到底——不倒计时、不停播、不换 epoch，
      // 画面、插件观察器与配乐都不重置；状态就是这一章的结尾（下一章第 0 步由它推导）
      if (following.from !== sc.id || !this.continueInto(following)) break;
      sc = following;
    }
    if (!next) return;
    if (this.autoNextDelay <= 0) {
      this.setScenario(next, 0, { quiet: true });
      void this.play({ fromStart: true });
      return;
    }
    // 页面上显示“下一章 · N 秒”：暂停时倒计时也停；立即播放跳过等待；取消（或停止）就停在这一章的结尾
    this.set({ busy: false, dwell: null, upNext: { scenarioId: next, left: Math.ceil(this.autoNextDelay / 1000) } });
    this.skipUpNext = false;
    let remaining = this.autoNextDelay;
    this.tickClock();
    const countdownStart = this.clock.rawTime;
    while (remaining > 0 && !this.skipUpNext) {
      await sleep(Math.min(remaining, 100));
      if (gen !== this.gen) return;
      this.tickClock();
      remaining = this.autoNextDelay - (this.clock.rawTime - countdownStart);
      const left = Math.max(0, Math.ceil(remaining / 1000));
      if (this.snap.upNext && left !== this.snap.upNext.left) this.set({ upNext: { scenarioId: next, left } });
    }
    if (gen !== this.gen) return;
    this.set({ upNext: null });
    this.setScenario(next, 0, { quiet: true });
    void this.play({ fromStart: true });
  }

  /** 接力到下一章：只换场景与（相同的）第 0 步状态，播放不停；回放失败时返回 false（按普通换章处理）。 */
  private continueInto(sc: Scenario): boolean {
    const p = this.snap.project;
    if (!p) return false;
    const r = this.safeStateAt(p, sc.id, 0);
    if (r.error || !r.state) return false;
    this.set({ featureId: p.options[sc.optionId]?.featureId ?? this.snap.featureId, scenarioId: sc.id, optionId: sc.optionId, state: r.state, playbackError: null, dwell: null });
    return true;
  }

  private skipUpNext = false;
  /** 下一章倒计时中：立即播放。 */
  playNextNow() {
    if (this.snap.upNext) this.skipUpNext = true;
  }
  /** 下一章倒计时中：取消，停在当前这一章的结尾。 */
  cancelNext() {
    if (this.snap.upNext) this.stop();
  }

  /**
   * 自动播放放完一个场景后，接着放哪个场景（返回 null 就停下）。缺省（D92 U2 / R9，看板、发布站、嵌入一致）：playSequence 里的
   * 下一个——from 接力链优先，其余按声明顺序，跳过 flow({ autoplay: false }) 的支线。支线本身播完就停。录制等场合可以设为 null。
   */
  autoNext: ((scenarioId: string) => string | null) | null = (id) => {
    const p = this.snap.project;
    const sc = p?.scenarios[id];
    if (!p || !sc) return null;
    const sequence = playSequence(p, sc.optionId);
    const i = sequence.findIndex((s) => s.id === id);
    return i >= 0 && i + 1 < sequence.length ? sequence[i + 1]!.id : null;
  };
  /** 两个场景之间的倒计时（毫秒，不随速度缩放；暂停时不计时）。缺省 0：不倒计时、不出“下一章”卡片，直接接着播（D92 U2）。 */
  autoNextDelay = 0;

  private fast: ((index: number) => boolean) | null = null;

  /** 这一步的时间计划（core stepPlan）：文字用当前语言的字幕；流式输出用提交时按提交前状态算好的出字计划（D100）。 */
  private planOf(step: Step, position?: number, cursor = true) {
    const streamed = position !== undefined && this.snap.streamAt?.position === position ? Math.max(0, ...this.snap.streamAt.plan.map((x) => x.ms)) : undefined;
    return stepPlan(this.snap.project ?? {}, step, { texts: dwellTexts(step, this.i18n), reduced: this.reducedMotion, cursor, ...(streamed !== undefined ? { streamMs: streamed } : {}) });
  }

  /** 停留在刚提交的第 index 步（0 起）上；被取消时返回 false。 */
  private async dwellOn(sc: Scenario, index: number, gen: number): Promise<boolean> {
    // 停留 = 时间计划里的 dwellMs（作者 hold、插件效果时长、阅读 / 镜头 / 流式输出中最长的），按引擎时间等：暂停不走、倍速与画面一致
    const dwell = this.planOf(sc.steps[index]!, index + 1).dwellMs;
    this.tickClock();
    const elapsed = Math.max(0, this.clock.time - this.committedAt);
    // 时间线上的进度条用浏览器时间画：换算成当前倍速下的真实毫秒
    this.set({ dwell: { position: index + 1, ms: Math.round(Math.max(dwell, elapsed) / this.speed), elapsed: Math.round(elapsed / this.speed) } });
    // 朗读（D74）：停留 = max(画面停留, 声音读完 + 换气)；画面停够了、声音没读完时标出“在等声音”
    const ok2 = (await Promise.all([
      this.wait(dwell - elapsed, gen).then((ok) => {
        if (ok && this.narrating && this.snap.narration && !this.snap.narration.waiting) this.set({ narration: { ...this.snap.narration, waiting: true } });
        return ok;
      }),
      this.waitNarration(gen),
    ])).every(Boolean);
    if (this.snap.dwell) this.set({ dwell: null });
    return ok2;
  }

  /** 快速带过一步（约 300ms）：不移动鼠标、不逐字输入。 */
  private async runQuick(sc: Scenario, gen: number): Promise<boolean> {
    const st = this.snap.state;
    if (!st) return false;
    this.inflight = { index: st.position };
    this.set({ activeStep: st.position });
    if (!(await this.wait(TIMING.quickStep, gen))) return false;
    if (gen !== this.gen || !this.commit(sc)) return false;
    if (gen === this.gen) this.set({ systemEvent: null, activeStep: null, ripple: null, gesture: null });
    return true;
  }

  pause(explore = true) {
    if ((!this.snap.playing && !this.snap.busy) || this.snap.paused) return;
    this.narrating?.pause();
    this.set({ paused: true, freeMode: explore || this.snap.freeMode });
  }

  resume() {
    if (!this.snap.paused) return;
    this.resetPlayground(false);
    this.narrating?.resume();
    this.set({ paused: false, freeMode: false });
  }

  /** 停掉当前朗读（人的操作优先：跳转、上一步、手动下一步、停止、关闭声音）。 */
  stopNarration() {
    const n = this.narrating;
    this.narrating = null;
    n?.cancel();
    if (this.snap.narration) this.set({ narration: null });
  }

  /** 读刚提交的这一步（第 position 步，1 起）。 */
  private narrate(sc: Scenario, position: number) {
    this.stopNarration();
    const p = this.snap.project;
    const step = sc.steps[position - 1];
    if (!p || !step || !this.narrator?.enabled) return;
    const line = spokenLine(step, stepCaption(step, this.i18n), speakerRoleAt(p, sc.id, position));
    const n = this.narrator.speak(line.text, line.role, this.speed);
    if (!n) return;
    this.narrating = n;
    this.set({ narration: { position, source: n.source, waiting: false, ...(n.source === 'browser' && this.narrator.hasVoice(line.role) ? { fallback: true } : {}) } });
    void n.done.then(() => {
      if (this.narrating !== n) return;
      this.narrating = null;
      if (this.snap.narration) this.set({ narration: null });
    });
  }

  /** 第 position 步的朗读读到哪了（0–1）；没在读这一步、或朗读方式给不出进度时为 null。 */
  private voiceProgress(position: number): number | null {
    if (!this.narrating || this.snap.narration?.position !== position) return null;
    return this.narrating.progress?.() ?? null;
  }

  /**
   * 等当前朗读读完，再换一口气（VOICE_BREATH_MS，按速度缩放，暂停时不计时）。没有朗读时立刻返回 true；被取消时返回 false。
   */
  private async waitNarration(gen: number): Promise<boolean> {
    const n = this.narrating;
    if (!n) return gen === this.gen;
    // 等声音时引擎时钟照常走（D92）：镜头漂移、进退场与逐字输出都由它驱动；播放 / 执行中帧驱动一直在转，这里只等声音
    this.tickClock();
    let cancel = () => {};
    await Promise.race([n.done, new Promise<void>((r) => { cancel = r; this.cancelWaiters.push(r); })]);
    this.cancelWaiters = this.cancelWaiters.filter((f) => f !== cancel);
    if (gen !== this.gen) return false;
    return this.wait(VOICE_BREATH_MS, gen);
  }

  /** 取消一切正在进行的动画与自动播放；被取消的步骤不会推进状态。 */
  stop() {
    this.gen++;
    this.stopNarration();
    this.resetPlayground(false);
    this.inflight = null;
    const ws = this.cancelWaiters;
    this.cancelWaiters = [];
    ws.forEach((w) => w());
    if (this.snap.playing || this.snap.busy || this.snap.preview || this.snap.systemEvent || this.snap.ripple || this.snap.activeStep !== null || this.snap.leadLayer || this.snap.leadFrame || this.snap.upNext)
      this.set({ playing: false, paused: false, busy: false, dwell: null, preview: null, systemEvent: null, ripple: null, activeStep: null, leadLayer: null, leadFrame: null, upNext: null, gesture: null });
  }

  // ---------- 点击 ----------
  /**
   * 单击画面元素：按当前场景解释（推进、禁用原因、演示范围外、不是当前步骤）。
   * inspect（⌥+单击）：只检查 —— 写入选中，不操作原型。
   */
  /** Pause before delivery; never cancel or replay the viewer's original DOM event. */
  stageInput(explore = false): void {
    // 先让舞台上进行中的展示落定（进退场、幽灵），再处理这次输入（D92 R6）：计数变化就是插件的信号
    this.set({ inputs: this.snap.inputs + 1 });
    if ((this.snap.playing || this.snap.busy) && !this.snap.paused) this.pause(explore);
    if (explore && !this.snap.freeMode) this.set({ freeMode: true });
  }
  resetPlayground(keepMode = true) {
    this.set({ playground: null, switchPrompt: null, freeMode: keepMode && this.snap.freeMode, epoch: this.snap.epoch + 1 });
  }
  dismissSwitch() { this.set({ switchPrompt: null }); }
  confirmSwitch(index: number) {
    const candidate = this.snap.switchPrompt?.[index];
    if (candidate) {
      const after = this.snap.project?.scenarios[candidate.scenarioId]?.actionEntry === 'after';
      this.setScenario(candidate.scenarioId, candidate.position + (after ? 1 : 0));
      // Before-action entry must expose its pre-state even at step zero.
      // After-action entry already shows the committed result and stays stopped.
      if (!after) this.set({ freeMode: true });
    }
  }
  async clickNode(nodeId: string, point: { x: number; y: number }, opts: { inspect?: boolean } = {}) {
    if (opts.inspect) return this.select(nodeId);
    return this.act({ type: 'click', target: nodeId }, undefined, point);
  }
  async act(action: Action, native?: Action, point?: {x:number;y:number}) {
    const p = this.snap.project;
    const st = this.snap.state;
    if (!p || !st) return;
    const sc = this.scenario();
    if (this.snap.view !== 'stage' || !sc) return this.info(m.player.staticStageThisOptionDoesNotDemonstrateThisCase);
    // Hover is passive during playback. Touch hover is preceded by pointerdown's pause.
    if (action.type === 'hover' && (this.snap.playing || this.snap.busy) && !this.snap.paused) return;
    this.stageInput(true);
    let index = this.indexes.get(sc.optionId);
    if (!index) { index = actionIndex(p, sc.optionId); this.indexes.set(sc.optionId, index); }
    const result = arbitrateAction(p, st, action, { layer: this.snap.playground, sceneId: this.shownSceneId() ?? undefined, index, native });
    if (result.kind === 'free') { this.set({ playground: applyPlayground(this.snap.playground, result.effects), freeMode: true, notice: null, switchPrompt: null }); return; }
    if (result.kind === 'switch') { this.set({ switchPrompt: result.candidates, notice: null }); return; }
    const nodeId = 'target' in action ? action.target : '';
    const cur = this.snap.state!;
    const verdict = result.kind === 'advance' ? { kind: 'advance' as const } : result.verdict;
    const scene = p.scenes[this.shownSceneId() ?? cur.sceneId];
    const node = scene ? findNode(scene, nodeId)?.node : null;
    const label = node ? nodeLabel(node) : m.player.element;
    switch (verdict.kind) {
      case 'advance': {
        const stayPaused = this.snap.paused;
        this.stop(); // Cancel any frozen demonstration, then apply the matched scripted step exactly once.
        this.set({ notice: null, freeMode: true });
        const gen = this.gen;
        this.cursorPos = point ?? ('target' in action ? this.measureCenter(action.target) : null) ?? this.cursorPos;
        this.set({ busy: true, cursorVisible: false });
        // The viewer already performed the gesture. Commit the script without replaying their typing/drag.
        const ok = this.commit(sc, true);
        // Interrupted playback stays at this step, including before a system response.
        // A stopped/manual walkthrough retains its existing automatic response behavior.
        let cont = ok;
        while (cont && !stayPaused && gen === this.gen) {
          const nx = this.nextStep();
          if (!nx || nx.kind !== 'system') break;
          // 朗读开着时，先读完用户这一步再接系统事件（不截断）
          if (!(await this.waitNarration(gen))) break;
          cont = await this.runStep(sc, gen, { moveCursor: false });
        }
        if (gen === this.gen) this.set({ busy: false });
        return;
      }
      // 点错位置（D55）：画面顶部一条轻提示 + 目标闪一下，3 秒后消失，不打断
      case 'disabled':
        this.set({ notice: { kind: 'disabled', nodeId, text: verdict.reason ?? m.player.defaultDisabledReason } });
        this.autoClear(3000);
        return;
      case 'unmodeled':
      case 'not_covered':
        this.set({ notice: { kind: 'uncovered', nodeId, text: m.player.thisDemoDoesNotCover(verdict.label || label) } });
        this.autoClear(3000);
        return;
      case 'out_of_order':
        this.set({ notice: { kind: 'out_of_order', nodeId, text: this.nextStep() && !this.snap.state?.completed ? m.player.inThisScenarioTheNextStepIs(stepCaption(this.nextStep()!, m)) : m.player.inThisScenarioTheDemoHasEnded } });
        this.autoClear(3000);
        return;
      case 'static':
        return;
    }
  }

  /** “回到演示”：关闭提示；聚焦框会重新指向下一步目标。场景已结束时提示可以重置。 */
  backToDemo() {
    const st = this.snap.state;
    const sc = this.scenario();
    if (st && sc && (st.completed || st.position >= sc.steps.length)) return this.info(sc.steps.length === 0 ? m.player.thisScenarioHasNoStepsAndOnlyShowsIts2 : m.player.scenarioEndedResetOrSwitchScenarios);
    this.set({ notice: null });
  }

  dismissNotice() {
    this.set({ notice: null });
  }

  // ---------- 审阅：选中（实现在 selection-sync.ts） ----------
  select(nodeId: string | null, stepId?: string | null) { return this.selection.select(nodeId, stepId); }
  /** 取消选中，并同步给 Agent（selection.json 写为 null）。 */
  clearSelection() { return this.selection.clear(); }
  /** 页面载入时恢复文件里的选中（与当前项目不符时清除）。 */
  restoreSelection(sel: Selection | null) { return this.selection.restore(sel); }

  /** 点击步骤条上的一步：跳到该步骤执行之后（-1 = 初始状态）。 */
  clickStepChip(index: number) {
    const sc = this.scenario();
    if (!sc || this.snap.view !== 'stage') return;
    this.goto(index + 1);
  }

  /** 取消动画；若有尚未提交的步骤，立即提交它（不跳过业务状态）。 */
  private finishInflight(sc: Scenario) {
    const f = this.inflight;
    this.stop();
    if (f && this.snap.state && this.snap.state.position === f.index) this.commit(sc);
  }

  // ---------- 内部：一个步骤的动画 + 状态推进 ----------
  private async runStep(sc: Scenario, gen: number, opts: { moveCursor: boolean; clickPoint?: { x: number; y: number } }): Promise<boolean> {
    const st = this.snap.state;
    if (!st) return false;
    const index = st.position;
    const step = sc.steps[index];
    if (!step) return false;
    this.inflight = { index };
    this.set({ activeStep: index });
    const a = step.action;
    const reduced = this.reducedMotion;
    // 各段时长来自时间计划；这里只负责每一段画什么
    const plan = this.planOf(step, undefined, opts.moveCursor);

    if (a.type === 'card') {
      // 过渡卡（D56）：直接提交，卡片淡入；停留由 play 的 dwell 负责
    } else if (a.type === 'press') {
      // 无目标用户操作：activeStep 投影为键帽，不移动鼠标，状态仍统一在 commit 推进。
      if (!(await this.wait(plan.gestureMs, gen))) return false;
    } else if (step.kind === 'system' || a.type === 'event') {
      this.set({ systemEvent: a.type === 'event' ? a.name : stepCaption(step, m) });
      if (!(await this.wait(plan.gestureMs, gen))) return false;
    } else if ('target' in a) {
      if (!(await this.leadTo(sc, a.target, gen))) return false;
      if (!(await this.frameTo(a.target, gen))) return false;
      if (reduced) {
        if (!(await this.wait(plan.gestureMs, gen))) return false;
      } else {
        const pt = opts.clickPoint ?? this.measureCenter(a.target);
        if (opts.moveCursor && pt) {
          this.set({ cursorVisible: true });
          if (!(await this.moveCursor(pt, gen, plan.cursorMs))) return false;
        }
        if (pt) this.set({ ripple: { x: pt.x, y: pt.y, key: ++this.rippleKey } });
        if (!(await this.wait(plan.rippleMs, gen))) return false;
        if (a.type === 'drag') {
          const end = typeof a.to === 'string' ? this.measureCenter(a.to) : a.to;
          const from = pt ?? this.cursorPos;
          if (!(await this.wait(plan.gestureMs, gen, progress => {
            this.set({ gesture: presentAction(a, progress) }, false);
            if (end) { this.cursorPos = gesturePoint(from, end, progress); if (this.cursorEl) this.cursorEl.style.transform = `translate(${this.cursorPos.x}px, ${this.cursorPos.y}px)`; }
          }))) return false;
        } else if (a.type === 'hover' || a.type === 'scroll' || a.type === 'plugin') {
          const scroll = a.type === 'scroll' ? this.scrollDemo(a.target, a.to) : null;
          if (!(await this.wait(plan.gestureMs, gen, progress => { this.set({ gesture: presentAction(a, progress) }, false); scroll?.(progress); }))) return false;
        } else if (a.type === 'type') {
          // 逐字输入：一段等待，按进度露出前 n 个字（暂停、倍速与其他手势一致）
          const chars = [...a.value];
          let shown = 0;
          if (!(await this.wait(plan.gestureMs, gen, progress => {
            const n = Math.min(chars.length, Math.max(1, Math.ceil(progress * chars.length)));
            if (n !== shown) { shown = n; this.set({ preview: { nodeId: a.target, text: chars.slice(0, n).join('') } }, false); }
          }))) return false;
        } else if (a.type === 'select') {
          this.set({ preview: { nodeId: a.target, text: a.value } });
          if (!(await this.wait(plan.gestureMs, gen))) return false;
        } else if (a.type === 'toggle') {
          if (!(await this.wait(plan.gestureMs, gen))) return false;
        }
      }
    } else {
      if (!(await this.wait(plan.rippleMs + plan.gestureMs, gen))) return false;
    }
    if (gen !== this.gen) return false;
    if (!this.commit(sc, true)) return false;
    if (plan.settleMs && !(await this.wait(plan.settleMs, gen))) return false;
    if (gen === this.gen) this.set({ systemEvent: null, activeStep: null, ripple: null, gesture: null });
    return true;
  }

  /** 推进一步：唯一调用 applyStep 的地方。 */
  private commit(sc: Scenario, stream = false): boolean {
    const p = this.snap.project;
    const st = this.snap.state;
    this.inflight = null;
    if (!p || !st) return false;
    try {
      const next = applyStep(p, getScenario(p, sc.id), st);
      // 出字计划要用提交前的状态（D100）：接着往后写时，原来就有的字不重新出
      const plan = stream ? streamPlan(sc.steps[st.position], st) : [];
      const n = this.snap.notice;
      // 推进后，锚定在元素上的就地提示（禁用原因、未覆盖、越序）已过时，关闭它。
      this.tickClock();
      this.committedAt = this.clock.time;
      this.set({ playground: null, switchPrompt: null, leadFrame: null, state: next, streamAt: plan.length ? { position: next.position, speed: this.speed, plan, voice: () => this.voiceProgress(next.position) } : null, preview: null, playbackError: null, leadLayer: null, ...(n && 'nodeId' in n ? { notice: null } : {}) });
      // 朗读（D74）：播放提交的一步（自动播放、下一步、点原型）才读；跳转、上一步、热更新不读
      if (stream) this.narrate(sc, next.position);
      return true;
    } catch (e) {
      this.stop();
      this.set({ playbackError: e instanceof Error ? e.message : String(e), notice: { kind: 'error', text: m.player.couldNotExecuteThisStep(e instanceof Error ? e.message : String(e)) } });
      return false;
    }
  }

  /**
   * 有层级的方案：操作目标不在当前显示的层里时（导演跟随），先切到包含它的第一个层并等画面到位，鼠标才能对准它。
   * 手动选层时不切（尊重用户的选择；目标不在这一层时鼠标不移动）。
   */
  private async leadTo(sc: Scenario, target: string, gen: number): Promise<boolean> {
    const p = this.snap.project;
    if (!p || !this.stageView.director || !layersOf(p, sc.id).length) return true;
    const shown = this.shownSceneId();
    const scene = shown ? p.scenes[shown] : undefined;
    if (scene && findNode(scene, target)) return true;
    const to = layersWithNode(p, sc.id, target)[0];
    if (!to || to === this.snap.leadLayer) return true;
    this.set({ leadLayer: to });
    return this.wait(this.reducedMotion ? 0 : TIMING.layerSwitch, gen);
  }

  /**
   * 操作目标不完整地在画面里时（被镜头推到画面外、被滚动区遮住），请求镜头把它一起框进来，等镜头到位。
   * 用户自己缩放平移时不动（尊重用户的视图）；目标根本不在当前画面里时交给 leadTo / 不处理。
   */
  private async frameTo(target: string, gen: number): Promise<boolean> {
    const root = this.stageEl;
    if (!root || root.dataset.userZoom) return true;
    const el = root.querySelector<HTMLElement>(`[data-jcontrol="${CSS.escape(target)}"]`) ?? root.querySelector<HTMLElement>(`[data-jid="${CSS.escape(target)}"]`);
    if (!el || fullyVisible(el, root)) return true;
    this.set({ leadFrame: target });
    return this.wait(this.reducedMotion ? 0 : TIMING.layerSwitch, gen);
  }

  private scrollDemo(target: string, to: string | {x:number;y:number}): ((progress:number)=>void) | null {
    const root = this.stageEl;
    const scroller = root ? scrollTarget(root, target) : null;
    if (!scroller) return null;
    const start = { x: scroller.scrollLeft, y: scroller.scrollTop };
    const end = scrollPoint(scroller, to) ?? start;
    return progress => { const p = gesturePoint(start, end, progress); scroller.scrollLeft = p.x; scroller.scrollTop = p.y; };
  }

  private measureCenter(nodeId: string): { x: number; y: number } | null {
    const root = this.stageEl;
    if (!root) return null;
    const el = root.querySelector<HTMLElement>(`[data-jcontrol="${CSS.escape(nodeId)}"]`) ?? root.querySelector<HTMLElement>(`[data-jid="${CSS.escape(nodeId)}"]`);
    if (!el) return null;
    const rr = root.getBoundingClientRect();
    const s = rr.width / root.offsetWidth || 1;
    const r = el.getBoundingClientRect();
    return { x: (r.left - rr.left + r.width / 2) / s, y: (r.top - rr.top + r.height / 2) / s };
  }

  private async moveCursor(to: { x: number; y: number }, gen: number, duration: number = TIMING.cursorMove): Promise<boolean> {
    const from = { ...this.cursorPos };
    return this.wait(duration, gen, t => {
      this.cursorPos = gesturePoint(from, to, t);
      if (this.cursorEl) this.cursorEl.style.transform = `translate(${this.cursorPos.x}px, ${this.cursorPos.y}px)`;
    });
  }

  /**
   * 等 ms 毫秒的引擎时间（倍速由时钟缩放）。只订阅时钟，不自己计时：暂停时时钟不走，等待也不走；
   * stop()（gen 变化）时返回 false。frame 每个时钟帧收到一次进度（0–1）。
   */
  private wait(ms: number, gen: number, frame?: (progress: number) => void): Promise<boolean> {
    this.tickClock();
    if (gen !== this.gen) return Promise.resolve(false);
    const start = this.clock.time;
    frame?.(gestureProgress(start, start, ms));
    if (gestureProgress(start, start, ms) >= 1) return Promise.resolve(true);
    return new Promise<boolean>((resolve) => {
      const finish = (ok: boolean) => {
        unsubscribe();
        this.cancelWaiters = this.cancelWaiters.filter((f) => f !== cancel);
        resolve(ok);
      };
      const cancel = () => finish(false);
      const unsubscribe = this.clock.subscribe(() => {
        if (gen !== this.gen) return finish(false);
        const progress = gestureProgress(this.clock.time, start, ms);
        frame?.(progress);
        if (progress >= 1) finish(true);
      });
      this.cancelWaiters.push(cancel);
    });
  }

  private info(text: Text) {
    this.set({ notice: { kind: 'info', text } });
    this.autoClear();
  }

  private autoClear(ms = 3500) {
    if (this.noticeTimer) clearTimeout(this.noticeTimer);
    const n = this.snap.notice;
    this.noticeTimer = setTimeout(() => {
      if (this.snap.notice === n) this.set({ notice: null });
    }, ms);
  }

}
