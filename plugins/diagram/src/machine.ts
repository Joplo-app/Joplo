import type { GraphStructure } from './model.ts';
import type { DiagramStates } from './state.ts';
export function machineStates(s: GraphStructure, value: unknown, prev: unknown): { current: string | null; states: DiagramStates } {
  const cur = typeof value === 'string' && s.nodes.some((n) => n.id === value) ? value : null;
  const states: DiagramStates = {};
  if (cur && typeof prev === 'string' && prev !== cur) {
    const t = s.edges.find((e) => e.from === prev && e.to === cur);
    if (t) states[t.id] = { state: 'active' };
  }
  if (cur) states[cur] = { state: 'active' };
  return { current: cur, states };
}
