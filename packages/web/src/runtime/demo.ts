/**
 * 演示控制器。手动体验、逐步查看、自动播放只通过 @joplo/core 的 applyStep / stateAt 推进状态
 * （PRD 8.4）；本文件只负责动画编排（鼠标、波纹、逐字输入、系统事件停留）和提示。
 *
 * 不变量：
 * - 业务状态 state 只有三种来源：initialState / stateAt / applyStep。动画中的“示例输入”是 preview，
 *   不写入 state；被取消的动画不会推进状态。
 * - 点击的含义只由 core 的 explainClick 决定。
 * - 时长使用固定逻辑时钟（暂停时不流逝），不依赖网络或随机延迟。
 * - 界面显示的“第 k 步”与上一步/下一步一致：动画进行中（含暂停）显示的是尚未提交的第 k 步，
 *   此时“上一步”取消这一步、回到已提交位置 k-1；“下一步”立即提交这一步，到达位置 k。
 * - .joplo/selection.json 始终反映画板当前的选中（取消选中写 null）；“已写入”只在写接口成功后显示。
 */
import { animate, type AnimationPlaybackControls } from 'motion';
import { explainClick, applyStep, getScenario, nodeLabel, findNode, replay, stateAt, type PlayState, type Project, type Scenario, type Step } from '@joplo/core';
import { putSelection, type Selection } from '../api';

export type Mode = 'review' | 'demo';

export type Notice =
  | { kind: 'disabled'; nodeId: string; text: string }
  | { kind: 'uncovered'; nodeId: string; text: string }
  | { kind: 'out_of_order'; nodeId: string; text: string }
  | { kind: 'info'; text: string }
  | { kind: 'switched'; text: string }
  | { kind: 'selected'; text: string }
  | { kind: 'error'; text: string };

export type SelectionSync = { status: 'idle' | 'pending' | 'ok' } | { status: 'error'; message: string };

export type Snapshot = {
  project: Project | null;
  revision: number | null;
  optionId: string | null;
  scenarioId: string | null;
  state: PlayState | null;
  mode: Mode;
  playing: boolean;
  paused: boolean;
  busy: boolean;
  /** 正在播放动画的步骤下标。 */
  activeStep: number | null;
  ripple: { x: number; y: number; key: number } | null;
  preview: { nodeId: string; text: string } | null;
  systemEvent: string | null;
  notice: Notice | null;
  selection: Selection | null;
  /** 回放失败（项目被改坏等）时的说明。 */
  playbackError: string | null;
  cursorVisible: boolean;
  /** 选中写回 .joplo/selection.json 的状态。 */
  selectionSync: SelectionSync;
  /** 状态被“跳转”（重置、上一步、切换场景/方案）时递增：舞台据此直接移除旧 Toast，不播放退出动画。 */
  epoch: number;
};

export const TIMING = {
  cursorMove: 0.55, // 秒（Motion）
  ripple: 260,
  typeChar: 45,
  selectHold: 360,
  toggleHold: 200,
  systemHold: 900,
  afterStep: 300,
  gap: 350,
  reducedStep: 450,
};

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export class DemoController {
  private snap: Snapshot = {
    project: null,
    revision: null,
    optionId: null,
    scenarioId: null,
    state: null,
    mode: 'demo',
    playing: false,
    paused: false,
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
  reducedMotion = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };
  getSnapshot = () => this.snap;

  private set(patch: Partial<Snapshot>) {
    this.snap = { ...this.snap, ...patch };
    if (typeof window !== 'undefined') {
      const w = window as unknown as Record<string, unknown>;
      w.__JOPLO_STATE__ = this.snap.state;
      w.__JOPLO_UI__ = { playing: this.snap.playing, paused: this.snap.paused, busy: this.snap.busy, mode: this.snap.mode, scenarioId: this.snap.scenarioId, activeStep: this.snap.activeStep };
    }
    for (const l of this.listeners) l();
  }

  // ---------- 注册 DOM ----------
  setStageEl = (el: HTMLElement | null) => {
    this.stageEl = el;
  };
  setCursorEl = (el: HTMLElement | null) => {
    this.cursorEl = el;
    if (el) el.style.transform = `translate(${this.cursorPos.x}px, ${this.cursorPos.y}px)`;
  };

  // ---------- 查询 ----------
  scenario(): Scenario | null {
    const { project, scenarioId } = this.snap;
    return project && scenarioId ? (project.scenarios[scenarioId] ?? null) : null;
  }
  scenariosOf(optionId: string | null): Scenario[] {
    const p = this.snap.project;
    if (!p || !optionId) return [];
    return Object.values(p.scenarios).filter((s) => s.optionId === optionId);
  }
  /** 当前位置的下一步（尚未执行）。 */
  nextStep(): Step | null {
    const sc = this.scenario();
    const st = this.snap.state;
    if (!sc || !st || st.completed) return null;
    return sc.steps[st.position] ?? null;
  }

  // ---------- 项目加载与刷新 ----------
  /** 载入（或刷新）项目：场景与位置仍有效时保持，越界夹到合法范围；选中保留。 */
  setProject(project: Project, revision: number) {
    this.stop();
    const prev = this.snap;
    const options = Object.values(project.options).filter((o) => !o.archived);
    let optionId = prev.optionId && project.options[prev.optionId] ? prev.optionId : (options[0]?.id ?? null);
    let scenarioId = prev.scenarioId && project.scenarios[prev.scenarioId] ? prev.scenarioId : null;
    if (scenarioId) optionId = project.scenarios[scenarioId]!.optionId;
    if (!scenarioId && optionId) scenarioId = Object.values(project.scenarios).find((s) => s.optionId === optionId)?.id ?? null;
    let state: PlayState | null = null;
    let playbackError: string | null = null;
    if (scenarioId) {
      const sc = project.scenarios[scenarioId]!;
      const want = Math.max(0, Math.min(prev.scenarioId === scenarioId && prev.state ? prev.state.position : 0, sc.steps.length));
      const r = this.safeStateAt(project, scenarioId, want);
      state = r.state;
      playbackError = r.error;
    }
    this.set({ project, revision, optionId, scenarioId, state, playbackError, preview: null, ripple: null, systemEvent: null, activeStep: null });
  }

  private safeStateAt(project: Project, scenarioId: string, position: number): { state: PlayState | null; error: string | null } {
    try {
      return { state: stateAt(project, scenarioId, position), error: null };
    } catch (e) {
      const r = replay(project, scenarioId);
      const msg = r.diagnostics[0]?.message ?? (e instanceof Error ? e.message : String(e));
      try {
        return { state: stateAt(project, scenarioId, Math.min(position, r.reached)), error: `回放在第 ${r.reached + 1} 步失败：${msg}` };
      } catch {
        return { state: null, error: `场景无法开始：${msg}` };
      }
    }
  }

  // ---------- 模式、方案、场景 ----------
  setMode(mode: Mode) {
    if (mode === this.snap.mode) return;
    this.stop();
    this.set({ mode, notice: { kind: 'info', text: mode === 'review' ? '已切换到审阅模式：点击元素只选中，不触发演示' : '已切换到演示模式：点击会执行原型交互' } });
    this.autoClear();
  }

  setOption(optionId: string) {
    const p = this.snap.project;
    if (!p || !p.options[optionId]) return;
    this.stop();
    const first = this.scenariosOf(optionId)[0] ?? null;
    const state = first ? this.safeStateAt(p, first.id, 0) : { state: null, error: null };
    this.set({ optionId, scenarioId: first?.id ?? null, state: state.state, playbackError: state.error, epoch: this.snap.epoch + 1, notice: { kind: 'switched', text: `已切换到方案「${p.options[optionId]!.name}」` } });
    this.autoClear();
  }

  setScenario(scenarioId: string) {
    const p = this.snap.project;
    if (!p || !p.scenarios[scenarioId]) return;
    this.stop();
    const r = this.safeStateAt(p, scenarioId, 0);
    const sc = p.scenarios[scenarioId]!;
    this.set({ scenarioId, optionId: sc.optionId, state: r.state, playbackError: r.error, epoch: this.snap.epoch + 1, notice: { kind: 'switched', text: `已切换到「${sc.name}」，数据已重置` } });
    this.autoClear();
  }

  // ---------- 逐步查看 ----------
  reset() {
    this.goto(0, '已重置到场景初始状态');
  }

  prev() {
    const st = this.snap.state;
    if (!st) return;
    if (this.inflight) {
      // 界面正显示尚未提交的第 k 步（position = k-1）：取消它即回到第 k-1 步，字幕同步回退。
      this.stop();
      this.set({ notice: null });
      return;
    }
    this.stop();
    if (st.position === 0) return this.info('已经是初始状态');
    this.goto(st.position - 1);
  }

  goto(position: number, message?: string) {
    const p = this.snap.project;
    const sc = this.scenario();
    if (!p || !sc) return;
    this.stop();
    const r = this.safeStateAt(p, sc.id, Math.max(0, Math.min(position, sc.steps.length)));
    this.set({ state: r.state, playbackError: r.error, epoch: this.snap.epoch + 1, notice: message ? { kind: 'info', text: message } : null });
    if (message) this.autoClear();
  }

  async next() {
    const sc = this.scenario();
    const st = this.snap.state;
    if (!sc || !st) return;
    if (this.inflight) {
      // 正在播放某一步的动画：立即完成这一步。
      this.finishInflight(sc);
      return;
    }
    this.stop();
    if (st.completed || st.position >= sc.steps.length) return this.info(sc.steps.length === 0 ? '这个场景没有步骤：只展示初始状态' : '场景已完成，可以重置或切换场景');
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

  async play() {
    const p = this.snap.project;
    const sc = this.scenario();
    if (!p || !sc || !this.snap.state) return;
    this.stop();
    if (sc.steps.length === 0) return this.info('这个场景没有步骤：只展示初始状态');
    if (this.snap.state.completed || this.snap.state.position >= sc.steps.length) {
      const r = this.safeStateAt(p, sc.id, 0);
      this.set({ state: r.state, playbackError: r.error });
    }
    const gen = this.gen;
    this.set({ playing: true, paused: false, busy: true, cursorVisible: !this.reducedMotion, notice: null });
    while (gen === this.gen) {
      const st = this.snap.state;
      if (!st || st.completed || st.position >= sc.steps.length) break;
      const ok = await this.runStep(sc, gen, { moveCursor: true });
      if (!ok || gen !== this.gen) return;
      await this.wait(TIMING.gap, gen);
    }
    if (gen === this.gen) this.set({ playing: false, paused: false, busy: false });
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
    if (this.snap.playing || this.snap.busy || this.snap.preview || this.snap.systemEvent || this.snap.ripple || this.snap.activeStep !== null)
      this.set({ playing: false, paused: false, busy: false, preview: null, systemEvent: null, ripple: null, activeStep: null });
  }

  // ---------- 点击 ----------
  async clickNode(nodeId: string, point: { x: number; y: number }) {
    const p = this.snap.project;
    const st = this.snap.state;
    const sc = this.scenario();
    if (!p || !st || !sc) return;
    if (this.snap.mode === 'review') return this.select(nodeId);

    if (this.snap.playing && !this.snap.paused) return this.info('正在自动播放：先暂停，再手动操作');
    if (this.snap.playing) this.stop(); // 暂停中手动接管
    else if (this.snap.busy) this.finishInflight(sc); // 上一步动画未完：先快进完成它

    const cur = this.snap.state;
    if (!cur) return;
    let verdict: ReturnType<typeof explainClick>;
    try {
      verdict = explainClick(p, cur, nodeId);
    } catch (e) {
      this.set({ notice: { kind: 'error', text: `无法解释这次点击：${e instanceof Error ? e.message : String(e)}` } });
      return;
    }
    const scene = p.scenes[cur.sceneId];
    const label = scene ? nodeLabel(findNode(scene, nodeId)?.node ?? { type: '元素' }) : nodeId;
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
      case 'disabled':
        this.set({ notice: { kind: 'disabled', nodeId, text: verdict.reason } });
        return;
      case 'unmodeled':
      case 'not_covered':
        this.set({ notice: { kind: 'uncovered', nodeId, text: `当前演示未覆盖此操作：「${verdict.label || label}」` } });
        return;
      case 'out_of_order':
        this.set({ notice: { kind: 'out_of_order', nodeId, text: verdict.expectedCaption ? `按当前场景，下一步是：${verdict.expectedCaption}` : '按当前场景，演示已经结束' } });
        return;
      case 'static':
        return;
    }
  }

  /** “回到演示”：关闭提示；聚焦框会重新指向下一步目标。场景已结束时提示可以重置。 */
  backToDemo() {
    const st = this.snap.state;
    const sc = this.scenario();
    if (st && sc && (st.completed || st.position >= sc.steps.length)) return this.info(sc.steps.length === 0 ? '这个场景没有步骤：只展示初始状态' : '场景已结束，可以重置或切换场景');
    this.set({ notice: null });
  }

  dismissNotice() {
    this.set({ notice: null });
  }

  // ---------- 审阅：选中 ----------
  async select(nodeId: string | null, stepId?: string | null) {
    const p = this.snap.project;
    const st = this.snap.state;
    const sc = this.scenario();
    if (!p || !st || !sc) return;
    const sel: Selection = {
      optionId: sc.optionId,
      scenarioId: sc.id,
      position: st.position,
      stepId: stepId !== undefined ? stepId : (sc.steps[st.position - 1]?.id ?? null),
      sceneId: st.sceneId,
      nodeId,
      at: new Date().toISOString(),
    };
    const scene = p.scenes[st.sceneId];
    const hit = nodeId && scene ? findNode(scene, nodeId) : null;
    const what = hit ? `「${nodeLabel(hit.node)}」` : stepId ? `步骤 ${stepId}` : '';
    this.set({ selection: sel, notice: { kind: 'selected', text: `已选中${what}，正在同步给 Agent…` } });
    await this.syncSelection(sel, `已选中${what}，可以在 Agent 会话里说要改什么`, '选中未能同步给 Agent');
  }

  /** 取消选中，并同步给 Agent（selection.json 写为 null）。 */
  async clearSelection() {
    this.set({ selection: null });
    await this.syncSelection(null, '已取消选中，已同步给 Agent', '取消选中未能同步给 Agent');
  }

  /** 串行写回选中；只有最后一次请求的结果会反映到界面上。 */
  private syncSelection(sel: Selection | null, okText: string, failText: string): Promise<void> {
    const seq = ++this.syncSeq;
    this.set({ selectionSync: { status: 'pending' } });
    this.syncChain = this.syncChain.then(async () => {
      const r = await putSelection(sel);
      if (seq !== this.syncSeq) return;
      if (r.ok) {
        this.set({ selectionSync: { status: 'ok' }, notice: { kind: 'selected', text: okText } });
        this.autoClear(5000);
      } else this.set({ selectionSync: { status: 'error', message: r.message }, notice: { kind: 'error', text: `${failText}：${r.message}` } });
    });
    return this.syncChain;
  }

  /** 点击步骤芯片：跳到该步骤执行之后；审阅模式下同时选中该步骤。 */
  clickStepChip(index: number) {
    const sc = this.scenario();
    if (!sc) return;
    this.goto(index + 1);
    if (this.snap.mode === 'review' && index >= 0) void this.select(null, sc.steps[index]?.id ?? null);
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

    if (step.kind === 'system' || a.type === 'event') {
      this.set({ systemEvent: a.type === 'event' ? a.name : step.caption });
      if (!(await this.wait(reduced ? TIMING.reducedStep : TIMING.systemHold, gen))) return false;
    } else if ('target' in a) {
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
    if (!this.commit(sc)) return false;
    if (opts.moveCursor && !reduced && !(await this.wait(TIMING.afterStep, gen))) return false;
    if (gen === this.gen) this.set({ systemEvent: null, activeStep: null, ripple: null });
    return true;
  }

  /** 推进一步：唯一调用 applyStep 的地方。 */
  private commit(sc: Scenario): boolean {
    const p = this.snap.project;
    const st = this.snap.state;
    this.inflight = null;
    if (!p || !st) return false;
    try {
      const next = applyStep(p, getScenario(p, sc.id), st);
      const n = this.snap.notice;
      // 推进后，锚定在元素上的就地提示（禁用原因、未覆盖、越序）已过时，关闭它。
      this.set({ state: next, preview: null, playbackError: null, ...(n && 'nodeId' in n ? { notice: null } : {}) });
      return true;
    } catch (e) {
      this.stop();
      this.set({ playbackError: e instanceof Error ? e.message : String(e), notice: { kind: 'error', text: `无法执行这一步：${e instanceof Error ? e.message : String(e)}` } });
      return false;
    }
  }

  private measureCenter(nodeId: string): { x: number; y: number } | null {
    const root = this.stageEl;
    if (!root) return null;
    const el = root.querySelector<HTMLElement>(`[data-jid="${CSS.escape(nodeId)}"]`);
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
    const controls = animate(el, { transform: [`translate(${from.x}px, ${from.y}px)`, `translate(${to.x}px, ${to.y}px)`] }, { duration: TIMING.cursorMove, ease: [0.4, 0, 0.2, 1] });
    this.anim = controls;
    if (this.snap.paused) controls.pause();
    await Promise.race([controls.finished ?? controls, new Promise<void>((r) => this.cancelWaiters.push(r))]);
    if (this.anim === controls) this.anim = null;
    return gen === this.gen;
  }

  /** 逻辑时钟等待：暂停期间不计时；被取消时返回 false。 */
  private async wait(ms: number, gen: number): Promise<boolean> {
    let remaining = ms;
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

  private info(text: string) {
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
