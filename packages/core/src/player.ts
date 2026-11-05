/**
 * 播放器：纯函数的状态转换。手动体验、逐步查看、自动播放、回放校验和渲染截图
 * 全部调用这里，不允许任何一方另写一套按钮逻辑（PRD 8.4）。
 *
 * 位置（position）语义：0 = 场景初始状态；k = 已执行前 k 个步骤之后的状态。
 * “上一步”通过从初始状态重放到 k-1 实现，因此恢复的是业务可见状态，而不是撤销动画。
 */
import { GATED_CONTAINERS, INTERACTIVE_TYPES, VALUE_TYPES, VIEWPORT_SIZE, atWidth, childWidth, breakpointPx, choicesFromData, hiddenAtWidth, matchChoice, nodeLabel, type Choice } from './catalog.ts';
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

/**
 * 属性值若是 `$ui.x` 形式的整值绑定，则从状态读取；对象与数组逐项解析
 * （例如 AppShell 的 navbar={{ collapsed: { mobile: $.ui.navClosed } }}）；其余原样返回。
 */
export function resolveValue(value: unknown, state: Pick<PlayState, 'ui' | 'data' | 'inputs'>): unknown {
  if (typeof value === 'string') {
    const m = BINDING.exec(value);
    if (m) return readPath(state, m[1]!);
    return value;
  }
  if (Array.isArray(value)) return value.some(hasBinding) ? value.map((v) => resolveValue(v, state)) : value;
  if (value && typeof value === 'object') {
    if (!hasBinding(value)) return value;
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, resolveValue(v, state)]));
  }
  return value;
}

function hasBinding(v: unknown): boolean {
  if (typeof v === 'string') return BINDING.test(v);
  if (Array.isArray(v)) return v.some(hasBinding);
  if (v && typeof v === 'object') return Object.values(v).some(hasBinding);
  return false;
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

/** 画面的舞台宽度（由页面的 viewport 决定）。 */
export function sceneWidth(scene: Pick<Scene, 'viewport'>): number {
  return VIEWPORT_SIZE[scene.viewport === 'mobile' ? 'mobile' : 'desktop'].width;
}

/**
 * 节点自身是否显示：when、Modal / Drawer 的 opened（兼容旧写法 open），
 * 以及给定舞台宽度时的 visibleFrom / hiddenFrom。
 */
export function isSelfVisible(node: SceneNode, state: PlayState, width?: number): boolean {
  if (node.when && !evaluateCondition(node.when, state)) return false;
  if (GATED_CONTAINERS.has(node.type)) {
    const opened = node.props?.opened !== undefined ? node.props.opened : node.props?.open;
    if (!resolveValue(opened, state)) return false;
  }
  if (width !== undefined && hiddenAtWidth(node.props, width)) return false;
  return true;
}

export type ShellRegion = { size: number; collapsed: boolean };
export type ShellLayout = { header: ShellRegion | null; footer: ShellRegion | null; navbar: ShellRegion | null; aside: ShellRegion | null; padding: unknown; mobile: { navbar: boolean; aside: boolean } };

/**
 * AppShell 在给定舞台宽度下的布局：窄于 navbar/aside 的 breakpoint 时为“移动布局”，
 * 默认收起（collapsed.mobile 未写时视为 true，写 false 或绑定为假时展开）；宽于断点时按 collapsed.desktop（默认展开）。
 * 渲染器与播放器共用，保证“看得见”和“能操作”一致。
 */
export function appShellLayout(props: Record<string, unknown> | undefined, state: Pick<PlayState, 'ui' | 'data' | 'inputs'>, width: number): ShellLayout {
  const p = props ?? {};
  const obj = (v: unknown): Record<string, unknown> | null => {
    const r = resolveValue(atWidth(v, width), state);
    return r && typeof r === 'object' && !Array.isArray(r) ? (r as Record<string, unknown>) : null;
  };
  const num = (v: unknown, d: number) => {
    const x = atWidth(resolveValue(v, state), width);
    return typeof x === 'number' && Number.isFinite(x) ? x : typeof x === 'string' && /^\d+(px)?$/.test(x) ? Number.parseInt(x, 10) : d;
  };
  const bar = (key: 'header' | 'footer'): ShellRegion | null => {
    const o = obj(p[key]);
    if (!o) return null;
    return { size: num(o.height, 60), collapsed: Boolean(resolveValue(o.collapsed, state)) };
  };
  const mobile = { navbar: false, aside: false };
  const side = (key: 'navbar' | 'aside'): ShellRegion | null => {
    const o = obj(p[key]);
    if (!o) return null;
    const bp = breakpointPx(o.breakpoint);
    const isMobile = bp !== null && width < bp;
    mobile[key] = isMobile;
    const col = resolveValue(o.collapsed, state);
    const c = col && typeof col === 'object' ? (col as Record<string, unknown>) : {};
    const collapsed = isMobile ? (c.mobile === undefined ? true : Boolean(c.mobile)) : Boolean(c.desktop);
    return { size: num(o.width, key === 'navbar' ? 260 : 300), collapsed };
  };
  return { header: bar('header'), footer: bar('footer'), navbar: side('navbar'), aside: side('aside'), padding: p.padding, mobile };
}

/** 节点在画面中是否可见：自身与所有祖先都可见；按画面宽度计算断点与 AppShell 收起。 */
export function isNodeVisible(scene: Scene, nodeId: string, state: PlayState, width: number = sceneWidth(scene)): boolean {
  const hit = findNode(scene, nodeId);
  if (!hit) return false;
  let shell: SceneNode | null = null;
  let shellWidth = width;
  let w = width;
  for (const n of [...hit.ancestors, hit.node]) {
    if (!isSelfVisible(n, state, w)) return false;
    if (n.type === 'AppShell') {
      shell = n;
      shellWidth = w;
    }
    if (shell && (n.type === 'AppShell.Navbar' || n.type === 'AppShell.Aside')) {
      const l = appShellLayout(shell.props, state, shellWidth);
      const r = n.type === 'AppShell.Navbar' ? l.navbar : l.aside;
      if (r?.collapsed) return false;
    }
    w = childWidth(n.type, w);
  }
  return true;
}

/**
 * 可选项：Select / MultiSelect / SegmentedControl 读 data；Radio.Group 读子 Radio；Tabs 读 Tabs.Tab；
 * Accordion 读 Accordion.Item；Pagination 为 1..total。没有可枚举选项时返回 null（select 动作不做限制）。
 */
export function choicesOf(node: SceneNode, state: Pick<PlayState, 'ui' | 'data' | 'inputs'>): Choice[] | null {
  const text = (n: SceneNode): string => (n.type === '#text' ? String(resolveValue(n.props?.text, state) ?? '') : (n.children ?? []).map(text).join(''));
  const desc = (type: string): SceneNode[] => {
    const out: SceneNode[] = [];
    walkNodes(node, (n) => {
      if (n !== node && n.type === type) out.push(n);
    });
    return out;
  };
  const p = node.props ?? {};
  switch (node.type) {
    case 'Select':
    case 'MultiSelect':
    case 'SegmentedControl': {
      const c = choicesFromData(resolveValue(p.data, state));
      return c.length ? c : null;
    }
    case 'Radio.Group':
    case 'Tabs':
    case 'Accordion': {
      const item = node.type === 'Radio.Group' ? 'Radio' : node.type === 'Tabs' ? 'Tabs.Tab' : 'Accordion.Item';
      const c = desc(item)
        .filter((n) => n.props?.value !== undefined)
        .map((n) => {
          const value = String(resolveValue(n.props!.value, state));
          const lbl = n.props?.label;
          const control = node.type === 'Accordion' ? (n.children ?? []).find((x) => x.type === 'Accordion.Control') : n;
          const t = typeof lbl === 'string' ? lbl : control ? text(control).trim() : '';
          return { value, label: t || value };
        });
      return c.length ? c : null;
    }
    case 'Pagination': {
      const total = Number(resolveValue(p.total, state));
      return Number.isInteger(total) && total > 0 ? Array.from({ length: total }, (_, i) => ({ value: String(i + 1), label: String(i + 1) })) : null;
    }
    default:
      return null;
  }
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
  const d = checkStepInner(project, scenario, state, step);
  if (d && step.source) d.at = step.source;
  return d;
}

function checkStepInner(project: Project, scenario: Scenario, state: PlayState, step: Step): Diagnostic | null {
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
  if (a.type === 'select') {
    const choices = choicesOf(node, state);
    if (choices && !matchChoice(choices, a.value))
      return {
        severity: 'error',
        code: 'UNKNOWN_CHOICE',
        message: `步骤 ${step.id} 在「${nodeLabel(node)}」中选择“${a.value}”，但它不是可选项（可选：${choices.map((c) => (c.label === c.value ? c.value : `${c.label}/${c.value}`)).join('、')}）`,
        source: 'replay',
        ref,
      };
  }
  return null;
}

/** select 动作写入的值：匹配到选项时存 value（动作可写 value 或 label）；MultiSelect 切换数组中的一项。 */
function selectedValue(project: Project, state: PlayState, target: string, raw: string): unknown {
  const scene = project.scenes[state.sceneId];
  const node = scene ? findNode(scene, target)?.node : undefined;
  if (!node) return raw;
  const choices = choicesOf(node, state);
  const value = (choices && matchChoice(choices, raw)?.value) ?? raw;
  if (node.type !== 'MultiSelect') return value;
  const cur = state.inputs[target] ?? resolveValue(node.props?.value ?? node.props?.defaultValue, state);
  const list = Array.isArray(cur) ? cur.map(String) : [];
  return list.includes(value) ? list.filter((x) => x !== value) : [...list, value];
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
  if (a.type === 'type' || a.type === 'toggle') next.inputs[a.target] = a.value;
  if (a.type === 'select') next.inputs[a.target] = selectedValue(project, state, a.target, a.value);
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
