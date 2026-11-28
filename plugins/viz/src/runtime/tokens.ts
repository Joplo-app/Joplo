import {
  ACCENT,
  DANGER,
  DIMMED,
  INFO,
  INK,
  INK2,
  LINE,
  LINE_STRONG,
  MONO,
  OK,
  SUBTLE,
  SURFACE,
  WARN,
  color,
  dim,
  tint,
} from '@joplo-app/kit/renderer-style';

export { ACCENT, DANGER, DIMMED, INFO, INK, INK2, LINE, LINE_STRONG, MONO, OK, SUBTLE, SURFACE, WARN, color, dim, tint };

export const VIZ_SERIES_PALETTE = [
  '#2231dd', // crisp editorial indigo
  '#0f9f6e', // emerald
  '#d97706', // amber
  '#0284c7', // sky/cyan
  '#dc2626', // crimson
  '#7c3aed', // violet
] as const;

export const VIZ_FONT_SANS = 'var(--jp-font-sans, ui-sans-serif, -apple-system, BlinkMacSystemFont, "PingFang SC", "Noto Sans SC", sans-serif)';

export const vizColor = (value: unknown, fallbackIndex = 0): string => {
  if (typeof value === 'string' && value.trim()) {
    if (value === 'accent') return ACCENT;
    if (value === 'ok' || value === 'emerald') return OK;
    if (value === 'warn' || value === 'amber') return WARN;
    if (value === 'danger' || value === 'crimson') return DANGER;
    if (value === 'info') return INFO;
    if (value === 'muted') return DIMMED;
    const mapped = color(value);
    if (mapped) return mapped;
  }
  return VIZ_SERIES_PALETTE[fallbackIndex % VIZ_SERIES_PALETTE.length]!;
};

export const num = (v: unknown, fallback?: number): number | undefined =>
  typeof v === 'number' && Number.isFinite(v) ? v : fallback;

export const str = (v: unknown, fallback = ''): string =>
  v === undefined || v === null ? fallback : String(v);

export const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

export function formatNumber(n: number, unit = ''): string {
  if (!Number.isFinite(n)) return '';
  const abs = Math.abs(n);
  let body: string;
  if (Number.isInteger(n)) body = abs >= 1000 ? n.toLocaleString('en-US') : String(n);
  else body = abs >= 100 ? String(Math.round(n * 10) / 10) : String(Number(n.toPrecision(3)));
  if (!unit) return body;
  if (/^[$¥€£]$/.test(unit)) return `${unit}${body}`;
  return `${body}${unit}`;
}

export const EASE_OUT_EXPO: [number, number, number, number] = [0.16, 1, 0.3, 1];
export const EASE_OUT_CUBIC: [number, number, number, number] = [0.22, 1, 0.36, 1];
