import type { CSSProperties } from 'react';
import type { ComponentCtx } from '@joplo-app/kit/plugin';
import { useRoot } from '@joplo-app/kit/renderer';
import { BT, bool, num, str, tonalWash, toneColor } from './tokens.ts';
import { BBadge } from './ui.tsx';

type Pose =
  | 'standing' | 'coding' | 'thinking' | 'pointing' | 'happy'
  | 'confused' | 'running' | 'presenting' | 'admin' | 'team';

function StickSvg({ pose, color, size }: { pose: Pose; color: string; size: number }) {
  const sw = 2.3;
  const strokeProps = { stroke: color, strokeWidth: sw, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, fill: 'none' };

  if (pose === 'team') {
    return (
      <svg width={size * 1.45} height={size} viewBox="0 0 92 64" style={{ display: 'block', overflow: 'visible' }}>
        <g opacity="0.72" transform="translate(-2, 4)">
          <circle cx="20" cy="14" r="6.5" {...strokeProps} />
          <path d="M20 21 C19.5 31 20.5 37 20 42 M20 27 L11 35 M20 27 L29 34 M20 42 L13 56 M20 42 L26 56" {...strokeProps} />
        </g>
        <g opacity="0.72" transform="translate(2, 4)">
          <circle cx="72" cy="14" r="6.5" {...strokeProps} />
          <path d="M72 21 C72.5 31 71.5 37 72 42 M72 27 L63 34 M72 27 L81 35 M72 42 L66 56 M72 42 L79 56" {...strokeProps} />
        </g>
        <g>
          <circle cx="46" cy="13" r="8" fill={tonalWash(color, 12)} stroke={color} strokeWidth={sw} />
          <path d="M46 21 C45.4 33 46.5 39 46 45 M46 28 L34 36 M46 28 L58 36 M46 45 L38 61 M46 45 L54 61" {...strokeProps} />
        </g>
      </svg>
    );
  }

  return (
    <svg width={size} height={size} viewBox="0 0 64 64" style={{ display: 'block', overflow: 'visible' }}>
      <circle
        cx={pose === 'running' ? 35 : pose === 'coding' ? 27 : 32}
        cy={pose === 'coding' ? 15 : 13}
        r="7.8"
        fill={tonalWash(color, 10)}
        stroke={color}
        strokeWidth={sw}
      />
      {pose === 'standing' && <path d="M32 21 C31.4 31 32.5 37 32 43 M32 27 C27 31 23 35 20 38 M32 27 C37 31 41 35 44 38 M32 43 C29 50 26 55 24 60 M32 43 C35 50 38 55 40 60" {...strokeProps} />}
      {pose === 'coding' && <path d="M27 23 C26 32 25 38 24 44 M26 29 L35 35 L42 35 M25 31 L34 38 L41 38 M24 44 L36 45 L38 58 M24 44 L20 57 M38 40 L55 40 M43 40 L48 28 L57 28 L52 40" {...strokeProps} />}
      {pose === 'thinking' && (
        <>
          <path d="M32 21 C31.5 31 32.5 37 32 43 M32 28 L23 36 L25 42 M32 28 L41 26 L37 20 M32 43 L25 59 M32 43 L39 59" {...strokeProps} />
          <circle cx="46" cy="11" r="1.5" fill={color} />
          <circle cx="51" cy="7" r="2.2" fill={color} />
          <circle cx="57" cy="4" r="3" {...strokeProps} />
        </>
      )}
      {pose === 'pointing' && <path d="M32 21 C31.5 31 32.5 37 32 43 M32 27 L21 35 M32 27 L52 24 M48 21 L54 24 L49 27 M32 43 L25 59 M32 43 L39 59" {...strokeProps} />}
      {pose === 'happy' && (
        <>
          <path d="M29 14 Q32 17 35 14" stroke={color} strokeWidth={1.7} strokeLinecap="round" fill="none" />
          <path d="M32 21 C31.5 31 32.5 37 32 43 M32 28 C25 23 19 17 15 12 M32 28 C39 23 45 17 49 12 M32 43 L24 58 M32 43 L40 58" {...strokeProps} />
          <path d="M11 6 L13 9 M53 6 L51 9 M32 2 L32 4" stroke={color} strokeWidth={1.8} strokeLinecap="round" />
        </>
      )}
      {pose === 'confused' && (
        <>
          <path d="M32 21 C31.5 31 32.5 37 32 43 M32 28 L20 34 L18 28 M32 28 L44 34 L46 28 M32 43 L26 59 M32 43 L38 59" {...strokeProps} />
          <path d="M47 8 C47 5 52 5 52 8 C52 10 49.5 10.5 49.5 12.5" {...strokeProps} strokeWidth={2} />
          <circle cx="49.5" cy="15.5" r="1.1" fill={color} />
        </>
      )}
      {pose === 'running' && (
        <>
          <path d="M34 21 C32 30 30 35 28 41 M32 27 L44 24 L49 29 M32 27 L21 31 L16 26 M28 41 L40 48 L46 58 M28 41 L18 50 L11 49" {...strokeProps} />
          <path d="M8 22 L15 22 M6 28 L12 28" stroke={color} strokeWidth={1.6} strokeLinecap="round" opacity="0.55" />
        </>
      )}
      {pose === 'presenting' && (
        <>
          <path d="M24 21 L24 43 M24 28 L15 36 M24 28 L38 22 M24 43 L18 59 M24 43 L30 59" {...strokeProps} />
          <rect x="38" y="13" width="21" height="17" rx="3" fill={tonalWash(color, 10)} stroke={color} strokeWidth={2} />
          <path d="M43 24 L47 20 L51 23 L55 17" {...strokeProps} strokeWidth={1.8} />
        </>
      )}
      {pose === 'admin' && (
        <>
          <path d="M32 21 L32 43 M32 27 L21 35 M32 27 L44 33 M32 43 L25 59 M32 43 L39 59" {...strokeProps} />
          <path d="M46 25 L54 28 V35 C54 40 50 43 46 45 C42 43 38 40 38 35 V28 Z" fill={tonalWash(color, 18)} stroke={color} strokeWidth={2} />
        </>
      )}
    </svg>
  );
}

export function StickFigure({ ctx }: { ctx: ComponentCtx }) {
  const p = ctx.node.props;
  const pose = str(p.pose, 'standing') as Pose;
  const label = str(p.label);
  const role = str(p.role);
  const tone = str(p.tone, 'neutral');
  const size = num(p.size, 62);
  const col = tone === 'neutral' ? BT.on : toneColor(tone);
  const { pose: _ps, label: _l, role: _r, tone: _t, size: _s, ...rest } = p;
  const root = useRoot(ctx.model, rest, {
    style: { display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: 6, padding: '6px 10px' },
  });
  return (
    <div {...root} data-bd-root="">
      <StickSvg pose={pose} color={col} size={size} />
      {label ? <span style={{ fontSize: 12.5, fontWeight: 700, color: BT.on, textAlign: 'center', fontFamily: BT.fontHand }}>{label}</span> : null}
      {role ? <BBadge tone={tone} size="xs">{role}</BBadge> : null}
    </div>
  );
}

const STICKY_PALETTE: Record<string, { bg: string; fold: string; ink: string }> = {
  yellow:   { bg: '#fef08a', fold: '#eab308', ink: '#422006' },
  pink:     { bg: '#fbcfe8', fold: '#ec4899', ink: '#500724' },
  mint:     { bg: '#bbf7d0', fold: '#22c55e', ink: '#052e16' },
  sky:      { bg: '#bae6fd', fold: '#0ea5e9', ink: '#082f49' },
  lavender: { bg: '#ddd6fe', fold: '#8b5cf6', ink: '#2e1065' },
  peach:    { bg: '#fed7aa', fold: '#f97316', ink: '#431407' },
};

export function StickyNote({ ctx }: { ctx: ComponentCtx }) {
  const p = ctx.node.props;
  const pal = STICKY_PALETTE[str(p.color, 'yellow')] ?? STICKY_PALETTE.yellow!;
  const title = str(p.title);
  const text = str(p.text);
  const author = str(p.author);
  const tilt = num(p.tilt, -1.5);
  const pin = bool(p.pin, true);
  const w = num(p.w, 184);
  const { color: _c, title: _t, text: _tx, author: _a, tilt: _tl, pin: _pn, w: _w, ...rest } = p;

  const root = useRoot(ctx.model, rest, {
    style: {
      position: 'relative',
      display: 'flex',
      flexDirection: 'column',
      gap: 6,
      width: w,
      minHeight: 118,
      padding: '15px 15px 14px',
      borderRadius: '3px 3px 18px 3px',
      background: `linear-gradient(155deg, ${pal.bg} 0%, color-mix(in srgb, ${pal.bg} 92%, ${pal.fold}) 100%)`,
      color: pal.ink,
      boxShadow: '0 10px 22px -8px rgba(15, 23, 42, 0.24), 0 2px 5px rgba(15, 23, 42, 0.08)',
      transform: tilt ? `rotate(${tilt}deg)` : undefined,
      fontFamily: BT.fontHand,
    },
  });

  return (
    <div {...root} data-bd-root="">
      {pin ? (
        <span style={{ position: 'absolute', top: -7, left: '50%', transform: 'translateX(-50%) rotate(-1.5deg)', width: 44, height: 14, borderRadius: 2, background: 'rgba(255, 255, 255, 0.56)', boxShadow: '0 1px 2px rgba(0,0,0,0.08)', pointerEvents: 'none' }} />
      ) : null}
      <span style={{ position: 'absolute', right: 0, bottom: 0, width: 18, height: 18, background: `linear-gradient(135deg, color-mix(in srgb, ${pal.fold} 40%, ${pal.bg}) 50%, transparent 50%)`, borderTopLeftRadius: 5, pointerEvents: 'none' }} />
      {title ? <strong style={{ fontSize: 14, fontWeight: 800, lineHeight: 1.25 }}>{title}</strong> : null}
      {text ? <span style={{ fontSize: 13, lineHeight: 1.4, opacity: 0.92 }}>{text}</span> : null}
      {ctx.renderChildren()}
      {author ? <span style={{ marginTop: 'auto', fontSize: 11, fontWeight: 700, opacity: 0.68 }}>— {author}</span> : null}
    </div>
  );
}

export function SpeechBubble({ ctx }: { ctx: ComponentCtx }) {
  const p = ctx.node.props;
  const text = str(p.text);
  const kind = str(p.kind, 'speech');
  const tail = str(p.tail, 'left');
  const speaker = str(p.speaker);
  const tone = str(p.tone, 'neutral');
  const col = tone === 'neutral' ? BT.on : toneColor(tone);
  const { text: _tx, kind: _k, tail: _tl, speaker: _sp, tone: _tn, ...rest } = p;
  const isThought = kind === 'thought';
  const isShout = kind === 'shout';

  const root = useRoot(ctx.model, rest, {
    style: {
      position: 'relative',
      display: 'inline-flex',
      flexDirection: 'column',
      gap: 4,
      maxWidth: 260,
      padding: isThought ? '12px 18px' : '11px 15px',
      borderRadius: isThought ? 999 : isShout ? 8 : 16,
      background: tone === 'neutral' ? BT.slab : tonalWash(col, 14),
      border: `2px ${isThought ? 'dashed' : 'solid'} ${col}`,
      boxShadow: isShout ? `4px 4px 0 ${col}` : 'var(--bd-slab-shadow)',
      color: BT.on,
      fontFamily: BT.fontHand,
    },
  });

  const tailStyle: CSSProperties =
    tail === 'right'
      ? { right: -9, top: '50%', transform: 'translateY(-50%) rotate(45deg)', borderRight: `2px solid ${col}`, borderTop: `2px solid ${col}` }
      : tail === 'bottom'
        ? { bottom: -9, left: 26, transform: 'rotate(45deg)', borderRight: `2px solid ${col}`, borderBottom: `2px solid ${col}` }
        : tail === 'top'
          ? { top: -9, left: 26, transform: 'rotate(45deg)', borderLeft: `2px solid ${col}`, borderTop: `2px solid ${col}` }
          : { left: -9, top: '50%', transform: 'translateY(-50%) rotate(45deg)', borderLeft: `2px solid ${col}`, borderBottom: `2px solid ${col}` };

  return (
    <div {...root} data-bd-root="">
      {!isThought ? (
        <span style={{ position: 'absolute', width: 14, height: 14, background: tone === 'neutral' ? BT.slab : tonalWash(col, 14), ...tailStyle }} />
      ) : (
        <>
          <span style={{ position: 'absolute', [tail === 'right' ? 'right' : 'left']: -10, bottom: 2, width: 9, height: 9, borderRadius: '50%', background: BT.slab, border: `2px solid ${col}` }} />
          <span style={{ position: 'absolute', [tail === 'right' ? 'right' : 'left']: -19, bottom: -5, width: 5.5, height: 5.5, borderRadius: '50%', background: BT.slab, border: `2px solid ${col}` }} />
        </>
      )}
      {speaker ? <span style={{ fontSize: 10.5, fontWeight: 700, color: col, fontFamily: BT.fontUi }}>{speaker}</span> : null}
      {text ? <span style={{ fontSize: 13.5, fontWeight: isShout ? 750 : 600, lineHeight: 1.38 }}>{text}</span> : null}
      {ctx.renderChildren()}
    </div>
  );
}

/** Protect CLI flags like --sheet or --film from splitting between hyphens. */
function renderProtectedDetail(detail: string) {
  const parts = detail.split(/(--[a-zA-Z0-9-]+)/g);
  if (parts.length === 1) return detail;
  return parts.map((part, idx) =>
    part.startsWith('--') ? (
      <span key={idx} style={{ whiteSpace: 'nowrap' }}>{part}</span>
    ) : (
      part
    ),
  );
}

export function Callout({ ctx }: { ctx: ComponentCtx }) {
  const p = ctx.node.props;
  const label = str(p.label, 'Note');
  const detail = str(p.detail);
  const kind = str(p.kind, 'badge');
  const tone = str(p.tone, kind === 'warning' ? 'danger' : kind === 'idea' ? 'warn' : kind === 'stamp' ? 'ok' : 'accent');
  const col = toneColor(tone);
  const { label: _l, detail: _d, kind: _k, tone: _t, ...rest } = p;
  const isStamp = kind === 'stamp';
  const keepLabelSingle = label.length <= 16;
  const root = useRoot(ctx.model, rest, {
    style: {
      display: 'inline-flex',
      flexWrap: 'wrap',
      alignItems: 'center',
      columnGap: 10,
      rowGap: 4,
      padding: isStamp ? '7px 14px' : detail ? '8px 14px' : '7px 13px',
      borderRadius: isStamp ? 8 : detail ? 14 : 999,
      background: isStamp ? 'transparent' : tonalWash(col, 16),
      border: isStamp ? `2.5px double ${col}` : `1.5px solid color-mix(in srgb, ${col} 42%, transparent)`,
      color: col,
      transform: isStamp ? 'rotate(-3deg)' : undefined,
      fontWeight: 750,
      fontSize: isStamp ? 13 : 12.5,
      letterSpacing: isStamp ? '0.08em' : '-0.01em',
      textTransform: isStamp ? 'uppercase' : undefined,
    },
  });
  return (
    <div {...root} data-bd-root="" data-bd-callout="">
      <span style={{ whiteSpace: keepLabelSingle ? 'nowrap' : undefined, flexShrink: 0 }}>{label}</span>
      {detail ? (
        <span
          style={{
            fontWeight: 500,
            color: BT.soft,
            textTransform: 'none',
            letterSpacing: 0,
            lineHeight: 1.4,
            minWidth: 0,
            flex: '1 1 150px',
            overflowWrap: 'break-word',
          }}
        >
          {renderProtectedDetail(detail)}
        </span>
      ) : null}
    </div>
  );
}
