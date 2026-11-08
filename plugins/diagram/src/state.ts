import type { Project } from '../../../packages/core/src/schema.ts';
import type { Trace } from './schema.ts';
// ---------- 调用链（D48）：Diagram 节点与连线的 state 由每一步的 trace 推算 ----------
export type DiagramState = 'idle' | 'active' | 'ok' | 'error' | 'dim';
/** 元素 id → 推算的 state；reverse = 这条连线本步逆向走（流动的小点从 to 走向 from）。没出现的 id 是 idle。 */
export type DiagramStates = Record<string, { state: DiagramState; reverse?: boolean }>;

/** 测试与 Node 工具读取编译好的快照；浏览器不导入本模块。 */
export function diagramStateAt(project: Project, scenarioId: string | null | undefined, position: number): DiagramStates {
  const sc = scenarioId ? project.scenarios[scenarioId] : undefined;
  if (!sc) return {};
  const n = Math.max(0, Math.min(position, sc.steps.length));
  const ext = n ? sc.steps[n - 1]?.ext : sc.ext;
  return structuredClone((ext?.diagram as { states?: DiagramStates } | undefined)?.states ?? {});
}

/** 编译期累计状态：本步 active，过去 active 变 ok；fail / skip 保持到下一次调用。 */
export function advanceStates(previous: DiagramStates, traces: Trace[]): DiagramStates {
  const out: DiagramStates = structuredClone(previous);
  for (const v of Object.values(out)) {
    if (v.state === 'active') {
      v.state = 'ok';
      delete v.reverse;
    }
  }
  for (const t of traces) {
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
  return out;
}
