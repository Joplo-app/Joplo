/**
 * Shared dual-mode tokens for @joplo-app/plugin-diagram board primitives.
 * Auto-adapts to Joplo built-in themes (sketch, clean, dracula, nord...) AND diagram:* themes.
 */

export const TONES = ['neutral', 'accent', 'info', 'violet', 'ok', 'warn', 'danger', 'muted'] as const;
export type Tone = (typeof TONES)[number];

export const NODE_STATUSES = ['idle', 'healthy', 'active', 'hot', 'degraded', 'down', 'cached'] as const;
export type NodeStatus = (typeof NODE_STATUSES)[number];

export const LINK_ROUTES = ['straight', 'curve', 'elbow', 'arc'] as const;
export type LinkRoute = (typeof LINK_ROUTES)[number];

export const LINK_STATES = ['idle', 'active', 'blocked', 'cached', 'error'] as const;
export type LinkState = (typeof LINK_STATES)[number];

export const ANCHOR_SIDES = ['auto', 'left', 'right', 'top', 'bottom', 'center'] as const;
export type AnchorSide = (typeof ANCHOR_SIDES)[number];

export const BT = {
  bg: 'var(--bd-bg, var(--jp-bg, #f4f4f1))',
  slab: 'var(--bd-slab, var(--jp-surface, #ffffff))',
  on: 'var(--bd-on, var(--jp-ink, #17181a))',
  soft: 'var(--bd-soft, color-mix(in srgb, var(--bd-on, var(--jp-ink, #17181a)) 74%, var(--bd-slab, var(--jp-surface, #ffffff))))',
  mute: 'var(--bd-mute, color-mix(in srgb, var(--bd-on, var(--jp-ink, #17181a)) 54%, var(--bd-slab, var(--jp-surface, #ffffff))))',
  faint: 'var(--bd-faint, color-mix(in srgb, var(--bd-on, var(--jp-ink, #17181a)) 36%, var(--bd-slab, var(--jp-surface, #ffffff))))',
  w4: 'var(--bd-w4, color-mix(in srgb, var(--bd-on, var(--jp-ink, #17181a)) 4%, var(--bd-slab, var(--jp-surface, #ffffff))))',
  w6: 'var(--bd-w6, color-mix(in srgb, var(--bd-on, var(--jp-ink, #17181a)) 6.5%, var(--bd-slab, var(--jp-surface, #ffffff))))',
  w12: 'var(--bd-w12, color-mix(in srgb, var(--bd-on, var(--jp-ink, #17181a)) 12%, var(--bd-slab, var(--jp-surface, #ffffff))))',
  w20: 'var(--bd-w20, color-mix(in srgb, var(--bd-on, var(--jp-ink, #17181a)) 20%, var(--bd-slab, var(--jp-surface, #ffffff))))',
  edge: 'var(--bd-edge, var(--jp-border, rgba(23, 24, 26, 0.1)))',
  signal: 'var(--bd-signal, var(--jp-accent, #2231dd))',
  onSignal: 'var(--bd-on-signal, #ffffff)',
  ok: 'var(--bd-ok, var(--jp-ok, #15803d))',
  onOk: 'var(--bd-on-ok, #ffffff)',
  warn: 'var(--bd-warn, var(--jp-warn, #d97706))',
  danger: 'var(--bd-danger, var(--jp-danger, #dc2626))',
  info: 'var(--bd-info, var(--jp-info, #0284c7))',
  violet: 'var(--bd-violet, #6d28d9)',
  fontUi: 'var(--bd-font-ui, var(--jp-font, Inter, system-ui, sans-serif))',
  fontHand: 'var(--bd-font-hand, "Virgil", "Caveat", "Segoe Print", "Bradley Hand", "PingFang SC", cursive)',
  fontMono: 'var(--bd-font-mono, var(--jp-font-mono, ui-monospace, monospace))',
} as const;

export const TABULAR: Record<string, string> = {
  fontFamily: BT.fontMono,
  fontVariantNumeric: 'tabular-nums',
};

export function toneColor(tone: Tone | string | undefined): string {
  switch (tone) {
    case 'accent': case 'signal': return BT.signal;
    case 'info': case 'cyan': return BT.info;
    case 'violet': case 'purple': return BT.violet;
    case 'ok': case 'green': return BT.ok;
    case 'warn': case 'amber': return BT.warn;
    case 'danger': case 'red': return BT.danger;
    case 'muted': return BT.mute;
    default: return BT.on;
  }
}

export function statusTone(status: NodeStatus | string | undefined): Tone {
  switch (status) {
    case 'healthy': case 'cached': return 'ok';
    case 'active': return 'accent';
    case 'hot': case 'degraded': return 'warn';
    case 'down': return 'danger';
    default: return 'muted';
  }
}

export function tonalWash(color: string, pct = 14): string {
  return `color-mix(in srgb, ${color} ${pct}%, var(--bd-slab, var(--jp-surface, #ffffff)))`;
}

export const str = (v: unknown, fallback = ''): string => (typeof v === 'string' ? v : fallback);
export const num = (v: unknown, fallback = 0): number => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);
export const bool = (v: unknown, fallback = false): boolean => (typeof v === 'boolean' ? v : fallback);
export const clamp01 = (x: number): number => Math.max(0, Math.min(1, x));
export const PULSE_SPEED_PX_PER_SEC = 220;
export const PULSE_MIN_MS = 900;
export const PULSE_MAX_AUTO_MS = 6500;

export const pulseDurationMs = (ms: number | undefined): number =>
  typeof ms === 'number' && Number.isFinite(ms) && ms >= 150 ? Math.min(ms, 12000) : PULSE_MIN_MS;

/**
 * Constant-velocity lap duration for FlowEdge pulse packets (~220 px/s),
 * so long corridor wires travel at the same calm visual speed as short links.
 */
export const pulseLapDurationMs = (pathLengthPx: number, explicitDurationMs?: number): number => {
  if (typeof explicitDurationMs === 'number' && Number.isFinite(explicitDurationMs) && explicitDurationMs >= 150) {
    return Math.min(explicitDurationMs, 12000);
  }
  const len = Number.isFinite(pathLengthPx) && pathLengthPx > 0 ? pathLengthPx : 0;
  return Math.min(PULSE_MAX_AUTO_MS, Math.max(PULSE_MIN_MS, Math.round((len / PULSE_SPEED_PX_PER_SEC) * 1000)));
};
