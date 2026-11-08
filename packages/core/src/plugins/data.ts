import { BIND, NODE, isBind } from '@joplo-app/kit/node';
/** Capture descriptors once; validation and consumers only see this host-owned, accessor-free copy. */
export function materialize<T>(value: T, mode: 'hook' | 'authoring' | 'json' = 'hook'): T {
  const active = new Set<object>();
  const completed = new Map<object, unknown>();
  const walk = (v: unknown, depth: number): unknown => {
    if (v === null || typeof v === 'string' || typeof v === 'boolean') return v;
    if (v === undefined && mode !== 'json') return v;
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    // Authoring $ bindings are callable proxies. Read their path once, then use a plain marker.
    if (typeof v === 'function' && mode === 'authoring') {
      const binding = (v as unknown as Record<symbol, unknown>)[BIND];
      if (typeof binding === 'string') return Object.freeze({ [BIND]: binding });
    }
    if (!v || typeof v !== 'object' || depth > 100 || active.has(v)) throw new Error('plugin data must be finite, acyclic data (depth <= 100)');
    if (completed.has(v)) return completed.get(v);
    if (!Array.isArray(v) && ![Object.prototype, null].includes(Object.getPrototypeOf(v))) throw new Error('plugin data must contain only plain JSON objects');
    active.add(v);
    const descriptors = Object.getOwnPropertyDescriptors(v);
    const out: any = Array.isArray(v) ? [] : {};
    for (const key of Reflect.ownKeys(descriptors)) {
      const descriptor = (descriptors as Record<PropertyKey, PropertyDescriptor>)[key]!;
      if (!Object.hasOwn(descriptor, 'value')) throw new Error('plugin output accessors are not supported; return plain data');
      if (Array.isArray(v) && key === 'length') continue;
      if (typeof key === 'symbol' && (mode !== 'authoring' || key !== NODE && key !== BIND)) throw new Error('plugin data cannot contain symbol keys');
      if (mode !== 'authoring' && !descriptor.enumerable) throw new Error('plugin data must use enumerable data properties');
      if (Array.isArray(v) && (typeof key !== 'string' || !/^(0|[1-9]\d*)$/.test(key))) throw new Error('plugin arrays must contain only indexed data');
      Object.defineProperty(out, key, { value: walk(descriptor.value, depth + 1), enumerable: descriptor.enumerable, configurable: true, writable: true });
    }
    if (Array.isArray(v)) {
      const length = descriptors.length!.value as number;
      for (let i = 0; i < length; i++) if (!Object.hasOwn(out, i)) throw new Error('plugin data cannot contain sparse arrays');
    }
    active.delete(v);
    completed.set(v, out);
    return out;
  };
  return walk(value, 0) as T;
}
/** Host-owned JSON envelope; no second read of plugin objects or toJSON execution. */
export const jsonData = (value: unknown): unknown => materialize(value, 'json');

export function errorMessage(error: unknown): string {
  try { return error instanceof Error ? String(error.message) : String(error); }
  catch { return 'Plugin returned or threw an unreadable value'; }
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
  if (value && typeof value === 'object' && 'then' in value) {
    // Handle real promises (including another realm) without invoking a result's then getter.
    try { void Promise.prototype.then.call(value, undefined, () => undefined); }
    catch { return value; } // Plain thenables/accessors are rejected by materialization.
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
