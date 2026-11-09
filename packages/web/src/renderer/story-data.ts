/** D56 P1 的展示投影：只读 IR 与位置/动画预览，不写业务状态。 */
import { keyboardActionOf, type Scenario, type StateChange } from '@joplo-app/core/runtime';

export function splitKeys(keys: string): string[] {
  return keys.trim().split(/[+\s]+/).filter(Boolean).flatMap(part => part.match(/[⌘⌥⇧⌃]|[^⌘⌥⇧⌃]+/gu) ?? []);
}
export type KeyboardRecord = { kind: 'type'; text: string } | { kind: 'press'; keys: string[] };
export function keyboardAt(scenario: Pick<Scenario, 'steps'> | null | undefined, position: number, activeStep: number | null = null, preview: { nodeId: string; text: string } | null = null): KeyboardRecord | null {
  const inflight = activeStep !== null && activeStep >= position;
  const a = keyboardActionOf(scenario?.steps[inflight ? activeStep : position - 1]);
  if (a?.type === 'type') return { kind: 'type', text: inflight ? preview?.nodeId === a.target ? preview.text : '' : a.value };
  if (a?.type === 'press') { const keys = splitKeys(a.keys); return keys.length ? { kind: 'press', keys } : null; }
  return null;
}
