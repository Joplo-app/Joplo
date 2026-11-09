import { pluginSpec } from './catalog.ts';
import { mapSlotTexts, mapTextPaths } from './plugin-data.ts';
/**
 * 作者内容多语言（D84）：源文件用默认语言写，译文放在 `locales/<语言>.json`（原文 → 译文）。
 *
 * - 编译时把译文放进 IR 的 `i18n.messages`（只留这份 IR 用得到的条目，见 pruneMessages），默认语言没有译文表。
 * - 看板、发布站、服务端都用 localizeProject 把整份 IR 换成某种语言：同一个原文在任何位置都换成同一个译文，
 *   所以状态值与条件里的同一个字面量一起换，比较结果不变；结构字段（id、路径、连线两端、颜色等）从不翻译。
 * - collectMessages 列出这份 IR 里要翻译的原文（joplo i18n add 与 check 用）。状态里的字符串只收显示出来的
 *   （路径和某个绑定重叠），输入值与状态值跳过像代码的单个 ASCII 词（id、邮箱、网址）。
 * - 内容语言只能是界面支持的 10 种（D57），观众选界面语言就是选内容语言；项目没有这种语言时退回默认语言。
 */
import type { Condition, Project, SceneNode, Scenario, Step } from './schema.ts';

/** 内容语言 = 界面支持的 10 种语言（与网页、服务端的 locale 列表一致）。 */
export const CONTENT_LOCALES = ['en', 'zh-CN', 'zh-TW', 'ja', 'ko', 'es', 'fr', 'de', 'pt-BR', 'ru'] as const;
export type ContentLocale = (typeof CONTENT_LOCALES)[number];
export const isContentLocale = (v: unknown): v is ContentLocale => typeof v === 'string' && (CONTENT_LOCALES as readonly string[]).includes(v);

export type ContentI18n = { default: string; locales: string[]; messages: Record<string, Record<string, string>> };

/** 字符串的种类：text = 作者写的显示文字；state = 状态与条件里的值；typed = 动作里输入或选择的值。 */
type Kind = 'text' | 'prop' | 'state' | 'typed';
type Visit = (s: string, kind: Kind, at?: string, path?: string) => string;

const BIND = /^\$(ui|data|inputs)(\.|$)/;
const isBinding = (s: string) => BIND.test(s);
/** 不翻译的属性：引用、样式与枚举。值是字符串时也原样保留。 */
const STRUCTURAL = new Set(['from', 'to', 'accessor', 'target', 'href', 'src', 'type', 'kind', 'tone', 'variant', 'color', 'c', 'bg', 'size', 'radius', 'position', 'direction', 'icon', 'pin', 'states', 'style', 'layout', 'orientation', 'align', 'justify', 'ff', 'fw', 'fz', 'ta', 'shadow', 'dir', 'lang', 'id', 'key', 'side', 'tt', 'td', 'fs', 'lh', 'display', 'pos', 'inset', 'top', 'left', 'right', 'bottom',
  'p', 'px', 'py', 'pt', 'pb', 'pl', 'pr', 'm', 'mx', 'my', 'mt', 'mb', 'ml', 'mr', 'w', 'h', 'maw', 'mah', 'miw', 'mih', 'gap', 'rowGap', 'columnGap', 'gutter', 'spacing', 'verticalSpacing', 'horizontalSpacing',
  'cols', 'span', 'offset', 'order', 'wrap', 'grow', 'mode', 'aspect', 'fit', 'inputMode', 'autoComplete', 'visibleFrom', 'hiddenFrom', 'transition', 'transitionProps', 'loaderProps', 'overlayProps', 'zIndex', 'opacity']);
/** 选项、列表项（数组里的对象）的 value 是选项的身份：照常按同一张表换（和状态值、选择动作的值一致），但收集时当作普通属性（像 id 的单词不收）。 */
const ITEM_VALUE = 'value';

/** 显示文字的属性：收集时不跳过单个英文词（英文项目的按钮名就是一个词）。其余属性里的单个 ASCII 词多半是枚举（sm、blue），不收。 */
/** 每一行都是邮箱或网址：不翻译。 */
const addressLike = (s: string) => s.split('\n').every((l) => /^\s*([^\s@]+@[^\s@]+|https?:\/\/\S+)\s*$/.test(l));

/** 有没有字母（任何文字）：纯数字、符号不翻译。 */
const hasLetter = (s: string) => /\p{L}/u.test(s);
/** 像代码的单个 ASCII 词：id、邮箱、网址、命令参数。只对状态值和输入值跳过。 */
const codeLike = (s: string) => /^[\x21-\x7e]+$/.test(s.trim());

function mapDeep(v: unknown, visit: (s: string, path: string, itemValue: boolean) => string, path: string, inItem = false, itemValue = false): unknown {
  if (typeof v === 'string') return isBinding(v) ? v : visit(v, path, itemValue);
  if (Array.isArray(v)) return v.map((x, i) => mapDeep(x, visit, `${path}.${i}`, true));
  if (v && typeof v === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(v)) out[k] = STRUCTURAL.has(k) ? x : mapDeep(x, visit, `${path}.${k}`, false, inItem && k === ITEM_VALUE);
    return out;
  }
  return v;
}

function mapCondition(c: Condition | undefined, visit: Visit): Condition | undefined {
  if (!c) return c;
  if ('eq' in c) return { eq: [c.eq[0], mapDeep(c.eq[1], (s) => visit(s, 'state'), '')] };
  if ('neq' in c) return { neq: [c.neq[0], mapDeep(c.neq[1], (s) => visit(s, 'state'), '')] };
  if ('in' in c) return { in: [c.in[0], c.in[1].map((x) => mapDeep(x, (s) => visit(s, 'state'), ''))] };
  if ('and' in c) return { and: c.and.map((x) => mapCondition(x, visit)!) };
  if ('or' in c) return { or: c.or.map((x) => mapCondition(x, visit)!) };
  if ('not' in c) return { not: mapCondition(c.not, visit)! };
  return c;
}

function mapNode(n: SceneNode, visit: Visit, plugins: Project['plugins']): SceneNode {
  const out: SceneNode = { ...n, ...(n.ext ? { ext: mapSlotTexts(n.ext, plugins, 'node', s => visit(s, 'text', n.source)) } : {}) };
  if (n.props) {
    const props: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(n.props)) props[k] = STRUCTURAL.has(k) || !(n.type === '#text' && k === 'text' || pluginSpec(plugins, n.type)?.traits?.text?.includes(k)) ? v : mapDeep(v, (s, _p, itemValue) => visit(s, !itemValue ? 'text' : 'prop', n.source), '');
    out.props = mapTextPaths(props, pluginSpec(plugins, n.type)?.traits?.textPaths ?? [], s => isBinding(s) ? s : visit(s, 'text', n.source)) as Record<string, unknown>;
  }
  if (n.children) out.children = n.children.map((c) => mapNode(c, visit, plugins));
  if (n.when) out.when = mapCondition(n.when, visit);
  if (n.disabled && typeof n.disabled === 'object') out.disabled = mapCondition(n.disabled, visit);
  if (n.redact && typeof n.redact === 'object') out.redact = mapCondition(n.redact, visit);
  if (n.disabledReason && !isBinding(n.disabledReason)) out.disabledReason = visit(n.disabledReason, 'text', n.source);
  // 设计备注（看板检查元素时显示；发布站没有）
  if (n.note) out.note = visit(n.note, 'text', n.source);
  return out;
}

const t = (s: string | undefined, visit: Visit, at?: string) => (s ? visit(s, 'text', at) : s);
const stateMap = (v: unknown, base: string, visit: Visit) => mapDeep(v, (s, p) => visit(s, 'state', undefined, `${base}${p}`), '');

function mapStep(st: Step, visit: Visit, plugins: Project['plugins']): Step {
  const at = st.source;
  const a = st.action;
  const action: Step['action'] =
    a.type === 'card' ? { ...a, title: visit(a.title, 'text', at), ...(a.sub ? { sub: visit(a.sub, 'text', at) } : {}), ...(a.points ? { points: a.points.map((p) => visit(p, 'text', at)) } : {}) }
      : a.type === 'type' || a.type === 'select' ? { ...a, value: visit(a.value, 'typed', at) }
        : a.type === 'event' ? { ...a, name: visit(a.name, 'text', at) }
          : a;
  const effects = st.effects.map((e): Step['effects'][number] => {
    if (e.type === 'set' || e.type === 'append') return { ...e, value: stateMap(e.value, e.path, visit) as typeof e.value };
    if (e.type === 'stream') return { ...e, value: visit(e.value, 'text', at) };
    if (e.type === 'toast' || e.type === 'complete') return { ...e, text: visit(e.text, 'text', at) };
    return e;
  });
  return {
    ...st,
    ...(st.ext ? { ext: mapSlotTexts(st.ext, plugins, 'step', s => visit(s, 'text', st.source)) } : {}),
    action,
    // 自动字幕是英文兜底，网页按 captionAuto 生成；只换它引用的元素名和值
    caption: st.captionAuto ? st.caption : visit(st.caption, 'text', at),
    ...(st.captionAuto ? { captionAuto: { ...st.captionAuto, label: visit(st.captionAuto.label, 'state'), ...(st.captionAuto.value !== undefined ? { value: visit(st.captionAuto.value, 'state') } : {}) } } : {}),
    effects,
    ...(st.explain ? { explain: visit(st.explain, 'text', at) } : {}),
    ...(st.say ? { say: visit(st.say, 'text', at) } : {}),
    ...(st.narrate ? { narrate: visit(st.narrate, 'text', at) } : {}),
    ...(st.callouts ? { callouts: st.callouts.map((c) => ({ ...c, text: visit(c.text, 'text', at) })) } : {}),
    marks: st.marks.map((m) => (m.note ? { ...m, note: visit(m.note, 'text', at) } : m)),
    forks: st.forks.map((f) => ({ ...f, label: visit(f.label, 'text', at) })),
  };
}

function mapScenario(sc: Scenario, visit: Visit, plugins: Project['plugins']): Scenario {
  const at = sc.source;
  return {
    ...sc,
    ...(sc.ext ? { ext: mapSlotTexts(sc.ext, plugins, 'step', s => visit(s, 'text', sc.source)) } : {}),
    name: visit(sc.name, 'text', at),
    description: t(sc.description, visit, at) ?? '',
    ...(sc.expected !== undefined ? { expected: t(sc.expected, visit, at) ?? '' } : {}),
    mock: sc.mock.auto ? sc.mock : { ...sc.mock, label: visit(sc.mock.label, 'text', at) },
    initial: { ...sc.initial, ui: stateMap(sc.initial.ui, 'ui', visit) as Record<string, unknown>, data: stateMap(sc.initial.data, 'data', visit) as Record<string, unknown>, inputs: stateMap(sc.initial.inputs, 'inputs', visit) as Record<string, unknown> },
    steps: sc.steps.map((st) => mapStep(st, visit, plugins)),
  };
}

/** 对 IR 里所有作者内容字符串调用 visit，返回替换后的新 IR（不改原对象）。 */
function mapProject(p: Project, visit: Visit): Project {
  // 缺字段（旧 IR、测试里的最小 IR）原样保留，不补空对象
  const obj = <T>(o: Record<string, T>, f: (v: T) => T) => (o ? Object.fromEntries(Object.entries(o).map(([k, v]) => [k, f(v)])) : o);
  const arr = <T>(a: T[], f: (v: T) => T) => (a ? a.map(f) : a);
  return {
    ...p,
    name: visit(p.name, 'text'),
    description: t(p.description, visit) ?? '',
    routes: obj(p.routes, (r) => ({ ...r, title: visit(r.title, 'text', r.source) })),
    features: obj(p.features, (f) => ({ ...f, name: visit(f.name, 'text', f.source), goal: visit(f.goal, 'text', f.source), roles: arr(f.roles, (r) => ({ ...r, name: visit(r.name, 'text', f.source), ...(r.desc ? { desc: visit(r.desc, 'text', f.source) } : {}) })), constraints: arr(f.constraints, (c) => ({ ...c, text: visit(c.text, 'text', f.source) })) })),
    options: obj(p.options, (o) => ({
      ...o,
      name: visit(o.name, 'text', o.source),
      idea: visit(o.idea, 'text', o.source),
      ...(o.decisionFocus !== undefined ? { decisionFocus: t(o.decisionFocus, visit, o.source) ?? '' } : {}),
      tradeoffs: arr(o.tradeoffs, (x) => visit(x, 'text', o.source)),
      coverage: obj(o.coverage, (c) => (c.reason ? { ...c, reason: visit(c.reason, 'text', o.source) } : c)),
      layers: obj(o.layers, (l) => ({ ...l, title: visit(l.title, 'text', o.source) })),
    })),
    // 创作侧信息（看板与评审里显示；发布站不带，所以发布 IR 里收不到也不带译文）
    cases: obj(p.cases, (c) => ({ ...c, title: visit(c.title, 'text', c.source), expected: t(c.expected, visit, c.source) ?? '' })),
    rules: obj(p.rules, (r) => ({ ...r, text: visit(r.text, 'text', r.source) })),
    issues: obj(p.issues, (q) => ({ ...q, text: visit(q.text, 'text', q.source) })),
    scenes: obj(p.scenes, (s) => ({ ...s, root: mapNode(s.root, visit, p.plugins) })),
    scenarios: obj(p.scenarios, (s) => mapScenario(s, visit, p.plugins)),
  };
}

/** 画面里显示出来的状态路径（文字、属性、禁用原因里的绑定）。 */
function boundPaths(p: Project): string[] {
  const out = new Set<string>();
  const add = (s: string) => {
    if (isBinding(s)) out.add(s.slice(1));
  };
  const walk = (v: unknown) => {
    if (typeof v === 'string') add(v);
    else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === 'object') Object.values(v).forEach(walk);
  };
  const node = (n: SceneNode) => {
    if (n.props) for (const [k, v] of Object.entries(n.props)) if (k !== 'style') walk(v);
    if (n.disabledReason) add(n.disabledReason);
    n.children?.forEach(node);
  };
  for (const s of Object.values(p.scenes)) node(s.root);
  return [...out];
}

const overlaps = (a: string, b: string) => a === b || a.startsWith(`${b}.`) || b.startsWith(`${a}.`);

export type MessageUse = { text: string; at?: string };

/** 这份 IR 里要翻译的原文（去重，按首次出现的顺序；at 是第一次出现的源位置）。 */
export function collectMessages(p: Project): MessageUse[] {
  const shown = boundPaths(p);
  const seen = new Map<string, MessageUse>();
  mapProject(p, (s, kind, at, path) => {
    const text = s;
    if (!text.trim() || !hasLetter(text) || addressLike(text) || seen.has(text)) return s;
    if (kind === 'state' && (!path || codeLike(text) || !shown.some((b) => overlaps(b, path)))) return s;
    if ((kind === 'typed' || kind === 'prop') && codeLike(text)) return s;
    seen.set(text, { text, ...(at ? { at } : {}) });
    return s;
  });
  return [...seen.values()];
}

/** 把 IR 换成某种语言；没有 i18n、语言是默认语言或没有译文表时原样返回。 */
export function localizeProject(p: Project, locale: string | null | undefined): Project {
  const i18n = p.i18n;
  if (!i18n || !locale || locale === i18n.default) return p;
  const table = i18n.messages[locale];
  if (!table || !Object.keys(table).length) return p;
  return mapProject(p, (s) => (Object.hasOwn(table, s) && table[s] ? table[s]! : s));
}

/** 观众的界面语言对应的内容语言：项目有这种语言就用它，否则退回默认语言（用户 2026-11-08 选定）。没有 i18n 时为 null。 */
export function contentLocaleFor(p: Pick<Project, 'i18n'>, uiLocale: string | null | undefined): string | null {
  const i18n = p.i18n;
  if (!i18n) return null;
  return uiLocale && i18n.locales.includes(uiLocale) ? uiLocale : i18n.default;
}

/** 只留这份 IR 用得到的译文（编译、范围分享之后调用，不带别的功能的文字）。 */
export function pruneMessages(p: Project): Project {
  if (!p.i18n) return p;
  const used = new Set(collectMessages(p).map((m) => m.text));
  const messages = Object.fromEntries(Object.entries(p.i18n.messages).map(([l, table]) => [l, Object.fromEntries(Object.entries(table).filter(([k, v]) => used.has(k) && v))]));
  return { ...p, i18n: { ...p.i18n, messages } };
}

/** 编辑距离（按码点）。 */
function distance(a: string, b: string): number {
  const x = [...a], y = [...b];
  let prev = Array.from({ length: y.length + 1 }, (_, j) => j);
  for (let i = 1; i <= x.length; i++) {
    const cur = [i];
    for (let j = 1; j <= y.length; j++) cur[j] = Math.min(prev[j]! + 1, cur[j - 1]! + 1, prev[j - 1]! + (x[i - 1] === y[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[y.length]!;
}

/** 最接近的旧条目（原文改过时给 check 提示）：编辑距离不超过较长一方的一半；没有时为 null。 */
export function nearestKey(text: string, candidates: readonly string[]): string | null {
  let best: string | null = null;
  let bestD = Infinity;
  for (const c of candidates) {
    const d = distance(text, c);
    const limit = Math.max([...text].length, [...c].length) / 2;
    if (d <= limit && d < bestD) {
      best = c;
      bestD = d;
    }
  }
  return best;
}
