/**
 * 画面查询（纯函数）：在 IR 里找场景、画面与元素，按当前状态取属性的值、判断可见与禁用、推导选项与分栏，
 * 以及方案的层级（每层一个独立画面）。不推进状态——状态转换在 playback.ts，演示投影（镜头、过渡卡、流式输出）在 presentation.ts。
 */
import { VIEWPORT_SIZE, atWidth, childWidth, breakpointPx, choicesFromData, hiddenAtWidth, type Choice } from './catalog.ts';
import type { Condition, LayerIcon, Project, Scenario, Scene, SceneNode } from './schema.ts';
import { JoploError } from './result.ts';

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
 * （例如 declared element 的 navbar={{ collapsed: { mobile: $.ui.navClosed } }}）；其余原样返回。
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
 * 节点自身是否显示：when、declared element 的 opened（兼容旧写法 open），
 * 以及给定舞台宽度时的 visibleFrom / hiddenFrom。
 */
export function isSelfVisible(node: SceneNode, state: PlayState, width?: number): boolean {
  if (node.when && !evaluateCondition(node.when, state)) return false;
  if (node.traits?.gate) {
    const opened = node.traits.gate.map(key => node.props?.[key]).find(v => v !== undefined);
    if (!resolveValue(opened, state)) return false;
  }
  if (width !== undefined && hiddenAtWidth(node.props, width)) return false;
  return true;
}

export type LayoutRegion = { size: number; collapsed: boolean; mobile: boolean };
/** Declarative layout regions share the same width/state interpretation in drawing and playback. */
export function layoutRegions(node: SceneNode, state: Pick<PlayState, 'ui' | 'data' | 'inputs'>, width: number): Record<string, LayoutRegion | null> {
  const regions: Record<string, LayoutRegion | null> = {};
  for (const [key, spec] of Object.entries(node.traits?.layout ?? {})) {
    const value = resolveValue(atWidth(node.props?.[key], width), state);
    if (!value || typeof value !== 'object' || Array.isArray(value)) { regions[key] = null; continue; }
    const props = value as Record<string, unknown>;
    const bp = spec.breakpoint ? breakpointPx(props.breakpoint) : null;
    const mobile = bp !== null && width < bp;
    const collapsed = resolveValue(props.collapsed, state);
    const config = collapsed && typeof collapsed === 'object' ? collapsed as Record<string, unknown> : {};
    const rawSize = atWidth(resolveValue(props[spec.size], state), width);
    const size = typeof rawSize === 'number' && Number.isFinite(rawSize) ? rawSize : typeof rawSize === 'string' && /^\d+(px)?$/.test(rawSize) ? Number.parseInt(rawSize, 10) : spec.defaultSize;
    regions[key] = { size, mobile, collapsed: spec.breakpoint ? (mobile ? config.mobile === undefined || Boolean(config.mobile) : Boolean(config.desktop)) : Boolean(collapsed) };
  }
  return regions;
}

/** 节点在画面中是否可见：自身与所有祖先都可见；按画面宽度计算断点与 declared element 收起。 */
export function isNodeVisible(scene: Scene, nodeId: string, state: PlayState, width: number = sceneWidth(scene)): boolean {
  const hit = findNode(scene, nodeId);
  if (!hit) return false;
  let shell: SceneNode | null = null;
  let shellWidth = width;
  let w = width;
  const chain = [...hit.ancestors, hit.node];
  for (const [index, n] of chain.entries()) {
    if (!isSelfVisible(n, state, w)) return false;
    const gate = n.traits?.selectionGate;
    if (gate) {
      const ancestors = chain.slice(0, index).reverse();
      const owner = ancestors.find(a => a.type === gate.owner);
      const item = gate.item ? ancestors.find(a => a.type === gate.item) : n;
      if (!owner || !item) return false;
      let selected = state.inputs[owner.id] !== undefined ? state.inputs[owner.id] : resolveValue(owner.props?.value ?? owner.props?.defaultValue, state);
      if (gate.fallbackFirst && (selected === undefined || selected === null || selected === '')) selected = choicesOf(owner, state)?.[0]?.value;
      const value = String(resolveValue(item.props?.[gate.value], state) ?? '');
      if (Array.isArray(selected) ? !selected.map(String).includes(value) : selected === undefined || selected === null || String(selected) !== value) return false;
    }
    if (n.traits?.layout) {
      shell = n;
      shellWidth = w;
    }
    if (shell && n.traits?.region) {
      const r = layoutRegions(shell, state, shellWidth)[n.traits.region];
      if (r?.collapsed) return false;
    }
    w = childWidth(n, w, resolveProps(n, state));
  }
  return true;
}

/** Enumerate declared data, descendant values, or a numeric range. No declaration means unconstrained input. */
export function choicesOf(node: SceneNode, state: Pick<PlayState, 'ui' | 'data' | 'inputs'>): Choice[] | null {
  const spec = node.traits?.choices;
  if (!spec) return null;
  const p = node.props ?? {};
  if ('prop' in spec) { const choices = choicesFromData(resolveValue(p[spec.prop], state)); return choices.length ? choices : null; }
  if ('range' in spec) {
    const total = Number(resolveValue(p[spec.range], state));
    return Number.isInteger(total) && total > 0 ? Array.from({ length: total }, (_, i) => ({ value: String(i+1), label: String(i+1) })) : null;
  }
  const text = (n: SceneNode): string => n.type === '#text' ? String(resolveValue(n.props?.text, state) ?? '') : (n.children ?? []).map(text).join('');
  const choices: Choice[] = [];
  walkNodes(node, n => {
    if (n === node || !spec.descendants.includes(n.type) || n.props?.[spec.value ?? 'value'] === undefined) return;
    const value = String(resolveValue(n.props[spec.value ?? 'value'], state));
    const label = n.props[spec.label ?? 'label'];
    const control = spec.labelChild ? n.children?.find(c => c.type === spec.labelChild) : n;
    const display = typeof label === 'string' ? label : control ? text(control).trim() : '';
    choices.push({value, label:display || value});
  });
  return choices.length ? choices : null;
}

export function isNodeDisabled(node: SceneNode, state: PlayState): boolean {
  if (node.disabled === undefined) return false;
  if (typeof node.disabled === 'boolean') return node.disabled;
  return evaluateCondition(node.disabled, state);
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

