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
import { animate, type AnimationPlaybackControls } from 'motion';
import { stepDwell, CAMERA_MS } from './pace';
import { dwellTexts } from '../player/cover-content';
import { holdMsOf, orderedFeatures, streamsOf, explainClick, applyStep, getScenario, nodeLabel, findNode, layersOf, layersWithNode, replay, stateAt, type PlayState, type Project, type Scenario, type Selection, type Step } from '@joplo-app/core';
import { browseSceneId, browseState, optionsOf, scenariosOf } from './views';

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
   * 有层级的方案（T-layers）：下一步的操作目标不在当前显示的层里时，先切到包含它的层（导演跟随时），
   * 再移动鼠标；这一步提交后清空，之后由 cameraAt 决定导演层。
   */
  leadLayer: string | null;
  /**
   * 用户操作的目标此刻不在画面里（镜头推近在别处、在画面外或被滚动区遮住）时，先让镜头把它一起框进来，
   * 再移动鼠标，保证观众看得到点击和输入；这一步提交后清空，之后由这一步自己的镜头决定。
   */
  leadFrame: string | null;
  /**
   * 自动播放停在第 position 步（D55）：总共停 ms，开始公布时已过去 elapsed；时间线据此画进度（暂停时停住）。
   * 不在停留中（手动、执行动画中、停止后）为 null。
   */
  dwell: { position: number; ms: number; elapsed: number } | null;
  /**
   * 流式输出（D56）：播放（自动或下一步）刚提交第 position 步时，这一步 stream 的文字逐字出现，speed 是当时的速度。
   * 任何别的方式改变状态（跳转、上一步、重置、热更新）都清空它，所以跳到某一步时直接显示全文。
   */
  streamAt: { position: number; speed: number } | null;
};

export const TIMING = {
  cursorMove: 0.55, // 秒（Motion）
  ripple: 260,
  typeChar: 45,
  selectHold: 420,
  toggleHold: 200,
  systemHold: 900,
  afterStep: 300,
  gap: 350,
  reducedStep: 450,
  quickStep: 300,
  layerSwitch: CAMERA_MS + 150, // 先切层再移动鼠标：等新画面淡入、镜头到位（不随速度缩放）
};

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
    playing: false,
    paused: false,
    dwell: null,
    streamAt: null,
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
  };
  private listeners = new Set<() => void>();
  private gen = 0;
  private cancelWaiters: (() => void)[] = [];
  private anim: AnimationPlaybackControls | null = null;
  /** 已开始动画、尚未提交的步骤下标。 */
  private inflight: { index: number } | null = null;
  private stageEl: HTMLElement | null = null;
  private cursorEl: HTMLElement | null = null;
  private cursorPos = { x: 760, y: 560 };
  private noticeTimer: ReturnType<typeof setTimeout> | null = null;
  private rippleKey = 0;
  private syncSeq = 0;
  private syncChain: Promise<void> = Promise.resolve();
  /** 最近一次服务端确认的选中（写入失败时回滚到它）。 */
  private confirmed: Selection | null = null;
  /** 播放速度（0.5 / 1 / 1.5，T-director2）：缩放动画与停留时长；镜头过渡与连线小点一圈不缩放。 */
  speed = 1;
  /** 最近一次提交的时刻：停留时长从这里算起。 */
  private committedAt = 0;
  reducedMotion = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;

  i18n: Dictionary = en;

  constructor(private readonly writer: SelectionWriter | null = null) {}

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };
  getSnapshot = () => this.snap;

  private set(patch: Partial<Snapshot>) {
    // 状态被替换但不是播放提交的：不再逐字输出（跳到某一步直接显示全文）
    if (patch.state !== undefined && patch.streamAt === undefined && patch.state !== this.snap.state) patch = { ...patch, streamAt: null };
    this.snap = { ...this.snap, ...patch };
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
    this.revalidateSelection();
  }

  /** 热更新后：选中的元素仍在当前画面则保留（位置变化时重新写入）；否则取消选中并说明。 */
  private revalidateSelection() {
    const sel = this.snap.selection;
    const p = this.snap.project;
    const st = this.snap.state;
    if (!sel || !p || !st) return;
    const shown = this.shownSceneId() ?? st.sceneId;
    const scene = p.scenes[sel.sceneId];
    const hit = sel.nodeId && scene && (sel.sceneId === shown || sel.sceneId === st.sceneId) ? findNode(scene, sel.nodeId) : null;
    const stepOk = !sel.nodeId && sel.stepId && sel.scenarioId && p.scenarios[sel.scenarioId]?.steps.some((s) => s.id === sel.stepId);
    if (hit || stepOk) {
      const at = hit ? (hit.node.source ?? null) : (p.scenarios[sel.scenarioId!]!.steps.find((s) => s.id === sel.stepId)?.source ?? null);
      if (at !== sel.at || (hit && scene && nodeLabel(hit.node) !== sel.label)) void this.writeSelection(this.inputOf(sel), boardRef('board', 'selectedElementLocationUpdated'), boardRef('board', 'couldNotSyncSelectionToAgent'));
      return;
    }
    void this.writeSelection(null, boardRef('board', 'theSelectedElementIsNoLongerInThisStage'), boardRef('board', 'couldNotSyncClearedSelectionToAgent'), true);
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
    const r = this.safeStateAt(p, sc.id, Math.max(0, Math.min(position, sc.steps.length)));
    this.set({ state: r.state, playbackError: r.error, epoch: this.snap.epoch + 1, notice: message ? { kind: 'info', text: message } : null });
    if (message) this.autoClear();
  }

  async next() {
    const sc = this.scenario();
    const st = this.snap.state;
    if (!sc || !st || this.snap.view !== 'stage') return;
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
   */
  async play(opts: { fromStart?: boolean; fast?: (index: number) => boolean } = {}) {
    const p = this.snap.project;
    const sc = this.scenario();
    if (!p || !sc || !this.snap.state || this.snap.view !== 'stage') return;
    this.stop();
    if (sc.steps.length === 0) return this.info(m.player.thisScenarioHasNoStepsAndOnlyShowsIts2);
    if (opts.fromStart || this.snap.state.completed || this.snap.state.position >= sc.steps.length) {
      const r = this.safeStateAt(p, sc.id, 0);
      this.set({ state: r.state, playbackError: r.error, epoch: this.snap.epoch + 1 });
    }
    this.fast = opts.fast ?? null;
    const gen = this.gen;
    this.set({ playing: true, paused: false, busy: true, cursorVisible: !this.reducedMotion, notice: null });
    while (gen === this.gen) {
      const st = this.snap.state;
      if (!st || st.completed || st.position >= sc.steps.length) break;
      const index = st.position;
      const quick = !!this.fast?.(index);
      const ok = quick ? await this.runQuick(sc, gen) : await this.runStep(sc, gen, { moveCursor: true });
      if (!ok || gen !== this.gen) return;
      if (!quick) {
        // 停留（T-director2）：按说明与解说的字数，至少 3 秒；并等镜头过渡结束、本步 active 连线上的小点跑完一圈
        const step = sc.steps[index]!;
        // hold（D67）：作者要求的最短停留（按速度缩放）；减少动态效果时同样保留，它是看的时间，不是动画
        const dwell = Math.max(holdMsOf(step, this.speed), this.reducedMotion
          ? TIMING.reducedStep
          : stepDwell({
              texts: dwellTexts(step, this.i18n),
              speed: this.speed,
              cameraMoved: step.shots.length > 0 || !!step.directorLayer,
              dotMs: this.activeDotMs(),
              streams: streamsOf(step).map((x) => x.value),
            }));
        const elapsed = Math.max(0, Math.round(performance.now() - this.committedAt));
        this.set({ dwell: { position: index + 1, ms: Math.max(dwell, elapsed), elapsed } });
        const ok2 = await this.wait(dwell - (performance.now() - this.committedAt), gen, true);
        if (this.snap.dwell) this.set({ dwell: null });
        if (!ok2) return;
      }
    }
    this.fast = null;
    if (gen === this.gen) this.set({ playing: false, paused: false, busy: false, dwell: null });
  }

  private fast: ((index: number) => boolean) | null = null;

  /** 画面上 active 连线的小点跑一圈的最长时间（毫秒；没有为 0）。 */
  private activeDotMs(): number {
    let ms = 0;
    this.stageEl?.querySelectorAll<SVGElement>('[data-state="active"] [data-jdot-ms]').forEach((d) => {
      ms = Math.max(ms, Number(d.getAttribute('data-jdot-ms')) || 0);
    });
    return ms;
  }

  /** 快速带过一步（约 300ms）：不移动鼠标、不逐字输入。 */
  private async runQuick(sc: Scenario, gen: number): Promise<boolean> {
    const st = this.snap.state;
    if (!st) return false;
    this.inflight = { index: st.position };
    this.set({ activeStep: st.position });
    if (!(await this.wait(TIMING.quickStep, gen))) return false;
    if (gen !== this.gen || !this.commit(sc)) return false;
    if (gen === this.gen) this.set({ systemEvent: null, activeStep: null, ripple: null });
    return true;
  }

  pause() {
    if (!this.snap.playing || this.snap.paused) return;
    this.anim?.pause();
    this.set({ paused: true });
  }

  resume() {
    if (!this.snap.paused) return;
    this.anim?.play();
    this.set({ paused: false });
  }

  /** 取消一切正在进行的动画与自动播放；被取消的步骤不会推进状态。 */
  stop() {
    this.gen++;
    this.anim?.stop();
    this.anim = null;
    this.inflight = null;
    const ws = this.cancelWaiters;
    this.cancelWaiters = [];
    ws.forEach((w) => w());
    if (this.snap.playing || this.snap.busy || this.snap.preview || this.snap.systemEvent || this.snap.ripple || this.snap.activeStep !== null || this.snap.leadLayer || this.snap.leadFrame)
      this.set({ playing: false, paused: false, busy: false, dwell: null, preview: null, systemEvent: null, ripple: null, activeStep: null, leadLayer: null, leadFrame: null });
  }

  // ---------- 点击 ----------
  /**
   * 单击画面元素：按当前场景解释（推进、禁用原因、演示范围外、不是当前步骤）。
   * inspect（⌥+单击）：只检查 —— 写入选中，不操作原型。
   */
  async clickNode(nodeId: string, point: { x: number; y: number }, opts: { inspect?: boolean } = {}) {
    const p = this.snap.project;
    const st = this.snap.state;
    if (!p || !st) return;
    if (opts.inspect) return this.select(nodeId);
    const sc = this.scenario();
    if (this.snap.view !== 'stage' || !sc) return this.info(m.player.staticStageThisOptionDoesNotDemonstrateThisCase);

    if (this.snap.playing && !this.snap.paused) return this.info(m.player.autoplayIsRunningPauseBeforeInteractingManually);
    if (this.snap.playing) this.stop(); // 暂停中手动接管
    else if (this.snap.busy) this.finishInflight(sc); // 上一步动画未完：先快进完成它

    const cur = this.snap.state;
    if (!cur) return;
    let verdict: ReturnType<typeof explainClick>;
    try {
      verdict = explainClick(p, cur, nodeId, this.shownSceneId() ?? undefined);
    } catch (e) {
      this.set({ notice: { kind: 'error', text: m.player.couldNotInterpretThisClick(e instanceof Error ? e.message : String(e)) } });
      return;
    }
    const scene = p.scenes[this.shownSceneId() ?? cur.sceneId];
    const node = scene ? findNode(scene, nodeId)?.node : null;
    const label = node ? nodeLabel(node) : m.player.element;
    switch (verdict.kind) {
      case 'advance': {
        this.set({ notice: null });
        const gen = this.gen;
        this.cursorPos = point;
        this.set({ busy: true, cursorVisible: false });
        const ok = await this.runStep(sc, gen, { moveCursor: false, clickPoint: point });
        // 用户动作之后紧跟的系统事件自动执行（模拟请求返回）。
        let cont = ok;
        while (cont && gen === this.gen) {
          const nx = this.nextStep();
          if (!nx || nx.kind !== 'system') break;
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

  // ---------- 审阅：选中 ----------
  /** 当前画面上下文中的选中请求。 */
  private currentInput(nodeId: string | null, stepId?: string | null): SelectionInput | null {
    const p = this.snap.project;
    const st = this.snap.state;
    if (!p || !st) return null;
    if (this.snap.view === 'stage') {
      const sc = this.scenario();
      if (!sc) return null;
      return { optionId: sc.optionId, scenarioId: sc.id, position: st.position, sceneId: this.shownSceneId() ?? st.sceneId, nodeId, ...(stepId ? { stepId } : {}) };
    }
    return { optionId: p.scenes[st.sceneId]?.optionId ?? null, scenarioId: null, position: 0, sceneId: st.sceneId, nodeId };
  }

  private inputOf(sel: Selection): SelectionInput {
    return { optionId: sel.optionId, scenarioId: sel.scenarioId, position: sel.position, sceneId: sel.sceneId, nodeId: sel.nodeId, ...(sel.nodeId ? {} : { stepId: sel.stepId }) };
  }

  /** 界面立即显示的选中（服务端确认后以服务端结果为准）。 */
  private localSelection(input: SelectionInput): Selection | null {
    const p = this.snap.project;
    if (!p) return null;
    const scene = p.scenes[input.sceneId];
    const hit = input.nodeId && scene ? findNode(scene, input.nodeId) : null;
    const step = !input.nodeId && input.stepId && input.scenarioId ? p.scenarios[input.scenarioId]?.steps.find((s) => s.id === input.stepId) : undefined;
    if (!hit && !step) return null;
    return {
      featureId: input.optionId ? (p.options[input.optionId]?.featureId ?? null) : null,
      optionId: input.optionId,
      scenarioId: input.scenarioId,
      position: input.position,
      stepId: input.stepId ?? (input.scenarioId ? (p.scenarios[input.scenarioId]?.steps[input.position - 1]?.id ?? null) : null),
      sceneId: input.sceneId,
      route: scene?.route ?? '',
      nodeId: input.nodeId,
      at: hit ? (hit.node.source ?? null) : (step?.source ?? null),
      label: hit ? nodeLabel(hit.node) : (step ? stepCaption(step, en) : null),
      selectedAt: new Date().toISOString(),
    };
  }

  async select(nodeId: string | null, stepId?: string | null) {
    const input = this.currentInput(nodeId, stepId);
    if (!input) return;
    const local = this.localSelection(input);
    if (!local) return;
    await this.writeSelection(input, boardRef('board', 'selectedTellAgentWhatYouWantToChange', selectionLabel(this.snap.project!, local)), boardRef('board', 'couldNotSyncSelectionToAgent'));
  }

  /** 取消选中，并同步给 Agent（selection.json 写为 null）。 */
  async clearSelection() {
    await this.writeSelection(null, boardRef('board', 'selectionClearedAndSyncedToAgent'), boardRef('board', 'couldNotSyncClearedSelectionToAgent'));
  }

  /**
   * 串行写回选中；只有最后一次请求的结果会反映到界面上。
   * 不变量：返回后界面选中 = 文件内容。被拒绝时以服务端返回的 current 为准；网络失败回滚到上次确认的选中。
   */
  private writeSelection(input: SelectionInput | null, okText: Text, failText: Text, quietOk = false): Promise<void> {
    const seq = ++this.syncSeq;
    const optimistic = input ? this.localSelection(input) : null;
    this.set({ selection: optimistic, selectionSync: { status: 'pending' } });
    const writer = this.writer;
    this.syncChain = this.syncChain.then(async () => {
      const r: SelectionWriteResult = writer ? await writer(input).catch((e: unknown) => ({ ok: false as const, message: e instanceof Error ? e.message : String(e) })) : { ok: false, message: boardRef('board', 'thisPageCannotWriteASelectionReadOnly') };
      if (r.ok) this.confirmed = r.selection;
      else if (r.current !== undefined) this.confirmed = r.current;
      if (seq !== this.syncSeq) return;
      if (r.ok) {
        this.set({ selection: r.selection, selectionSync: { status: 'ok' }, notice: { kind: 'selected', text: okText } });
        this.autoClear(quietOk ? 3000 : 5000);
      } else {
        const rolledBack = this.confirmed;
        const tail = rolledBack ? boardRef('board', 'keepingThePreviousSelection', this.snap.project ? selectionLabel(this.snap.project, rolledBack) : rolledBack.label ?? rolledBack.nodeId ?? '') : boardRef('board', 'selectionCleared');
        this.set({ selection: rolledBack, selectionSync: { status: 'error', message: r.message }, notice: { kind: 'error', text: boardRef('board', 'selectionSyncFailed', failText, r.message, tail) } });
      }
    });
    return this.syncChain;
  }

  /** 页面载入时恢复文件里的选中（与当前项目不符时清除）。 */
  async restoreSelection(sel: Selection | null) {
    const p = this.snap.project;
    if (!sel || !p) return;
    if (sel.scenarioId && p.scenarios[sel.scenarioId]) this.setScenario(sel.scenarioId, sel.position);
    else if (!sel.scenarioId && p.scenes[sel.sceneId]) {
      this.stop();
      this.set({ view: 'browse', browseSceneId: sel.sceneId, state: browseState(p, sel.sceneId), epoch: this.snap.epoch + 1 });
    }
    this.set({ notice: null });
    await this.writeSelection(this.inputOf(sel), boardRef('board', 'previousSelectionRestored'), boardRef('board', 'previousSelectionIsNoLongerValid'), true);
  }

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

    if (a.type === 'card') {
      // 过渡卡（D56）：直接提交，卡片淡入；停留由 play 的 dwell 负责
    } else if (a.type === 'press') {
      // 无目标用户操作：activeStep 投影为键帽，不移动鼠标，状态仍统一在 commit 推进。
      if (!(await this.wait(reduced ? TIMING.reducedStep : TIMING.selectHold, gen))) return false;
    } else if (step.kind === 'system' || a.type === 'event') {
      this.set({ systemEvent: a.type === 'event' ? a.name : stepCaption(step, m) });
      if (!(await this.wait(reduced ? TIMING.reducedStep : TIMING.systemHold, gen))) return false;
    } else if ('target' in a) {
      if (!(await this.leadTo(sc, a.target, gen))) return false;
      if (!(await this.frameTo(a.target, gen))) return false;
      if (reduced) {
        if (!(await this.wait(TIMING.reducedStep, gen))) return false;
      } else {
        const pt = opts.clickPoint ?? this.measureCenter(a.target);
        if (opts.moveCursor && pt) {
          this.set({ cursorVisible: true });
          if (!(await this.moveCursor(pt, gen))) return false;
        }
        if (pt) this.set({ ripple: { x: pt.x, y: pt.y, key: ++this.rippleKey } });
        if (!(await this.wait(TIMING.ripple, gen))) return false;
        if (a.type === 'type') {
          for (let i = 1; i <= a.value.length; i++) {
            this.set({ preview: { nodeId: a.target, text: a.value.slice(0, i) } });
            if (!(await this.wait(TIMING.typeChar, gen))) return false;
          }
        } else if (a.type === 'select') {
          this.set({ preview: { nodeId: a.target, text: a.value } });
          if (!(await this.wait(TIMING.selectHold, gen))) return false;
        } else if (a.type === 'toggle') {
          if (!(await this.wait(TIMING.toggleHold, gen))) return false;
        }
      }
    } else {
      if (!(await this.wait(reduced ? TIMING.reducedStep : TIMING.ripple, gen))) return false;
    }
    if (gen !== this.gen) return false;
    if (!this.commit(sc, true)) return false;
    if (opts.moveCursor && !reduced && !(await this.wait(TIMING.afterStep, gen))) return false;
    if (gen === this.gen) this.set({ systemEvent: null, activeStep: null, ripple: null });
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
      const n = this.snap.notice;
      // 推进后，锚定在元素上的就地提示（禁用原因、未覆盖、越序）已过时，关闭它。
      this.committedAt = typeof performance !== 'undefined' ? performance.now() : Date.now();
      this.set({ leadFrame: null, state: next, streamAt: stream && streamsOf(sc.steps[st.position]).length ? { position: next.position, speed: this.speed } : null, preview: null, playbackError: null, leadLayer: null, ...(n && 'nodeId' in n ? { notice: null } : {}) });
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
    return this.wait(this.reducedMotion ? 0 : TIMING.layerSwitch, gen, true);
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
    return this.wait(this.reducedMotion ? 0 : TIMING.layerSwitch, gen, true);
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

  private async moveCursor(to: { x: number; y: number }, gen: number): Promise<boolean> {
    const el = this.cursorEl;
    const from = this.cursorPos;
    this.cursorPos = to;
    if (!el) return true;
    const controls = animate(el, { transform: [`translate(${from.x}px, ${from.y}px)`, `translate(${to.x}px, ${to.y}px)`] }, { duration: TIMING.cursorMove / this.speed, ease: [0.4, 0, 0.2, 1] });
    this.anim = controls;
    if (this.snap.paused) controls.pause();
    await Promise.race([controls.finished ?? controls, new Promise<void>((r) => this.cancelWaiters.push(r))]);
    if (this.anim === controls) this.anim = null;
    return gen === this.gen;
  }

  /** 逻辑时钟等待：暂停期间不计时；被取消时返回 false。 */
  /** 等待 ms 毫秒（按速度缩放；raw = 不缩放）；暂停时不计时，被取消时返回 false。 */
  private async wait(ms: number, gen: number, raw = false): Promise<boolean> {
    let remaining = raw ? ms : ms / (this.speed > 0 ? this.speed : 1);
    let last = performance.now();
    while (remaining > 0) {
      await sleep(Math.min(remaining, 25));
      if (gen !== this.gen) return false;
      const now = performance.now();
      if (!this.snap.paused) remaining -= now - last;
      last = now;
    }
    return gen === this.gen;
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
