import { en, type Dictionary } from './en';
export type Text = string | Message;
export type Message = { ns: string; key: string; args: readonly (Text | number)[] };
type Deferred<T> = { [K in keyof T]: T[K] extends (...args: infer A) => string ? (...args: { [I in keyof A]: A[I] extends string | number ? Text | number : A[I] }) => Message : T[K] extends string ? Message : Deferred<T[K]> };
export function deferred<T extends object>(source: T): Deferred<T> {
  return Object.fromEntries(Object.entries(source).map(([ns, entries]) => [ns, Object.fromEntries(Object.entries(entries as object).map(([key,v]) => [key, typeof v === 'function' ? (...args: (Text | number)[]) => ({ns,key,args}) : {ns,key,args:[]}]))])) as unknown as Deferred<T>;
}
export const m = deferred(en);
/** Persist only keys and parameters. Resolve recursively at the rendering boundary. */
export function translate(text: Text, dictionary: object): string {
  if (typeof text === 'string') return text;
  const namespaces = dictionary as Record<string, Record<string, unknown>>;
  const entry = namespaces[text.ns]?.[text.key];
  if (typeof entry === 'function') return entry(...text.args.map((v) => typeof v === 'number' ? v : translate(v,dictionary)));
  return typeof entry === 'string' ? entry : `${text.ns}.${text.key}`;
}
export class MessageError extends Error {
  constructor(readonly text: Text) { super(typeof text === 'string' ? text : `${text.ns}.${text.key}`); }
}
