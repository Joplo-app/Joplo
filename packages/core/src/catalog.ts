import type { PluginDataSpec, ElementTraits } from '@joplo-app/kit/plugin';
export const COMPONENT_TYPES = ['Custom', '#text', '#fragment'] as const;
export type ComponentType = (typeof COMPONENT_TYPES)[number];
export type ComponentInfo = { interactive?: boolean; parent?: string; needsId?: boolean; selfEvident?: boolean; traits?: ElementTraits };
export const JOPLO_PROPS = ['id', 'when', 'disabledReason', 'unmodeled', 'note', 'redact'] as const;
// ---------- 插件组件（D86）----------
/** 插件组件的类型名：`<插件 id>:<组件名>`（例如 scene3d:Target）。目录组件的名字里没有冒号。 */
export const PLUGIN_TYPE = /^[a-z][a-z0-9-]*:[A-Za-z][A-Za-z0-9]*(\.[A-Za-z][A-Za-z0-9]*)*$/;
export type PluginComponentType = `${string}:${string}`;
export const isPluginType = (type: string): type is PluginComponentType => PLUGIN_TYPE.test(type);
/** 插件 id 与组件名：scene3d:Scene.Part → { plugin: 'scene3d', name: 'Scene.Part' }。 */
export const splitPluginType = (type: string): { plugin: string; name: string } | null => {
  if (!isPluginType(type)) return null;
  const i = type.indexOf(':');
  return { plugin: type.slice(0, i), name: type.slice(i + 1) };
};
/** IR 里记录的插件信息（编译自插件清单；发布站保留，不含运行时路径）。 */
export type PluginInfo = { actions?: Record<string, import('@joplo-app/kit/plugin').PluginActionSpec>; themes?: Record<string, string>; properties?: Record<string, import('@joplo-app/kit/plugin').PluginPropertySpec>; data?: PluginDataSpec; id: string; title: string; version?: string; components: Record<string, ComponentInfo> };
export type PluginTable = Readonly<Record<string, PluginInfo>> | undefined;
/** 插件组件的声明；不是插件类型或插件没启用时为 null。 */
export function pluginSpec(plugins: PluginTable, type: string): ComponentInfo | null {
  const t = splitPluginType(type);
  return (t && plugins?.[t.plugin]?.components[t.name]) || null;
}
/** 可操作的类型：声明了 interactive 的插件组件。 */
export function isInteractiveType(type: string, plugins?: PluginTable): boolean {
  return pluginSpec(plugins, type)?.interactive === true;
}

// ---------- 响应式（Mantine 默认断点，按舞台宽度取值） ----------

/** Mantine 默认断点：36/48/62/75/88em，按 16px 换算。 */
export const BREAKPOINTS = { xs: 576, sm: 768, md: 992, lg: 1200, xl: 1408 } as const;
export type Breakpoint = keyof typeof BREAKPOINTS;
const BP_KEYS = ['base', 'xs', 'sm', 'md', 'lg', 'xl'] as const;

/** 页面 viewport 对应的舞台尺寸。 */
export const VIEWPORT_SIZE = { desktop: { width: 1280, height: 800 }, mobile: { width: 390, height: 844 } } as const;

/**
 * 内置主题（D51）：每个主题是一个只写 CSS 变量（--jp-*）的样式表，CSS 在 web 包里（renderer/themes.ts）。
 * 作者可以在项目根目录 themes/<name>.css 写自己的主题；与内置同名时用作者的。
 */
export const BUILTIN_THEMES = ['sketch', 'clean', 'blueprint', 'nord', 'dracula', 'solarized-light', 'terminal', 'kraft', 'contrast'] as const;
/** 主题名：字母开头，字母、数字、连字符、下划线（也是 themes/ 下的文件名）。 */
export const THEME_NAME = /^[A-Za-z][\w-]*$/;

/**
 * 看板外观（D55）：配色仍是主题名；字体与线条可以单独选，null = 跟随主题。
 * 只在本机看板与导出的图片 / 视频里生效，发布站（joplo.config.ts）暂不支持。只用本机字体（手写体是已打包的 Excalifont + 小赖）。
 */
export const APPEARANCE_FONTS = ['hand', 'sans', 'serif', 'kai', 'mono'] as const;
export type AppearanceFont = (typeof APPEARANCE_FONTS)[number];
export const APPEARANCE_STROKES = ['rough', 'clean'] as const;
export type AppearanceStroke = (typeof APPEARANCE_STROKES)[number];
export const isAppearanceFont = (v: unknown): v is AppearanceFont => typeof v === 'string' && (APPEARANCE_FONTS as readonly string[]).includes(v);
export const isAppearanceStroke = (v: unknown): v is AppearanceStroke => typeof v === 'string' && (APPEARANCE_STROKES as readonly string[]).includes(v);

/** 字幕的“字数”：中文（及其他全角字符）一个算 1，英文、数字、标点按 0.5 算；空白不算。check 用它提示说明与 explain 过长。 */
export function captionLength(s: string): number {
  let n = 0;
  for (const ch of s) {
    if (/\s/.test(ch)) continue;
    n += (ch.codePointAt(0) ?? 0) > 0x2e80 ? 1 : 0.5;
  }
  return n;
}
/** 说明 / explain 的建议上限（超过时 check 报 CAPTION_TOO_LONG / EXPLAIN_TOO_LONG）。 */
export const CAPTION_MAX = 24;
export const EXPLAIN_MAX = 48;
/** 旁白 say() 的建议上限（D74，超过时 check 报 SAY_TOO_LONG）：读出来约 10 秒。 */
export const SAY_MAX = 80;
/**
 * 叙事提示（D67，见 docs/research/storytelling-and-demos.md）：
 * - 封面说明（flow 的 description）：D61 定为 30 字以内，超过时 DESCRIPTION_TOO_LONG；
 * - 过渡卡：副标题与 explain 同上限、每条要点与说明同上限、最多 4 条要点，超过时 CARD_TEXT_TOO_LONG（info）；
 * - 单个场景按 1× 估算超过 90 秒时 SCENARIO_TOO_LONG（info）：一个场景讲一件事，长流程拆成几个场景或用 fork。
 */
export const DESCRIPTION_MAX = 30;
export const CARD_POINTS_MAX = 4;
export const SCENARIO_MS_MAX = 90_000;

/** 没有声明 layers 的方案：镜头作用在路径页面上，记为这个伪层级（不出现在层级栏）。作者的层级键不能以 @ 开头。 */
export const PAGE_LAYER = '@page';
/** shot()（不带 id）在有层级的方案里：作用于“当时导演所在的层”，让它回到整体。 */
export const DIRECTOR_LAYER = '@director';

/** Child viewport width is declared by the plugin, never inferred from a type name. */
export function childWidth(node: { traits?: ElementTraits }, width: number, props?: Record<string, unknown>): number {
  const spec = node.traits?.childWidth;
  if (!spec) return width;
  return spec.when && props?.[spec.when.prop] === spec.when.value ? spec.when.width : spec.value;
}

/** 是否为响应式对象 `{ base, sm, md }`：普通对象，至少一个键，且全部键都是断点名。 */
export function isResponsive(v: unknown): v is Partial<Record<(typeof BP_KEYS)[number], unknown>> {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return false;
  const keys = Object.keys(v);
  return keys.length > 0 && keys.every((k) => (BP_KEYS as readonly string[]).includes(k));
}

/** 按舞台宽度取响应式属性的值：取不超过宽度的最大断点；都不满足时取 base；非响应式值原样返回。 */
export function atWidth(v: unknown, width: number): unknown {
  if (!isResponsive(v)) return v;
  let out: unknown = undefined;
  for (const k of BP_KEYS) {
    if (!(k in v)) continue;
    const min = k === 'base' ? 0 : BREAKPOINTS[k];
    if (width >= min) out = v[k];
  }
  return out;
}

/** 断点名、数字（px）或 `40em` / `600px` 字符串 → 像素；无法识别返回 null。 */
export function breakpointPx(bp: unknown): number | null {
  if (typeof bp === 'number' && Number.isFinite(bp)) return bp;
  if (typeof bp !== 'string') return null;
  if (bp in BREAKPOINTS) return BREAKPOINTS[bp as Breakpoint];
  const m = /^(\d+(?:\.\d+)?)(px|em|rem)?$/.exec(bp.trim());
  if (!m) return null;
  return m[2] === 'em' || m[2] === 'rem' ? Number(m[1]) * 16 : Number(m[1]);
}

/** visibleFrom / hiddenFrom：在给定舞台宽度下是否被隐藏。 */
export function hiddenAtWidth(props: Record<string, unknown> | undefined, width: number): boolean {
  if (!props) return false;
  const from = breakpointPx(props.visibleFrom);
  if (from !== null && width < from) return true;
  const until = breakpointPx(props.hiddenFrom);
  if (until !== null && width >= until) return true;
  return false;
}

// ---------- 数据声明的选项 ----------

export type Choice = { value: string; label: string };

/** Mantine 的 data：string[]、{ value, label }[]，或分组 { group, items }[]。 */
export function choicesFromData(data: unknown): Choice[] {
  if (!Array.isArray(data)) return [];
  const out: Choice[] = [];
  for (const d of data) {
    if (typeof d === 'string' || typeof d === 'number') out.push({ value: String(d), label: String(d) });
    else if (d && typeof d === 'object') {
      const o = d as Record<string, unknown>;
      if (Array.isArray(o.items)) out.push(...choicesFromData(o.items));
      else if (o.value !== undefined && o.value !== null) out.push({ value: String(o.value), label: typeof o.label === 'string' ? o.label : String(o.value) });
    }
  }
  return out;
}

/** 按 value 或 label 匹配一个选项。 */
export function matchChoice(choices: Choice[], v: string): Choice | null {
  return choices.find((c) => c.value === v) ?? choices.find((c) => c.label === v) ?? null;
}

// ---------- 标签 ----------

const IS_BINDING = /^\$(?:ui|data|inputs)(?:\.|$)/;

type LabelNode = { type: string; props?: Record<string, unknown>; children?: LabelNode[] };

/** 元素的人类可读标签：优先 label/title/aria-label/placeholder 等属性（Mantine 输入组件直接带 label），其次子文本。 */
export function nodeLabel(node: LabelNode): string {
  const p = node.props ?? {};
  for (const k of ['label', 'title', 'aria-label', 'placeholder', 'name', 'kind', 'alt']) {
    const v = p[k];
    if (typeof v === 'string' && v && !IS_BINDING.test(v)) return v;
  }
  // 没有 label 的连线 / 转换 / 消息：「from → to」
  if (typeof p.from === 'string' && typeof p.to === 'string') return `${p.from} → ${p.to}`;
  const text = collectText(node).trim();
  return text || node.type;
}

function collectText(node: LabelNode): string {
  if (node.type === '#text') {
    const t = node.props?.text;
    return typeof t === 'string' && !IS_BINDING.test(t) ? t : '';
  }
  return (node.children ?? []).map(collectText).join('');
}
