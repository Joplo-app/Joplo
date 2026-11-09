type StateChange = {path:string;before:unknown;after:unknown};
const binding = (value: unknown) => typeof value === 'string' && /^\$(ui|data|inputs)(\.[A-Za-z0-9_-]+)*$/.test(value) ? value.slice(1) : null;
const at = (v: unknown, keys: string[]) => keys.reduce<unknown>((o, k) => o && typeof o === 'object' ? (o as Record<string, unknown>)[k] : undefined, v);
/** 匹配绑定本身、祖先替换及子字段变化；子字段变化聚合成局部前后值。 */
export function changeFor(value: unknown, changes: readonly StateChange[]): StateChange | null {
  const path = binding(value);
  if (!path) return null;
  const exact = changes.find(c => c.path === path);
  if (exact) return exact;
  const parent = changes.find(c => path.startsWith(`${c.path}.`));
  if (parent) {
    const keys = path.slice(parent.path.length + 1).split('.');
    const before = at(parent.before, keys), after = at(parent.after, keys);
    return JSON.stringify(before) === JSON.stringify(after) ? null : { path, before, after };
  }
  const children = changes.filter(c => c.path.startsWith(`${path}.`));
  if (!children.length) return null;
  const before: Record<string, unknown> = {}, after: Record<string, unknown> = {};
  const put = (o: Record<string, unknown>, keys: string[], v: unknown) => {
    for (const k of keys.slice(0, -1)) { o[k] ??= {}; o = o[k] as Record<string, unknown>; }
    o[keys.at(-1)!] = v;
  };
  for (const c of children) { const keys = c.path.slice(path.length + 1).split('.'); put(before, keys, c.before); put(after, keys, c.after); }
  return { path, before, after };
}
export function dataRows(value: unknown, fields: unknown, rawBinding: unknown, changes: readonly StateChange[]) {
  const obj = value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const selected = Array.isArray(fields) ? fields.flatMap(f => f && typeof f === 'object' && typeof f.key === 'string' ? [{ key: f.key as string, label: typeof f.label === 'string' ? f.label : f.key as string }] : []) : Object.keys(obj).map(key => ({ key, label: key }));
  return selected.map(f => ({ ...f, value: obj[f.key], change: binding(rawBinding) ? changeFor(`${rawBinding}.${f.key}`, changes) : null }));
}
export function stateFlowItems(value: unknown, states: unknown, labels: unknown) {
  const list: string[] = Array.isArray(states) ? states.filter((v): v is string => typeof v === 'string' && v.length > 0) : [];
  const names = labels && typeof labels === 'object' ? labels as Record<string, unknown> : {};
  const current = list.indexOf(String(value ?? ''));
  return list.map((v, i) => ({ value: v, label: typeof names[v] === 'string' ? names[v] as string : v, state: i === current ? 'current' as const : current >= 0 && i < current ? 'done' as const : 'todo' as const }));
}
export function displayData(v: unknown): string { return v === undefined || v === null || v === '' ? '—' : typeof v === 'object' ? JSON.stringify(v) : String(v); }
