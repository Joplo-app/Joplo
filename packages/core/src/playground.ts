/** D88: interaction semantics are data-only. The timeline is never mutated by this module. */
import { actionMatches, pluginActionSpec } from './actions.ts';
import type { Action, Effect, Project, Scene, Step } from './schema.ts';
import { applyStep, checkStep, choicesOf, explainClick, findNode, initialState, isNodeDisabled, isNodeVisible, resolveValue, sceneOfTarget, type PlayState } from './player.ts';
import { matchChoice } from './catalog.ts';

export type LocalEffect = Extract<Effect, { type: 'set' | 'append' | 'toast' | 'navigate' }>;
/** Only local deltas. Dropping this object restores the exact scripted state. Never serialized in IR or URLs. */
export type Playground = { effects: LocalEffect[] };
export type ActionEntry = { scenarioId: string; position: number; sceneId: string; action: Action };
export type ActionVerdict =
  | { kind: 'advance' }
  | { kind: 'switch'; candidates: ActionEntry[] }
  | { kind: 'free'; effects: LocalEffect[] }
  | { kind: 'hint'; verdict: ReturnType<typeof explainClick> };

export { actionMatches, pluginActionSpec, validActionData } from './actions.ts';

/** Index only positions whose prefix replays and whose action is available there. */
export function actionIndex(project: Project, workId: string): ActionEntry[] {
  const entries: ActionEntry[] = [];
  for (const sc of Object.values(project.scenarios)) {
    if (sc.workId !== workId) continue;
    try {
      let state = initialState(project, sc.id);
      for (const [position, step] of sc.steps.entries()) {
        if (step.kind === 'user' && 'target' in step.action && !checkStep(project, sc, state, step)) {
          const scene = sceneOfTarget(project, sc, state, step.action.target);
          if (scene) entries.push({ scenarioId: sc.id, position, sceneId: scene.id, action: step.action });
        }
        state = applyStep(project, sc, state);
      }
    } catch { /* No entries beyond an invalid prefix. */ }
  }
  return entries;
}

function canonicalAction(action: Action, scene: Scene | undefined, state: PlayState): Action {
  if (action.type !== 'select' || !scene) return action;
  const node = findNode(scene, action.target)?.node;
  const choices = node && choicesOf(node, state);
  return choices ? { ...action, value: matchChoice(choices, action.value)?.value ?? action.value } : action;
}
function nativeEffects(scene: Scene, state: PlayState, action: Action): LocalEffect[] {
  if (!('target' in action) || !('value' in action)) return [];
  const node = findNode(scene, action.target)?.node;
  const native = node?.traits?.native;
  if (!node || !native || native.action !== action.type || isNodeDisabled(node, state) || !isNodeVisible(scene, node.id, state)) return [];
  let value: unknown = action.value;
  if (action.type === 'select') {
    const choices = choicesOf(node, state);
    if (choices && !matchChoice(choices, action.value)) return [];
    value = choices ? matchChoice(choices, action.value)!.value : action.value;
    const current = state.inputs[node.id] ?? resolveValue(node.props?.[native.prop] ?? node.props?.defaultValue, state);
    if (node.traits?.input === 'multiple' || resolveValue(node.props?.multiple, state) === true) {
      const list = Array.isArray(current) ? current : [];
      value = list.includes(value) ? list.filter(v => v !== value) : [...list, value];
    } else if (native.deselect && current === value) value = null;
  }
  const effects: LocalEffect[] = [{ type: 'set', path: `inputs.${node.id}`, value }];
  const binding = node.props?.[native.prop];
  if (typeof binding === 'string' && /^\$(ui|data|inputs)\.[A-Za-z0-9_.-]+$/.test(binding)) effects.push({ type: 'set', path: binding.slice(1), value });
  return effects;
}

export function arbitrateAction(project: Project, timeline: PlayState, action: Action, opts: { layer?: Playground | null; sceneId?: string; index?: readonly ActionEntry[]; native?: Action } = {}): ActionVerdict {
  const scenario = project.scenarios[timeline.scenarioId];
  const scene = project.scenes[opts.sceneId ?? timeline.sceneId];
  if (!scenario || !scene) return { kind: 'hint', verdict: { kind: 'static' } };
  const view = playgroundState(timeline, opts.layer ?? null);
  const inputs = [action, ...(opts.native ? [opts.native] : [])];
  // Input is accepted only from a visible, enabled target in the displayed local view.
  const available = (input: Action) => !('target' in input) || !!findNode(scene, input.target) && isNodeVisible(scene, input.target, view) && !isNodeDisabled(findNode(scene, input.target)!.node, view);
  const matches = (expected: Action) => inputs.some(input => available(input) && actionMatches(canonicalAction(expected, scene, view), canonicalAction(input, scene, view), expected.type === 'plugin' ? pluginActionSpec(project, expected.name) : undefined));
  const next = scenario.steps[timeline.position];
  // A page reached only in the local layer never advances the timeline: the scripted step belongs to the timeline's page.
  if (next && !timeline.completed && view.sceneId === timeline.sceneId && matches(next.action) && !checkStep(project, scenario, timeline, next)) return { kind: 'advance' };
  const candidates = (opts.index ?? actionIndex(project, scenario.workId)).filter(entry => entry.scenarioId !== scenario.id && entry.sceneId === scene.id && matches(entry.action));
  if (candidates.length) return { kind: 'switch', candidates };
  const reaction = Object.values(project.works[scenario.workId]?.free ?? {}).find(r => matches(r.action));
  const native = nativeEffects(scene, view, opts.native ?? action);
  const nativeFocus = action.type === 'click' && available(action) && !!findNode(scene, action.target)?.node.traits?.native;
  // Local navigation (element onClick go()) only reaches stages of this work; publication keeps the shared public stages.
  const localStage = (sceneId: string) => { const target = project.scenes[sceneId]; return !!target && (target.workId === scenario.workId || project.mode === 'publish' && target.workId === null); };
  const local = (e: Effect): e is LocalEffect => e.type === 'set' || e.type === 'append' || e.type === 'toast' || e.type === 'navigate' && localStage(e.sceneId);
  if (reaction || native.length || nativeFocus) return { kind: 'free', effects: [...native, ...(reaction?.effects.filter(local) ?? [])] };
  const hint = 'target' in action ? explainClick(project, timeline, action.target, scene.id) : { kind: 'static' as const };
  // Legacy explainClick intentionally accepts a target alone; never let it bypass action matching.
  return { kind: 'hint', verdict: hint.kind === 'advance' ? { kind: 'out_of_order', label: '', expectedCaption: next?.caption ?? null } : hint };
}

export function applyPlayground(layer: Playground | null, effects: readonly LocalEffect[]): Playground {
  return { effects: [...(layer?.effects ?? []), ...structuredClone(effects)] };
}
export function playgroundState(timeline: PlayState, layer: Playground | null): PlayState {
  if (!layer || !layer.effects.length) return timeline;
  const view = structuredClone(timeline);
  for (const [i, effect] of layer.effects.entries()) {
    if (effect.type === 'toast') { view.toasts = [{ id: `free-${i}`, text: effect.text, tone: effect.tone }]; continue; }
    if (effect.type === 'navigate') { if (effect.sceneId !== view.sceneId) { view.sceneStack.push(view.sceneId); view.sceneId = effect.sceneId; view.toasts = []; } continue; }
    const [root, ...keys] = effect.path.split('.');
    if (!['ui', 'data', 'inputs'].includes(root!) || !keys.length || keys.some(k => ['__proto__', 'constructor', 'prototype'].includes(k))) continue;
    let object = view[root as 'ui' | 'data' | 'inputs'];
    for (const key of keys.slice(0, -1)) {
      if (!object[key] || typeof object[key] !== 'object' || Array.isArray(object[key])) object[key] = {};
      object = object[key] as Record<string, unknown>;
    }
    const key = keys.at(-1)!;
    object[key] = effect.type === 'append' ? [...(Array.isArray(object[key]) ? object[key] as unknown[] : []), structuredClone(effect.value)] : structuredClone(effect.value);
  }
  return view;
}

/**
 * The stage the viewer is looking at. A reported stage other than the timeline's page (a layer) stays authoritative;
 * otherwise local navigation in the playground decides. Dropping the layer returns to the timeline's page.
 */
export function shownSceneOf(timeline: PlayState, layer: Playground | null, shown: string | null): string {
  if (shown && shown !== timeline.sceneId) return shown;
  return playgroundState(timeline, layer).sceneId;
}
