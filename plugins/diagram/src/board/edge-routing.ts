/**
 * Programmatic board-wide FlowEdge router:
 * 1. Multi-port spreading along shared rectangular node sides (preserving diamond tips, safe for any node ID).
 * 2. Automatic opposing & parallel edge separation.
 * 3. Obstacle-aware orthogonal visibility-grid A* routing with spacious corridor centerlines,
 *    ClusterBox header/border awareness, edge-crossing avoidance, and generous parallel bus lanes.
 * 4. Label-aware automatic segment lengthening: when a label pill is wider/taller than the
 *    clear gap between endpoints, automatically lengthens the wire via an obstacle-free bridge
 *    (or balanced 2-line wrap / crisp side-offset for short vertical arrows) so every label
 *    sits cleanly with visible wire tails and zero node/header/pill overlap.
 * 5. CJK-aware text measurement and collision-free label placement.
 */
import type { AnchorSide } from './tokens.ts';

export type Rect = { x: number; y: number; w: number; h: number };
export type Point = { x: number; y: number };
export type ResolvedSide = 'left' | 'right' | 'top' | 'bottom';
export type RouteKind = 'curve' | 'straight' | 'elbow' | 'ortho' | 'arc' | 'auto';

export type BoardNode = {
  id: string;
  rect: Rect;
  shape?: 'box' | 'decision';
};

export type SoftObstacle = {
  rect: Rect;
  /** 'header' = ClusterBox title/badge bar; 'border' = ClusterBox perimeter; 'callout' = whiteboard Callout/stamp */
  kind: 'header' | 'border' | 'callout';
};

export type EdgeSpec = {
  id: string;
  from: string;
  to: string;
  route: RouteKind;
  fromSide: AnchorSide;
  toSide: AnchorSide;
  /** Explicit author bend; undefined enables automatic bend/separation. */
  bend?: number;
  label: string;
};

export type RoutedEdge = {
  id: string;
  fromSide: ResolvedSide;
  toSide: ResolvedSide;
  d: string;
  /** Sampled polyline points (orthogonal vertices for ortho/elbow/straight/bridge, or sampled curve points). */
  points: Point[];
  kind: 'polyline' | 'quad';
  quad?: { x1: number; y1: number; cx: number; cy: number; x2: number; y2: number };
  labelPos: Point;
  labelLines: string[];
  pillW: number;
  pillH: number;
  /** Optional short hairline tick when a cramped vertical/straight edge places its pill beside the arrow. */
  labelTick?: { x1: number; y1: number; x2: number; y2: number };
  headFrom: Point;
  headTo: Point;
  startFrom: Point;
  startTo: Point;
  /** True when this edge visually crosses at least one earlier edge (enables subtle halo separation). */
  hasCrossing: boolean;
};

const VALID_SIDES = new Set<ResolvedSide>(['left', 'right', 'top', 'bottom']);
const PILL_PAD_X = 20;
const PILL_H_SINGLE = 22;
const PILL_H_DOUBLE = 36;
const MIN_TAIL = 12;

/** Estimate raw rendered text width in px at fontSize 10.5px mono/UI (CJK + arrows + Latin). */
export function measureTextWidth(text: string): number {
  if (!text) return 0;
  let px = 0;
  for (const ch of text) {
    const cp = ch.codePointAt(0) ?? 0;
    if (
      cp >= 0x2e80 ||
      (cp >= 0x2190 && cp <= 0x21ff) || // arrows
      (cp >= 0x2500 && cp <= 0x27bf)
    ) {
      px += 11.4;
    } else if (ch === ' ') {
      px += 4.5;
    } else {
      px += 6.8;
    }
  }
  return px;
}

/** Estimate single-line SVG label pill width accurately for both Latin and wide CJK / emoji characters. */
export function measureLabelWidth(label: string): number {
  if (!label) return 0;
  return Math.max(46, Math.ceil(measureTextWidth(label) + PILL_PAD_X));
}

export type LabelLayout = { lines: string[]; w: number; h: number };

/** Build single-line label box metrics. */
function singleLineLayout(label: string): LabelLayout {
  if (!label) return { lines: [], w: 0, h: 0 };
  return { lines: [label], w: measureLabelWidth(label), h: PILL_H_SINGLE };
}

/** Split a long label into 2 balanced lines at natural breakpoints without breaking CLI flags (--foo) or Latin words. */
export function wrapLabelTwoLines(label: string): LabelLayout | null {
  const trimmed = label.trim();
  if (trimmed.length < 6) return null;
  const chars = [...trimmed];
  const breakIndices: number[] = [];
  for (let i = 2; i < chars.length - 1; i++) {
    const prev = chars[i - 1]!;
    const cur = chars[i]!;
    const prevCp = prev.codePointAt(0) ?? 0;
    const curCp = cur.codePointAt(0) ?? 0;
    const isBreakPunct = prev === ' ' || prev === '/' || prev === '·' || prev === '→' || prev === '、' || prev === '+' || prev === '|';
    const isCjkBoundary = (prevCp >= 0x2e80 || curCp >= 0x2e80) && prev !== '-' && cur !== '-';
    if (isBreakPunct || isCjkBoundary) {
      // Never split right after/inside `--flag`
      if (prev === '-' || cur === '-') continue;
      breakIndices.push(i);
    }
  }
  if (breakIndices.length === 0) return null;

  const singleW = measureLabelWidth(trimmed);
  let best: { lines: string[]; w: number } | null = null;
  for (const idx of breakIndices) {
    const a = chars.slice(0, idx).join('').trim();
    const b = chars.slice(idx).join('').trim();
    if (!a || !b) continue;
    const w = Math.max(46, Math.ceil(Math.max(measureTextWidth(a), measureTextWidth(b)) + PILL_PAD_X));
    if (!best || w < best.w) best = { lines: [a, b], w };
  }
  if (!best || best.w >= singleW - 14) return null;
  return { lines: best.lines, w: best.w, h: PILL_H_DOUBLE };
}

function centerOf(r: Rect): Point {
  return { x: r.x + r.w / 2, y: r.y + r.h / 2 };
}

function inflate(r: Rect, pad: number): Rect {
  return { x: r.x - pad, y: r.y - pad, w: r.w + 2 * pad, h: r.h + 2 * pad };
}

function rectsOverlap(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

function pointInRect(p: Point, r: Rect): boolean {
  return p.x > r.x && p.x < r.x + r.w && p.y > r.y && p.y < r.y + r.h;
}

/** True if axis-aligned or general segment AB intersects interior of rect R. */
export function segmentIntersectsRect(a: Point, b: Point, r: Rect): boolean {
  const minX = Math.min(a.x, b.x);
  const maxX = Math.max(a.x, b.x);
  const minY = Math.min(a.y, b.y);
  const maxY = Math.max(a.y, b.y);
  if (maxX <= r.x || minX >= r.x + r.w || maxY <= r.y || minY >= r.y + r.h) return false;
  if (Math.abs(a.x - b.x) < 0.01) {
    return a.x > r.x && a.x < r.x + r.w && maxY > r.y && minY < r.y + r.h;
  }
  if (Math.abs(a.y - b.y) < 0.01) {
    return a.y > r.y && a.y < r.y + r.h && maxX > r.x && minX < r.x + r.w;
  }
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  let t0 = 0;
  let t1 = 1;
  const checks: [number, number][] = [
    [-dx, a.x - r.x],
    [dx, r.x + r.w - a.x],
    [-dy, a.y - r.y],
    [dy, r.y + r.h - a.y],
  ];
  for (const [p, q] of checks) {
    if (Math.abs(p) < 1e-9) {
      if (q <= 0) return false;
    } else {
      const t = q / p;
      if (p < 0) {
        if (t > t1) return false;
        if (t > t0) t0 = t;
      } else {
        if (t < t0) return false;
        if (t < t1) t1 = t;
      }
    }
  }
  return t1 > t0 + 1e-4;
}

function segmentCrossesRectBorder(a: Point, b: Point, r: Rect): boolean {
  const tl = { x: r.x, y: r.y };
  const tr = { x: r.x + r.w, y: r.y };
  const br = { x: r.x + r.w, y: r.y + r.h };
  const bl = { x: r.x, y: r.y + r.h };
  return (
    segmentsCross(a, b, tl, tr) ||
    segmentsCross(a, b, tr, br) ||
    segmentsCross(a, b, br, bl) ||
    segmentsCross(a, b, bl, tl)
  );
}

function cross2(o: Point, a: Point, b: Point): number {
  return (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
}

function distSq(a: Point, b: Point): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
}

function onSegmentInterior(p: Point, a: Point, b: Point, eps = 0.5): boolean {
  if (distSq(p, a) < 1 || distSq(p, b) < 1) return false;
  return (
    p.x >= Math.min(a.x, b.x) - eps &&
    p.x <= Math.max(a.x, b.x) + eps &&
    p.y >= Math.min(a.y, b.y) - eps &&
    p.y <= Math.max(a.y, b.y) + eps
  );
}

/** Proper intersection between segments AB and CD (including vertex-on-interior-segment crossings; ignoring shared endpoints). */
export function segmentsCross(a: Point, b: Point, c: Point, d: Point): boolean {
  if (
    Math.max(a.x, b.x) < Math.min(c.x, d.x) - 0.5 ||
    Math.max(c.x, d.x) < Math.min(a.x, b.x) - 0.5 ||
    Math.max(a.y, b.y) < Math.min(c.y, d.y) - 0.5 ||
    Math.max(c.y, d.y) < Math.min(a.y, b.y) - 0.5
  ) {
    return false;
  }
  // Ignore segments sharing a common endpoint
  if (distSq(a, c) < 1 || distSq(a, d) < 1 || distSq(b, c) < 1 || distSq(b, d) < 1) return false;
  const d1 = cross2(c, d, a);
  const d2 = cross2(c, d, b);
  const d3 = cross2(a, b, c);
  const d4 = cross2(a, b, d);
  if (
    ((d1 > 1e-3 && d2 < -1e-3) || (d1 < -1e-3 && d2 > 1e-3)) &&
    ((d3 > 1e-3 && d4 < -1e-3) || (d3 < -1e-3 && d4 > 1e-3))
  ) {
    return true;
  }
  // Handle sampled curve vertices landing exactly on a straight edge
  if (Math.abs(d1) <= 1e-2 && onSegmentInterior(a, c, d)) return true;
  if (Math.abs(d2) <= 1e-2 && onSegmentInterior(b, c, d)) return true;
  if (Math.abs(d3) <= 1e-2 && onSegmentInterior(c, a, b)) return true;
  if (Math.abs(d4) <= 1e-2 && onSegmentInterior(d, a, b)) return true;
  return false;
}

function collinearOverlapLen(a: Point, b: Point, c: Point, d: Point, tol = 5): number {
  const aH = Math.abs(a.y - b.y) < 0.5;
  const cH = Math.abs(c.y - d.y) < 0.5;
  if (aH && cH && Math.abs(a.y - c.y) <= tol) {
    const lo = Math.max(Math.min(a.x, b.x), Math.min(c.x, d.x));
    const hi = Math.min(Math.max(a.x, b.x), Math.max(c.x, d.x));
    return Math.max(0, hi - lo);
  }
  const aV = Math.abs(a.x - b.x) < 0.5;
  const cV = Math.abs(c.x - d.x) < 0.5;
  if (aV && cV && Math.abs(a.x - c.x) <= tol) {
    const lo = Math.max(Math.min(a.y, b.y), Math.min(c.y, d.y));
    const hi = Math.min(Math.max(a.y, b.y), Math.max(c.y, d.y));
    return Math.max(0, hi - lo);
  }
  return 0;
}

function resolveSide(r: Rect, side: AnchorSide | string, other: Rect): ResolvedSide {
  if (VALID_SIDES.has(side as ResolvedSide)) return side as ResolvedSide;
  const dx = other.x + other.w / 2 - (r.x + r.w / 2);
  const dy = other.y + other.h / 2 - (r.y + r.h / 2);
  return Math.abs(dx) >= Math.abs(dy) ? (dx >= 0 ? 'right' : 'left') : (dy >= 0 ? 'bottom' : 'top');
}

function anchorPoint(r: Rect, side: ResolvedSide, offset = 0): Point {
  switch (side) {
    case 'left': return { x: r.x, y: r.y + r.h / 2 + offset };
    case 'right': return { x: r.x + r.w, y: r.y + r.h / 2 + offset };
    case 'top': return { x: r.x + r.w / 2 + offset, y: r.y };
    case 'bottom': return { x: r.x + r.w / 2 + offset, y: r.y + r.h };
  }
}

function stepOut(p: Point, side: ResolvedSide, dist: number): Point {
  switch (side) {
    case 'left': return { x: p.x - dist, y: p.y };
    case 'right': return { x: p.x + dist, y: p.y };
    case 'top': return { x: p.x, y: p.y - dist };
    case 'bottom': return { x: p.x, y: p.y + dist };
  }
}

/** Build a clean SVG path with rounded quadratic corners for an orthogonal polyline. */
export function buildRoundedPolylinePath(pts: Point[], maxRadius = 14): string {
  if (pts.length === 0) return '';
  if (pts.length === 1) return `M ${pts[0]!.x} ${pts[0]!.y}`;
  if (pts.length === 2) return `M ${round1(pts[0]!.x)} ${round1(pts[0]!.y)} L ${round1(pts[1]!.x)} ${round1(pts[1]!.y)}`;
  const out: string[] = [`M ${round1(pts[0]!.x)} ${round1(pts[0]!.y)}`];
  for (let i = 1; i < pts.length - 1; i++) {
    const prev = pts[i - 1]!;
    const cur = pts[i]!;
    const next = pts[i + 1]!;
    const d1 = Math.hypot(cur.x - prev.x, cur.y - prev.y);
    const d2 = Math.hypot(next.x - cur.x, next.y - cur.y);
    if (d1 < 1 || d2 < 1) {
      out.push(`L ${round1(cur.x)} ${round1(cur.y)}`);
      continue;
    }
    const r = Math.min(maxRadius, d1 * 0.45, d2 * 0.45);
    const pIn = { x: cur.x - ((cur.x - prev.x) / d1) * r, y: cur.y - ((cur.y - prev.y) / d1) * r };
    const pOut = { x: cur.x + ((next.x - cur.x) / d2) * r, y: cur.y + ((next.y - cur.y) / d2) * r };
    out.push(`L ${round1(pIn.x)} ${round1(pIn.y)} Q ${round1(cur.x)} ${round1(cur.y)} ${round1(pOut.x)} ${round1(pOut.y)}`);
  }
  const last = pts[pts.length - 1]!;
  out.push(`L ${round1(last.x)} ${round1(last.y)}`);
  return out.join(' ');
}

/** Total Euclidean length along a polyline (in px). */
export function polylineLength(pts: readonly Point[]): number {
  let total = 0;
  for (let i = 1; i < pts.length; i++) {
    total += Math.hypot(pts[i]!.x - pts[i - 1]!.x, pts[i]!.y - pts[i - 1]!.y);
  }
  return total;
}

/** Arc-length parameterized sampling along a polyline (for constant-speed pulse packets). */
export function samplePolyline(pts: Point[], t: number): Point {
  if (pts.length === 0) return { x: 0, y: 0 };
  if (pts.length === 1) return pts[0]!;
  const clamped = Math.max(0, Math.min(1, t));
  const lens: number[] = [];
  let total = 0;
  for (let i = 1; i < pts.length; i++) {
    const l = Math.hypot(pts[i]!.x - pts[i - 1]!.x, pts[i]!.y - pts[i - 1]!.y);
    lens.push(l);
    total += l;
  }
  if (total < 1e-6) return pts[0]!;
  let target = clamped * total;
  for (let i = 0; i < lens.length; i++) {
    const l = lens[i]!;
    if (target <= l || i === lens.length - 1) {
      const f = l > 1e-6 ? target / l : 0;
      const a = pts[i]!;
      const b = pts[i + 1]!;
      return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f };
    }
    target -= l;
  }
  return pts[pts.length - 1]!;
}

export function sampleQuad(q: { x1: number; y1: number; cx: number; cy: number; x2: number; y2: number }, t: number): Point {
  const mt = 1 - t;
  return {
    x: mt * mt * q.x1 + 2 * mt * t * q.cx + t * t * q.x2,
    y: mt * mt * q.y1 + 2 * mt * t * q.cy + t * t * q.y2,
  };
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function simplifyPolyline(pts: Point[]): Point[] {
  if (pts.length <= 2) return pts;
  const dedup: Point[] = [pts[0]!];
  for (let i = 1; i < pts.length; i++) {
    const prev = dedup[dedup.length - 1]!;
    if (Math.hypot(pts[i]!.x - prev.x, pts[i]!.y - prev.y) > 0.5) dedup.push(pts[i]!);
  }
  if (dedup.length <= 2) return dedup;
  const out: Point[] = [dedup[0]!];
  for (let i = 1; i < dedup.length - 1; i++) {
    const a = out[out.length - 1]!;
    const b = dedup[i]!;
    const c = dedup[i + 1]!;
    const sameX = Math.abs(a.x - b.x) < 0.6 && Math.abs(b.x - c.x) < 0.6;
    const sameY = Math.abs(a.y - b.y) < 0.6 && Math.abs(b.y - c.y) < 0.6;
    if (!sameX && !sameY) out.push(b);
  }
  out.push(dedup[dedup.length - 1]!);
  return out;
}

function dedupeCoords(values: number[], keepExact: number[], tol = 5): number[] {
  const sorted = [...values].sort((a, b) => a - b);
  const out: number[] = [];
  for (const v of sorted) {
    const prev = out[out.length - 1];
    if (prev === undefined || v - prev > tol) {
      out.push(v);
    } else if (keepExact.some((k) => Math.abs(k - v) < 0.5) && !keepExact.some((k) => Math.abs(k - prev) < 0.5)) {
      out[out.length - 1] = v;
    }
  }
  for (const k of keepExact) {
    if (!out.some((v) => Math.abs(v - k) < 0.6)) out.push(k);
  }
  out.sort((a, b) => a - b);
  return out;
}

type ExistingSeg = { a: Point; b: Point };

/** Compute minimum parallel clearance distance between an axis-aligned segment and a rect's perimeter edges. */
function parallelHugPenalty(a: Point, b: Point, r: Rect, threshold: number): number {
  const isH = Math.abs(a.y - b.y) < 0.5;
  const isV = Math.abs(a.x - b.x) < 0.5;
  if (isH) {
    const lo = Math.min(a.x, b.x);
    const hi = Math.max(a.x, b.x);
    const ov = Math.min(hi, r.x + r.w + 8) - Math.max(lo, r.x - 8);
    if (ov <= 4) return 0;
    const d = Math.min(Math.abs(a.y - r.y), Math.abs(a.y - (r.y + r.h)));
    return d < threshold ? (threshold - d) * ov : 0;
  }
  if (isV) {
    const lo = Math.min(a.y, b.y);
    const hi = Math.max(a.y, b.y);
    const ov = Math.min(hi, r.y + r.h + 8) - Math.max(lo, r.y - 8);
    if (ov <= 4) return 0;
    const d = Math.min(Math.abs(a.x - r.x), Math.abs(a.x - (r.x + r.w)));
    return d < threshold ? (threshold - d) * ov : 0;
  }
  return 0;
}

/**
 * Visibility-grid A* orthogonal router: finds a clean, spacious low-bend path centered in
 * inter-node & inter-cluster corridors while avoiding node interiors, cluster headers/badges,
 * whiteboard callouts, border-hugging, and already-routed edges.
 */
function routeOrthogonalAStar(
  p1: Point,
  fromSide: ResolvedSide,
  p2: Point,
  toSide: ResolvedSide,
  fromRect: Rect,
  toRect: Rect,
  hardObstacles: Rect[],
  softObstacles: SoftObstacle[],
  existingSegments: ExistingSeg[],
): Point[] {
  const gapHint = Math.max(Math.abs(p2.x - p1.x), Math.abs(p2.y - p1.y));
  const stub = Math.min(24, Math.max(14, gapHint * 0.22));
  let s1 = stepOut(p1, fromSide, stub);
  let s2 = stepOut(p2, toSide, stub);

  const paddedHard: Rect[] = hardObstacles.map((r) => inflate(r, 12));
  const callouts: Rect[] = softObstacles.filter((o) => o.kind === 'callout').map((o) => inflate(o.rect, 8));
  const selfBodies: Rect[] = [inflate(fromRect, 2), inflate(toRect, 2)];
  const headers: Rect[] = softObstacles.filter((o) => o.kind === 'header').map((o) => inflate(o.rect, 8));
  const borders: Rect[] = softObstacles.filter((o) => o.kind === 'border').map((o) => o.rect);

  for (const h of headers) {
    if (fromSide === 'top' && segmentIntersectsRect(p1, s1, h)) {
      s1 = { x: s1.x, y: Math.min(s1.y, h.y - 10) };
    } else if (fromSide === 'bottom' && segmentIntersectsRect(p1, s1, h)) {
      s1 = { x: s1.x, y: Math.max(s1.y, h.y + h.h + 10) };
    }
    if (toSide === 'top' && segmentIntersectsRect(p2, s2, h)) {
      s2 = { x: s2.x, y: Math.min(s2.y, h.y - 10) };
    } else if (toSide === 'bottom' && segmentIntersectsRect(p2, s2, h)) {
      s2 = { x: s2.x, y: Math.max(s2.y, h.y + h.h + 10) };
    }
  }

  const rawX: number[] = [s1.x, s2.x, (s1.x + s2.x) / 2];
  const rawY: number[] = [s1.y, s2.y, (s1.y + s2.y) / 2];

  const allBoxes = [fromRect, toRect, ...hardObstacles, ...headers, ...callouts];
  const corridorBoxes = [...allBoxes, ...borders];
  let minX = Math.min(p1.x, p2.x, s1.x, s2.x);
  let maxX = Math.max(p1.x, p2.x, s1.x, s2.x);
  let minY = Math.min(p1.y, p2.y, s1.y, s2.y);
  let maxY = Math.max(p1.y, p2.y, s1.y, s2.y);

  for (const b of corridorBoxes) {
    minX = Math.min(minX, b.x);
    maxX = Math.max(maxX, b.x + b.w);
    minY = Math.min(minY, b.y);
    maxY = Math.max(maxY, b.y + b.h);
    rawX.push(b.x - 22, b.x + b.w + 22);
    rawY.push(b.y - 22, b.y + b.h + 22);
  }
  rawX.push(minX - 34, maxX + 34);
  rawY.push(minY - 34, maxY + 34);

  const addCorridorMids = (boxes: Rect[], axis: 'x' | 'y', target: number[]) => {
    const spans = boxes
      .map((b) => (axis === 'x' ? ([b.x, b.x + b.w] as const) : ([b.y, b.y + b.h] as const)))
      .sort((a, b) => a[0] - b[0]);
    let curHi = spans[0]?.[1] ?? 0;
    for (const [lo, hi] of spans) {
      if (lo > curHi + 14) target.push((curHi + lo) / 2);
      curHi = Math.max(curHi, hi);
    }
    for (let i = 0; i < spans.length; i++) {
      for (let j = i + 1; j < spans.length; j++) {
        const gap = spans[j]![0] - spans[i]![1];
        if (gap >= 24 && gap <= 260) target.push((spans[i]![1] + spans[j]![0]) / 2);
      }
    }
  };
  addCorridorMids(allBoxes, 'x', rawX);
  addCorridorMids(allBoxes, 'y', rawY);
  if (borders.length > 0) {
    addCorridorMids([...borders, fromRect, toRect], 'x', rawX);
    addCorridorMids([...borders, fromRect, toRect], 'y', rawY);
  }

  const xs = dedupeCoords(rawX, [s1.x, s2.x], 7);
  const ys = dedupeCoords(rawY, [s1.y, s2.y], 7);
  const nx = xs.length;
  const ny = ys.length;

  const findIdx = (arr: number[], v: number) => {
    let best = 0;
    let bestD = Infinity;
    for (let i = 0; i < arr.length; i++) {
      const d = Math.abs(arr[i]! - v);
      if (d < bestD) { bestD = d; best = i; }
    }
    return best;
  };

  const sx = findIdx(xs, s1.x);
  const sy = findIdx(ys, s1.y);
  const gx = findIdx(xs, s2.x);
  const gy = findIdx(ys, s2.y);

  const startDir = fromSide === 'left' || fromSide === 'right' ? 0 : 1;
  const goalDir = toSide === 'left' || toSide === 'right' ? 0 : 1;

  const totalStates = nx * ny * 2;
  const gScore = new Float64Array(totalStates).fill(Infinity);
  const parent = new Int32Array(totalStates).fill(-1);
  const closed = new Uint8Array(totalStates);

  const heapState: number[] = [];
  const heapF: number[] = [];
  const push = (st: number, f: number) => {
    let i = heapState.length;
    heapState.push(st);
    heapF.push(f);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (heapF[p]! <= heapF[i]!) break;
      [heapState[p], heapState[i]] = [heapState[i]!, heapState[p]!];
      [heapF[p], heapF[i]] = [heapF[i]!, heapF[p]!];
      i = p;
    }
  };
  const pop = (): number => {
    const top = heapState[0]!;
    const lastS = heapState.pop()!;
    const lastF = heapF.pop()!;
    if (heapState.length > 0) {
      heapState[0] = lastS;
      heapF[0] = lastF;
      let i = 0;
      const n = heapState.length;
      while (true) {
        let best = i;
        const l = i * 2 + 1;
        const r = l + 1;
        if (l < n && heapF[l]! < heapF[best]!) best = l;
        if (r < n && heapF[r]! < heapF[best]!) best = r;
        if (best === i) break;
        [heapState[i], heapState[best]] = [heapState[best]!, heapState[i]!];
        [heapF[i], heapF[best]] = [heapF[best]!, heapF[i]!];
        i = best;
      }
    }
    return top;
  };

  const stateId = (ix: number, iy: number, dir: number) => (iy * nx + ix) * 2 + dir;
  const hCost = (ix: number, iy: number) => Math.abs(xs[ix]! - xs[gx]!) + Math.abs(ys[iy]! - ys[gy]!);

  const startSt = stateId(sx, sy, startDir);
  gScore[startSt] = 0;
  push(startSt, hCost(sx, sy));

  const segCost = (a: Point, b: Point): number => {
    let cost = Math.hypot(b.x - a.x, b.y - a.y);
    for (const r of paddedHard) if (segmentIntersectsRect(a, b, r)) cost += 50_000;
    for (const r of callouts) if (segmentIntersectsRect(a, b, r)) cost += 35_000;
    for (const r of selfBodies) if (segmentIntersectsRect(a, b, r)) cost += 40_000;
    for (const h of headers) if (segmentIntersectsRect(a, b, h)) cost += 2_600;
    for (const r of allBoxes) {
      const hug = parallelHugPenalty(a, b, r, 28);
      if (hug > 0) cost += hug * 0.08;
    }
    for (const bd of borders) {
      if (segmentCrossesRectBorder(a, b, bd)) cost += 120;
      const borderHug = parallelHugPenalty(a, b, bd, 22);
      if (borderHug > 0) cost += borderHug * 0.22;
    }
    for (const ex of existingSegments) {
      const ov = collinearOverlapLen(a, b, ex.a, ex.b, 8);
      if (ov > 2) cost += 950 + ov * 5;
      else if (segmentsCross(a, b, ex.a, ex.b)) cost += 300;
    }
    return cost;
  };

  const dirs: [number, number, number][] = [
    [1, 0, 0],
    [-1, 0, 0],
    [0, 1, 1],
    [0, -1, 1],
  ];

  let bestGoalSt = -1;
  let bestGoalCost = Infinity;

  while (heapState.length > 0) {
    const cur = pop();
    if (closed[cur]) continue;
    closed[cur] = 1;
    const curG = gScore[cur]!;
    if (curG >= bestGoalCost) break;

    const dir = cur & 1;
    const cell = cur >> 1;
    const iy = Math.floor(cell / nx);
    const ix = cell - iy * nx;

    if (ix === gx && iy === gy) {
      const finalTurn = dir !== goalDir ? 48 : 0;
      if (curG + finalTurn < bestGoalCost) {
        bestGoalCost = curG + finalTurn;
        bestGoalSt = cur;
      }
      continue;
    }

    const a = { x: xs[ix]!, y: ys[iy]! };
    for (const [dx, dy, nextDir] of dirs) {
      const nix = ix + dx;
      const niy = iy + dy;
      if (nix < 0 || nix >= nx || niy < 0 || niy >= ny) continue;
      const nst = stateId(nix, niy, nextDir);
      if (closed[nst]) continue;
      const b = { x: xs[nix]!, y: ys[niy]! };
      const turnPenalty = nextDir !== dir ? 54 : 0;
      const ng = curG + segCost(a, b) + turnPenalty;
      if (ng < gScore[nst]!) {
        gScore[nst] = ng;
        parent[nst] = cur;
        push(nst, ng + hCost(nix, niy));
      }
    }
  }

  if (bestGoalSt === -1) {
    const mid: Point = startDir === 0
      ? { x: (s1.x + s2.x) / 2, y: s1.y }
      : { x: s1.x, y: (s1.y + s2.y) / 2 };
    const mid2: Point = startDir === 0
      ? { x: mid.x, y: s2.y }
      : { x: s2.x, y: mid.y };
    return simplifyPolyline([p1, s1, mid, mid2, s2, p2]);
  }

  const rev: Point[] = [];
  for (let st = bestGoalSt; st !== -1; st = parent[st]!) {
    const cell = st >> 1;
    const iy = Math.floor(cell / nx);
    const ix = cell - iy * nx;
    rev.push({ x: xs[ix]!, y: ys[iy]! });
  }
  rev.reverse();
  return simplifyPolyline([p1, ...rev, p2]);
}

/**
 * Separate overlapping collinear internal orthogonal segments into parallel bus lanes
 * without entering hard node obstacles.
 */
function nudgeParallelLanes(
  polylines: Map<string, Point[]>,
  allNodeRects: Rect[],
  spacing = 22,
): void {
  type SegRef = { edgeId: string; idx: number; orient: 'H' | 'V'; coord: number; lo: number; hi: number };
  const segs: SegRef[] = [];
  for (const [edgeId, pts] of polylines) {
    for (let i = 1; i < pts.length - 2; i++) {
      const a = pts[i]!;
      const b = pts[i + 1]!;
      if (Math.abs(a.y - b.y) < 0.6 && Math.abs(b.x - a.x) > 16) {
        segs.push({ edgeId, idx: i, orient: 'H', coord: a.y, lo: Math.min(a.x, b.x), hi: Math.max(a.x, b.x) });
      } else if (Math.abs(a.x - b.x) < 0.6 && Math.abs(b.y - a.y) > 16) {
        segs.push({ edgeId, idx: i, orient: 'V', coord: a.x, lo: Math.min(a.y, b.y), hi: Math.max(a.y, b.y) });
      }
    }
  }

  const visited = new Set<number>();
  for (let i = 0; i < segs.length; i++) {
    if (visited.has(i)) continue;
    const base = segs[i]!;
    const group: SegRef[] = [base];
    visited.add(i);
    for (let j = i + 1; j < segs.length; j++) {
      if (visited.has(j)) continue;
      const other = segs[j]!;
      if (other.orient !== base.orient || other.edgeId === base.edgeId) continue;
      if (Math.abs(other.coord - base.coord) <= 10 && Math.min(other.hi, base.hi) - Math.max(other.lo, base.lo) > 8) {
        group.push(other);
        visited.add(j);
      }
    }
    if (group.length < 2) continue;
    group.sort((a, b) => a.lo - b.lo);
    const mid = (group.length - 1) / 2;
    for (let k = 0; k < group.length; k++) {
      const s = group[k]!;
      const delta = (k - mid) * spacing;
      if (Math.abs(delta) < 0.5) continue;
      const pts = polylines.get(s.edgeId)!;
      const pA = pts[s.idx]!;
      const pB = pts[s.idx + 1]!;
      const candA = s.orient === 'H' ? { x: pA.x, y: pA.y + delta } : { x: pA.x + delta, y: pA.y };
      const candB = s.orient === 'H' ? { x: pB.x, y: pB.y + delta } : { x: pB.x + delta, y: pB.y };
      const hitsNode = allNodeRects.some((r) => segmentIntersectsRect(candA, candB, inflate(r, 4)));
      if (!hitsNode) {
        pts[s.idx] = candA;
        pts[s.idx + 1] = candB;
      }
    }
  }
}

type LabelEval = {
  pos: Point;
  score: number;
  clean: boolean;
  tick?: { x1: number; y1: number; x2: number; y2: number };
};

/** Score a label pill rectangle against all board obstacles, other edges, and previously placed pills. */
function scorePillRect(
  pillRect: Rect,
  edgeId: string,
  nodeRects: Rect[],
  headerRects: Rect[],
  calloutRects: Rect[],
  otherEdgePolylines: Map<string, Point[]>,
  placedPills: Rect[],
): { penalty: number; hardHit: boolean } {
  let penalty = 0;
  let hardHit = false;
  for (const nr of nodeRects) {
    if (rectsOverlap(pillRect, inflate(nr, 3))) { penalty += 50_000; hardHit = true; }
  }
  for (const cr of calloutRects) {
    if (rectsOverlap(pillRect, inflate(cr, 3))) { penalty += 40_000; hardHit = true; }
  }
  for (const hr of headerRects) {
    if (rectsOverlap(pillRect, inflate(hr, 3))) { penalty += 14_000; hardHit = true; }
  }
  for (const pp of placedPills) {
    if (rectsOverlap(pillRect, inflate(pp, 4))) { penalty += 24_000; hardHit = true; }
  }
  for (const [otherId, opts] of otherEdgePolylines) {
    if (otherId === edgeId) continue;
    for (let i = 1; i < opts.length; i++) {
      if (segmentIntersectsRect(opts[i - 1]!, opts[i]!, pillRect)) {
        penalty += 4_500;
      }
    }
  }
  return { penalty, hardHit };
}

/** Pick the cleanest pill position along a path, reporting whether it satisfies strict tail & obstacle clearance. */
function evaluateLabelOnPath(
  edgeId: string,
  layout: LabelLayout,
  kind: 'polyline' | 'quad',
  pts: Point[],
  quad: { x1: number; y1: number; cx: number; cy: number; x2: number; y2: number } | undefined,
  nodeRects: Rect[],
  headerRects: Rect[],
  calloutRects: Rect[],
  otherEdgePolylines: Map<string, Point[]>,
  placedPills: Rect[],
): LabelEval {
  type Cand = { pos: Point; distFromMid: number; vertical: boolean; hasTailRoom: boolean };
  const cands: Cand[] = [];
  const pStart = pts[0]!;
  const pEnd = pts[pts.length - 1]!;

  if (kind === 'polyline' && pts.length >= 2) {
    let total = 0;
    const segLens: number[] = [];
    for (let i = 1; i < pts.length; i++) {
      const l = Math.hypot(pts[i]!.x - pts[i - 1]!.x, pts[i]!.y - pts[i - 1]!.y);
      segLens.push(l);
      total += l;
    }
    let acc = 0;
    for (let i = 0; i < segLens.length; i++) {
      const a = pts[i]!;
      const b = pts[i + 1]!;
      const l = segLens[i]!;
      const vertical = Math.abs(a.x - b.x) < Math.abs(a.y - b.y);
      const isHoriz = Math.abs(a.y - b.y) < 1;
      const isVert = Math.abs(a.x - b.x) < 1;
      const minX = Math.min(a.x, b.x);
      const maxX = Math.max(a.x, b.x);
      const minY = Math.min(a.y, b.y);
      const maxY = Math.max(a.y, b.y);
      if (l >= 22) {
        for (const f of [0.5, 0.36, 0.64, 0.25, 0.75]) {
          const fromStart = acc + l * f;
          const fromEnd = total - fromStart;
          const pos = { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f };
          const tailOk = isHoriz
            ? pos.x - layout.w / 2 >= minX + MIN_TAIL && pos.x + layout.w / 2 <= maxX - MIN_TAIL
            : isVert
              ? pos.y - layout.h / 2 >= minY + MIN_TAIL && pos.y + layout.h / 2 <= maxY - (MIN_TAIL + 2)
              : fromStart >= layout.w / 2 + MIN_TAIL && fromEnd >= layout.w / 2 + MIN_TAIL + 2;
          const globalT = total > 1 ? fromStart / total : 0.5;
          cands.push({ pos, distFromMid: Math.abs(globalT - 0.5), vertical, hasTailRoom: tailOk });
        }
      }
      acc += l;
    }
    if (cands.length === 0) {
      cands.push({ pos: samplePolyline(pts, 0.5), distFromMid: 0, vertical: false, hasTailRoom: false });
    }
  } else if (quad) {
    for (const t of [0.5, 0.42, 0.58, 0.34, 0.66, 0.26, 0.74]) {
      const pos = sampleQuad(quad, t);
      const pillBox = { x: pos.x - layout.w / 2 - MIN_TAIL, y: pos.y - layout.h / 2 - MIN_TAIL, w: layout.w + 2 * MIN_TAIL, h: layout.h + 2 * MIN_TAIL };
      const tailOk = !pointInRect(pStart, pillBox) && !pointInRect(pEnd, inflate(pillBox, 4));
      cands.push({ pos, distFromMid: Math.abs(t - 0.5), vertical: false, hasTailRoom: tailOk });
    }
  } else {
    cands.push({ pos: samplePolyline(pts, 0.5), distFromMid: 0, vertical: false, hasTailRoom: false });
  }

  let best: LabelEval = { pos: cands[0]!.pos, score: Infinity, clean: false };
  for (const c of cands) {
    const pillRect: Rect = { x: c.pos.x - layout.w / 2 - 3, y: c.pos.y - layout.h / 2 - 3, w: layout.w + 6, h: layout.h + 6 };
    const { penalty, hardHit } = scorePillRect(pillRect, edgeId, nodeRects, headerRects, calloutRects, otherEdgePolylines, placedPills);
    const tailPenalty = c.hasTailRoom ? 0 : 12_000;
    const score = penalty + tailPenalty + c.distFromMid * 110 + (c.vertical ? 95 : 0);
    const clean = !hardHit && c.hasTailRoom && penalty < 4_000;
    if (score < best.score) best = { pos: c.pos, score, clean };
  }
  return best;
}

/** Try placing a pill neatly beside a short vertical or straight edge (keeping the arrow 100% unobstructed). */
function trySideOffsetLabel(
  edgeId: string,
  layout: LabelLayout,
  pts: Point[],
  nodeRects: Rect[],
  headerRects: Rect[],
  calloutRects: Rect[],
  otherEdgePolylines: Map<string, Point[]>,
  placedPills: Rect[],
): LabelEval | null {
  const mid = samplePolyline(pts, 0.5);
  const a = pts[0]!;
  const b = pts[pts.length - 1]!;
  const isVertical = Math.abs(a.x - b.x) < Math.abs(a.y - b.y);
  const gap = 10;
  const offsets: Array<{ pos: Point; tick: { x1: number; y1: number; x2: number; y2: number } }> = isVertical
    ? [
        { pos: { x: mid.x + gap + layout.w / 2, y: mid.y }, tick: { x1: mid.x, y1: mid.y, x2: mid.x + gap, y2: mid.y } },
        { pos: { x: mid.x - gap - layout.w / 2, y: mid.y }, tick: { x1: mid.x, y1: mid.y, x2: mid.x - gap, y2: mid.y } },
      ]
    : [
        { pos: { x: mid.x, y: mid.y - gap - layout.h / 2 }, tick: { x1: mid.x, y1: mid.y, x2: mid.x, y2: mid.y - gap } },
        { pos: { x: mid.x, y: mid.y + gap + layout.h / 2 }, tick: { x1: mid.x, y1: mid.y, x2: mid.x, y2: mid.y + gap } },
      ];

  let best: LabelEval | null = null;
  for (let i = 0; i < offsets.length; i++) {
    const o = offsets[i]!;
    const pillRect: Rect = { x: o.pos.x - layout.w / 2 - 3, y: o.pos.y - layout.h / 2 - 3, w: layout.w + 6, h: layout.h + 6 };
    const { penalty, hardHit } = scorePillRect(pillRect, edgeId, nodeRects, headerRects, calloutRects, otherEdgePolylines, placedPills);
    if (!hardHit && penalty < 4_000) {
      const score = penalty + i * 20;
      if (!best || score < best.score) best = { pos: o.pos, score, clean: true, tick: o.tick };
    }
  }
  return best;
}

/**
 * Automatically lengthen a cramped horizontal/cross-column edge by building a clean
 * elevated or lowered carrier bridge into open whitespace above/below the endpoints,
 * guaranteeing a horizontal segment >= pillW + 2*MIN_TAIL + 10 with zero obstacle overlap.
 */
function tryLengthenBridgeForLabel(params: {
  edgeId: string;
  spec: EdgeSpec;
  fromNode: BoardNode;
  toNode: BoardNode;
  fromSide: ResolvedSide;
  toSide: ResolvedSide;
  p1: Point;
  p2: Point;
  layouts: LabelLayout[];
  allNodes: BoardNode[];
  softObstacles: SoftObstacle[];
  otherEdgePolylines: Map<string, Point[]>;
  placedPills: Rect[];
}): { pts: Point[]; layout: LabelLayout; labelPos: Point; fromSide: ResolvedSide; toSide: ResolvedSide } | null {
  const { edgeId, spec, fromNode, toNode, fromSide, toSide, p1, p2, layouts, allNodes, softObstacles, otherEdgePolylines, placedPills } = params;
  const nodeRects = allNodes.map((n) => n.rect);
  const hardOthers = allNodes.filter((n) => n.id !== spec.from && n.id !== spec.to).map((n) => n.rect);
  const headerRects = softObstacles.filter((o) => o.kind === 'header').map((o) => o.rect);
  const calloutRects = softObstacles.filter((o) => o.kind === 'callout').map((o) => o.rect);
  const borders = softObstacles.filter((o) => o.kind === 'border').map((o) => o.rect);

  // Find outer vertical envelopes including any ClusterBox that wraps from/to
  let topEnv = Math.min(fromNode.rect.y, toNode.rect.y);
  let botEnv = Math.max(fromNode.rect.y + fromNode.rect.h, toNode.rect.y + toNode.rect.h);
  for (const bd of borders) {
    if (rectsOverlap(fromNode.rect, bd) || rectsOverlap(toNode.rect, bd)) {
      topEnv = Math.min(topEnv, bd.y);
      botEnv = Math.max(botEnv, bd.y + bd.h);
    }
  }

  const preferAbove = spec.bend !== undefined ? spec.bend <= 0 : fromNode.rect.y <= toNode.rect.y;
  const aboveYs = [topEnv - 24, topEnv - 48, topEnv - 74];
  const belowYs = [botEnv + 24, botEnv + 48, botEnv + 74];
  // Also include local space directly above/below endpoints when they sit inside open room
  const localTop = Math.min(fromNode.rect.y, toNode.rect.y) - 28;
  const localBot = Math.max(fromNode.rect.y + fromNode.rect.h, toNode.rect.y + toNode.rect.h) + 28;
  const candYs = preferAbove
    ? [localTop, ...aboveYs, localBot, ...belowYs]
    : [localBot, ...belowYs, localTop, ...aboveYs];

  const goingRight = toNode.rect.x + toNode.rect.w / 2 >= fromNode.rect.x + fromNode.rect.w / 2;

  type BridgeCand = {
    pts: Point[];
    layout: LabelLayout;
    labelPos: Point;
    fromSide: ResolvedSide;
    toSide: ResolvedSide;
    score: number;
  };
  let best: BridgeCand | null = null;

  for (let li = 0; li < layouts.length; li++) {
    const layout = layouts[li]!;
    const needSpan = layout.w + 2 * MIN_TAIL + 12;

    for (const cy of candYs) {
      const isAbove = cy < Math.min(fromNode.rect.y, toNode.rect.y);
      const isBelow = cy > Math.max(fromNode.rect.y + fromNode.rect.h, toNode.rect.y + toNode.rect.h);
      if (!isAbove && !isBelow) continue;

      // Candidate shape 1: clean shoulder bridge (top->top or bottom->bottom) spanning >= needSpan
      const exitSide: ResolvedSide = isAbove ? 'top' : 'bottom';
      const enterSide: ResolvedSide = isAbove ? 'top' : 'bottom';
      const fAnchorX = goingRight
        ? Math.max(fromNode.rect.x + 28, Math.min(fromNode.rect.x + fromNode.rect.w - 28, fromNode.rect.x + fromNode.rect.w * 0.65))
        : Math.max(fromNode.rect.x + 28, Math.min(fromNode.rect.x + fromNode.rect.w - 28, fromNode.rect.x + fromNode.rect.w * 0.35));
      const tAnchorX = goingRight
        ? Math.max(toNode.rect.x + 28, Math.min(toNode.rect.x + toNode.rect.w - 28, toNode.rect.x + toNode.rect.w * 0.35))
        : Math.max(toNode.rect.x + 28, Math.min(toNode.rect.x + toNode.rect.w - 28, toNode.rect.x + toNode.rect.w * 0.65));

      let ax = fAnchorX;
      let bx = tAnchorX;
      // Ensure horizontal carrier segment is genuinely >= needSpan
      if (Math.abs(bx - ax) < needSpan) {
        const midX = (ax + bx) / 2;
        if (goingRight) {
          ax = Math.max(fromNode.rect.x + 18, midX - needSpan / 2);
          bx = Math.min(toNode.rect.x + toNode.rect.w - 18, ax + needSpan);
          if (bx - ax < needSpan) ax = Math.max(fromNode.rect.x + 18, bx - needSpan);
        } else {
          ax = Math.min(fromNode.rect.x + fromNode.rect.w - 18, midX + needSpan / 2);
          bx = Math.max(toNode.rect.x + 18, ax - needSpan);
          if (ax - bx < needSpan) ax = Math.min(fromNode.rect.x + fromNode.rect.w - 18, bx + needSpan);
        }
      }
      if (Math.abs(bx - ax) < needSpan - 2) continue;

      const bridgeVariants: Array<{ pts: Point[]; fSide: ResolvedSide; tSide: ResolvedSide; extraCost: number }> = [];

      // Variant 1A: top->top / bottom->bottom shoulder bridge (4 pts, 2 clean corners)
      const fy = isAbove ? fromNode.rect.y : fromNode.rect.y + fromNode.rect.h;
      const ty = isAbove ? toNode.rect.y : toNode.rect.y + toNode.rect.h;
      if (fromNode.shape !== 'decision' && toNode.shape !== 'decision') {
        bridgeVariants.push({
          pts: simplifyPolyline([{ x: ax, y: fy }, { x: ax, y: cy }, { x: bx, y: cy }, { x: bx, y: ty }]),
          fSide: exitSide,
          tSide: enterSide,
          extraCost: 0,
        });
      }

      // Variant 1B: keep toSide='left'/'right' so we enter side of target without crossing its ClusterBox header
      const enterX = goingRight ? toNode.rect.x - 16 : toNode.rect.x + toNode.rect.w + 16;
      const sideStartX = goingRight ? enterX - needSpan : enterX + needSpan;
      if (
        fromNode.shape !== 'decision' &&
        ((goingRight && sideStartX >= fromNode.rect.x + 14 && sideStartX <= fromNode.rect.x + fromNode.rect.w - 14) ||
          (!goingRight && sideStartX <= fromNode.rect.x + fromNode.rect.w - 14 && sideStartX >= fromNode.rect.x + 14))
      ) {
        bridgeVariants.push({
          pts: simplifyPolyline([
            { x: sideStartX, y: fy },
            { x: sideStartX, y: cy },
            { x: enterX, y: cy },
            { x: enterX, y: p2.y },
            p2,
          ]),
          fSide: exitSide,
          tSide: toSide,
          extraCost: 18,
        });
      }

      // Variant 1C: preserve fromSide & toSide by stepping out from p1, rising to cy, running across to p2's stub
      const s1 = stepOut(p1, fromSide, 16);
      const s2 = stepOut(p2, toSide, 16);
      if (Math.abs(s2.x - s1.x) >= needSpan) {
        bridgeVariants.push({
          pts: simplifyPolyline([p1, s1, { x: s1.x, y: cy }, { x: s2.x, y: cy }, s2, p2]),
          fSide: fromSide,
          tSide: toSide,
          extraCost: 24,
        });
      }

      for (const v of bridgeVariants) {
        // Check hard obstacle & callout clearance for all bridge segments
        let pathPenalty = v.extraCost + li * 85; // prefer single-line lengthened wire over 2-line wrap
        let blocked = false;
        let totalLen = 0;
        for (let i = 1; i < v.pts.length; i++) {
          const a = v.pts[i - 1]!;
          const b = v.pts[i]!;
          totalLen += Math.hypot(b.x - a.x, b.y - a.y);
          for (const obs of hardOthers) {
            if (segmentIntersectsRect(a, b, inflate(obs, 6))) blocked = true;
          }
          for (const cr of calloutRects) {
            if (segmentIntersectsRect(a, b, inflate(cr, 6))) blocked = true;
          }
          // Avoid cutting back through from/to bodies on intermediate segments
          if (i > 1 && i < v.pts.length - 1) {
            if (segmentIntersectsRect(a, b, inflate(fromNode.rect, 2)) || segmentIntersectsRect(a, b, inflate(toNode.rect, 2))) {
              blocked = true;
            }
          }
          for (const hr of headerRects) {
            if (segmentIntersectsRect(a, b, inflate(hr, 4))) pathPenalty += 220;
          }
          for (const [, opts] of otherEdgePolylines) {
            for (let j = 1; j < opts.length; j++) {
              if (segmentsCross(a, b, opts[j - 1]!, opts[j]!)) pathPenalty += 260;
            }
          }
        }
        if (blocked) continue;

        // Place pill dead-center on the horizontal carrier segment at y = cy
        const evalRes = evaluateLabelOnPath(
          edgeId, layout, 'polyline', v.pts, undefined,
          nodeRects, headerRects, calloutRects, otherEdgePolylines, placedPills,
        );
        if (!evalRes.clean) continue;

        const dirBonus = (preferAbove && isAbove) || (!preferAbove && isBelow) ? 0 : 75;
        const score = totalLen + pathPenalty + dirBonus + evalRes.score * 0.25;
        if (!best || score < best.score) {
          best = { pts: v.pts, layout, labelPos: evalRes.pos, fromSide: v.fSide, toSide: v.tSide, score };
        }
      }
    }
  }

  return best
    ? { pts: best.pts, layout: best.layout, labelPos: best.labelPos, fromSide: best.fromSide, toSide: best.toSide }
    : null;
}

function sampleQuadPolyline(q: { x1: number; y1: number; cx: number; cy: number; x2: number; y2: number }, steps = 12): Point[] {
  const pts: Point[] = [];
  for (let i = 0; i <= steps; i++) pts.push(sampleQuad(q, i / steps));
  return pts;
}

/**
 * Route all FlowEdges inside a board container together so they spread shared ports,
 * separate opposing pairs, route cleanly around obstacles & cluster headers, automatically
 * lengthen segments when center labels exceed endpoint gaps, and place labels without collisions.
 */
export function routeBoardEdges(input: {
  nodes: BoardNode[];
  edges: EdgeSpec[];
  softObstacles?: SoftObstacle[];
}): Map<string, RoutedEdge> {
  const nodeMap = new Map<string, BoardNode>(input.nodes.map((n) => [n.id, n]));
  const softObstacles = input.softObstacles ?? [];
  const validEdges = input.edges.filter((e) => nodeMap.has(e.from) && nodeMap.has(e.to));

  // 1. Resolve sides for every edge (safe against invalid side strings)
  const resolved = validEdges.map((e) => {
    const a = nodeMap.get(e.from)!;
    const b = nodeMap.get(e.to)!;
    return {
      spec: e,
      fromNode: a,
      toNode: b,
      fromSide: resolveSide(a.rect, e.fromSide, b.rect),
      toSide: resolveSide(b.rect, e.toSide, a.rect),
    };
  });

  // 2. Spread multiple ports attached to the same (nodeId, side) without string-splitting node IDs
  type PortRef = { edgeIdx: number; end: 'from' | 'to'; otherCenter: Point };
  const portGroups = new Map<string, { nodeId: string; side: ResolvedSide; refs: PortRef[] }>();
  const addPort = (nodeId: string, side: ResolvedSide, ref: PortRef) => {
    const key = `${JSON.stringify(nodeId)}:${side}`;
    let group = portGroups.get(key);
    if (!group) {
      group = { nodeId, side, refs: [] };
      portGroups.set(key, group);
    }
    group.refs.push(ref);
  };
  resolved.forEach((r, idx) => {
    addPort(r.spec.from, r.fromSide, { edgeIdx: idx, end: 'from', otherCenter: centerOf(r.toNode.rect) });
    addPort(r.spec.to, r.toSide, { edgeIdx: idx, end: 'to', otherCenter: centerOf(r.fromNode.rect) });
  });

  const fromOffsets = new Array<number>(resolved.length).fill(0);
  const toOffsets = new Array<number>(resolved.length).fill(0);

  for (const { nodeId, side, refs } of portGroups.values()) {
    if (refs.length < 2) continue;
    const node = nodeMap.get(nodeId)!;
    if (node.shape === 'decision') continue;
    const horizontalSide = side === 'top' || side === 'bottom';
    refs.sort((a, b) => (horizontalSide ? a.otherCenter.x - b.otherCenter.x : a.otherCenter.y - b.otherCenter.y));
    const sideLen = horizontalSide ? node.rect.w : node.rect.h;
    const maxSpan = Math.max(0, Math.min((sideLen - 34) * 0.65, (refs.length - 1) * 28));
    const step = refs.length > 1 ? maxSpan / (refs.length - 1) : 0;
    refs.forEach((ref, i) => {
      const off = -maxSpan / 2 + i * step;
      if (ref.end === 'from') fromOffsets[ref.edgeIdx] = off;
      else toOffsets[ref.edgeIdx] = off;
    });
  }

  // 3. Group parallel / opposing pairs sharing the same two endpoints
  const pairGroups = new Map<string, number[]>();
  resolved.forEach((r, idx) => {
    const pairKey = r.spec.from < r.spec.to
      ? `${JSON.stringify(r.spec.from)}|${JSON.stringify(r.spec.to)}`
      : `${JSON.stringify(r.spec.to)}|${JSON.stringify(r.spec.from)}`;
    const list = pairGroups.get(pairKey) ?? [];
    list.push(idx);
    pairGroups.set(pairKey, list);
  });

  // 4. Route short direct edges first, then longer cross-grid edges
  const order = resolved
    .map((r, idx) => {
      const ca = centerOf(r.fromNode.rect);
      const cb = centerOf(r.toNode.rect);
      return { idx, dist: Math.hypot(cb.x - ca.x, cb.y - ca.y) };
    })
    .sort((a, b) => a.dist - b.dist)
    .map((x) => x.idx);

  const existingSegs: ExistingSeg[] = [];
  const orthoPolylines = new Map<string, Point[]>();
  const allPolylines = new Map<string, Point[]>();
  const quadMap = new Map<string, { x1: number; y1: number; cx: number; cy: number; x2: number; y2: number }>();
  const kindMap = new Map<string, 'polyline' | 'quad'>();
  const crossingMap = new Map<string, boolean>();
  const anchorMap = new Map<string, { p1: Point; p2: Point }>();
  const allNodeRects = input.nodes.map((n) => n.rect);
  const headerRects = softObstacles.filter((o) => o.kind === 'header').map((o) => o.rect);
  const calloutRects = softObstacles.filter((o) => o.kind === 'callout').map((o) => o.rect);

  for (const idx of order) {
    const r = resolved[idx]!;
    const { spec, fromNode, toNode, fromSide, toSide } = r;
    const p1 = anchorPoint(fromNode.rect, fromSide, fromOffsets[idx]!);
    const p2 = anchorPoint(toNode.rect, toSide, toOffsets[idx]!);
    anchorMap.set(spec.id, { p1, p2 });
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const dist = Math.hypot(dx, dy) || 1;

    const hardObstacles = input.nodes
      .filter((n) => n.id !== spec.from && n.id !== spec.to)
      .map((n) => n.rect);

    const pairKey = spec.from < spec.to
      ? `${JSON.stringify(spec.from)}|${JSON.stringify(spec.to)}`
      : `${JSON.stringify(spec.to)}|${JSON.stringify(spec.from)}`;
    const siblings = pairGroups.get(pairKey) ?? [idx];
    const hasOpposing = siblings.length >= 2;

    const directBlocked =
      hardObstacles.some((obs) => segmentIntersectsRect(p1, p2, inflate(obs, 6))) ||
      headerRects.some((h) => segmentIntersectsRect(p1, p2, inflate(h, 4))) ||
      calloutRects.some((c) => segmentIntersectsRect(p1, p2, inflate(c, 4)));
    const isLongDiagonal = Math.abs(dx) > 190 && Math.abs(dy) > 95;
    // Allow auto to route orthogonally even for opposing pairs when an obstacle directly blocks the corridor
    const useOrtho =
      spec.route === 'ortho' ||
      spec.route === 'elbow' ||
      (spec.route === 'auto' && (directBlocked || (!hasOpposing && isLongDiagonal)));

    if (spec.route === 'straight') {
      const pts = [p1, p2];
      kindMap.set(spec.id, 'polyline');
      allPolylines.set(spec.id, pts);
      crossingMap.set(spec.id, existingSegs.some((ex) => segmentsCross(p1, p2, ex.a, ex.b)));
      existingSegs.push({ a: p1, b: p2 });
    } else if (useOrtho) {
      const pts = routeOrthogonalAStar(
        p1, fromSide, p2, toSide,
        fromNode.rect, toNode.rect,
        hardObstacles, softObstacles, existingSegs,
      );
      kindMap.set(spec.id, 'polyline');
      orthoPolylines.set(spec.id, pts);
      allPolylines.set(spec.id, pts);
      let crossed = false;
      for (let i = 1; i < pts.length; i++) {
        const a = pts[i - 1]!;
        const b = pts[i]!;
        if (existingSegs.some((ex) => segmentsCross(a, b, ex.a, ex.b))) crossed = true;
        existingSegs.push({ a, b });
      }
      crossingMap.set(spec.id, crossed);
    } else {
      const baseMag = spec.route === 'arc' ? Math.min(72, dist * 0.34) : Math.min(34, dist * 0.2);
      let chosenBend: number;
      if (spec.bend !== undefined) {
        chosenBend = spec.bend;
      } else if (hasOpposing) {
        const posInPair = siblings.indexOf(idx);
        const oppDir = siblings.some((si) => resolved[si]!.spec.from === spec.to && resolved[si]!.spec.to === spec.from);
        if (oppDir) {
          chosenBend = -Math.max(24, baseMag);
        } else {
          const mid = (siblings.length - 1) / 2;
          chosenBend = (posInPair - mid) * 26;
        }
      } else {
        const candidates = spec.route === 'arc'
          ? [baseMag, -baseMag, baseMag * 1.4, -baseMag * 1.4]
          : [baseMag, -baseMag, 0, baseMag * 1.75, -baseMag * 1.75];
        let bestB = candidates[0]!;
        let bestPen = Infinity;
        for (const cand of candidates) {
          const cx = (p1.x + p2.x) / 2 - (dy / dist) * cand;
          const cy = (p1.y + p2.y) / 2 + (dx / dist) * cand;
          const qPts = sampleQuadPolyline({ x1: p1.x, y1: p1.y, cx, cy, x2: p2.x, y2: p2.y }, 10);
          let pen = Math.abs(cand - baseMag) * 0.1;
          for (let i = 1; i < qPts.length; i++) {
            const a = qPts[i - 1]!;
            const b = qPts[i]!;
            for (const obs of hardObstacles) if (segmentIntersectsRect(a, b, inflate(obs, 6))) pen += 20_000;
            for (const cr of calloutRects) if (segmentIntersectsRect(a, b, inflate(cr, 4))) pen += 15_000;
            for (const h of headerRects) if (segmentIntersectsRect(a, b, inflate(h, 4))) pen += 2_000;
            for (const ex of existingSegs) if (segmentsCross(a, b, ex.a, ex.b)) pen += 300;
          }
          if (pen < bestPen) {
            bestPen = pen;
            bestB = cand;
          }
        }
        chosenBend = bestB;
      }

      const cx = (p1.x + p2.x) / 2 - (dy / dist) * chosenBend;
      const cy = (p1.y + p2.y) / 2 + (dx / dist) * chosenBend;
      const quad = { x1: p1.x, y1: p1.y, cx, cy, x2: p2.x, y2: p2.y };
      const qPts = sampleQuadPolyline(quad, 12);
      kindMap.set(spec.id, 'quad');
      quadMap.set(spec.id, quad);
      allPolylines.set(spec.id, qPts);
      let crossed = false;
      for (let i = 1; i < qPts.length; i++) {
        const a = qPts[i - 1]!;
        const b = qPts[i]!;
        if (existingSegs.some((ex) => segmentsCross(a, b, ex.a, ex.b))) crossed = true;
        existingSegs.push({ a, b });
      }
      crossingMap.set(spec.id, crossed);
    }
  }

  // 5. Separate parallel orthogonal tracks sharing a corridor into generous schematic lanes
  if (orthoPolylines.size >= 2) {
    nudgeParallelLanes(orthoPolylines, allNodeRects, 22);
    for (const [id, pts] of orthoPolylines) allPolylines.set(id, pts);
  }

  // 6. Label-aware validation, automatic wire lengthening for cramped labels, and final assembly
  const placedPills: Rect[] = [];
  const results = new Map<string, RoutedEdge>();

  for (const idx of order) {
    const r = resolved[idx]!;
    const { spec, fromNode, toNode } = r;
    let fromSide = r.fromSide;
    let toSide = r.toSide;
    let kind = kindMap.get(spec.id)!;
    let pts = allPolylines.get(spec.id)!;
    let quad = quadMap.get(spec.id);
    const anchors = anchorMap.get(spec.id)!;

    let labelLayout = singleLineLayout(spec.label);
    let labelPos: Point;
    let labelTick: { x1: number; y1: number; x2: number; y2: number } | undefined;

    if (!spec.label) {
      labelPos = kind === 'quad' && quad ? sampleQuad(quad, 0.5) : samplePolyline(pts, 0.5);
    } else {
      const baseEval = evaluateLabelOnPath(
        spec.id, labelLayout, kind, pts, quad,
        allNodeRects, headerRects, calloutRects, allPolylines, placedPills,
      );
      if (baseEval.clean) {
        labelPos = baseEval.pos;
      } else {
        const wrapped = wrapLabelTwoLines(spec.label);
        const layoutsToTry = wrapped ? [labelLayout, wrapped] : [labelLayout];
        const dx = Math.abs(anchors.p2.x - anchors.p1.x);
        const dy = Math.abs(anchors.p2.y - anchors.p1.y);
        const isShortVertical = dx < 28 && dy < labelLayout.h + 28;
        let resolvedLabel: Point | null = null;

        // Tier A: For cramped short vertical arrows (e.g. 36px gap inside a ClusterBox), keep arrow clean & offset pill neatly beside it
        if (isShortVertical || spec.route === 'straight') {
          const sideTry = trySideOffsetLabel(
            spec.id, labelLayout, pts,
            allNodeRects, headerRects, calloutRects, allPolylines, placedPills,
          );
          if (sideTry) {
            resolvedLabel = sideTry.pos;
            labelTick = sideTry.tick;
          }
        }

        // Tier B: Automatically lengthen horizontal/cross-column wire into open corridor above/below endpoints
        if (!resolvedLabel && spec.route !== 'straight') {
          const bridge = tryLengthenBridgeForLabel({
            edgeId: spec.id,
            spec,
            fromNode,
            toNode,
            fromSide,
            toSide,
            p1: anchors.p1,
            p2: anchors.p2,
            layouts: layoutsToTry,
            allNodes: input.nodes,
            softObstacles,
            otherEdgePolylines: allPolylines,
            placedPills,
          });
          if (bridge) {
            kind = 'polyline';
            pts = bridge.pts;
            quad = undefined;
            fromSide = bridge.fromSide;
            toSide = bridge.toSide;
            labelLayout = bridge.layout;
            resolvedLabel = bridge.labelPos;
            allPolylines.set(spec.id, pts);
          }
        }

        // Tier C: Try balanced 2-line wrap on original path if single-line didn't fit and no bridge was needed/available
        if (!resolvedLabel && wrapped) {
          const wrapEval = evaluateLabelOnPath(
            spec.id, wrapped, kind, pts, quad,
            allNodeRects, headerRects, calloutRects, allPolylines, placedPills,
          );
          if (wrapEval.clean || wrapEval.score + 2_000 < baseEval.score) {
            labelLayout = wrapped;
            resolvedLabel = wrapEval.pos;
          }
        }

        // Tier D: Side-offset fallback if inline placement still collides with endpoints
        if (!resolvedLabel) {
          const sideFallback = trySideOffsetLabel(
            spec.id, wrapped ?? labelLayout, pts,
            allNodeRects, headerRects, calloutRects, allPolylines, placedPills,
          );
          if (sideFallback) {
            labelLayout = wrapped ?? labelLayout;
            resolvedLabel = sideFallback.pos;
            labelTick = sideFallback.tick;
          }
        }

        labelPos = resolvedLabel ?? baseEval.pos;
      }

      placedPills.push({
        x: labelPos.x - labelLayout.w / 2,
        y: labelPos.y - labelLayout.h / 2,
        w: labelLayout.w,
        h: labelLayout.h,
      });
    }

    const d = kind === 'quad' && quad
      ? `M ${round1(quad.x1)} ${round1(quad.y1)} Q ${round1(quad.cx)} ${round1(quad.cy)} ${round1(quad.x2)} ${round1(quad.y2)}`
      : spec.route === 'straight'
        ? `M ${round1(pts[0]!.x)} ${round1(pts[0]!.y)} L ${round1(pts[pts.length - 1]!.x)} ${round1(pts[pts.length - 1]!.y)}`
        : buildRoundedPolylinePath(pts, 14);

    // Recompute crossing flag against all earlier edges in case this edge was lengthened into a bridge
    let hasCrossing = crossingMap.get(spec.id) ?? false;
    if (kind === 'polyline') {
      hasCrossing = false;
      for (const [prevId, prevRes] of results) {
        if (prevId === spec.id) continue;
        for (let i = 1; i < pts.length && !hasCrossing; i++) {
          for (let j = 1; j < prevRes.points.length && !hasCrossing; j++) {
            if (segmentsCross(pts[i - 1]!, pts[i]!, prevRes.points[j - 1]!, prevRes.points[j]!)) {
              hasCrossing = true;
            }
          }
        }
      }
    }

    const headTo = pts[pts.length - 1]!;
    const headFrom = kind === 'quad' && quad ? sampleQuad(quad, 0.92) : pts[Math.max(0, pts.length - 2)]!;
    const startTo = pts[0]!;
    const startFrom = kind === 'quad' && quad ? sampleQuad(quad, 0.08) : pts[Math.min(pts.length - 1, 1)]!;

    results.set(spec.id, {
      id: spec.id,
      fromSide,
      toSide,
      d,
      points: pts,
      kind,
      quad,
      labelPos,
      labelLines: labelLayout.lines,
      pillW: labelLayout.w,
      pillH: labelLayout.h,
      ...(labelTick ? { labelTick } : {}),
      headFrom,
      headTo,
      startFrom,
      startTo,
      hasCrossing,
    });
  }

  return results;
}

export const _geom = { pointInRect };
