/**
 * JSX 收集：`<Button id="x">文字</Button>` 在这里变成普通数据（JNode），不会作为 React 执行。
 * 作者自己写的函数组件（例如复用的页面骨架）会在收集时直接调用，展开成 JNode。
 */

export const NODE = Symbol.for('joplo.node');
export const COMPONENT = Symbol.for('joplo.component');
export const BIND = Symbol.for('joplo.bind');

export type Bind = { readonly [BIND]: string };
export type CondExpr = { readonly $cond: unknown };

export type JNode = {
  readonly [NODE]: true;
  type: string;
  props: Record<string, unknown>;
  children: JChild[];
  /** jsxDEV 提供的源位置（绝对路径:行:列），编译器会改成项目相对路径。 */
  source?: string;
};
export type JChild = JNode | string | number | boolean | null | undefined | Bind | JChild[];

/** 目录组件的标记函数。 */
export type ComponentMarker = ((props: Record<string, unknown>) => never) & { readonly [COMPONENT]: string };

export function component(name: string): ComponentMarker {
  const fn = (() => {
    throw new Error(`${name} is a Joplo component marker and can only be used in JSX`);
  }) as unknown as ComponentMarker;
  Object.defineProperty(fn, COMPONENT, { value: name });
  Object.defineProperty(fn, 'displayName', { value: name });
  return fn;
}

export const isNode = (v: unknown): v is JNode => typeof v === 'object' && v !== null && (v as Record<symbol, unknown>)[NODE] === true;
export const isBind = (v: unknown): v is Bind => (typeof v === 'object' || typeof v === 'function') && v !== null && typeof (v as Record<symbol, unknown>)[BIND] === 'string';
export const bindPath = (b: Bind): string => b[BIND];

export const Fragment = component('#fragment');
/** 布局或页面中的插槽：方案把元素堆叠到这里。 */
export const Slot = component('#slot') as unknown as (props: { name: string }) => JNode;
/** 布局中页面内容的位置。 */
export const Outlet = component('#outlet') as unknown as (props: Record<string, never>) => JNode;

type Source = { fileName?: string; lineNumber?: number; columnNumber?: number } | undefined;

export function createNode(type: unknown, rawProps: Record<string, unknown> | null, source?: Source): JNode {
  const props = { ...(rawProps ?? {}) };
  const children = props.children as JChild | undefined;
  delete props.children;
  const src = source?.fileName ? `${source.fileName}:${source.lineNumber ?? 0}:${source.columnNumber ?? 0}` : undefined;

  if (typeof type === 'string') return mk(type, props, children, src);
  if (typeof type === 'function') {
    const name = (type as Partial<ComponentMarker>)[COMPONENT];
    if (name) return mk(name, props, children, src);
    // 作者自定义的函数组件：收集时展开
    const out = (type as (p: Record<string, unknown>) => unknown)({ ...props, children });
    if (isNode(out)) {
      if (!out.source && src) out.source = src;
      return out;
    }
    return mk('#fragment', {}, out as JChild, src);
  }
  throw new Error(`Unsupported JSX type: ${String(type)}`);
}

function mk(type: string, props: Record<string, unknown>, children: JChild | undefined, source: string | undefined): JNode {
  const node: JNode = { [NODE]: true, type, props, children: children === undefined ? [] : Array.isArray(children) ? children : [children] };
  if (source) node.source = source;
  return node;
}

// ---------- 状态绑定 $ ----------

function makeBind(path: string): Bind {
  const target = function () {} as unknown as Bind;
  return new Proxy(target, {
    get(_t, prop) {
      if (prop === BIND) return path;
      if (prop === Symbol.toPrimitive) return () => `$${path}`;
      if (prop === 'toString' || prop === 'valueOf') return () => `$${path}`;
      if (typeof prop === 'symbol') return undefined;
      return makeBind(`${path}.${prop}`);
    },
    has(_t, prop) {
      return prop === BIND;
    },
  });
}

/** 状态引用：`$.ui.inviteOpen`、`$.data.members`、`$.inputs.in_email`。 */
export const $ = {
  ui: makeBind('ui') as Record<string, any>,
  data: makeBind('data') as Record<string, any>,
  inputs: makeBind('inputs') as Record<string, any>,
};

// ---------- 受控条件 ----------
type Operand = Bind | CondExpr;
const cond = (c: unknown): CondExpr => ({ $cond: c });
const asCond = (x: Operand): unknown => (isBind(x) ? { truthy: bindPath(x) } : (x as CondExpr).$cond);

export const not = (x: Operand): CondExpr => cond(isBind(x) ? { falsy: bindPath(x) } : { not: asCond(x) });
export const eq = (b: Bind, v: unknown): CondExpr => cond({ eq: [bindPath(b), v] });
export const neq = (b: Bind, v: unknown): CondExpr => cond({ neq: [bindPath(b), v] });
export const empty = (b: Bind): CondExpr => cond({ empty: bindPath(b) });
export const notEmpty = (b: Bind): CondExpr => cond({ notEmpty: bindPath(b) });
export const oneOf = (b: Bind, values: unknown[]): CondExpr => cond({ in: [bindPath(b), values] });
export const and = (...xs: Operand[]): CondExpr => cond({ and: xs.map(asCond) });
export const or = (...xs: Operand[]): CondExpr => cond({ or: xs.map(asCond) });

export const isCond = (v: unknown): v is CondExpr => typeof v === 'object' && v !== null && '$cond' in v;
/** 把 Bind 或条件表达式转成 IR 条件。 */
export const toCondition = (x: unknown): unknown => (isBind(x) ? { truthy: bindPath(x) } : isCond(x) ? x.$cond : x);

/** 取调用者位置，用于给 feature/option/flow 步骤记录源位置。 */
export function callsite(depth = 3): string | undefined {
  const line = new Error().stack?.split('\n')[depth];
  const m = line && /\(?((?:file:\/\/)?[^()\s]+?):(\d+):(\d+)\)?\s*$/.exec(line);
  if (!m) return undefined;
  const file = decodeURIComponent(m[1]!.replace(/^file:\/\//, '').replace(/\?.*$/, ''));
  return `${file}:${m[2]}:${m[3]}`;
}
