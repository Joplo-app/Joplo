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
  pulseLapDurationMs,
  statusTone,
  str,
  tonalWash,
  toneColor,
  type AnchorSide,
} from './tokens.ts';
import { BBadge, BDot, BHeader, BKbd, Glyph, SLAB_STYLE, SURFACE_STYLE, type GlyphName } from './ui.tsx';
import { resolveTechIcon } from './icons.tsx';
import {
  polylineLength,
  routeBoardEdges,
  samplePolyline,
  sampleQuad,
  type BoardNode,
  type EdgeSpec,
  type Rect,
  type RouteKind,
  type RoutedEdge,
  type SoftObstacle,
} from './edge-routing.ts';

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
  const statusRing =
    status === 'down'
      ? `0 0 0 2px ${BT.danger}`
      : status === 'hot' || status === 'degraded'
        ? `0 0 0 2px ${BT.warn}`
        : undefined;
  const root = useRoot(ctx.model, rest, {
    style: {
      ...SLAB_STYLE,
      minWidth: 182,
      gap: 8,
      padding: '11px 13px',
      ...(statusRing ? ({ '--bd-status-ring': statusRing } as Record<string, string>) : {}),
    },
  });

  const Mark = iconMeta?.Mark;
  return (
    <div {...root} data-bd-root="" data-bd-slab="" data-bd-fill={fill === 'solid' ? 'solid' : undefined} data-bd-status={status}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, minWidth: 0, flex: 1 }}>
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
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0, flex: 1 }}>
            <span
              title={label}
              style={{
                fontSize: 13.5,
                fontWeight: 700,
                letterSpacing: '-0.015em',
                color: BT.on,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {label}
            </span>
            {sub ? (
              <span
                style={{
                  fontSize: 11,
                  lineHeight: 1.35,
                  color: BT.mute,
                  overflowWrap: 'anywhere',
                }}
              >
                {sub}
              </span>
            ) : null}
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
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0, flex: 1 }}>
          <span title={label} style={{ fontSize: 13.5, fontWeight: 700, color: BT.on, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</span>
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
    <div {...root} data-bd-root="" data-bd-cluster="">
      <div data-bd-cluster-header="" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
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

/* ---- DOM-Anchored FlowEdge Vector Connector (Board-Wide Programmatic Router + Rough.js + EngineClock pulse) ---- */
function relativeRect(el: HTMLElement, ancestor: HTMLElement): Rect | null {
  let x = 0;
  let y = 0;
  let cur: HTMLElement | null = el;
  while (cur && cur !== ancestor) {
    x += cur.offsetLeft;
    y += cur.offsetTop;
    cur = cur.offsetParent as HTMLElement | null;
  }
  if (cur === ancestor) return { x, y, w: el.offsetWidth, h: el.offsetHeight };
  // Fallback when offsetParent chain skips host (e.g. non-positioned wrapper)
  const hr = ancestor.getBoundingClientRect();
  const er = el.getBoundingClientRect();
  const scale = hr.width / (ancestor.offsetWidth || 1);
  if (scale <= 0) return null;
  return {
    x: (er.left - hr.left) / scale,
    y: (er.top - hr.top) / scale,
    w: er.width / scale,
    h: er.height / scale,
  };
}

const VALID_ROUTES = new Set<RouteKind>(['curve', 'straight', 'elbow', 'ortho', 'arc', 'auto']);
const boardRouteCache = new WeakMap<HTMLElement, { sig: string; routes: Map<string, RoutedEdge> }>();

function solveBoardEdges(host: HTMLElement): Map<string, RoutedEdge> {
  const edgeEls = [...host.querySelectorAll<SVGSVGElement>('svg[data-fe-edge]')].filter(
    (el) => el.parentElement === host,
  );
  const specs: EdgeSpec[] = [];
  const referencedIds = new Set<string>();
  for (const el of edgeEls) {
    const id = el.dataset.feId ?? '';
    const from = el.dataset.feFrom ?? '';
    const to = el.dataset.feTo ?? '';
    if (!id || !from || !to) continue;
    const rawRoute = (el.dataset.feRoute ?? 'curve') as RouteKind;
    const route: RouteKind = VALID_ROUTES.has(rawRoute) ? rawRoute : 'curve';
    const fromSide = (el.dataset.feFromSide ?? 'auto') as AnchorSide;
    const toSide = (el.dataset.feToSide ?? 'auto') as AnchorSide;
    const bendStr = el.dataset.feBend;
    const bend = bendStr !== undefined && bendStr !== '' && Number.isFinite(Number(bendStr)) ? Number(bendStr) : undefined;
    const label = el.dataset.feLabel ?? '';
    specs.push({ id, from, to, route, fromSide, toSide, bend, label });
    referencedIds.add(from);
    referencedIds.add(to);
  }
  if (specs.length === 0) return new Map();

  // Collect node boxes: all referenced endpoints + all visual node slabs/shapes inside host
  const nodes: BoardNode[] = [];
  const seenNodeEl = new Set<HTMLElement>();
  const seenNodeId = new Set<string>();
  const addNode = (id: string, el: HTMLElement) => {
    if (seenNodeEl.has(el) || seenNodeId.has(id)) return;
    const rect = relativeRect(el, host);
    if (!rect || rect.w <= 0 || rect.h <= 0) return;
    seenNodeEl.add(el);
    seenNodeId.add(id);
    const shape = el.dataset.bdShape === 'decision' ? 'decision' : 'box';
    nodes.push({ id, rect, shape });
  };

  for (const id of referencedIds) {
    const el = host.querySelector<HTMLElement>(`[data-jid="${CSS.escape(id)}"]`);
    if (el) addNode(id, el);
  }
  let anonIdx = 0;
  for (const el of host.querySelectorAll<HTMLElement>('[data-bd-slab], [data-bd-node]')) {
    if (seenNodeEl.has(el)) continue;
    const id = el.getAttribute('data-jid') ?? `__obs_${anonIdx++}`;
    addNode(id, el);
  }

  // Collect ClusterBox headers/badges (strong avoid), cluster perimeters (mild crossing penalty), and whiteboard Callouts
  const softObstacles: SoftObstacle[] = [];
  for (const hdr of host.querySelectorAll<HTMLElement>('[data-bd-cluster-header]')) {
    const rect = relativeRect(hdr, host);
    if (rect && rect.w > 0 && rect.h > 0) softObstacles.push({ rect, kind: 'header' });
  }
  for (const cl of host.querySelectorAll<HTMLElement>('[data-bd-cluster]')) {
    const rect = relativeRect(cl, host);
    if (rect && rect.w > 0 && rect.h > 0) softObstacles.push({ rect, kind: 'border' });
  }
  for (const co of host.querySelectorAll<HTMLElement>('[data-bd-callout]')) {
    const rect = relativeRect(co, host);
    if (rect && rect.w > 0 && rect.h > 0) softObstacles.push({ rect, kind: 'callout' });
  }

  const sig = JSON.stringify([
    nodes.map((n) => [n.id, Math.round(n.rect.x), Math.round(n.rect.y), Math.round(n.rect.w), Math.round(n.rect.h), n.shape]),
    softObstacles.map((o) => [o.kind, Math.round(o.rect.x), Math.round(o.rect.y), Math.round(o.rect.w), Math.round(o.rect.h)]),
    specs.map((s) => [s.id, s.from, s.to, s.route, s.fromSide, s.toSide, s.bend ?? null, s.label]),
  ]);

  const cached = boardRouteCache.get(host);
  if (cached && cached.sig === sig) return cached.routes;

  const routes = routeBoardEdges({ nodes, edges: specs, softObstacles });
  boardRouteCache.set(host, { sig, routes });
  return routes;
}

export function FlowEdge({ ctx }: { ctx: ComponentCtx }) {
  const p = ctx.node.props;
  const from = str(p.from);
  const to = str(p.to);
  const route = str(p.route, 'curve');
  const fromSide = str(p.fromSide, 'auto') as AnchorSide;
  const toSide = str(p.toSide, 'auto') as AnchorSide;
  const explicitBend = p.bend !== undefined ? num(p.bend, 0) : undefined;
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
  const [routed, setRouted] = useState<RoutedEdge | null>(null);

  useLayoutEffect(() => {
    const svg = svgRef.current;
    const host = svg?.parentElement;
    if (!host || !from || !to) return;
    const measure = () => {
      const next = solveBoardEdges(host).get(ctx.model.id) ?? null;
      setRouted((prev) => {
        if (!prev && !next) return prev;
        if (
          prev &&
          next &&
          prev.d === next.d &&
          prev.pillW === next.pillW &&
          prev.pillH === next.pillH &&
          prev.hasCrossing === next.hasCrossing &&
          prev.labelLines.join('\n') === next.labelLines.join('\n') &&
          Math.abs(prev.labelPos.x - next.labelPos.x) < 0.25 &&
          Math.abs(prev.labelPos.y - next.labelPos.y) < 0.25 &&
          JSON.stringify(prev.labelTick ?? null) === JSON.stringify(next.labelTick ?? null)
        ) {
          return prev;
        }
        return next;
      });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(host);
    // Also watch endpoints so height changes from wrapping subtitles immediately re-anchor edges
    const a = host.querySelector<HTMLElement>(`[data-jid="${CSS.escape(from)}"]`);
    const b = host.querySelector<HTMLElement>(`[data-jid="${CSS.escape(to)}"]`);
    if (a) ro.observe(a);
    if (b) ro.observe(b);
    return () => ro.disconnect();
  }, [ctx.model.id, from, to, route, fromSide, toSide, explicitBend, label, ctx.frame.position]);

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
  const { from: _f, to: _t, route: _r, fromSide: _fs, toSide: _ts, bend: _bn, state: _s, dashed: _d, bidirectional: _b, label: _l, protocol: _pr, tone: _tn, ...rest } = p;
  const root = useRoot(ctx.model, rest, {
    style: { position: 'absolute', inset: 0, width: '100%', height: '100%', overflow: 'visible', pointerEvents: 'none', zIndex: isHot ? 6 : 4 },
  });

  const dataAttrs = {
    'data-bd-root': '',
    'data-fe-edge': '',
    'data-fe-id': ctx.model.id,
    'data-fe-from': from,
    'data-fe-to': to,
    'data-fe-route': route,
    'data-fe-from-side': fromSide,
    'data-fe-to-side': toSide,
    'data-fe-bend': explicitBend !== undefined ? String(explicitBend) : '',
    'data-fe-label': label,
  };

  if (!routed) return <svg {...root} {...dataAttrs} ref={svgRef} />;

  const lapMs = pulse?.active
    ? pulseLapDurationMs(polylineLength(routed.points), pulse.explicitDuration ? pulse.durationMs : undefined)
    : 0;
  const pulseT = pulse?.active
    ? live && ctx.frame.clock && lapMs > 0
      ? clamp01((ctx.frame.clock.elapsedMs % lapMs) / lapMs)
      : 0.54
    : -1;

  const ptAt = (t: number): [number, number] => {
    const pt = routed.kind === 'quad' && routed.quad ? sampleQuad(routed.quad, t) : samplePolyline(routed.points, t);
    return [pt.x, pt.y];
  };

  const tEff = pulse?.reverse ? 1 - pulseT : pulseT;
  const [px, py] = pulseT >= 0 ? ptAt(tEff) : [0, 0];
  const { x: mx, y: my } = routed.labelPos;
  const pillW = routed.pillW;

  // Hand-drawn arrowhead triangle at endpoint when rough mode is active
  const ang = Math.atan2(routed.headTo.y - routed.headFrom.y, routed.headTo.x - routed.headFrom.x);
  const ah = 9;
  const headD = `M ${routed.headTo.x} ${routed.headTo.y} L ${routed.headTo.x - ah * Math.cos(ang - 0.45)} ${routed.headTo.y - ah * Math.sin(ang - 0.45)} L ${routed.headTo.x - ah * Math.cos(ang + 0.45)} ${routed.headTo.y - ah * Math.sin(ang + 0.45)} Z`;

  return (
    <svg {...root} {...dataAttrs} ref={svgRef}>
      <defs>
        <marker id={markerId} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6.5" markerHeight="6.5" orient="auto-start-reverse">
          <path d="M 1 1.5 L 8.5 5 L 1 8.5 z" fill={stroke} />
        </marker>
      </defs>
      {strokeMode === 'rough' ? (
        <>
          <RoughPath seedKey={`${ctx.model.id}:edge`} d={routed.d} stroke={stroke} strokeWidth={isHot ? 2.4 : 1.75} dashed={dashed} roughness={0.85} />
          <RoughPath seedKey={`${ctx.model.id}:head`} d={headD} stroke={stroke} fill={stroke} strokeWidth={1.2} roughness={0.4} />
        </>
      ) : (
        <>
          {routed.hasCrossing ? (
            <path
              d={routed.d}
              fill="none"
              stroke={BT.bg}
              strokeWidth={isHot ? 6.5 : 5.5}
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity={0.86}
            />
          ) : null}
          <path
            d={routed.d}
            fill="none"
            stroke={stroke}
            strokeWidth={isHot ? 2.4 : 1.75}
            strokeDasharray={dashed ? '5 4' : undefined}
            strokeLinecap="round"
            strokeLinejoin="round"
            markerEnd={`url(#${markerId})`}
            markerStart={bidirectional ? `url(#${markerId})` : undefined}
          />
        </>
      )}
      {pulseT >= 0 ? (
        <circle cx={px} cy={py} r={5.5} fill={stroke} stroke={BT.slab} strokeWidth={2} />
      ) : null}
      {routed.labelTick ? (
        <line
          x1={routed.labelTick.x1}
          y1={routed.labelTick.y1}
          x2={routed.labelTick.x2}
          y2={routed.labelTick.y2}
          stroke={stroke}
          strokeWidth={1.1}
          strokeDasharray="2 2"
          opacity={0.75}
        />
      ) : null}
      {label && routed.labelLines.length > 0 ? (
        <g transform={`translate(${mx}, ${my})`}>
          <rect
            x={-pillW / 2}
            y={-routed.pillH / 2}
            width={pillW}
            height={routed.pillH}
            rx={routed.labelLines.length > 1 ? 11 : 999}
            fill={BT.slab}
            stroke={BT.edge}
            strokeWidth={1}
          />
          {routed.labelLines.length === 1 ? (
            <text
              x={0}
              y={3.8}
              textAnchor="middle"
              style={{ fontSize: 10.5, fontFamily: BT.fontMono, fontWeight: 700, fill: stroke }}
            >
              {routed.labelLines[0]}
            </text>
          ) : (
            <text
              x={0}
              textAnchor="middle"
              style={{ fontSize: 10.5, fontFamily: BT.fontMono, fontWeight: 700, fill: stroke }}
            >
              <tspan x={0} y={-3}>{routed.labelLines[0]}</tspan>
              <tspan x={0} y={11}>{routed.labelLines[1]}</tspan>
            </text>
          )}
        </g>
      ) : null}
    </svg>
  );
}
