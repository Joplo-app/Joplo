/**
 * 结构校验（zod）问题 → 作者能直接改的诊断。
 *
 * 不变量：
 * - 定位取路径上最近一个带 `source` 的对象（通常是作者写的 JSX 元素），而不是整份 IR 的根；
 * - 同一个根因（同一源位置、同一代码、同一说明）在多个画面 / 层级里展开时只输出一条，
 *   说明后面附 “affects N views”，`affects` 列出受影响的画面或对象（新增字段，旧字段不变）；
 * - `when` 收到普通值（布尔、数字、字符串、null）时给出专门的 INVALID_CONDITION 说明，其余仍是 INVALID_SCHEMA。
 * 计数语义：合并后的每一条只算一个 error。
 */
import type { Diagnostic } from './result.ts';

export type SchemaIssue = { readonly path: readonly PropertyKey[]; readonly message: string };

/** `when` 只接受条件表达式：说明里给出可直接照抄的写法。 */
export function whenMessage(value: unknown, element?: string): string {
  const shown = typeof value === 'string' ? JSON.stringify(value) : String(value);
  return `${element ? `<${element}> ` : ''}when received a plain ${value === null ? 'null' : typeof value} (${shown}); when accepts only condition expressions bound to state, `
    + `e.g. when={$.ui.sent}, when={not($.ui.sent)}, when={eq($.ui.mode, 'code')}. `
    + `For a value already known while writing, render conditionally in your own code instead: {showHint && <Alert …/>}`;
}

const isPlain = (v: unknown) => v === null || ['boolean', 'number', 'string'].includes(typeof v);

/**
 * root 是被校验的对象（编译中的 IR），issues 是 zod 的问题列表。
 * rel 把绝对源路径转成项目相对路径（compile 传入；validate 读的 IR 已是相对路径）。
 */
export function schemaDiagnostics(root: unknown, issues: readonly SchemaIssue[], opts: { limit?: number; rel?: (s: string) => string | undefined } = {}): Diagnostic[] {
  const groups = new Map<string, { diagnostic: Diagnostic; affects: string[] }>();
  for (const issue of issues) {
    const path = issue.path.map(String);
    let value: unknown = root;
    let at: string | undefined;
    let element: string | undefined;
    let sourced = -1;
    let reached = true;
    for (let i = 0; i < path.length; i++) {
      if (value && typeof value === 'object') {
        const record = value as Record<string, unknown>;
        if (typeof record.source === 'string') { at = record.source; sourced = i; element = typeof record.type === 'string' && !record.type.startsWith('#') ? record.type : undefined; }
        value = record[path[i]!];
      } else { reached = false; break; }
    }
    // 叶子本身带 source（例如整条 Step 不合法）时也用它
    if (reached && value && typeof value === 'object' && typeof (value as Record<string, unknown>).source === 'string') {
      at = (value as Record<string, string>).source; sourced = path.length; element = undefined;
    }
    const where = at ? (opts.rel?.(at) ?? at) : undefined;
    const local = sourced >= 0 ? path.slice(sourced).join('.') : '';
    const full = path.join('.') || 'project';
    const condition = reached && path.at(-1) === 'when' && isPlain(value) && sourced === path.length - 1;
    const code = condition ? 'INVALID_CONDITION' : 'INVALID_SCHEMA';
    // 有源位置时说明只写元素内的相对路径，这样展开到多个画面的同一错误说明相同、能合并
    const message = condition ? whenMessage(value, element) : where ? `${element ? `<${element}> ` : ''}${local || full}: ${issue.message}` : `${full}: ${issue.message}`;
    // 受影响的对象：画面 id（scenes.<id>）或表名 + id（works.<id> 等）
    const scope = path.length >= 2 ? (path[0] === 'scenes' ? path[1]! : `${path[0]}.${path[1]}`) : full;
    const key = JSON.stringify([code, where ?? full, message]);
    const group = groups.get(key);
    if (group) { if (!group.affects.includes(scope)) group.affects.push(scope); continue; }
    groups.set(key, { diagnostic: { severity: 'error', code, message, source: 'schema', ...(where ? { at: where } : {}) }, affects: [scope] });
  }
  const out = [...groups.values()].map(({ diagnostic, affects }) => affects.length > 1 ? { ...diagnostic, message: `${diagnostic.message} (affects ${affects.length} views)`, affects } : diagnostic);
  return opts.limit === undefined ? out : out.slice(0, opts.limit);
}
