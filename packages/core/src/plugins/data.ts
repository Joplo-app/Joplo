import { isBind } from '@joplo-app/kit/node';
/** Host-owned JSON envelope and immutable callback inputs. No content semantics. */
export function jsonData(value: unknown): unknown {
  const active = new Set<object>();
  const walk = (v: unknown, depth: number): void => {
    if (v === null || typeof v === 'string' || typeof v === 'boolean') return;
    if (typeof v === 'number' && Number.isFinite(v)) return;
    if (!v || typeof v !== 'object' || depth > 100 || active.has(v)) throw new Error('plugin data must be finite, acyclic JSON (depth <= 100)');
    if (!Array.isArray(v) && ![Object.prototype, null].includes(Object.getPrototypeOf(v))) throw new Error('plugin data must contain only plain JSON objects');
    active.add(v);
    if (Array.isArray(v)) for (let i = 0; i < v.length; i++) walk(v[i], depth + 1);
    else for (const x of Object.values(v)) walk(x, depth + 1);
    active.delete(v);
  };
  walk(value, 0);
  return JSON.parse(JSON.stringify(value));
}
/** Authoring bindings/functions are opaque; JSON objects/arrays are copied and frozen. */
export function snapshot<T>(value: T): T {
  const seen = new Map<object, unknown>();
  const copy = (v: any): any => {
    if (!v || typeof v !== 'object') return v;
    if (seen.has(v)) return seen.get(v);
    const out: any = Array.isArray(v) ? [] : {};
    seen.set(v, out);
    for (const key of Reflect.ownKeys(v)) if (key !== 'length') Object.defineProperty(out, key, { value: copy(v[key]), enumerable: Object.getOwnPropertyDescriptor(v, key)?.enumerable ?? true, configurable: true, writable: true });
    return Object.freeze(out);
  };
  return copy(value);
}
export function object(value: unknown): value is Record<string, unknown> { return !!value && typeof value === 'object' && !Array.isArray(value); }
export const strings = (v: unknown): v is string[] => Array.isArray(v) && v.every(x => typeof x === 'string' && x.length > 0);

export function syncResult<T>(value: T): T {
  if (value && typeof value === 'object' && 'then' in value && typeof value.then === 'function') {
    void Promise.resolve(value).catch(() => undefined);
    throw new Error('Plugin compile hooks and schemas must return synchronously');
  }
  return value;
}

/** Bindings/undefined/functions are authoring values; cycles are never valid props. */
export function authoringData(value: unknown): void {
  const active = new Set<object>();
  const walk = (v: unknown, depth: number): void => {
    if (isBind(v) || v === undefined || v === null || typeof v === 'function' || ['string', 'boolean'].includes(typeof v)) return;
    if (typeof v === 'number' && Number.isFinite(v)) return;
    if (!v || typeof v !== 'object' || depth > 100 || active.has(v)) throw new Error('node props must be finite, acyclic authoring data');
    if (!Array.isArray(v) && ![Object.prototype, null].includes(Object.getPrototypeOf(v))) throw new Error('node props must contain plain objects');
    active.add(v); Object.values(v).forEach(x => walk(x, depth + 1)); active.delete(v);
  };
  walk(value, 0);
}
