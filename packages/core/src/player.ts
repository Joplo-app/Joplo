/**
 * 播放器：纯函数的状态转换。手动体验、逐步查看、自动播放、回放校验和渲染截图
 * 全部调用这里，不允许任何一方另写一套按钮逻辑（PRD 8.4）。
 *
 * 位置（position）语义：0 = 场景初始状态；k = 已执行前 k 个步骤之后的状态。
 * “上一步”通过从初始状态重放到 k-1 实现，因此恢复的是业务可见状态，而不是撤销动画。
 */
import { DIRECTOR_LAYER, GATED_CONTAINERS, INTERACTIVE_TYPES, PAGE_LAYER, VALUE_TYPES, VIEWPORT_SIZE, atWidth, childWidth, breakpointPx, choicesFromData, hiddenAtWidth, matchChoice, nodeLabel, type Choice } from './catalog.ts';
import type { Condition, LayerIcon, Project, Scenario, Scene, SceneNode, Step } from './schema.ts';
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
  if (!sc) throw new JoploError('NOT_FOUND', `Scenario does not exist: ${scenarioId}`);
  return sc;
}

export function getScene(project: Project, sceneId: string): Scene {
  const s = project.scenes[sceneId];
  if (!s) throw new JoploError('NOT_FOUND', `Stage does not exist: ${sceneId}`);
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
    w = childWidth(n.type, w, n.props);
  }
  return true;
}

/**
 * 可选项：Select / MultiSelect / SegmentedControl 读 data；Radio.Group 读子 Radio；Tabs 读 Tabs.Tab；
 * Accordion 读 Accordion.Item；Pagination 为 1..total。没有可枚举选项时返回 null（select 动作不做限制）。
 */
export function choicesOf(node: SceneNode, state: Pick<PlayState, 'ui' | 'data' | 'inputs'>): Choice[] | null {
  const text = (n: SceneNode): string => (n.type === '#text' ? String(resolveValue(n.props?.text, state) ?? '') : (n.children ?? []).map(text).join(''));
  /** 按文档顺序取指定类型的子孙（Radio 与 Radio.Card 混写时保持书写顺序）。 */
  const desc = (types: readonly string[]): SceneNode[] => {
    const out: SceneNode[] = [];
    walkNodes(node, (n) => {
      if (n !== node && types.includes(n.type)) out.push(n);
    });
    return out;
  };
  const p = node.props ?? {};
  switch (node.type) {
    case 'Select':
    case 'MultiSelect':
    case 'SegmentedControl':
    case 'TabBar': {
      const c = choicesFromData(resolveValue(p.data, state));
      return c.length ? c : null;
    }
    case 'Radio.Group':
    case 'Tabs':
    case 'Accordion': {
      const items = node.type === 'Radio.Group' ? ['Radio', 'Radio.Card'] : node.type === 'Tabs' ? ['Tabs.Tab'] : ['Accordion.Item'];
      const c = desc(items)
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
  const ref = { kind: 'step', id: step.id, optionId: scenario.optionId, scenarioId: scenario.id, stepId: step.id };
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
  if (a.type === 'click' && !INTERACTIVE_TYPES.has(node.type))
    return { severity: 'error', code: 'NOT_INTERACTIVE', message: `Step ${step.id} clicks ${node.type} "${nodeLabel(node)}", which is not interactive`, source: 'replay', ref };
  if (a.type !== 'click' && !VALUE_TYPES.has(node.type))
    return { severity: 'error', code: 'NOT_A_FIELD', message: `Step ${step.id} ${a.type} action target ${node.type} cannot accept input`, source: 'replay', ref };
  if (a.type === 'select') {
    const choices = choicesOf(node, state);
    if (choices && !matchChoice(choices, a.value))
      return {
        severity: 'error',
        code: 'UNKNOWN_CHOICE',
        message: `Step ${step.id} field "${nodeLabel(node)}" cannot select "${a.value}"; it is not an available option (available: ${choices.map((c) => (c.label === c.value ? c.value : `${c.label}/${c.value}`)).join(', ')})`,
        source: 'replay',
        ref,
      };
  }
  return null;
}

/** select 动作写入的值：匹配到选项时存 value（动作可写 value 或 label）；MultiSelect 切换数组中的一项。 */
function selectedValue(project: Project, state: PlayState, target: string, raw: string): unknown {
  const sc = project.scenarios[state.scenarioId];
  const scene = sc ? sceneOfTarget(project, sc, state, target) : project.scenes[state.sceneId];
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
    const ref = { kind: 'step', id: step.id, optionId: scenario.optionId, scenarioId: scenario.id, stepId: step.id, path: `effects[${i}]` };
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
        // 发布 IR 只有发布视图（`@/路径`，optionId 为 null）；dev / review 里跳转目标必须属于同一方案（D68 修复：以前发布站一跳转就报错）
        if (!target || (target.optionId !== scenario.optionId && !(project.mode === 'publish' && target.optionId === null)))
          throw new PlaybackError(`Step ${step.id} navigates to a stage that is missing or outside this option: ${e.sceneId}`, {
            severity: 'error',
            code: 'MISSING_SCENE',
            message: `Navigation target stage ${e.sceneId} is missing or outside option ${scenario.optionId}`,
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
    throw new JoploError('NOT_FOUND', `Position ${position} is outside scenario ${scenarioId} range 0..${sc.steps.length}`);
  let s = initialState(project, scenarioId);
  while (s.position < position) s = applyStep(project, sc, s);
  return s;
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
  if (!INTERACTIVE_TYPES.has(node.type)) return { kind: 'static' };
  if (node.unmodeled) return { kind: 'unmodeled', label };
  if (sc.steps.some((s) => targetOf(s) === nodeId)) return { kind: 'out_of_order', label, expectedCaption: current && !state.completed ? current.caption : null };
  return { kind: 'not_covered', label };
}

// ---------- 视角层级与导演镜头（D43 / T-layers：每层一个独立画面） ----------

/** 方案的层级（源码顺序）：每层一个完全独立的画面。没有声明时为空，演示照常显示路径页面。 */
export function layersOf(project: Project, scenarioId: string | null): { id: string; title: string; sceneId: string; icon: LayerIcon }[] {
  const sc = scenarioId ? project.scenarios[scenarioId] : null;
  const opt = sc ? project.options[sc.optionId] : null;
  // 图标：作者写的优先；没写时手机视口用 mobile，其余用 window
  return Object.entries(opt?.layers ?? {}).map(([id, l]) => ({ id, title: l.title, sceneId: l.sceneId, icon: l.icon ?? (project.scenes[l.sceneId]?.viewport === 'mobile' ? 'mobile' : 'window') }));
}

/** 包含某个元素的层级（多层都有同名 id 时都返回）。 */
export function layersWithNode(project: Project, scenarioId: string, nodeId: string): string[] {
  return layersOf(project, scenarioId)
    .filter((l) => { const sc = project.scenes[l.sceneId]; return !!sc && !!findNode(sc, nodeId); })
    .map((l) => l.id);
}

/**
 * 步骤目标所在的画面：有层级的方案在各层画面里找（优先当前可见的那一层），否则是状态里的路径画面。
 * 回放校验、select 取值都用它。
 */
export function sceneOfTarget(project: Project, scenario: Scenario, state: PlayState, target: string): Scene | undefined {
  const layers = layersOf(project, scenario.id);
  if (!layers.length) return project.scenes[state.sceneId];
  const scenes = layers.map((l) => project.scenes[l.sceneId]).filter((x): x is Scene => !!x && !!findNode(x, target));
  return scenes.find((x) => isNodeVisible(x, target, state)) ?? scenes[0] ?? project.scenes[state.sceneId];
}

/** 某一步的镜头：导演层与每个层级当前对准的元素（空数组 = 这一层的整体）。 */
export type Camera = { directorLayer: string; perLayer: Record<string, string[]> };

/**
 * 第 position 步之后的镜头。纯函数：只由步骤上的 shots / directorLayer 推导，不进入 ui / data / inputs。
 * 初始导演层 = 第一个声明的层级（没有层级时是路径页面 @page），各层都是整体。
 * 没有 shot 的步骤沿用上一步；shot()（@director）让当时的导演层回到整体。
 * 手动、逐步、自动播放、回放、renderStep、视频录制和发布站都用它。
 */
export function cameraAt(project: Project, scenarioId: string, position: number): Camera {
  const sc = project.scenarios[scenarioId];
  const perLayer: Record<string, string[]> = {};
  let directorLayer = layersOf(project, scenarioId)[0]?.id ?? PAGE_LAYER;
  if (!sc) return { directorLayer, perLayer };
  const n = Math.max(0, Math.min(position, sc.steps.length));
  for (let i = 0; i < n; i++) {
    const st = sc.steps[i]!;
    if (st.directorLayer) directorLayer = st.directorLayer;
    for (const s of st.shots ?? []) perLayer[s.layer === DIRECTOR_LAYER ? directorLayer : s.layer] = [...s.targets];
  }
  return { directorLayer, perLayer };
}

/** 第 position 步之后用户看到的画面：有层级时是导演层（或手动选的层）的画面，否则是状态里的路径画面。 */
export function displaySceneId(project: Project, scenarioId: string, position: number, layer?: string | null): string {
  const layers = layersOf(project, scenarioId);
  const state = stateAt(project, scenarioId, position);
  if (!layers.length) return state.sceneId;
  const want = layer && layers.some((l) => l.id === layer) ? layer : cameraAt(project, scenarioId, position).directorLayer;
  return (layers.find((l) => l.id === want) ?? layers[0]!).sceneId;
}

/** 第 index 步（0 起）的镜头是否改变了某一层（“只重放这一层”时，不变的步骤快速带过）。 */
export function stepTouchesLayer(project: Project, scenarioId: string, index: number, layer: string): boolean {
  const st = project.scenarios[scenarioId]?.steps[index];
  if (!st) return false;
  if ((st.shots ?? []).some((s) => s.layer === layer || (s.layer === DIRECTOR_LAYER && cameraAt(project, scenarioId, index + 1).directorLayer === layer))) return true;
  // 操作目标在这一层的步骤也算（要看着它被点）
  return 'target' in st.action && layersWithNode(project, scenarioId, st.action.target).includes(layer);
}

// ---------- 调用链（D48）：Diagram 节点与连线的 state 由每一步的 trace 推算 ----------
export type DiagramState = 'idle' | 'active' | 'ok' | 'error' | 'dim';
/** 元素 id → 推算的 state；reverse = 这条连线本步逆向走（流动的小点从 to 走向 from）。没出现的 id 是 idle。 */
export type DiagramStates = Record<string, { state: DiagramState; reverse?: boolean }>;

/**
 * 第 position 步之后 Diagram 的状态（纯函数，与 cameraAt 同级；回放、renderStep、视频、发布站都用它）：
 * - 本步 trace 到的：active；之前 trace 过、本步没再 trace 的：ok；
 * - trace.fail：路径上的连线与终点节点 error（起点等其余节点 active），保持到之后又被 trace 成功；
 * - trace.skip：路径上的节点与连线 dim（保持到之后又被 trace）；
 * - 从未涉及的：idle（不在结果里）。
 * - 分组（D69）：路径经过的节点所在的各级分组同样 active → ok；trace.fail 时终点所在的最内层分组 error；trace.skip 不改分组。
 * 节点或连线上显式写的 state 优先于推算结果（由渲染器处理）。
 */
export function diagramStateAt(project: Project, scenarioId: string | null | undefined, position: number): DiagramStates {
  const sc = scenarioId ? project.scenarios[scenarioId] : undefined;
  const out: DiagramStates = {};
  if (!sc) return out;
  const n = Math.max(0, Math.min(position, sc.steps.length));
  for (let i = 0; i < n; i++) {
    for (const v of Object.values(out)) {
      if (v.state === 'active') {
        v.state = 'ok';
        delete v.reverse;
      }
    }
    for (const t of sc.steps[i]!.traces ?? []) {
      if (t.mode === 'skip') {
        for (const id of t.nodes) out[id] = { state: 'dim' };
        for (const e of t.edges) out[e.id] = { state: 'dim' };
      } else if (t.mode === 'fail') {
        const last = t.nodes[t.nodes.length - 1];
        for (const id of t.groups ?? []) out[id] = { state: 'active' };
        for (const id of t.errorGroups ?? []) out[id] = { state: 'error' };
        for (const id of t.nodes) out[id] = { state: id === last ? 'error' : 'active' };
        for (const e of t.edges) out[e.id] = { state: 'error' };
      } else {
        for (const id of t.groups ?? []) out[id] = { state: 'active' };
        for (const id of t.nodes) out[id] = { state: 'active' };
        for (const e of t.edges) out[e.id] = e.reverse ? { state: 'active', reverse: true } : { state: 'active' };
      }
    }
  }
  return out;
}

// ---------- 过渡卡、角色、流式输出（D56） ----------

export type CardAction = Extract<Step['action'], { type: 'card' }>;
export type RoleInfo = { id: string; name: string; desc: string; color: string };

/** 第 position 步之后是否停在一张过渡卡上（最近执行的一步是过渡卡）；是则返回卡片内容。 */
export function cardAt(project: Project, scenarioId: string | null | undefined, position: number): CardAction | null {
  const st = scenarioId ? project.scenarios[scenarioId]?.steps[position - 1] : undefined;
  return st && st.action.type === 'card' ? st.action : null;
}

/** 方案所属功能里可引用的角色（有 id 的）。 */
export function roleOf(project: Project, optionId: string | null | undefined, roleId: string | null | undefined): RoleInfo | null {
  if (!optionId || !roleId) return null;
  const opt = project.options[optionId];
  const r = opt ? project.features[opt.featureId]?.roles?.find((x) => x.id === roleId) : undefined;
  return r && r.id ? { id: r.id, name: r.name, desc: r.desc, color: r.color } : null;
}

/** 某个画面是谁的（层级声明了 role 时）；路径页面与没有角色的层级返回 null。 */
export function roleOfScene(project: Project, sceneId: string | null | undefined): RoleInfo | null {
  const scene = sceneId ? project.scenes[sceneId] : undefined;
  if (!scene?.layer || !scene.optionId) return null;
  return roleOf(project, scene.optionId, project.options[scene.optionId]?.layers[scene.layer]?.role);
}

/** 第 index 步（0 起）流式输出的状态路径与文字。 */
export function streamsOf(step: Step | undefined): { path: string; value: string }[] {
  return (step?.effects ?? []).flatMap((e) => (e.type === 'stream' ? [{ path: e.path, value: e.value }] : []));
}


// ---------- 分叉、标注与变化（D56 P1） ----------

/** 动作和业务效果完全相同的公共前缀步数；字幕、镜头、分叉等展示信息不参与。 */
export function commonPrefix(a: readonly Pick<Step, 'action' | 'effects'>[], b: readonly Pick<Step, 'action' | 'effects'>[]): number {
  let n = 0;
  while (n < Math.min(a.length, b.length) && sameValue(a[n]!.action, b[n]!.action) && sameValue(a[n]!.effects, b[n]!.effects)) n++;
  return n;
}

function sameValue(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object') return false;
  if (Array.isArray(a) || Array.isArray(b)) return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((v, i) => sameValue(v, b[i]));
  const ak = Object.keys(a), bk = Object.keys(b);
  return ak.length === bk.length && ak.every(k => Object.hasOwn(b, k) && sameValue((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]));
}

export function forksAt(project: Project, scenarioId: string | null | undefined, position: number): Step['forks'] {
  return forksOf(scenarioId ? project.scenarios[scenarioId]?.steps[position - 1] : undefined);
}

/** 与 Toast 一样只显示最近一步，目标是否可见由当前显示画面决定。 */
export function marksAt(project: Project, scenarioId: string | null | undefined, position: number): Step['marks'] {
  return (scenarioId ? project.scenarios[scenarioId]?.steps[position - 1]?.marks : undefined) ?? [];
}

export type StateChange = { path: string; before: unknown; after: unknown };
/** 对比 core 回放产生的相邻状态：对象按叶子展开，数组作为一个值；不包含动画、Toast 等展示状态。 */
export function changedAt(project: Project, scenarioId: string | null | undefined, position: number): StateChange[] {
  const sc = scenarioId ? project.scenarios[scenarioId] : undefined;
  if (!sc || !Number.isInteger(position) || position <= 0 || position > sc.steps.length) return [];
  const before = stateAt(project, sc.id, position - 1);
  const after = applyStep(project, sc, before);
  const out: StateChange[] = [];
  const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
  const diff = (path: string, a: unknown, b: unknown) => {
    if (sameValue(a, b)) return;
    if ((object(a) || a === undefined) && (object(b) || b === undefined) && (object(a) || object(b))) {
      const keys = [...new Set([...Object.keys(a ?? {}), ...Object.keys(b ?? {})])].sort();
      if (keys.length) { for (const k of keys) diff(`${path}.${k}`, a?.[k], b?.[k]); return; }
    }
    out.push({ path, before: structuredClone(a), after: structuredClone(b) });
  };
  for (const root of ['ui', 'data', 'inputs'] as const) diff(root, before[root], after[root]);
  return out;
}

/** 已定位的一步的路线；字幕也用这一个投影入口。 */
export function forksOf(step: Step | undefined): Step['forks'] { return step?.forks ?? []; }

/** 按键记录的 IR 入口：静态取最近一步，动画预览与键帽分词由 web 负责。 */
export function keyboardActionOf(step: Step | undefined): Extract<Step['action'], { type: 'type' | 'press' }> | null {
  const a = step?.action;
  return a?.type === 'type' || a?.type === 'press' ? a : null;
}
