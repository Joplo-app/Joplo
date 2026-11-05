/**
 * 播放器：纯函数的状态转换。手动体验、逐步查看、自动播放、回放校验和渲染截图
 * 全部调用这里，不允许任何一方另写一套按钮逻辑（PRD 8.4）。
 *
 * 位置（position）语义：0 = 场景初始状态；k = 已执行前 k 个步骤之后的状态。
 * “上一步”通过从初始状态重放到 k-1 实现，因此恢复的是业务可见状态，而不是撤销动画。
 */
import { GATED_CONTAINERS, INTERACTIVE_TYPES, VALUE_TYPES, nodeLabel } from './catalog.ts';
import type { Condition, Project, Scenario, Scene, SceneNode, Step } from './schema.ts';
import { JoploError, type Diagnostic } from './result.ts';

export type Toast = { id: string; text: string; tone: 'success' | 'error' | 'info' };

export type PlayState = {
  scenarioId: string;
  /** 已执行的步骤数。 */
  position: number;
  sceneId: string;
  ui: Record<string, unknown>;
  data: Record<string, unknown>;
  inputs: Record<string, unknown>;
  /** 最近一个步骤产生的 Toast；下一步开始时清空，保证“上一步”可复现。 */
  toasts: Toast[];
  completed: null | { text: string; outcome: 'success' | 'failure' | 'cancelled' };
  /** 画面栈，用于 back 动作。 */
  sceneStack: string[];
};

// ---------- 查找 ----------

export function getScenario(project: Project, scenarioId: string): Scenario {
  const sc = project.scenarios[scenarioId];
  if (!sc) throw new JoploError('NOT_FOUND', `场景不存在：${scenarioId}`);
  return sc;
}

export function getScene(project: Project, sceneId: string): Scene {
  const s = project.scenes[sceneId];
  if (!s) throw new JoploError('NOT_FOUND', `画面不存在：${sceneId}`);
  return s;
}

export function walkNodes(root: SceneNode, visit: (node: SceneNode, ancestors: SceneNode[]) => void): void {
  const rec = (n: SceneNode, anc: SceneNode[]) => {
    visit(n, anc);
    const next = [...anc, n];
    for (const c of n.children ?? []) rec(c, next);
  };
  rec(root, []);
}

/** 返回节点及其祖先链（自根向下，不含自身）；找不到返回 null。 */
export function findNode(scene: Scene, nodeId: string): { node: SceneNode; ancestors: SceneNode[] } | null {
  let found: { node: SceneNode; ancestors: SceneNode[] } | null = null;
  walkNodes(scene.root, (node, ancestors) => {
    if (!found && node.id === nodeId) found = { node, ancestors };
  });
  return found;
}

// ---------- 状态读取与条件 ----------

export function readPath(state: Pick<PlayState, 'ui' | 'data' | 'inputs'>, path: string): unknown {
  const [root, ...rest] = path.split('.');
  let cur: unknown = root === 'ui' ? state.ui : root === 'data' ? state.data : root === 'inputs' ? state.inputs : undefined;
  for (const key of rest) {
    if (cur === null || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[key];
  }
  return cur;
}

const BINDING = /^\$((?:ui|data|inputs)(?:\.[A-Za-z0-9_-]+)*)$/;

/** 属性值若是 `$ui.x` 形式的整值绑定，则从状态读取；否则原样返回。 */
export function resolveValue(value: unknown, state: Pick<PlayState, 'ui' | 'data' | 'inputs'>): unknown {
  if (typeof value === 'string') {
    const m = BINDING.exec(value);
    if (m) return readPath(state, m[1]!);
  }
  return value;
}

export function resolveProps(node: SceneNode, state: Pick<PlayState, 'ui' | 'data' | 'inputs'>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(node.props ?? {})) out[k] = resolveValue(v, state);
  return out;
}

const isEmpty = (v: unknown) =>
  v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0) || (typeof v === 'object' && v !== null && !Array.isArray(v) && Object.keys(v).length === 0);

export function evaluateCondition(cond: Condition, state: Pick<PlayState, 'ui' | 'data' | 'inputs'>): boolean {
  if ('truthy' in cond) return Boolean(readPath(state, cond.truthy));
  if ('falsy' in cond) return !readPath(state, cond.falsy);
  if ('empty' in cond) return isEmpty(readPath(state, cond.empty));
  if ('notEmpty' in cond) return !isEmpty(readPath(state, cond.notEmpty));
  if ('eq' in cond) return readPath(state, cond.eq[0]) === cond.eq[1];
  if ('neq' in cond) return readPath(state, cond.neq[0]) !== cond.neq[1];
  if ('in' in cond) return cond.in[1].includes(readPath(state, cond.in[0]));
  if ('and' in cond) return cond.and.every((c) => evaluateCondition(c, state));
  if ('or' in cond) return cond.or.some((c) => evaluateCondition(c, state));
  if ('not' in cond) return !evaluateCondition(cond.not, state);
  return false;
}

/** 节点自身是否显示（when + Dialog 的 open）。 */
export function isSelfVisible(node: SceneNode, state: PlayState): boolean {
  if (node.when && !evaluateCondition(node.when, state)) return false;
  if (GATED_CONTAINERS.has(node.type) && !resolveValue(node.props?.open, state)) return false;
  return true;
}

export function isNodeVisible(scene: Scene, nodeId: string, state: PlayState): boolean {
  const hit = findNode(scene, nodeId);
  if (!hit) return false;
  return [...hit.ancestors, hit.node].every((n) => isSelfVisible(n, state));
}

export function isNodeDisabled(node: SceneNode, state: PlayState): boolean {
  if (node.disabled === undefined) return false;
  if (typeof node.disabled === 'boolean') return node.disabled;
  return evaluateCondition(node.disabled, state);
}

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
  if (rest.length === 0) throw new Error(`不能整体覆盖状态根：${path}`);
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
  const ref = { kind: 'step', id: step.id, optionId: scenario.optionId, scenarioId: scenario.id, stepId: step.id };
  if (state.completed) return { severity: 'error', code: 'ALREADY_COMPLETED', message: `场景已结束，不能继续执行步骤 ${step.id}`, source: 'replay', ref };
  const a = step.action;
  if (a.type === 'event') return null;
  if (a.type === 'back') {
    return state.sceneStack.length === 0
      ? { severity: 'error', code: 'NOTHING_TO_GO_BACK', message: `步骤 ${step.id} 要返回，但没有上一个画面`, source: 'replay', ref }
      : null;
  }
  const scene = project.scenes[state.sceneId];
  if (!scene) return { severity: 'error', code: 'MISSING_SCENE', message: `当前画面 ${state.sceneId} 不存在`, source: 'replay', ref };
  const hit = findNode(scene, a.target);
  if (!hit)
    return { severity: 'error', code: 'MISSING_TARGET', message: `步骤 ${step.id} 的目标 ${a.target} 不在当前画面 ${scene.id} 中`, source: 'replay', ref };
  const { node } = hit;
  if (!isNodeVisible(scene, a.target, state))
    return { severity: 'error', code: 'TARGET_HIDDEN', message: `步骤 ${step.id} 的目标「${nodeLabel(node)}」当前不可见`, source: 'replay', ref };
  if (isNodeDisabled(node, state))
    return { severity: 'error', code: 'TARGET_DISABLED', message: `步骤 ${step.id} 的目标「${nodeLabel(node)}」当前处于禁用状态`, source: 'replay', ref };
  if (a.type === 'click' && !INTERACTIVE_TYPES.has(node.type))
    return { severity: 'error', code: 'NOT_INTERACTIVE', message: `步骤 ${step.id} 点击的 ${node.type}「${nodeLabel(node)}」不是可操作组件`, source: 'replay', ref };
  if (a.type !== 'click' && !VALUE_TYPES.has(node.type))
    return { severity: 'error', code: 'NOT_A_FIELD', message: `步骤 ${step.id} 的 ${a.type} 动作目标 ${node.type} 不能接收输入`, source: 'replay', ref };
  return null;
}

/** 执行 scenario.steps[state.position]，返回新状态（不修改入参）。 */
export function applyStep(project: Project, scenario: Scenario, state: PlayState): PlayState {
  const step = scenario.steps[state.position];
  if (!step) throw new JoploError('PLAYBACK_FAILED', `场景 ${scenario.id} 没有第 ${state.position + 1} 步`);
  const problem = checkStep(project, scenario, state, step);
  if (problem) throw new PlaybackError(problem.message, problem);

  const next: PlayState = structuredClone(state);
  next.toasts = [];
  const a = step.action;
  if (a.type === 'type' || a.type === 'select' || a.type === 'toggle') next.inputs[a.target] = a.value;
  if (a.type === 'back') next.sceneId = next.sceneStack.pop()!;

  step.effects.forEach((e, i) => {
    const ref = { kind: 'step', id: step.id, optionId: scenario.optionId, scenarioId: scenario.id, stepId: step.id, path: `effects[${i}]` };
    switch (e.type) {
      case 'set':
        setPath(next, e.path, e.value, 'set');
        break;
      case 'append':
        setPath(next, e.path, e.value, 'append');
        break;
      case 'toast':
        next.toasts.push({ id: `${step.id}_${i}`, text: e.text, tone: e.tone });
        break;
      case 'navigate': {
        const target = project.scenes[e.sceneId];
        if (!target || target.optionId !== scenario.optionId)
          throw new PlaybackError(`步骤 ${step.id} 跳转到不存在或不属于本方案的画面 ${e.sceneId}`, {
            severity: 'error',
            code: 'MISSING_SCENE',
            message: `跳转目标画面 ${e.sceneId} 不存在或不属于方案 ${scenario.optionId}`,
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

/** 从初始状态重放到指定位置。 */
export function stateAt(project: Project, scenarioId: string, position: number): PlayState {
  const sc = getScenario(project, scenarioId);
  if (!Number.isInteger(position) || position < 0 || position > sc.steps.length)
    throw new JoploError('NOT_FOUND', `位置 ${position} 超出场景 ${scenarioId} 的范围 0..${sc.steps.length}`);
  let s = initialState(project, scenarioId);
  while (s.position < position) s = applyStep(project, sc, s);
  return s;
}

/** 步骤 ID → 该步骤执行之后的位置。 */
export function positionAfterStep(project: Project, scenarioId: string, stepId: string): number {
  const sc = getScenario(project, scenarioId);
  const i = sc.steps.findIndex((s) => s.id === stepId);
  if (i < 0) throw new JoploError('NOT_FOUND', `步骤 ${stepId} 不在场景 ${scenarioId} 中`);
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
  | { kind: 'disabled'; reason: string }
  | { kind: 'unmodeled'; label: string } // 明确标记为未建模
  | { kind: 'out_of_order'; label: string; expectedCaption: string | null } // 是本场景其他步骤的目标
  | { kind: 'not_covered'; label: string } // 没有任何已定义行为
  | { kind: 'static' }; // 背景元素，不必响应

/**
 * 演示模式下用户点击了某个元素：判断应推进步骤，还是提示“当前演示未覆盖”（PRD 8.2、AC-19）。
 * 流程外点击绝不能被解释为成功。
 */
export function explainClick(project: Project, state: PlayState, nodeId: string): ClickVerdict {
  const sc = getScenario(project, state.scenarioId);
  const scene = getScene(project, state.sceneId);
  const hit = findNode(scene, nodeId);
  if (!hit) return { kind: 'static' };
  const { node } = hit;
  const label = nodeLabel(node);
  if (isNodeDisabled(node, state)) return { kind: 'disabled', reason: node.disabledReason ?? '该操作当前不可用（未说明原因）' };
  const current = sc.steps[state.position];
  const targetOf = (s: Step) => ('target' in s.action ? s.action.target : null);
  if (current && !state.completed && targetOf(current) === nodeId && checkStep(project, sc, state, current) === null) return { kind: 'advance' };
  if (!INTERACTIVE_TYPES.has(node.type)) return { kind: 'static' };
  if (node.unmodeled) return { kind: 'unmodeled', label };
  if (sc.steps.some((s) => targetOf(s) === nodeId)) return { kind: 'out_of_order', label, expectedCaption: current && !state.completed ? current.caption : null };
  return { kind: 'not_covered', label };
}
