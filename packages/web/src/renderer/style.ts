/**
 * Mantine 样式属性 → 内联样式。所有值都可以写成响应式对象 { base, xs, sm, md, lg, xl }，按舞台宽度取值。
 * 只做低保真近似：间距、字号、圆角用 Mantine 默认刻度；颜色映射到一组柔和的调色板。
 */
import type { CSSProperties } from 'react';
import { atWidth } from '@tokenroll/joplo-core';

export const SPACING: Record<string, number> = { xs: 10, sm: 12, md: 16, lg: 20, xl: 32 };
export const FONT: Record<string, number> = { xs: 12, sm: 14, md: 16, lg: 18, xl: 20 };
export const RADIUS: Record<string, number> = { xs: 2, sm: 4, md: 8, lg: 16, xl: 32 };

export const INK = '#1e1e1e';
export const SOFT = '#9a9a9a';
export const DIMMED = '#868e96';

const PALETTE: Record<string, string> = {
  dark: '#2e2e2e',
  gray: '#868e96',
  red: '#e03131',
  pink: '#c2255c',
  grape: '#9c36b5',
  violet: '#7048e8',
  indigo: '#4263eb',
  blue: '#1c7ed6',
  cyan: '#1098ad',
  teal: '#0ca678',
  green: '#2f9e44',
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
    if (n < 6) return `color-mix(in srgb, ${base} ${100 - (6 - n) * 15}%, white)`;
    if (n > 6) return `color-mix(in srgb, ${base} ${100 - (n - 6) * 12}%, black)`;
    return base;
  }
  if (/^(#|rgb|hsl|oklch|var\()/.test(v)) return v;
  return undefined;
}

/** 浅色底（light 变体、Alert 背景）。 */
export const light = (c: string) => `color-mix(in srgb, ${c} 11%, white)`;

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

const FAMILY: Record<string, string> = {
  monospace: 'ui-monospace, SFMono-Regular, Menlo, "Joplo Xiaolai", monospace',
  mono: 'ui-monospace, SFMono-Regular, Menlo, "Joplo Xiaolai", monospace',
};

const ALIGN: Record<string, string> = { left: 'left', center: 'center', right: 'right', justify: 'justify', start: 'start', end: 'end' };

/** 通用样式属性。p 是已解析绑定的属性；width 是舞台宽度。 */
export function styleOf(p: Record<string, unknown>, width: number): CSSProperties {
  const r = (k: string) => atWidth(p[k], width);
  const s: CSSProperties = {};
  if (p.style && typeof p.style === 'object' && !Array.isArray(p.style)) Object.assign(s, p.style as CSSProperties);
  const sp = (k: string) => space(r(k));
  const set = <K extends keyof CSSProperties>(key: K, v: CSSProperties[K] | undefined) => {
    if (v !== undefined) s[key] = v;
  };
  set('margin', sp('m'));
  set('marginTop', sp('mt') ?? sp('my'));
  set('marginBottom', sp('mb') ?? sp('my'));
  set('marginLeft', sp('ml') ?? sp('mx'));
  set('marginRight', sp('mr') ?? sp('mx'));
  set('padding', sp('p'));
  set('paddingTop', sp('pt') ?? sp('py'));
  set('paddingBottom', sp('pb') ?? sp('py'));
  set('paddingLeft', sp('pl') ?? sp('px'));
  set('paddingRight', sp('pr') ?? sp('px'));
  set('width', dim(r('w')));
  set('height', dim(r('h')));
  set('minWidth', dim(r('miw')));
  set('maxWidth', dim(r('maw')));
  set('minHeight', dim(r('mih')));
  set('maxHeight', dim(r('mah')));
  set('color', color(r('c')));
  set('background', color(r('bg')));
  set('fontSize', fontSize(r('fz')));
  const fw = r('fw');
  set('fontWeight', typeof fw === 'number' || typeof fw === 'string' ? (fw as CSSProperties['fontWeight']) : undefined);
  const ta = r('ta');
  set('textAlign', typeof ta === 'string' ? (ALIGN[ta] as CSSProperties['textAlign']) : undefined);
  const ff = r('ff');
  set('fontFamily', typeof ff === 'string' ? (FAMILY[ff] ?? (ff === 'text' || ff === 'heading' ? undefined : ff)) : undefined);
  const lh = r('lh');
  set('lineHeight', typeof lh === 'number' ? lh : typeof lh === 'string' ? (lh in FONT ? 1.5 : lh) : undefined);
  const fs = r('fs');
  set('fontStyle', typeof fs === 'string' ? fs : undefined);
  const td = r('td');
  set('textDecoration', typeof td === 'string' ? td : undefined);
  const tt = r('tt');
  set('textTransform', typeof tt === 'string' ? (tt as CSSProperties['textTransform']) : undefined);
  const op = r('opacity');
  set('opacity', typeof op === 'number' ? op : undefined);
  const display = r('display');
  set('display', typeof display === 'string' ? display : undefined);
  const flex = r('flex');
  set('flex', typeof flex === 'number' || typeof flex === 'string' ? flex : undefined);
  const pos = r('pos');
  set('position', typeof pos === 'string' ? (pos as CSSProperties['position']) : undefined);
  for (const k of ['top', 'left', 'right', 'bottom'] as const) set(k, dim(r(k)));
  return s;
}

/** Flex 对齐属性：Mantine 写法即 CSS 值（flex-start、center、space-between…）。 */
export const flexVal = (v: unknown, d?: string): string | undefined => (typeof v === 'string' && v ? v : d);
