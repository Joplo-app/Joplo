import type { CSSProperties, ReactNode } from 'react';
import { BT, TABULAR, tonalWash, toneColor, type Tone } from './tokens.ts';

export function BDot({ tone = 'ok', pulse = false, size = 7 }: { tone?: Tone | string; pulse?: boolean; size?: number }) {
  return (
    <span
      className={pulse ? 'bd-dot-pulse' : undefined}
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        background: toneColor(tone),
        flexShrink: 0,
        display: 'inline-block',
      }}
    />
  );
}

export function BBadge({
  children,
  tone = 'neutral',
  solid = false,
  size = 'sm',
  style,
}: {
  children: ReactNode;
  tone?: Tone | string;
  solid?: boolean;
  size?: 'xs' | 'sm';
  style?: CSSProperties;
}) {
  const col = toneColor(tone);
  const isNeutral = tone === 'neutral' || tone === 'muted';
  const bg = solid ? col : isNeutral ? BT.w6 : tonalWash(col, 15);
  const fg = solid ? (tone === 'ok' ? BT.onOk : BT.onSignal) : isNeutral ? BT.soft : col;
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        padding: size === 'xs' ? '2px 7px' : '3px 9px',
        borderRadius: 999,
        background: bg,
        color: fg,
        fontSize: size === 'xs' ? 10.5 : 11.5,
        fontWeight: 600,
        lineHeight: 1.2,
        letterSpacing: '0.01em',
        whiteSpace: 'nowrap',
        ...TABULAR,
        ...style,
      }}
    >
      {children}
    </span>
  );
}

export function BKbd({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        padding: '2px 6px',
        borderRadius: 6,
        background: BT.w6,
        color: BT.soft,
        fontSize: 10.5,
        fontWeight: 600,
        lineHeight: 1.2,
        whiteSpace: 'nowrap',
        ...TABULAR,
        ...style,
      }}
    >
      {children}
    </span>
  );
}

export function BHeader({
  icon,
  title,
  sub,
  right,
  style,
}: {
  icon?: ReactNode;
  title: string;
  sub?: string;
  right?: ReactNode;
  style?: CSSProperties;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '2px 2px 6px', ...style }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
        {icon ? <span style={{ color: BT.soft, display: 'inline-flex', alignItems: 'center', flexShrink: 0 }}>{icon}</span> : null}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 1, minWidth: 0 }}>
          <span style={{ fontSize: 13, fontWeight: 650, letterSpacing: '-0.01em', color: BT.on, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {title}
          </span>
          {sub ? <span style={{ fontSize: 11, color: BT.mute }}>{sub}</span> : null}
        </div>
      </div>
      {right ? <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>{right}</div> : null}
    </div>
  );
}

export const SLAB_STYLE: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
  padding: '12px 14px',
  borderRadius: 'var(--bd-r-outer, 18px)',
};

export const SURFACE_STYLE: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
  padding: 8,
  borderRadius: 'var(--bd-r-inner, 12px)',
  background: BT.w4,
};

export const ROW_STYLE: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 10,
  padding: '7px 10px',
  borderRadius: 'var(--bd-r-row, 10px)',
  background: BT.w6,
  color: BT.on,
  fontSize: 12.5,
  lineHeight: 1.3,
};

export type GlyphName =
  | 'activity' | 'arrowRight' | 'box' | 'clock' | 'cloud' | 'cpu' | 'database' | 'globe'
  | 'grid' | 'hardDrive' | 'hash' | 'key' | 'laptop' | 'layers' | 'link' | 'list'
  | 'network' | 'radio' | 'search' | 'server' | 'shield' | 'smartphone' | 'table'
  | 'tablet' | 'terminal' | 'zap';

const GLYPH_PATHS: Record<GlyphName, string> = {
  activity: 'M22 12h-4l-3 9L9 3l-3 9H2',
  arrowRight: 'M5 12h14M13 5l7 7-7 7',
  box: 'M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z M3.3 7 12 12l8.7-5 M12 22V12',
  clock: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm0 4v6l4 2',
  cloud: 'M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z',
  cpu: 'M6 6h12v12H6z M9 2v4 M15 2v4 M9 18v4 M15 18v4 M2 9h4 M2 15h4 M18 9h4 M18 15h4',
  database: 'M12 3c-4.97 0-9 1.34-9 3v12c0 1.66 4.03 3 9 3s9-1.34 9-3V6c0-1.66-4.03-3-9-3Zm0 6c-4.97 0-9-1.34-9-3 M3 12c0 1.66 4.03 3 9 3s9-1.34 9-3',
  globe: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20ZM2 12h20 M12 2a15 15 0 0 1 4 10 15 15 0 0 1-4 10 15 15 0 0 1-4-10 15 15 0 0 1 4-10Z',
  grid: 'M3 3h7v7H3z M14 3h7v7h-7z M14 14h7v7h-7z M3 14h7v7H3z',
  hardDrive: 'M22 12H2 M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11ZM6 16h.01 M10 16h.01',
  hash: 'M4 9h16 M4 15h16 M10 3 8 21 M16 3l-2 18',
  key: 'M15.5 7.5 19 4l2 2-3.5 3.5 M11 12l4.5-4.5 M7 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z',
  laptop: 'M20 16V7a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v9m16 0H4m16 0 1.28 2.55a1 1 0 0 1-.9 1.45H3.62a1 1 0 0 1-.9-1.45L4 16',
  layers: 'M12 2 2 7l10 5 10-5-10-5Zm-10 10 10 5 10-5 M2 17l10 5 10-5',
  link: 'M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71 M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71',
  list: 'M8 6h13 M8 12h13 M8 18h13 M3 6h.01 M3 12h.01 M3 18h.01',
  network: 'M9 3h6v5H9z M3 16h6v5H3z M15 16h6v5h-6z M12 8v4 M6 16v-4h12v4',
  radio: 'M12 12m-2 0a2 2 0 1 0 4 0 2 2 0 1 0-4 0 M16.24 7.76a6 6 0 0 1 0 8.49 M7.76 16.24a6 6 0 0 1 0-8.49 M19.07 4.93a10 10 0 0 1 0 14.14 M4.93 19.07a10 10 0 0 1 0-14.14',
  search: 'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm10 2-4.35-4.35',
  server: 'M2 4h20v6H2z M2 14h20v6H2z M6 7h.01 M6 17h.01',
  shield: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z',
  smartphone: 'M7 2h10a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2Zm5 16h.01',
  table: 'M3 5h18v14H3z M3 10h18 M9 10v9',
  tablet: 'M5 2h14a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2Zm7 16h.01',
  terminal: 'M4 17l6-6-6-6 M12 19h8',
  zap: 'M13 2 3 14h9l-1 8 10-12h-9l1-8Z',
};

export function Glyph({ name, size = 15, color, style }: { name: GlyphName; size?: number; color?: string; style?: CSSProperties }) {
  return (
    <svg
      aria-hidden
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color ?? 'currentColor'}
      strokeWidth={1.9}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ display: 'block', flexShrink: 0, ...style }}
    >
      <path d={GLYPH_PATHS[name]} />
    </svg>
  );
}
