/**
 * 回放（纯函数的状态转换）：手动体验、逐步查看、自动播放、回放校验和渲染截图全部调用这里，
 * 不允许任何一方另写一套按钮逻辑（PRD 8.4）。
 *
 * 位置（position）语义：0 = 场景初始状态；k = 已执行前 k 个步骤之后的状态。
 * “上一步”通过取第 k-1 个位置的状态实现，因此恢复的是业务可见状态，而不是撤销动画。
 */
import { pluginActionSpec, validActionData } from './actions.ts';
import { isInteractiveType, matchChoice, nodeLabel } from './catalog.ts';
import type { Project, Scenario, SceneNode, Step } from './schema.ts';
import { JoploError, type Diagnostic } from './result.ts';
import { choicesOf, findNode, getScenario, getScene, isNodeDisabled, isNodeVisible, resolveValue, sceneOfTarget, type PlayState } from './scene-query.ts';

// ---------- 状态转换 ----------

export function initialState(project: Project, scenarioId: string): PlayState {
  const sc = getScenario(project, scenarioId);
  getScene(project, sc.initial.sceneId);
  return {
    scenarioId,
    position: 0,
    sceneId: sc.initial.sceneId,
    ui: structuredClone(sc.initial.ui),
    data: structuredClone(sc.initial.data),
    inputs: structuredClone(sc.initial.inputs),
    toasts: [],
    completed: null,
    sceneStack: [],
  };
}

export class PlaybackError extends JoploError {
  constructor(message: string, diagnostic: Diagnostic) {
    super('PLAYBACK_FAILED', message, { diagnostics: [diagnostic] });
  }
}

function setPath(state: PlayState, path: string, value: unknown, mode: 'set' | 'append'): void {
  const [root, ...rest] = path.split('.');
  const base = (root === 'ui' ? state.ui : root === 'data' ? state.data : state.inputs) as Record<string, unknown>;
  if (rest.length === 0) throw new Error(`Cannot replace an entire state root: ${path}`);
  let cur = base;
  for (const key of rest.slice(0, -1)) {
    const next = cur[key];
    if (next === null || typeof next !== 'object' || Array.isArray(next)) cur[key] = {};
    cur = cur[key] as Record<string, unknown>;
  }
  const last = rest[rest.length - 1]!;
  if (mode === 'set') cur[last] = structuredClone(value);
  else {
    const arr = cur[last];
    cur[last] = [...(Array.isArray(arr) ? arr : []), structuredClone(value)];
  }
}

/**
 * 校验当前步骤能否在给定状态下执行；返回诊断（null 表示可执行）。
 * 手动体验时，UI 也用它判断用户点击的是不是“当前步骤的目标”。
 */
export function checkStep(project: Project, scenario: Scenario, state: PlayState, step: Step): Diagnostic | null {
  const d = checkStepInner(project, scenario, state, step);
  if (d && step.source) d.at = step.source;
  return d;
}

function checkStepInner(project: Project, scenario: Scenario, state: PlayState, step: Step): Diagnostic | null {
  const ref = { kind: 'step', id: step.id, workId: scenario.workId, scenarioId: scenario.id, stepId: step.id };
  if (state.completed) return { severity: 'error', code: 'ALREADY_COMPLETED', message: `Scenario has ended; cannot execute step ${step.id}`, source: 'replay', ref };
  const a = step.action;
  if (a.type === 'event' || a.type === 'card' || a.type === 'press') return null;
  if (a.type === 'back') {
    return state.sceneStack.length === 0
      ? { severity: 'error', code: 'NOTHING_TO_GO_BACK', message: `Step ${step.id} goes back, but there is no previous stage`, source: 'replay', ref }
      : null;
  }
  const scene = sceneOfTarget(project, scenario, state, a.target);
  if (!scene) return { severity: 'error', code: 'MISSING_SCENE', message: `Current stage ${state.sceneId} does not exist`, source: 'replay', ref };
  const hit = findNode(scene, a.target);
  if (!hit)
    return { severity: 'error', code: 'MISSING_TARGET', message: `Step ${step.id} target ${a.target} is not in the current stage ${scene.id}`, source: 'replay', ref };
  const { node } = hit;
  if (!isNodeVisible(scene, a.target, state))
    return { severity: 'error', code: 'TARGET_HIDDEN', message: `Step ${step.id} target "${nodeLabel(node)}" is currently hidden`, source: 'replay', ref };
  if (isNodeDisabled(node, state))
    return { severity: 'error', code: 'TARGET_DISABLED', message: `Step ${step.id} target "${nodeLabel(node)}" is currently disabled`, source: 'replay', ref };
  if (a.type === 'click' && !isInteractiveType(node.type, project.plugins))
    return { severity: 'error', code: 'NOT_INTERACTIVE', message: `Step ${step.id} clicks ${node.type} "${nodeLabel(node)}", which is not interactive`, source: 'replay', ref };
  if ((a.type === 'type' || a.type === 'select' || a.type === 'toggle') && !node.traits?.input)
    return { severity: 'error', code: 'NOT_A_FIELD', message: `Step ${step.id} ${a.type} action target ${node.type} cannot accept input`, source: 'replay', ref };
  if ((a.type === 'drag' || a.type === 'scroll') && typeof a.to === 'string' && !findNode(scene, a.to)) return { severity: 'error', code: 'ACTION_DESTINATION_MISSING', message: `Step ${step.id} destination ${a.to} is missing`, source: 'replay', ref };
  if (a.type === 'scroll' && typeof a.to === 'string' && !findNode({ ...scene, root: node }, a.to)) return {severity:'error',code:'ACTION_DESTINATION_INVALID',message:`Step ${step.id} scroll destination ${a.to} is outside ${a.target}`,source:'replay',ref};
  if (a.type === 'plugin') {
    const spec = pluginActionSpec(project, a.name);
    if (!spec || !validActionData(spec, a.data) || spec.targets && !spec.targets.includes(node.type)) return { severity: 'error', code: 'ACTION_DATA_INVALID', message: `Step ${step.id} has an unknown or invalid plugin action ${a.name}`, source: 'replay', ref };
  }
  if (a.type === 'select') {
    const choices = choicesOf(node, state);
    if (choices && !matchChoice(choices, a.value))
      return {
        severity: 'error',
        code: 'UNKNOWN_CHOICE',
        message: `Step ${step.id} field "${nodeLabel(node)}" cannot select "${a.value}"; it is not an available choice (available: ${choices.map((c) => (c.label === c.value ? c.value : `${c.label}/${c.value}`)).join(', ')})`,
        source: 'replay',
        ref,
      };
  }
  return null;
}

/** select 动作写入的值：匹配到选项时存 value（动作可写 value 或 label）；declared element 切换数组中的一项。 */
function selectedValue(project: Project, state: PlayState, target: string, raw: string): unknown {
  const sc = project.scenarios[state.scenarioId];
  const scene = sc ? sceneOfTarget(project, sc, state, target) : project.scenes[state.sceneId];
  const node = scene ? findNode(scene, target)?.node : undefined;
  if (!node) return raw;
  const choices = choicesOf(node, state);
  const value = (choices && matchChoice(choices, raw)?.value) ?? raw;
  if (node.traits?.input !== 'multiple') return value;
  const cur = state.inputs[target] ?? resolveValue(node.props?.value ?? node.props?.defaultValue, state);
  const list = Array.isArray(cur) ? cur.map(String) : [];
  return list.includes(value) ? list.filter((x) => x !== value) : [...list, value];
}

/** 执行 scenario.steps[state.position]，返回新状态（不修改入参）。 */
export function applyStep(project: Project, scenario: Scenario, state: PlayState): PlayState {
  const step = scenario.steps[state.position];
  if (!step) throw new JoploError('PLAYBACK_FAILED', `Scenario ${scenario.id} has no step ${state.position + 1}`);
  const problem = checkStep(project, scenario, state, step);
  if (problem) throw new PlaybackError(problem.message, problem);

  const next: PlayState = structuredClone(state);
  next.toasts = [];
  const a = step.action;
  if (a.type === 'type' || a.type === 'toggle') next.inputs[a.target] = a.value;
  if (a.type === 'select') next.inputs[a.target] = selectedValue(project, state, a.target, a.value);
  if (a.type === 'back') next.sceneId = next.sceneStack.pop()!;

  step.effects.forEach((e, i) => {
    const ref = { kind: 'step', id: step.id, workId: scenario.workId, scenarioId: scenario.id, stepId: step.id, path: `effects[${i}]` };
    switch (e.type) {
      case 'set':
        setPath(next, e.path, e.value, 'set');
        break;
      case 'append':
        setPath(next, e.path, e.value, 'append');
        break;
      case 'stream':
        setPath(next, e.path, e.value, 'set');
        break;
      case 'toast':
        next.toasts.push({ id: `${step.id}_${i}`, text: e.text, tone: e.tone });
        break;
      case 'navigate': {
        const target = project.scenes[e.sceneId];
        // 发布 IR 只有发布视图（`@/路径`，workId 为 null）；dev / review 里跳转目标必须属于同一方案（D68 修复：以前发布站一跳转就报错）
        if (!target || (target.workId !== scenario.workId && !(project.mode === 'publish' && target.workId === null)))
          throw new PlaybackError(`Step ${step.id} navigates to a stage that is missing or outside this work: ${e.sceneId}`, {
            severity: 'error',
            code: 'MISSING_SCENE',
            message: `Navigation target stage ${e.sceneId} is missing or outside work ${scenario.workId}`,
            source: 'replay',
            ref,
          });
        next.sceneStack.push(next.sceneId);
        next.sceneId = e.sceneId;
        break;
      }
      case 'complete':
        next.completed = { text: e.text, outcome: e.outcome };
        break;
    }
  });
  next.position = state.position + 1;
  return next;
}

function checkPosition(sc: Scenario, scenarioId: string, position: number): void {
  if (!Number.isInteger(position) || position < 0 || position > sc.steps.length)
    throw new JoploError('NOT_FOUND', `Position ${position} is outside scenario ${scenarioId} range 0..${sc.steps.length}`);
}

/** 从初始状态重放到指定位置，不读也不写缓存。编译器在 IR 还没定稿（之后还会改场景的初始状态）时用它。 */
export function replayTo(project: Project, scenarioId: string, position: number): PlayState {
  const sc = getScenario(project, scenarioId);
  checkPosition(sc, scenarioId, position);
  let s = initialState(project, scenarioId);
  while (s.position < position) s = applyStep(project, sc, s);
  return s;
}

/**
 * 场景的时间线缓存：每个位置（0..步数）回放出的状态与镜头，按项目对象缓存、按需往后算。
 * 前提：编译完成的 IR 不再修改（热更新、换语言都会换一个项目对象）。场景对象、步骤数组或初始状态被换掉时这一份作废。
 * stateAt / cameraAt / changedAt / 焦点时间线都从这里取，跳到第 k 步不再从头重放。
 */
type Timeline = { scenario: Scenario; steps: Scenario['steps']; initial: Scenario['initial']; states: PlayState[]; error?: unknown; memo: Map<string, unknown> };
const timelines = new WeakMap<Project, Map<string, Timeline>>();
function timelineOf(project: Project, sc: Scenario): Timeline {
  let byScenario = timelines.get(project);
  if (!byScenario) timelines.set(project, (byScenario = new Map()));
  let t = byScenario.get(sc.id);
  if (!t || t.scenario !== sc || t.steps !== sc.steps || t.initial !== sc.initial) byScenario.set(sc.id, (t = { scenario: sc, steps: sc.steps, initial: sc.initial, states: [], memo: new Map() }));
  return t;
}
/** 挂在同一条时间线上的派生结果（例如每个位置的镜头）：与状态一起缓存、一起作废。 */
export function timelineMemo<T>(project: Project, sc: Scenario, key: string, compute: () => T): T {
  const t = timelineOf(project, sc);
  if (!t.memo.has(key)) t.memo.set(key, compute());
  return t.memo.get(key) as T;
}
/** 时间线上第 position 步之后的状态（共享对象，调用方不得修改）；这一步或之前的步骤回放失败时抛出当时的错误。 */
export function timelineState(project: Project, sc: Scenario, position: number): PlayState {
  const t = timelineOf(project, sc);
  if (!t.states.length) t.states.push(initialState(project, sc.id));
  while (t.states.length <= position) {
    if (t.error !== undefined) throw t.error;
    try { t.states.push(applyStep(project, sc, t.states[t.states.length - 1]!)); }
    catch (e) { t.error = e ?? new JoploError('PLAYBACK_FAILED', 'Step failed'); throw t.error; }
  }
  return t.states[position]!;
}

/** 第 position 步之后的状态（从时间线缓存取，返回独立副本）。 */
export function stateAt(project: Project, scenarioId: string, position: number): PlayState {
  const sc = getScenario(project, scenarioId);
  checkPosition(sc, scenarioId, position);
  return structuredClone(timelineState(project, sc, position));
}

/** 时间线上每个位置的状态（0..步数）；回放失败之后的位置为 null。共享对象，只读。 */
export function timelineStates(project: Project, scenarioId: string): (PlayState | null)[] {
  const sc = project.scenarios[scenarioId];
  if (!sc) return [];
  const out: (PlayState | null)[] = [];
  for (let k = 0; k <= sc.steps.length; k++) {
    try { out.push(timelineState(project, sc, k)); } catch { out.push(null); }
  }
  return out;
}

/** 步骤 ID → 该步骤执行之后的位置。 */
export function positionAfterStep(project: Project, scenarioId: string, stepId: string): number {
  const sc = getScenario(project, scenarioId);
  const i = sc.steps.findIndex((s) => s.id === stepId);
  if (i < 0) throw new JoploError('NOT_FOUND', `Step ${stepId} is not in scenario ${scenarioId}`);
  return i + 1;
}

/** 完整回放一个场景，收集诊断而不抛出。供校验器使用。 */
export function replay(project: Project, scenarioId: string): { finalState: PlayState | null; reached: number; diagnostics: Diagnostic[] } {
  let sc: Scenario;
  let s: PlayState;
  try {
    sc = getScenario(project, scenarioId);
    s = initialState(project, scenarioId);
  } catch (e) {
    return { finalState: null, reached: 0, diagnostics: [toDiagnostic(e, { kind: 'scenario', id: scenarioId })] };
  }
  while (s.position < sc.steps.length) {
    try {
      s = applyStep(project, sc, s);
    } catch (e) {
      return { finalState: s, reached: s.position, diagnostics: [toDiagnostic(e, { kind: 'scenario', id: scenarioId, scenarioId })] };
    }
  }
  return { finalState: s, reached: s.position, diagnostics: [] };
}

function toDiagnostic(e: unknown, ref: Diagnostic['ref']): Diagnostic {
  if (e instanceof JoploError && e.diagnostics[0]) return e.diagnostics[0];
  return { severity: 'error', code: e instanceof JoploError ? e.code : 'PLAYBACK_FAILED', message: e instanceof Error ? e.message : String(e), source: 'replay', ref };
}

// ---------- 手动体验：解释一次点击 ----------

export type ClickVerdict =
  | { kind: 'advance' } // 正是当前步骤的目标
  | { kind: 'disabled'; reason: string | null }
  | { kind: 'unmodeled'; label: string } // 明确标记为未建模
  | { kind: 'out_of_order'; label: string; expectedCaption: string | null } // 是本场景其他步骤的目标
  | { kind: 'not_covered'; label: string } // 没有任何已定义行为
  | { kind: 'static' }; // 背景元素，不必响应

/** 禁用原因的当前文字：字面量原样返回；绑定（`$ui.x`）读当前状态；空或不是文字时为 null（界面用默认说明）。 */
export function disabledReasonOf(node: SceneNode, state: Pick<PlayState, 'ui' | 'data' | 'inputs'>): string | null {
  const v = node.disabledReason === undefined ? undefined : resolveValue(node.disabledReason, state);
  return typeof v === 'string' && v.trim() ? v : typeof v === 'number' ? String(v) : null;
}

/**
 * 演示模式下用户点击了某个元素：判断应推进步骤，还是提示“当前演示未覆盖”（PRD 8.2、AC-19）。
 * 流程外点击绝不能被解释为成功。
 */
export function explainClick(project: Project, state: PlayState, nodeId: string, sceneId?: string): ClickVerdict {
  const sc = getScenario(project, state.scenarioId);
  // sceneId：用户正在看的画面（有层级的方案是某一层的画面）；缺省为状态里的路径画面
  const scene = getScene(project, sceneId ?? state.sceneId);
  const hit = findNode(scene, nodeId);
  if (!hit) return { kind: 'static' };
  const { node } = hit;
  const label = nodeLabel(node);
  if (isNodeDisabled(node, state)) return { kind: 'disabled', reason: disabledReasonOf(node, state) };
  const current = sc.steps[state.position];
  const targetOf = (s: Step) => ('target' in s.action ? s.action.target : null);
  if (current && !state.completed && targetOf(current) === nodeId && checkStep(project, sc, state, current) === null) return { kind: 'advance' };
  if (!isInteractiveType(node.type, project.plugins)) return { kind: 'static' };
  if (node.unmodeled) return { kind: 'unmodeled', label };
  if (sc.steps.some((s) => targetOf(s) === nodeId)) return { kind: 'out_of_order', label, expectedCaption: current && !state.completed ? current.caption : null };
  return { kind: 'not_covered', label };
}

