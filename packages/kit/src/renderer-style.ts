/** Shared theme tokens and pure style scales; no host or framework dependency. */
export const SPACING: Record<string, number> = { xs: 10, sm: 12, md: 16, lg: 20, xl: 32 };
export const FONT: Record<string, number> = { xs: 12, sm: 14, md: 16, lg: 18, xl: 20 };
export const RADIUS: Record<string, number> = { xs: 2, sm: 4, md: 8, lg: 16, xl: 32 };

// 主题色（D51）：全部读主题的 CSS 变量（renderer/themes.ts），不写死颜色
export const INK = 'var(--jp-ink)';
/** 次一级的文字与线条：正文色与底色混合。 */
export const INK2 = 'color-mix(in srgb, var(--jp-ink) 78%, var(--jp-bg))';
export const SOFT = 'var(--jp-faint)';
export const DIMMED = 'var(--jp-muted)';
export const BG = 'var(--jp-bg)';
export const SURFACE = 'var(--jp-surface)';
export const SUBTLE = 'var(--jp-subtle)';
export const LINE = 'var(--jp-line)';
export const LINE_STRONG = 'var(--jp-line-strong)';
export const ACCENT = 'var(--jp-accent)';
export const INFO = 'var(--jp-info)';
export const OK = 'var(--jp-ok)';
export const WARN = 'var(--jp-warn)';
export const DANGER = 'var(--jp-danger)';
export const MONO = 'var(--jp-font-mono)';
/** 实心底上的文字：底是正文色（例如 color="dark"）时用舞台底色，其余用白色。 */
export const onFill = (c: string) => (c === INK || c === 'var(--jp-ink)' ? BG : '#fff');
/** 某个颜色的浅色底（混入卡片底色，深色主题里也是“浅一点”的那一档）。 */
export const tint = (c: string, pct = 12) => `color-mix(in srgb, ${c} ${pct}%, var(--jp-surface))`;

const PALETTE: Record<string, string> = {
  dark: 'var(--jp-ink)',
  gray: 'var(--jp-muted)',
  red: 'var(--jp-danger)',
  pink: '#c2255c',
  grape: '#9c36b5',
  violet: '#7048e8',
  indigo: '#4263eb',
  blue: 'var(--jp-info)',
  cyan: '#1098ad',
  teal: '#0ca678',
  green: 'var(--jp-ok)',
  lime: '#66a80f',
  yellow: '#f08c00',
  orange: '#e8590c',
  white: '#ffffff',
  black: '#000000',
};

/** 颜色：dimmed、调色板名（可带 .0-9 色阶）、或原样的 CSS 颜色；无法识别返回 undefined。 */
export function color(v: unknown): string | undefined {
  if (typeof v !== 'string' || !v) return undefined;
  if (v === 'dimmed') return DIMMED;
  if (v === 'bright' || v === 'ink') return INK;
  const m = /^([a-z]+)(?:\.(\d))?$/.exec(v);
  if (m && PALETTE[m[1]!]) {
    const base = PALETTE[m[1]!]!;
    if (m[2] === undefined) return base;
    const n = Number(m[2]);
    if (n < 6) return `color-mix(in srgb, ${base} ${100 - (6 - n) * 15}%, var(--jp-surface))`;
    if (n > 6) return `color-mix(in srgb, ${base} ${100 - (n - 6) * 12}%, var(--jp-ink))`;
    return base;
  }
  if (/^(#|rgb|hsl|oklch|var\()/.test(v)) return v;
  return undefined;
}

/** 浅色底（light 变体、Alert 背景）：混入主题的卡片底色。 */
export const light = (c: string) => `color-mix(in srgb, ${c} 11%, var(--jp-surface))`;

/** 间距：刻度名 → px；数字 → px；其余字符串原样（如 'auto'、'1rem'）。 */
export function space(v: unknown): string | undefined {
  if (typeof v === 'number' && Number.isFinite(v)) return `${v}px`;
  if (typeof v !== 'string' || !v) return undefined;
  if (v in SPACING) return `${SPACING[v]}px`;
  return v;
}
export const spaceNum = (v: unknown, d: number): number => (typeof v === 'number' ? v : typeof v === 'string' && v in SPACING ? SPACING[v]! : d);

/** 尺寸：数字 → px；字符串原样（'100%'、'auto'）。 */
export function dim(v: unknown): string | undefined {
  if (typeof v === 'number' && Number.isFinite(v)) return `${v}px`;
  if (typeof v === 'string' && v) return v in SPACING ? `${SPACING[v]}px` : v;
  return undefined;
}

export function fontSize(v: unknown): string | undefined {
  if (typeof v === 'number' && Number.isFinite(v)) return `${v}px`;
  if (typeof v !== 'string' || !v) return undefined;
  if (v in FONT) return `${FONT[v]}px`;
  if (/^h[1-6]$/.test(v)) return `${TITLE_SIZE[Number(v[1]) - 1]}px`;
  return v;
}

export function radius(v: unknown): string | undefined {
  if (typeof v === 'number') return `${v}px`;
  if (typeof v === 'string' && v) return v in RADIUS ? `${RADIUS[v]}px` : v;
  return undefined;
}

export const TITLE_SIZE = [30, 24, 20, 17, 15, 14];
