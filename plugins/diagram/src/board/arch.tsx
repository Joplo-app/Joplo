import { useLayoutEffect, useRef, useState } from 'react';
import type { ComponentCtx } from '@joplo-app/kit/plugin';
import { useEngineFrame, useRoot } from '@joplo-app/kit/renderer';
import { RoughPath, useStroke } from '@joplo-app/kit/renderer-internal';
import type { z } from 'zod';
import type { FrameData, PulseSnapshot } from '../schema.ts';
import {
  BT,
  TABULAR,
  bool,
  clamp01,
  num,
  statusTone,
  str,
  tonalWash,
  toneColor,
  type AnchorSide,
} from './tokens.ts';
import { BBadge, BDot, BHeader, BKbd, Glyph, SLAB_STYLE, SURFACE_STYLE, type GlyphName } from './ui.tsx';
import { resolveTechIcon } from './icons.tsx';

type DiagramFrame = z.infer<typeof FrameData>;

function getSceneData(ctx: ComponentCtx) {
  const snap = ctx.ext.diagram as DiagramFrame | undefined;
  return snap?.scenes?.[ctx.frame.sceneId];
}

/** Negative-space camera island anchor inside Canvas. */
export function BoardZone({ ctx }: { ctx: ComponentCtx }) {
  const p = ctx.node.props;
  const x = typeof p.x === 'number' ? p.x : undefined;
  const y = typeof p.y === 'number' ? p.y : undefined;
  const w = typeof p.w === 'number' ? p.w : undefined;
  const h = typeof p.h === 'number' ? p.h : undefined;
  const eyebrow = str(p.eyebrow);
  const title = str(p.title);
  const { x: _x, y: _y, w: _w, h: _h, eyebrow: _e, title: _t, ...rest } = p;

  const root = useRoot(ctx.model, rest, {
    style: {
      position: x !== undefined || y !== undefined ? 'absolute' : 'relative',
      ...(x !== undefined ? { left: x } : {}),
      ...(y !== undefined ? { top: y } : {}),
      ...(w !== undefined ? { width: w } : {}),
      ...(h !== undefined ? { minHeight: h } : {}),
      display: 'flex',
      flexDirection: 'column',
      gap: 20,
      padding: '10px 6px',
    },
  });

  return (
    <div {...root} data-bd-root="">
      {(eyebrow || title) ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          {eyebrow ? (
            <span
              style={{
                ...TABULAR,
                fontSize: 10.5,
                fontWeight: 700,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                padding: '4px 10px',
                borderRadius: 999,
                background: tonalWash(BT.signal, 14),
                color: BT.signal,
              }}
            >
              {eyebrow}
            </span>
          ) : null}
          {title ? (
            <span style={{ fontSize: 18, fontWeight: 700, letterSpacing: '-0.025em', color: BT.on }}>
              {title}
            </span>
          ) : null}
        </div>
      ) : null}
      <div style={{ position: 'relative', flex: 1 }}>{ctx.renderChildren()}</div>
    </div>
  );
}

const KIND_GLYPHS: Record<string, GlyphName> = {
  lb: 'network',
  gateway: 'shield',
  cdn: 'globe',
  firewall: 'shield',
  service: 'server',
  worker: 'cpu',
  cron: 'clock',
  cache: 'zap',
  queue: 'layers',
  pubsub: 'radio',
  db: 'database',
  storage: 'hardDrive',
  search: 'search',
  dns: 'globe',
  client: 'box',
  external: 'cloud',
};

/** System-design architecture node with automatic authentic TechIcon binding, health LED, replicas & telemetry badges. */
export function ArchNode({ ctx }: { ctx: ComponentCtx }) {
  const p = ctx.node.props;
  const label = str(p.label, 'Service');
  const sub = str(p.sub);
  const kind = str(p.kind, 'service');
  const iconMeta = resolveTechIcon(p.icon ?? p.tech);
  const sceneStatus = getSceneData(ctx)?.nodeStates?.[ctx.model.id];
  const status = sceneStatus ?? str(p.status, 'healthy');
  const replicas = typeof p.replicas === 'number' ? p.replicas : undefined;
  const metric = str(p.metric);
  const fill = str(p.fill);
  const sTone = statusTone(status);
  const glyph = KIND_GLYPHS[kind] ?? 'server';

  const { label: _l, sub: _sb, kind: _k, icon: _ic, tech: _tc, status: _st, replicas: _rp, metric: _mt, fill: _fl, ...rest } = p;
  const root = useRoot(ctx.model, rest, {
    style: {
      ...SLAB_STYLE,
      minWidth: 182,
      gap: 8,
      padding: '11px 13px',
      boxShadow: status === 'down'
        ? `0 0 0 2px ${BT.danger}, var(--bd-slab-shadow)`
        : status === 'hot' || status === 'degraded'
          ? `0 0 0 2px ${BT.warn}, var(--bd-slab-shadow)`
          : undefined,
    },
  });

  const Mark = iconMeta?.Mark;
  return (
    <div {...root} data-bd-root="" data-bd-slab="" data-bd-fill={fill === 'solid' ? 'solid' : undefined} data-bd-status={status}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, minWidth: 0 }}>
          <div
            style={{
              width: 34,
              height: 34,
              borderRadius: 10,
              background: iconMeta ? tonalWash(iconMeta.brand, 14) : tonalWash(toneColor(sTone), 14),
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: iconMeta ? BT.on : toneColor(sTone),
              flexShrink: 0,
            }}
          >
            {Mark ? <Mark size={20} /> : <Glyph name={glyph} size={17} />}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 1, minWidth: 0 }}>
            <span style={{ fontSize: 13.5, fontWeight: 700, letterSpacing: '-0.015em', color: BT.on, whiteSpace: 'nowrap' }}>{label}</span>
            {sub ? <span style={{ fontSize: 11, color: BT.mute, whiteSpace: 'nowrap' }}>{sub}</span> : null}
          </div>
        </div>
        <BDot tone={sTone} pulse={status === 'active' || status === 'hot'} />
      </div>

      {(replicas !== undefined || metric || status === 'down' || status === 'degraded') ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          {replicas !== undefined ? <BKbd>×{replicas} pods</BKbd> : null}
          {metric ? <BBadge tone={sTone === 'muted' ? 'neutral' : sTone} size="xs">{metric}</BBadge> : null}
          {(status === 'down' || status === 'degraded') ? <BBadge tone={sTone} solid size="xs">{status.toUpperCase()}</BBadge> : null}
        </div>
      ) : null}
      {ctx.renderChildren()}
    </div>
  );
}

/** Stylized physical 3D-cylinder Database primitive with authentic DB engine logo, role, and storage spec. */
export function Database({ ctx }: { ctx: ComponentCtx }) {
  const p = ctx.node.props;
  const label = str(p.label, 'Primary DB');
  const engine = str(p.engine, 'postgres');
  const role = str(p.role, 'primary');
  const storage = str(p.storage);
  const fill = str(p.fill);
  const iconMeta = resolveTechIcon(engine);
  const col = iconMeta?.brand ?? BT.info;
  const { label: _l, engine: _e, role: _r, storage: _st, fill: _fl, ...rest } = p;

  const root = useRoot(ctx.model, rest, { style: { ...SLAB_STYLE, minWidth: 186, gap: 8, padding: '12px 14px' } });
  const Mark = iconMeta?.Mark;
  return (
    <div {...root} data-bd-root="" data-bd-slab="" data-bd-fill={fill === 'solid' ? 'solid' : undefined}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ position: 'relative', width: 42, height: 46, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <svg width="42" height="46" viewBox="0 0 42 46" style={{ position: 'absolute', inset: 0 }}>
            <path d="M5 10 V36 C5 40.5 12.2 44 21 44 C29.8 44 37 40.5 37 36 V10" fill={tonalWash(col, 14)} stroke={col} strokeWidth="1.8" />
            <ellipse cx="21" cy="10" rx="16" ry="5.5" fill={tonalWash(col, 26)} stroke={col} strokeWidth="1.8" />
            <path d="M5 23 C5 27.5 12.2 31 21 31 C29.8 31 37 27.5 37 23" fill="none" stroke={col} strokeWidth="1.4" opacity="0.5" />
          </svg>
          {Mark ? (
            <span style={{ position: 'relative', marginTop: 8, width: 20, height: 20, borderRadius: 6, background: BT.slab, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 2px 5px rgba(0,0,0,0.14)' }}>
              <Mark size={14} />
            </span>
          ) : null}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
          <span style={{ fontSize: 13.5, fontWeight: 700, color: BT.on, whiteSpace: 'nowrap' }}>{label}</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
            <BBadge tone={role === 'primary' ? 'accent' : role === 'sharded' ? 'violet' : 'ok'} size="xs">{role}</BBadge>
            {storage ? <BKbd>{storage}</BKbd> : null}
          </div>
        </div>
      </div>
    </div>
  );
}

/** Partitioned Message Queue / Kafka Topic conveyor pipe with visible message slots & lag badge. */
export function QueuePipe({ ctx }: { ctx: ComponentCtx }) {
  const p = ctx.node.props;
  const label = str(p.label, 'orders.events');
  const engine = str(p.engine, 'kafka');
  const partitions = Math.max(1, num(p.partitions, 4));
  const lag = str(p.lag);
  const messages = Array.isArray(p.messages) ? (p.messages as string[]) : ['e101', 'e102', 'e103', 'e104'];
  const iconMeta = resolveTechIcon(engine);
  const Mark = iconMeta?.Mark;
  const { label: _l, engine: _e, partitions: _pt, lag: _lg, messages: _ms, ...rest } = p;

  const root = useRoot(ctx.model, rest, { style: { ...SLAB_STYLE, minWidth: 260, gap: 8 } });
  return (
    <div {...root} data-bd-root="" data-bd-slab="">
      <BHeader
        icon={Mark ? <Mark size={16} /> : <Glyph name="layers" size={15} />}
        title={label}
        right={<><BKbd>{partitions}P</BKbd>{lag ? <BBadge tone="warn" size="xs">lag {lag}</BBadge> : null}</>}
      />
      <div style={{ ...SURFACE_STYLE, flexDirection: 'row', alignItems: 'center', gap: 5, padding: '7px 8px' }}>
        {messages.map((m, idx) => {
          const isHead = idx === messages.length - 1;
          return (
            <div key={idx} style={{ flex: 1, padding: '6px 8px', borderRadius: 8, background: isHead ? BT.signal : BT.slab, color: isHead ? BT.onSignal : BT.on, fontSize: 11, fontWeight: 700, textAlign: 'center', boxShadow: `0 0 0 1px ${isHead ? BT.signal : BT.edge}`, ...TABULAR }}>
              {m}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** CacheNode showing hit ratio bar and TTL. */
export function CacheNode({ ctx }: { ctx: ComponentCtx }) {
  const p = ctx.node.props;
  const label = str(p.label, 'Redis Cache');
  const engine = str(p.engine, 'redis');
  const hitRate = Math.max(0, Math.min(100, num(p.hitRate, 94)));
  const ttl = str(p.ttl, 'TTL 5m');
  const iconMeta = resolveTechIcon(engine);
  const Mark = iconMeta?.Mark;
  const { label: _l, engine: _e, hitRate: _hr, ttl: _t, ...rest } = p;

  const root = useRoot(ctx.model, rest, { style: { ...SLAB_STYLE, width: 242, gap: 7 } });
  return (
    <div {...root} data-bd-root="" data-bd-slab="">
      <BHeader
        icon={Mark ? <Mark size={16} /> : <Glyph name="zap" size={15} color={BT.warn} />}
        title={label}
        right={<BBadge tone={hitRate >= 85 ? 'ok' : 'warn'} size="xs">{hitRate}% hit</BBadge>}
      />
      <div style={{ height: 7, borderRadius: 999, background: BT.w12, overflow: 'hidden', padding: 1.5 }}>
        <div style={{ width: `${hitRate}%`, height: '100%', borderRadius: 999, background: hitRate >= 85 ? BT.ok : BT.warn }} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 11, color: BT.mute, ...TABULAR }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><Glyph name="activity" size={11} /> In-Memory</span>
        <BKbd>{ttl}</BKbd>
      </div>
    </div>
  );
}

/** Dashed VPC / Region / K8s Namespace boundary container with cloud icon badge. */
export function ClusterBox({ ctx }: { ctx: ComponentCtx }) {
  const p = ctx.node.props;
  const label = str(p.label, 'VPC · us-east-1');
  const cloud = str(p.cloud);
  const badge = str(p.badge);
  const tone = str(p.tone, 'info');
  const col = toneColor(tone);
  const iconMeta = cloud ? resolveTechIcon(cloud) : null;
  const Mark = iconMeta?.Mark;
  const { label: _l, cloud: _cl, badge: _b, tone: _t, ...rest } = p;

  const root = useRoot(ctx.model, rest, {
    style: {
      position: 'relative',
      display: 'flex',
      flexDirection: 'column',
      gap: 14,
      padding: '16px 18px 18px',
      borderRadius: 'var(--bd-r-outer, 18px)',
      background: tonalWash(col, 5),
      border: `1.75px dashed color-mix(in srgb, ${col} 52%, transparent)`,
    },
  });

  return (
    <div {...root} data-bd-root="">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 12, fontWeight: 700, color: col }}>
          {Mark ? <Mark size={16} /> : <Glyph name="cloud" size={15} />}
          <span>{label}</span>
        </span>
        {badge ? <BBadge tone={tone} size="xs">{badge}</BBadge> : null}
      </div>
      <div style={{ position: 'relative', display: 'flex', gap: 22, alignItems: 'center', flexWrap: 'wrap' }}>
        {ctx.renderChildren()}
      </div>
    </div>
  );
}

/* ---- DOM-Anchored FlowEdge Vector Connector (Rough.js aware + EngineClock pulse) ---- */
type Rect = { x: number; y: number; w: number; h: number };
function relativeRect(el: HTMLElement, ancestor: HTMLElement): Rect | null {
  let x = 0;
  let y = 0;
  let cur: HTMLElement | null = el;
  while (cur && cur !== ancestor) {
    x += cur.offsetLeft;
    y += cur.offsetTop;
    cur = cur.offsetParent as HTMLElement | null;
  }
  if (cur !== ancestor) return null;
  return { x, y, w: el.offsetWidth, h: el.offsetHeight };
}

function anchorOf(r: Rect, side: AnchorSide, other: Rect): [number, number] {
  let s = side;
  if (s === 'auto') {
    const dx = other.x + other.w / 2 - (r.x + r.w / 2);
    const dy = other.y + other.h / 2 - (r.y + r.h / 2);
    s = Math.abs(dx) >= Math.abs(dy) ? (dx >= 0 ? 'right' : 'left') : (dy >= 0 ? 'bottom' : 'top');
  }
  switch (s) {
    case 'left': return [r.x, r.y + r.h / 2];
    case 'right': return [r.x + r.w, r.y + r.h / 2];
    case 'top': return [r.x + r.w / 2, r.y];
    case 'bottom': return [r.x + r.w / 2, r.y + r.h];
    default: return [r.x + r.w / 2, r.y + r.h / 2];
  }
}

export function FlowEdge({ ctx }: { ctx: ComponentCtx }) {
  const p = ctx.node.props;
  const from = str(p.from);
  const to = str(p.to);
  const route = str(p.route, 'curve');
  const fromSide = str(p.fromSide, 'auto') as AnchorSide;
  const toSide = str(p.toSide, 'auto') as AnchorSide;
  const state = str(p.state, 'idle');
  const dashed = bool(p.dashed, state === 'blocked' || p.protocol === 'async');
  const bidirectional = bool(p.bidirectional, false);
  const baseLabel = str(p.label, str(p.protocol));
  const toneProp = str(p.tone);
  const strokeMode = useStroke();

  const pulse: PulseSnapshot | undefined = getSceneData(ctx)?.pulses?.[ctx.model.id];
  const label = pulse?.label ?? baseLabel;
  const live = ctx.frame.animate && !!ctx.frame.clock && (ctx.frame.clock.running || !!ctx.frame.clock.paused);
  useEngineFrame(live && !!pulse?.active);
  const markerId = `bd-arr-${ctx.model.id.replace(/[^a-zA-Z0-9_-]/g, '_')}`;

  const svgRef = useRef<SVGSVGElement | null>(null);
  const [geom, setGeom] = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(null);

  useLayoutEffect(() => {
    const svg = svgRef.current;
    const host = svg?.parentElement;
    if (!host || !from || !to) return;
    const measure = () => {
      const a = host.querySelector(`[data-jid="${CSS.escape(from)}"]`) as HTMLElement | null;
      const b = host.querySelector(`[data-jid="${CSS.escape(to)}"]`) as HTMLElement | null;
      if (!a || !b) return;
      const ra = relativeRect(a, host);
      const rb = relativeRect(b, host);
      if (!ra || !rb) return;
      const [x1, y1] = anchorOf(ra, fromSide, rb);
      const [x2, y2] = anchorOf(rb, toSide, ra);
      setGeom((prev) => (prev && prev.x1 === x1 && prev.y1 === y1 && prev.x2 === x2 && prev.y2 === y2 ? prev : { x1, y1, x2, y2 }));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(host);
    return () => ro.disconnect();
  }, [from, to, fromSide, toSide, ctx.frame.position]);

  const pulseT = pulse?.active
    ? live && ctx.frame.clock
      ? clamp01((ctx.frame.clock.elapsedMs % pulse.durationMs) / pulse.durationMs)
      : 0.54
    : -1;

  const stroke = pulse?.tone
    ? toneColor(pulse.tone)
    : toneProp
      ? toneColor(toneProp)
      : state === 'active' || pulse?.active
        ? BT.signal
        : state === 'blocked' || state === 'error'
          ? BT.danger
          : state === 'cached'
            ? BT.ok
            : BT.faint;

  const isHot = state === 'active' || Boolean(pulse?.active);
  const { from: _f, to: _t, route: _r, fromSide: _fs, toSide: _ts, state: _s, dashed: _d, bidirectional: _b, label: _l, protocol: _pr, tone: _tn, ...rest } = p;
  const root = useRoot(ctx.model, rest, {
    style: { position: 'absolute', inset: 0, width: '100%', height: '100%', overflow: 'visible', pointerEvents: 'none', zIndex: 4 },
  });

  if (!geom) return <svg {...root} ref={svgRef} data-bd-root="" />;

  const { x1, y1, x2, y2 } = geom;
  const dx = x2 - x1;
  const dy = y2 - y1;
  const dist = Math.hypot(dx, dy) || 1;
  const bend = num(p.bend, route === 'arc' ? Math.min(72, dist * 0.34) : Math.min(34, dist * 0.2));

  let d: string;
  let ptAt: (t: number) => [number, number];
  if (route === 'straight') {
    d = `M ${x1} ${y1} L ${x2} ${y2}`;
    ptAt = (t) => [x1 + dx * t, y1 + dy * t];
  } else if (route === 'elbow') {
    const mx = (x1 + x2) / 2;
    d = `M ${x1} ${y1} L ${mx} ${y1} L ${mx} ${y2} L ${x2} ${y2}`;
    ptAt = (t) => (t < 0.33 ? [x1 + (mx - x1) * (t / 0.33), y1] : t < 0.66 ? [mx, y1 + dy * ((t - 0.33) / 0.33)] : [mx + (x2 - mx) * ((t - 0.66) / 0.34), y2]);
  } else {
    const cx = (x1 + x2) / 2 - (dy / dist) * bend;
    const cy = (y1 + y2) / 2 + (dx / dist) * bend;
    d = `M ${x1} ${y1} Q ${cx} ${cy} ${x2} ${y2}`;
    ptAt = (t) => {
      const mt = 1 - t;
      return [mt * mt * x1 + 2 * mt * t * cx + t * t * x2, mt * mt * y1 + 2 * mt * t * cy + t * t * y2];
    };
  }

  const [mx, my] = ptAt(0.5);
  const tEff = pulse?.reverse ? 1 - pulseT : pulseT;
  const [px, py] = pulseT >= 0 ? ptAt(tEff) : [0, 0];
  const pillW = Math.max(46, Math.round(label.length * 7.5 + 16));

  // Hand-drawn arrowhead triangle at endpoint when rough mode is active
  const [tx, ty] = ptAt(0.92);
  const ang = Math.atan2(y2 - ty, x2 - tx);
  const ah = 9;
  const headD = `M ${x2} ${y2} L ${x2 - ah * Math.cos(ang - 0.45)} ${y2 - ah * Math.sin(ang - 0.45)} L ${x2 - ah * Math.cos(ang + 0.45)} ${y2 - ah * Math.sin(ang + 0.45)} Z`;

  return (
    <svg {...root} ref={svgRef} data-bd-root="">
      <defs>
        <marker id={markerId} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6.5" markerHeight="6.5" orient="auto-start-reverse">
          <path d="M 1 1.5 L 8.5 5 L 1 8.5 z" fill={stroke} />
        </marker>
      </defs>
      {strokeMode === 'rough' ? (
        <>
          <RoughPath seedKey={`${ctx.model.id}:edge`} d={d} stroke={stroke} strokeWidth={isHot ? 2.4 : 1.75} dashed={dashed} roughness={0.85} />
          <RoughPath seedKey={`${ctx.model.id}:head`} d={headD} stroke={stroke} fill={stroke} strokeWidth={1.2} roughness={0.4} />
        </>
      ) : (
        <path
          d={d}
          fill="none"
          stroke={stroke}
          strokeWidth={isHot ? 2.4 : 1.75}
          strokeDasharray={dashed ? '5 4' : undefined}
          strokeLinecap="round"
          markerEnd={`url(#${markerId})`}
          markerStart={bidirectional ? `url(#${markerId})` : undefined}
        />
      )}
      {pulseT >= 0 ? (
        <circle cx={px} cy={py} r={5.5} fill={stroke} stroke={BT.slab} strokeWidth={2} />
      ) : null}
      {label ? (
        <g transform={`translate(${mx}, ${my})`}>
          <rect x={-pillW / 2} y={-10.5} width={pillW} height={21} rx={999} fill={BT.slab} stroke={BT.edge} strokeWidth={1} />
          <text
            x={0}
            y={3.5}
            textAnchor="middle"
            style={{ fontSize: 10.5, fontFamily: BT.fontMono, fontWeight: 700, fill: stroke }}
          >
            {label}
          </text>
        </g>
      ) : null}
    </svg>
  );
}
