/**
 * Mantine 样式属性 → 内联样式。所有值都可以写成响应式对象 { base, xs, sm, md, lg, xl }，按舞台宽度取值。
 * 只做低保真近似：间距、字号、圆角用 Mantine 默认刻度；颜色映射到一组柔和的调色板。
 */
import type { CSSProperties } from 'react';
import { atWidth } from '@joplo-app/core';

export * from '@joplo-app/kit/renderer-style';
import { SPACING, FONT, RADIUS, INK, INK2, SOFT, DIMMED, BG, SURFACE, SUBTLE, LINE, LINE_STRONG, ACCENT, INFO, OK, WARN, DANGER, MONO, onFill, tint, color, light, space, spaceNum, dim, fontSize, radius, TITLE_SIZE } from '@joplo-app/kit/renderer-style';

const FAMILY: Record<string, string> = {
  monospace: 'var(--jp-font-mono)',
  mono: 'var(--jp-font-mono)',
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
