/**
 * 外观浮层的模型（D55，纯函数，创作侧）：
 * - 读取点 effectiveAppearance：本项目 > 所有项目 > 项目 config（字段分别计算）；字体、线条为 null 时跟随主题；
 *   未知主题名（作者主题被删、手改了文件）回退到项目 config，再回退到 sketch；未知字体 / 线条按跟随主题。
 * - 写入点 applyAppearance / resetAppearance / setAsDefault：返回新的 BoardSettings（不改输入），由 useBoardSettings.save
 *   写到 PUT /__joplo/settings；服务端 normalizeSettings 再校验一遍。
 * - 配色格 paletteCells：sketch 与 clean 配色相同，合并为一格「纸白」；8 格内置 + 作者主题（标 *）。
 */
import { isAppearanceFont, isAppearanceStroke, type AppearanceFont, type AppearanceStroke } from '@joplo-app/core';
import { parseThemeVars, settingValue, type ThemeInfo } from '../renderer/themes';
import type { Look } from '../renderer/appearance';
import type { BoardSettings } from '../runtime/dev-client';

export type Scope = 'project' | 'all';
export type LookPatch = { theme?: string | null; font?: AppearanceFont | null; stroke?: AppearanceStroke | null };

export function effectiveAppearance(settings: BoardSettings | Record<string, unknown> | null | undefined, projectId: string | null, configTheme: string, available?: readonly string[]): Look {
  const s = settings as Parameters<typeof settingValue>[0];
  const t = settingValue(s, projectId, 'theme').value;
  const known = (n: unknown): n is string => typeof n === 'string' && (!available || available.includes(n));
  const theme = known(t) ? t : known(configTheme) ? configTheme : 'sketch';
  const f = settingValue(s, projectId, 'font').value;
  const k = settingValue(s, projectId, 'stroke').value;
  return { theme, font: isAppearanceFont(f) ? f : null, stroke: isAppearanceStroke(k) ? k : null };
}

const base = (s: BoardSettings | null | undefined): BoardSettings => ({ ...(s ?? {}), version: 1 });

/** 点一下立即应用并保存：只改这个项目（projects[id]，与已有字段合并），或所有项目（顶层）。没有项目 id 时按所有项目。 */
export function applyAppearance(settings: BoardSettings | null | undefined, scope: Scope, projectId: string | null, patch: LookPatch): BoardSettings {
  const s = base(settings);
  if (scope === 'project' && projectId) return { ...s, projects: { ...(s.projects ?? {}), [projectId]: { ...(s.projects?.[projectId] ?? {}), ...patch } } };
  return { ...s, ...patch };
}

/** 恢复项目默认：本项目三个字段写 null（回到 joplo.config.ts 的主题，字体线条跟随主题）；所有项目范围则清掉顶层的选择。 */
export function resetAppearance(settings: BoardSettings | null | undefined, scope: Scope, projectId: string | null): BoardSettings {
  const s = base(settings);
  if (scope === 'project' && projectId) return { ...s, projects: { ...(s.projects ?? {}), [projectId]: { theme: null, font: null, stroke: null } } };
  const { theme: _t, font: _f, stroke: _k, ...rest } = s;
  return { ...rest, version: 1 };
}

/** 设为所有项目的默认：顶层写当前这套外观；本项目的单独设置清掉（之后跟随这个默认）；其他项目不受影响。 */
export function setAsDefault(settings: BoardSettings | null | undefined, projectId: string | null, look: Look): BoardSettings {
  const s = base(settings);
  const next: BoardSettings = { ...s, theme: look.theme, font: look.font, stroke: look.stroke };
  if (projectId && s.projects?.[projectId]) {
    const { [projectId]: _drop, ...others } = s.projects;
    if (Object.keys(others).length) next.projects = others;
    else delete next.projects;
  }
  return next;
}

// ---------- 配色格 ----------

/** 格子里显示的短名（内置主题）。 */
const SHORT: Record<string, string> = { sketch: '纸白', clean: '纸白', 'solarized-light': 'Solarized' };

export type PaletteCell = { id: string; names: string[]; title: string; builtin: boolean; css: string };

export function paletteCells(catalog: ThemeInfo[]): PaletteCell[] {
  const out: PaletteCell[] = [];
  const byName = new Map(catalog.map((t) => [t.name, t]));
  const BUILTIN_CELLS = [['sketch', 'clean'], ['blueprint'], ['nord'], ['dracula'], ['solarized-light'], ['terminal'], ['kraft'], ['contrast']];
  for (const names of BUILTIN_CELLS) {
    const first = byName.get(names[0]!);
    if (!first) continue;
    const author = names.some((n) => byName.get(n) && !byName.get(n)!.builtin);
    out.push({ id: names[0]!, names, title: `${SHORT[first.name] ?? first.title}${author ? '*' : ''}`, builtin: true, css: first.css });
  }
  const used = new Set(BUILTIN_CELLS.flat());
  for (const t of catalog) if (!used.has(t.name)) out.push({ id: t.name, names: [t.name], title: `${t.title}*`, builtin: false, css: t.css });
  return out;
}

export const isCellSelected = (cell: PaletteCell, theme: string) => cell.names.includes(theme);
/** 点一格要写的主题名；已经选中（纸白里的 sketch 或 clean）时返回 null，不写入。 */
export const themeToWrite = (cell: PaletteCell, current: string): string | null => (isCellSelected(cell, current) ? null : cell.names[0]!);

/** 缩略图与外观按钮的色块：底色、墨色、强调色、细线。缺变量时用默认（手绘主题）的值。 */
export function themeSwatch(css: string): { bg: string; ink: string; accent: string; line: string } {
  const v = parseThemeVars(css ?? '');
  return { bg: v['--jp-bg'] ?? '#ffffff', ink: v['--jp-ink'] ?? '#1e1e1e', accent: v['--jp-accent'] ?? '#e8590c', line: v['--jp-line'] ?? '#dee2e6' };
}

export const FONT_CHOICES: { value: AppearanceFont | null; name: string; sample: string }[] = [
  { value: null, name: '跟随主题', sample: '自动' },
  { value: 'hand', name: '漫黑', sample: '永 Aa' },
  { value: 'sans', name: '黑体', sample: '永 Aa' },
  { value: 'serif', name: '宋体', sample: '永 Aa' },
  { value: 'kai', name: '文楷', sample: '永 Aa' },
  { value: 'mono', name: '等宽', sample: 'Aa 01' },
];
export const STROKE_CHOICES: { value: AppearanceStroke | null; name: string }[] = [
  { value: 'rough', name: '手绘' },
  { value: 'clean', name: '直线' },
  { value: null, name: '跟随主题' },
];

/** 外观按钮上的名字：配色（· 字体，有单独选字体时）。 */
export function appearanceLabel(look: Look, catalog: ThemeInfo[]): string {
  const cell = paletteCells(catalog).find((c) => isCellSelected(c, look.theme));
  const name = cell ? cell.title.replace(/\*$/, '') : look.theme;
  const font = look.font ? FONT_CHOICES.find((f) => f.value === look.font)?.name : null;
  return font ? `${name} · ${font}` : name;
}

/** “复制 theme”：粘进 joplo.config.ts，发布站也用这套配色（字体、线条暂不发布）。 */
export const themeLine = (theme: string) => `theme: '${theme}',`;

/** “+ 自定义”复制的主题模板。 */
export const THEME_TEMPLATE = `/* themes/<名字>.css：只写 --jp-* 变量（也可以加普通选择器细调），再在 joplo.config.ts 里写 theme: '<名字>' */
:root {
  --jp-font: system-ui, -apple-system, "PingFang SC", sans-serif;
  --jp-ink: #1e1e1e;
  --jp-bg: #ffffff;
  --jp-surface: #ffffff;
  --jp-subtle: #f1f3f5;
  --jp-muted: #868e96;
  --jp-line: #dee2e6;
  --jp-line-strong: #adb5bd;
  --jp-border: #3a3a3a;
  --jp-accent: #e8590c;
  --jp-radius: 6px;
  --jp-stroke: clean;
}
`;
