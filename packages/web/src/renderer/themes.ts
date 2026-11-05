/**
 * 主题（D51）：一个主题就是一段 CSS。Joplo 约定一组 CSS 变量（--jp-*），渲染器、Diagram、Terminal、Phone、高光与字幕
 * 都只读这些变量；主题也可以写普通选择器做细调。主题 CSS 自动限定在舞台范围内（scopeThemeCss），不影响看板本身。
 *
 * 变量（THEME_VARS）：
 *   --jp-font / --jp-font-mono / --jp-font-size   正文字体、等宽字体、正文字号
 *   --jp-ink      主要文字与线条          --jp-bg       舞台底色
 *   --jp-surface  卡片、输入框、节点的底   --jp-subtle   次级底色（分段控件、气泡、进度条底）
 *   --jp-muted    次要文字                --jp-faint    占位、禁用文字
 *   --jp-line     分隔线、浅边框          --jp-line-strong 较深的边框（未完成的步骤、dim 状态）
 *   --jp-border   线框描边（--jp-stroke: clean 时的组件边框）
 *   --jp-accent   高光、焦点、示例输入     --jp-select   ⌥+单击选中的元素
 *   --jp-info     Diagram active（流动）  --jp-ok / --jp-warn / --jp-danger  成功 / 警告 / 错误
 *   --jp-radius   圆角                    --jp-shadow   卡片阴影
 *   --jp-stroke   rough = Rough 手绘描边；clean = 细线边框
 */

export type StrokeMode = 'rough' | 'clean';
export type ThemeInfo = { name: string; title: string; css: string; builtin: boolean; stroke: StrokeMode; dark: boolean };

export const THEME_VARS = [
  '--jp-font',
  '--jp-font-mono',
  '--jp-font-size',
  '--jp-ink',
  '--jp-bg',
  '--jp-surface',
  '--jp-subtle',
  '--jp-muted',
  '--jp-faint',
  '--jp-line',
  '--jp-line-strong',
  '--jp-border',
  '--jp-accent',
  '--jp-select',
  '--jp-info',
  '--jp-ok',
  '--jp-warn',
  '--jp-danger',
  '--jp-radius',
  '--jp-shadow',
  '--jp-stroke',
] as const;

const HAND = '"Joplo Excalifont", "Joplo Xiaolai", "PingFang SC", sans-serif';
const SYSTEM = 'system-ui, -apple-system, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif';
const MONO = 'ui-monospace, SFMono-Regular, Menlo, "Joplo Xiaolai", monospace';

type Vars = Partial<Record<(typeof THEME_VARS)[number], string>>;
const block = (v: Vars, extra = '') => `:root {\n${Object.entries(v).map(([k, x]) => `  ${k}: ${x};`).join('\n')}\n}\n${extra}`;

/** 手绘（默认）：与 T-theme 之前的 sketch 主题视觉一致。 */
const SKETCH: Vars = {
  '--jp-font': HAND,
  '--jp-font-mono': MONO,
  '--jp-font-size': '16px',
  '--jp-ink': '#1e1e1e',
  '--jp-bg': '#ffffff',
  '--jp-surface': '#ffffff',
  '--jp-subtle': '#f1f3f5',
  '--jp-muted': '#868e96',
  '--jp-faint': '#9a9a9a',
  '--jp-line': '#dee2e6',
  '--jp-line-strong': '#adb5bd',
  '--jp-border': '#3a3a3a',
  '--jp-accent': '#e8590c',
  '--jp-select': '#6741d9',
  '--jp-info': '#1c7ed6',
  '--jp-ok': '#2b8a3e',
  '--jp-warn': '#e67700',
  '--jp-danger': '#e03131',
  '--jp-radius': '4px',
  '--jp-shadow': '4px 4px 0 rgba(30, 30, 30, 0.12)',
  '--jp-stroke': 'rough',
};

export const BUILTIN: { name: string; title: string; dark: boolean; vars: Vars; extra?: string }[] = [
  { name: 'sketch', title: '手绘', dark: false, vars: SKETCH },
  {
    name: 'clean',
    title: '线框',
    dark: false,
    vars: { ...SKETCH, '--jp-font': SYSTEM, '--jp-font-size': '15px', '--jp-shadow': '0 1px 3px rgba(0, 0, 0, 0.08), 0 4px 12px rgba(0, 0, 0, 0.06)', '--jp-stroke': 'clean' },
  },
  {
    name: 'blueprint',
    title: '蓝图',
    dark: true,
    vars: {
      '--jp-font': SYSTEM, '--jp-font-mono': MONO, '--jp-font-size': '15px',
      '--jp-ink': '#f1f6ff', '--jp-bg': '#0f3b73', '--jp-surface': '#144887', '--jp-subtle': '#1b569c',
      '--jp-muted': '#a9c4ec', '--jp-faint': '#86a6d6', '--jp-line': '#3f6ead', '--jp-line-strong': '#7898c9', '--jp-border': '#e3edff',
      '--jp-accent': '#ffd43b', '--jp-select': '#ff9be0', '--jp-info': '#74c0fc', '--jp-ok': '#8ce99a', '--jp-warn': '#ffc078', '--jp-danger': '#ff8787',
      '--jp-radius': '2px', '--jp-shadow': 'none', '--jp-stroke': 'clean',
    },
    // 蓝图：画布上的网格
    extra: `:root { background-image: linear-gradient(rgba(255,255,255,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.06) 1px, transparent 1px); background-size: 24px 24px; }\n`,
  },
  {
    name: 'nord',
    title: 'Nord',
    dark: true,
    vars: {
      '--jp-font': SYSTEM, '--jp-font-mono': MONO, '--jp-font-size': '15px',
      '--jp-ink': '#eceff4', '--jp-bg': '#2e3440', '--jp-surface': '#3b4252', '--jp-subtle': '#434c5e',
      '--jp-muted': '#aab3c3', '--jp-faint': '#8590a3', '--jp-line': '#4c566a', '--jp-line-strong': '#6f7b94', '--jp-border': '#d8dee9',
      '--jp-accent': '#ebcb8b', '--jp-select': '#d6a4cf', '--jp-info': '#88c0d0', '--jp-ok': '#a3be8c', '--jp-warn': '#e3a07c', '--jp-danger': '#ef8b93',
      '--jp-radius': '8px', '--jp-shadow': '0 4px 14px rgba(0, 0, 0, 0.25)', '--jp-stroke': 'clean',
    },
  },
  {
    name: 'dracula',
    title: 'Dracula',
    dark: true,
    vars: {
      '--jp-font': SYSTEM, '--jp-font-mono': MONO, '--jp-font-size': '15px',
      '--jp-ink': '#f8f8f2', '--jp-bg': '#282a36', '--jp-surface': '#343746', '--jp-subtle': '#44475a',
      '--jp-muted': '#aeb4d8', '--jp-faint': '#8890bb', '--jp-line': '#4f536b', '--jp-line-strong': '#6d76a8', '--jp-border': '#bd93f9',
      '--jp-accent': '#ffb86c', '--jp-select': '#ff79c6', '--jp-info': '#8be9fd', '--jp-ok': '#50fa7b', '--jp-warn': '#f1fa8c', '--jp-danger': '#ff6e6e',
      '--jp-radius': '8px', '--jp-shadow': '0 4px 14px rgba(0, 0, 0, 0.3)', '--jp-stroke': 'clean',
    },
  },
  {
    name: 'solarized-light',
    title: 'Solarized Light',
    dark: false,
    vars: {
      '--jp-font': SYSTEM, '--jp-font-mono': MONO, '--jp-font-size': '15px',
      '--jp-ink': '#073642', '--jp-bg': '#fdf6e3', '--jp-surface': '#fffdf6', '--jp-subtle': '#eee8d5',
      '--jp-muted': '#5f747c', '--jp-faint': '#839496', '--jp-line': '#e3dcc6', '--jp-line-strong': '#bfb698', '--jp-border': '#586e75',
      '--jp-accent': '#cb4b16', '--jp-select': '#6c71c4', '--jp-info': '#268bd2', '--jp-ok': '#5f7a00', '--jp-warn': '#a07800', '--jp-danger': '#dc322f',
      '--jp-radius': '6px', '--jp-shadow': '0 1px 3px rgba(7, 54, 66, 0.12)', '--jp-stroke': 'clean',
    },
  },
  {
    name: 'terminal',
    title: '复古终端',
    dark: true,
    vars: {
      '--jp-font': 'SFMono-Regular, Menlo, ui-monospace, "Joplo Xiaolai", monospace', '--jp-font-mono': 'SFMono-Regular, Menlo, ui-monospace, "Joplo Xiaolai", monospace', '--jp-font-size': '14px',
      '--jp-ink': '#3dff6e', '--jp-bg': '#050a06', '--jp-surface': '#0b150d', '--jp-subtle': '#112016',
      '--jp-muted': '#2fbf58', '--jp-faint': '#1f8a3e', '--jp-line': '#1a4a27', '--jp-line-strong': '#2a7a40', '--jp-border': '#3dff6e',
      '--jp-accent': '#ffd000', '--jp-select': '#ff6ad5', '--jp-info': '#5cdcff', '--jp-ok': '#c4ff4d', '--jp-warn': '#ffb000', '--jp-danger': '#ff5f56',
      '--jp-radius': '0px', '--jp-shadow': 'none', '--jp-stroke': 'clean',
    },
    extra: `:root { text-shadow: 0 0 6px rgba(61, 255, 110, 0.35); }\n`,
  },
  {
    name: 'kraft',
    title: '牛皮纸',
    dark: false,
    vars: {
      ...SKETCH,
      '--jp-ink': '#3b2a1a', '--jp-bg': '#d8bf96', '--jp-surface': '#e9d6b3', '--jp-subtle': '#cdb185',
      '--jp-muted': '#6b5234', '--jp-faint': '#86694a', '--jp-line': '#b9996c', '--jp-line-strong': '#987850', '--jp-border': '#3b2a1a',
      '--jp-accent': '#b23a1d', '--jp-select': '#5b3fa8', '--jp-info': '#1f5f8b', '--jp-ok': '#3d6b21', '--jp-warn': '#a05a00', '--jp-danger': '#a52a1a',
      '--jp-shadow': '4px 4px 0 rgba(59, 42, 26, 0.18)',
    },
  },
  {
    name: 'contrast',
    title: '高对比',
    dark: false,
    vars: {
      '--jp-font': SYSTEM, '--jp-font-mono': MONO, '--jp-font-size': '16px',
      '--jp-ink': '#000000', '--jp-bg': '#ffffff', '--jp-surface': '#ffffff', '--jp-subtle': '#ececec',
      '--jp-muted': '#2b2b2b', '--jp-faint': '#4d4d4d', '--jp-line': '#6b6b6b', '--jp-line-strong': '#8a8a8a', '--jp-border': '#000000',
      '--jp-accent': '#ff5c00', '--jp-select': '#7a00cc', '--jp-info': '#0040e0', '--jp-ok': '#006b1f', '--jp-warn': '#7a4a00', '--jp-danger': '#c00000',
      '--jp-radius': '4px', '--jp-shadow': 'none', '--jp-stroke': 'clean',
    },
    extra: `.jbox { border-width: 2px; }\n`,
  },
];

export const builtinCss = (name: string): string | null => {
  const t = BUILTIN.find((b) => b.name === name);
  return t ? block(t.vars, t.extra ?? '') : null;
};

// ---------- 解析 ----------

const stripComments = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '');

/** 主题里声明的 --jp-* 变量（取第一次出现的值）。 */
export function parseThemeVars(css: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of stripComments(css).matchAll(/(--jp-[\w-]+)\s*:\s*([^;}]+)/g)) if (!(m[1]! in out)) out[m[1]!] = m[2]!.trim();
  return out;
}

/** 主题的描边方式：--jp-stroke 写 rough 时用 Rough 手绘描边，否则细线边框；没写时与默认（手绘）一致。 */
export function strokeOf(css: string): StrokeMode {
  const v = parseThemeVars(css)['--jp-stroke'];
  return v === undefined ? 'rough' : v.replace(/['"]/g, '') === 'rough' ? 'rough' : 'clean';
}

/** 粗略判断深色主题（--jp-bg 的亮度）：设置页的缩略图标注用。 */
export function isDark(css: string): boolean {
  const bg = parseThemeVars(css)['--jp-bg'] ?? '#ffffff';
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(bg.trim());
  if (!m) return false;
  const hex = m[1]!.length === 3 ? m[1]!.split('').map((c) => c + c).join('') : m[1]!;
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b < 0.5;
}

/** 主题的作用范围：舞台（.jstage）与跟随主题的舞台外部件（字幕区、手机外框：.jtheme）。 */
export const themeScope = (name: string) => `:is(.jstage, .jtheme)[data-theme="${name.replace(/"/g, '')}"]`;

/** 一条选择器加上作用范围：:root / html / body / :scope / :host / .jstage 本身指向舞台根；其余是舞台里的后代。 */
function scopeSelector(sel: string, scope: string): string {
  const s = sel.trim();
  if (!s) return s;
  const root = /^(:root|html|body|:scope|:host|\.jstage)(?![\w-])/.exec(s);
  if (root) {
    const rest = s.slice(root[0].length);
    return `${scope}${/^\s/.test(rest) || rest === '' ? rest : rest}`;
  }
  return `${scope} ${s}`;
}

/** 按逗号拆分选择器列表（不拆括号里的逗号，例如 :is(a, b)）。 */
function splitSelectors(prelude: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = '';
  for (const ch of prelude) {
    if (ch === '(' || ch === '[') depth++;
    if (ch === ')' || ch === ']') depth--;
    if (ch === ',' && depth === 0) {
      out.push(cur);
      cur = '';
    } else cur += ch;
  }
  out.push(cur);
  return out;
}

/**
 * 把主题 CSS 限定在 .jstage[data-theme=名字]（以及 .jtheme[data-theme=名字]）里：每条规则的选择器都加上作用范围前缀；
 * @media / @supports / @container / @layer 里面的规则递归处理；@keyframes、@font-face、@property、@import 原样保留。
 */
export function scopeThemeCss(css: string, name: string): string {
  const scope = themeScope(name);
  const src = stripComments(css);
  let out = '';
  let i = 0;
  const readBlock = (from: number): number => {
    // from 指向 '{' 之后；返回匹配的 '}' 的位置
    let depth = 1;
    let j = from;
    while (j < src.length && depth > 0) {
      if (src[j] === '{') depth++;
      else if (src[j] === '}') depth--;
      j++;
    }
    return j - 1;
  };
  while (i < src.length) {
    const open = src.indexOf('{', i);
    const semi = src.indexOf(';', i);
    if (open === -1) {
      out += src.slice(i);
      break;
    }
    // 语句式的 @规则（@import …;）
    if (semi !== -1 && semi < open && /^\s*@/.test(src.slice(i, semi))) {
      out += src.slice(i, semi + 1);
      i = semi + 1;
      continue;
    }
    const prelude = src.slice(i, open).trim();
    const close = readBlock(open + 1);
    const body = src.slice(open + 1, close);
    if (prelude.startsWith('@')) {
      if (/^@(media|supports|container|layer|document)\b/.test(prelude)) out += `${prelude} {\n${scopeThemeCss(body, name)}}\n`;
      else out += `${prelude} {${body}}\n`;
    } else if (prelude) {
      out += `${splitSelectors(prelude).map((s) => scopeSelector(s, scope)).join(', ')} {${body}}\n`;
    }
    i = close + 1;
  }
  return out;
}

/** 可用的主题：内置 + 作者主题（themes/<name>.css；与内置同名时用作者的）。 */
export function themeCatalog(authorThemes: Record<string, string> = {}): ThemeInfo[] {
  const list: ThemeInfo[] = BUILTIN.map((b) => {
    const css = authorThemes[b.name] ?? block(b.vars, b.extra ?? '');
    return { name: b.name, title: b.title, css, builtin: !(b.name in authorThemes), stroke: strokeOf(css), dark: authorThemes[b.name] ? isDark(css) : b.dark };
  });
  for (const [name, css] of Object.entries(authorThemes)) if (!BUILTIN.some((b) => b.name === name)) list.push({ name, title: name, css, builtin: false, stroke: strokeOf(css), dark: isDark(css) });
  return list;
}

/** 主题名 → 描边方式（未知主题按默认：手绘）。 */
export function strokeOfTheme(name: string, authorThemes: Record<string, string> = {}): StrokeMode {
  return themeCatalog(authorThemes).find((t) => t.name === name)?.stroke ?? 'rough';
}

/** 所有主题限定作用范围后的 CSS（注入到页面里一次）。 */
export function allThemesCss(authorThemes: Record<string, string> = {}): string {
  return themeCatalog(authorThemes)
    .map((t) => `/* 主题 ${t.name}${t.builtin ? '' : '（作者）'} */\n${scopeThemeCss(t.css, t.name)}`)
    .join('\n');
}

/**
 * 看板设置里某个外观字段的取值（纯函数，D51 / D55）：本项目的覆盖 > 全局选择；都没有写时 set = false。
 * 项目覆盖里写了 null 也算“写了”（主题：恢复为项目默认；字体、线条：跟随主题），即使有全局选择也不用它。
 */
export type ThemeSettings = { theme?: string | null; font?: unknown; stroke?: unknown; projects?: Record<string, { theme?: string | null; font?: unknown; stroke?: unknown }> };
export function settingValue(settings: ThemeSettings | null | undefined, projectId: string | null, key: 'theme' | 'font' | 'stroke'): { set: boolean; value: unknown } {
  const p = projectId ? settings?.projects?.[projectId] : undefined;
  if (p && typeof p === 'object' && key in p) return { set: true, value: (p as Record<string, unknown>)[key] ?? null };
  if (settings && typeof settings === 'object' && key in settings) return { set: true, value: (settings as Record<string, unknown>)[key] ?? null };
  return { set: false, value: null };
}

/** 看板里实际使用的主题：本项目的覆盖 > 全局选择 > 项目配置的默认主题（null = 恢复为项目默认）。 */
export function effectiveTheme(settings: ThemeSettings | null | undefined, projectId: string | null, configTheme: string): string {
  const v = settingValue(settings, projectId, 'theme').value;
  return typeof v === 'string' ? v : configTheme;
}
