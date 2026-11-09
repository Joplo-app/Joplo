import type { PluginActionSpec } from '@joplo-app/kit/plugin';
import type { Action, Project } from './schema.ts';

export function pluginActionSpec(project: Pick<Project, 'plugins'>, name: string): PluginActionSpec | undefined {
  const [plugin, key] = name.split(':');
  return plugin && key ? project.plugins?.[plugin]?.actions?.[key] : undefined;
}
export function validActionData(spec: PluginActionSpec, data: Record<string, unknown>): boolean {
  return Object.keys(data).length === Object.keys(spec.fields).length && Object.entries(spec.fields).every(([key, field]) => {
    const value = data[key];
    return typeof value === field.type && (typeof value !== 'number' || Number.isFinite(value) && (field.min === undefined || value >= field.min) && (field.max === undefined || value <= field.max));
  });
}
const sameDestination = (a: string | {x:number;y:number}, b: string | {x:number;y:number}) => typeof a === 'string' || typeof b === 'string' ? a === b : Math.hypot(a.x - b.x, a.y - b.y) <= 16;
/** Gesture matching is declarative, including plugin payloads. No plugin callbacks in playback. */
export function actionMatches(expected: Action, observed: Action, spec?: PluginActionSpec): boolean {
  if (expected.type !== observed.type) return false;
  if ('target' in expected && (!('target' in observed) || expected.target !== observed.target)) return false;
  switch (expected.type) {
    case 'click': case 'back': return true;
    case 'type': case 'select': case 'toggle': return 'value' in observed && expected.value === observed.value;
    case 'press': return observed.type === 'press' && expected.keys === observed.keys;
    case 'drag': case 'scroll': return 'to' in observed && sameDestination(expected.to, observed.to);
    case 'hover': return observed.type === 'hover' && observed.ms >= expected.ms;
    case 'plugin': return observed.type === 'plugin' && expected.name === observed.name && !!spec && validActionData(spec, observed.data) && Object.entries(spec.fields).every(([key, field]) => {
      const a = expected.data[key], b = observed.data[key];
      return typeof a === 'number' && typeof b === 'number' ? Math.abs(a - b) <= (field.tolerance ?? 0) : a === b;
    });
    default: return false; // System events and cards cannot be triggered by audience input.
  }
}

