import { m as commonMessages, type Text } from '../i18n/messages';
import { m } from '../i18n/board/messages';
import { boardEnglish, type BoardMessages } from '../i18n/board/dictionaries';
/**
 * 外观浮层的模型（D55，纯函数，创作侧）：
 * - 读取点 effectiveAppearance：本项目 > 所有项目 > 项目 config（字段分别计算）；字体、线条为 null 时跟随主题；
 *   未知主题名（作者主题被删、手改了文件）回退到项目 config，再回退到 sketch；未知字体 / 线条按跟随主题。
 * - 写入点 applyAppearance / resetAppearance / setAsDefault：返回新的 BoardSettings（不改输入），由 useBoardSettings.save
 *   写到 PUT /__joplo/settings；服务端 normalizeSettings 再校验一遍。
 * - 配色格 paletteCells：sketch 与 clean 配色相同，合并为一格「纸白」；8 格内置 + 作者主题（标 *）。
 */
import { isAppearanceFont, isAppearanceStroke, type AppearanceFont, type AppearanceStroke } from '@joplo-app/core/runtime';
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
const SHORT = (i18n: BoardMessages = boardEnglish): Record<string, string> => ({ sketch: i18n.board.paperWhite, clean: i18n.board.paperWhite, 'solarized-light': 'Solarized' });

export type PaletteCell = { id: string; names: string[]; title: string; builtin: boolean; css: string };

export function paletteCells(catalog: ThemeInfo[], i18n: BoardMessages = boardEnglish): PaletteCell[] {
  const out: PaletteCell[] = [];
  const byName = new Map(catalog.map((t) => [t.name, t]));
  const BUILTIN_CELLS = [['sketch', 'clean'], ['blueprint'], ['nord'], ['dracula'], ['solarized-light'], ['terminal'], ['kraft'], ['contrast']];
  for (const names of BUILTIN_CELLS) {
    const first = byName.get(names[0]!);
    if (!first) continue;
    const author = names.some((n) => byName.get(n) && !byName.get(n)!.builtin);
    out.push({ id: names[0]!, names, title: `${SHORT(i18n)[first.name] ?? first.title}${author ? '*' : ''}`, builtin: true, css: first.css });
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

export const FONT_CHOICES = (i18n: BoardMessages = boardEnglish): { value: AppearanceFont | null; name: string; sample: string }[] => ([
  { value: null, name: i18n.board.followTheme, sample: i18n.board.auto },
  { value: 'hand', name: i18n.board.markerGothic, sample: i18n.board.fontSample },
  { value: 'sans', name: i18n.board.sansSerif, sample: i18n.board.fontSample },
  { value: 'serif', name: i18n.board.serif, sample: i18n.board.fontSample },
  { value: 'kai', name: i18n.board.wenKai, sample: i18n.board.fontSample },
  { value: 'mono', name: i18n.board.monospace, sample: 'Aa 01' },
]);
export const STROKE_CHOICES = (i18n: BoardMessages = boardEnglish): { value: AppearanceStroke | null; name: string }[] => ([
  { value: 'rough', name: i18n.board.handDrawn },
  { value: 'clean', name: i18n.board.straight },
  { value: null, name: i18n.board.followTheme },
]);

/** 外观按钮上的名字：配色（· 字体，有单独选字体时）。 */
export function appearanceLabel(look: Look, catalog: ThemeInfo[], i18n: BoardMessages = boardEnglish): string {
  const cell = paletteCells(catalog, i18n).find((c) => isCellSelected(c, look.theme));
  const name = cell ? cell.title.replace(/\*$/, '') : look.theme;
  const font = look.font ? FONT_CHOICES(i18n).find((f) => f.value === look.font)?.name : null;
  return font ? `${name} · ${font}` : name;
}

/** “复制 theme”：粘进 joplo.config.ts，发布站也用这套配色（字体、线条暂不发布）。 */
export const themeLine = (theme: string) => `theme: '${theme}',`;

/** “+ 自定义”复制的主题模板。 */
export const THEME_TEMPLATE = (i18n: BoardMessages = boardEnglish) => (i18n.board.themesNameCssDefineJpVariablesThenSetTheme);

/** Deferred appearance names keep an existing confirmation flash in sync with later language changes. */
export function appearanceMessage(look: Look, catalog: ThemeInfo[]): Text {
  const builtins: Record<string, Text> = { sketch: m.board.paperWhite, clean: m.board.paperWhite, blueprint: commonMessages.stage.blueprint, nord: 'Nord', dracula: 'Dracula', 'solarized-light': 'Solarized', terminal: commonMessages.stage.retroTerminal, kraft: commonMessages.stage.kraft, contrast: commonMessages.stage.highContrast };
  const fonts: Record<AppearanceFont, Text> = { hand: m.board.markerGothic, sans: m.board.sansSerif, serif: m.board.serif, kai: m.board.wenKai, mono: m.board.monospace };
  const name = builtins[look.theme] ?? catalog.find((t) => t.name === look.theme)?.title ?? look.theme;
  return look.font ? m.board.appearanceName(name, fonts[look.font]) : name;
}
