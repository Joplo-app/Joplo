/**
 * 发布站评审模式（`?embed=1&review=1`，云端契约 8.2）：演示与外层评审页之间的 postMessage 桥。
 *
 * 出站（演示 → 外层，一律 `window.parent.postMessage(msg, '*')`，位置信息对嵌入方本来就可见，不含秘密）：
 * - `joplo:ready { scenarios: [{ id, optionId, steps }] }`：IR 里的所有场景（评审版含所有方案），steps 是步骤数；
 * - `joplo:position { scenario, step, stepId, layer }`：step 是播放器位置（0 = 初始状态，k = 已执行 k 步），
 *   stepId = 第 step 步的 id（step = 0 时为 null），layer = 当前显示的层级键（没有层级时 null）；任何一项变化时发一次；
 *   diff 模式额外确认每次合法 goto 后的实际位置，即使位置与上次相同，仍须等渲染器报告。
 * - `joplo:pick-result { element: { id, label } | null }`：选元素结束（null = 取消）。
 *
 * 入站（外层 → 演示）：只处理 `event.source === window.parent` 且字段校验通过的 `joplo:goto` / `joplo:pick`，其余一律忽略。
 * 不是评审模式、或者不在 iframe 里时，桥根本不创建：不注册 message 监听，也不发任何消息。
 *
 * 发布站的 `@joplo-app/core` 是 core-lite（不带 zod），所以这里手写校验。本文件是发布站里唯一使用 postMessage 的地方。
 */
import { nodeLabel, orderedFeatures, type Project, type SceneNode } from '@joplo-app/core/runtime';

export const REVIEW_PROTOCOL = 1 as const;
/** 作者写的元素 Id（与 IR 的 Id、Rule.elementIds 同一套）；编译器生成的 id 以 `_` 开头，不匹配。 */
export const ELEMENT_ID = /^[A-Za-z][A-Za-z0-9_-]{0,63}$/;

export type ReviewScenario = { id: string; optionId: string; steps: number };
export type ReviewPosition = { scenario: string; step: number; stepId: string | null; layer: string | null };
export type ReviewElement = { id: string; label: string };
export type ReviewGoto = { scenario: string; step: number; highlight: string | null };
export type ReviewInbound = ({ type: 'goto' } & ReviewGoto) | { type: 'pick'; active: boolean };

const own = (o: object, k: string) => Object.prototype.hasOwnProperty.call(o, k);

/** ready 里的场景列表：功能顺序 → 方案在 feature.optionIds 里的顺序 → 场景在 IR 里的顺序；其余（理论上没有）排在最后。 */
export function reviewScenarios(project: Project): ReviewScenario[] {
  const all = Object.values(project.scenarios ?? {});
  const out: ReviewScenario[] = [];
  const seen = new Set<string>();
  const add = (s: (typeof all)[number]) => {
    if (seen.has(s.id)) return;
    seen.add(s.id);
    out.push({ id: s.id, optionId: s.optionId, steps: s.steps.length });
  };
  for (const f of orderedFeatures(project)) for (const oid of f.optionIds ?? []) for (const s of all) if (s.optionId === oid) add(s);
  for (const s of all) add(s);
  return out;
}

/** 外层发来的消息 → 校验后的命令；不合法时为 null（多余字段忽略）。 */
export function parseReviewMessage(data: unknown, project: Project): ReviewInbound | null {
  if (data === null || typeof data !== 'object' || Array.isArray(data)) return null;
  const m = data as Record<string, unknown>;
  if (m.protocol !== REVIEW_PROTOCOL) return null;
  if (m.type === 'joplo:pick') return typeof m.active === 'boolean' ? { type: 'pick', active: m.active } : null;
  if (m.type !== 'joplo:goto') return null;
  if (typeof m.scenario !== 'string' || !own(project.scenarios ?? {}, m.scenario)) return null;
  const sc = project.scenarios[m.scenario]!;
  if (typeof m.step !== 'number' || !Number.isSafeInteger(m.step) || m.step < 0) return null;
  const highlight = m.highlight === undefined ? null : m.highlight;
  if (highlight !== null && (typeof highlight !== 'string' || !ELEMENT_ID.test(highlight))) return null;
  return { type: 'goto', scenario: m.scenario, step: Math.min(m.step, sc.steps.length), highlight };
}

/** 桥需要的 window 能力（测试用替身）。 */
export type BridgeWindow = {
  parent: { postMessage(message: unknown, targetOrigin: string): void } | null;
  addEventListener(type: 'message', fn: (e: { source: unknown; data: unknown }) => void): void;
  removeEventListener(type: 'message', fn: (e: { source: unknown; data: unknown }) => void): void;
};

export type ReviewBridge = {
  ready(): void;
  /** 默认对相同位置去重；acknowledgeGoto 模式允许合法 goto 后的首次实际位置再次上报。 */
  position(pos: ReviewPosition): void;
  pickResult(element: ReviewElement | null): void;
  dispose(): void;
};

/**
 * 创建桥。enabled 为 false（不是评审模式）或不在 iframe 里（parent 就是自己）时返回 null，且不碰 window。
 */
export function createReviewBridge(opts: { enabled: boolean; acknowledgeGoto?: boolean; win: BridgeWindow; project: Project; onGoto: (g: ReviewGoto) => void; onPick: (active: boolean) => void }): ReviewBridge | null {
  if (!opts.enabled) return null;
  const { win, project } = opts;
  const parent = win.parent;
  if (!parent || (parent as unknown) === win) return null;
  let alive = true;
  let last: string | null = null;
  const post = (msg: Record<string, unknown>) => {
    if (!alive) return;
    try {
      parent.postMessage({ ...msg, protocol: REVIEW_PROTOCOL }, '*');
    } catch {
      /* 外层已经离开 */
    }
  };
  const onMessage = (e: { source: unknown; data: unknown }) => {
    if (!alive || e.source !== parent) return;
    const m = parseReviewMessage(e.data, project);
    if (!m) return;
    try {
      if (m.type === 'goto') {
        // Diff needs a fresh observed position even when the requested tuple is unchanged.
        // Wait for the renderer's position() call; never acknowledge a command speculatively.
        if (opts.acknowledgeGoto) last = null;
        opts.onGoto({ scenario: m.scenario, step: m.step, highlight: m.highlight });
      }
      else opts.onPick(m.active);
    } catch {
      /* 处理失败不影响之后的消息 */
    }
  };
  win.addEventListener('message', onMessage);
  return {
    ready: () => post({ type: 'joplo:ready', scenarios: reviewScenarios(project) }),
    position: (pos) => {
      const key = JSON.stringify([pos.scenario, pos.step, pos.stepId, pos.layer]);
      if (!alive || key === last) return;
      last = key;
      post({ type: 'joplo:position', scenario: pos.scenario, step: pos.step, stepId: pos.stepId, layer: pos.layer });
    },
    pickResult: (element) => post({ type: 'joplo:pick-result', element: element ? { id: element.id, label: element.label } : null }),
    dispose: () => {
      alive = false;
      win.removeEventListener('message', onMessage);
    },
  };
}

/** DOM 元素的最小接口（测试用替身）。 */
type ElLike = { dataset: Record<string, string | undefined>; parentElement: ElLike | null };

/**
 * 选择元素：从命中的元素（Stage 的 pickTarget 结果）向上找最近的作者 id 元素。
 * 编译器生成的 `_` 开头 id、文本节点（#text）跳过；不在舞台里时为 null。
 */
export function authorElement<T extends ElLike>(hit: T | null, root: T, contains: (root: T, el: T) => boolean = (r, el) => (r as unknown as Node).contains(el as unknown as Node)): T | null {
  for (let el: ElLike | null = hit; el && el !== root && contains(root, el as T); el = el.parentElement) {
    const id = el.dataset.jid;
    if (id && el.dataset.jtype !== '#text' && ELEMENT_ID.test(id)) return el as T;
  }
  return null;
}

/** 元素的人类可读名字：在当前显示的画面里按 id 找到 IR 节点，用 nodeLabel（与评审清单 elements[].label 一致）；找不到时用组件类型。 */
export function elementLabel(project: Project, sceneId: string | null, id: string, type: string | null): string {
  const root = sceneId ? project.scenes[sceneId]?.root : undefined;
  const find = (n: SceneNode): SceneNode | null => {
    if (n.id === id) return n;
    for (const c of n.children ?? []) {
      const hit = find(c);
      if (hit) return hit;
    }
    return null;
  };
  const node = root ? find(root) : null;
  const label = node ? nodeLabel(node) : type && type !== '#text' ? type : id;
  // 与评审清单 elements[].label 相同的上限（200 个码点，超出时末尾 “…”）
  const chars = [...label];
  return chars.length <= 200 ? label : `${chars.slice(0, 199).join('')}…`;
}
