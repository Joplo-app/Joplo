/**
 * Node-only synchronous D2 TALA layout engine for @joplo-app/plugin-diagram.
 *
 * Executes D2 v0.9.0's open-source TALA engine (MPL-2.0, precompiled to
 * `./tala.wasm.br`) synchronously via WebAssembly.Instance with a deterministic,
 * warning-free WASI preview1 host shim. Browser bundles (Board & Published sites)
 * never import this module — they read precomputed coordinates from IR.
 */
import fs from 'node:fs';
import zlib from 'node:zlib';
import {
  DEFAULT_ASPECT,
  crossings,
  feedbackEdges,
  placeLabels,
  placeTitles,
  sampleRoute,
  type LayoutGoal,
} from './graph-layout.ts';
import {
  GROUP_HEAD,
  GROUP_PAD,
  START,
  groupTitleWidth,
  structureKey,
  type Box,
  type GEdge,
  type GraphLayout,
  type GraphStructure,
  type Point,
} from './model.ts';

type TalaInputNode = {
  id: string;
  parent?: string;
  isContainer?: boolean;
  forceHierarchy?: boolean;
  direction?: 'right' | 'down';
  near?: string;
  label?: string;
  labelPos?: string;
  w: number;
  h: number;
  lw?: number;
  lh?: number;
};

type TalaInputEdge = {
  id: string;
  from: string;
  to: string;
  reversed?: boolean;
  invisible?: boolean;
  label?: string;
  lw?: number;
  lh?: number;
  async?: boolean;
};

type TalaInputGraph = {
  direction?: 'right' | 'down';
  forceHierarchy?: boolean;
  seeds?: number[];
  nodes: TalaInputNode[];
  edges: TalaInputEdge[];
};

type TalaOutputGraph = {
  error?: string;
  boxes?: Record<string, Box>;
  labels?: Record<string, Box>;
  edges?: Record<string, { points: Point[]; label: Box | null }>;
};

type TalaExports = {
  memory: WebAssembly.Memory;
  _initialize: () => void;
  tala_alloc: (size: number) => number;
  tala_layout: (ptr: number, size: number) => number;
  tala_out_ptr: () => number;
  tala_out_len: () => number;
};

type TalaGlobalState = {
  exports: TalaExports | null;
  resetClock: (() => void) | null;
  cache: Map<string, GraphLayout>;
};

const TALA_GLOBAL_KEY = Symbol.for('@joplo-app/plugin-diagram:tala:v1');

function getGlobalState(): TalaGlobalState {
  const g = globalThis as Record<symbol, TalaGlobalState | undefined>;
  if (!g[TALA_GLOBAL_KEY]) {
    g[TALA_GLOBAL_KEY] = { exports: null, resetClock: null, cache: new Map() };
  }
  return g[TALA_GLOBAL_KEY]!;
}

function getTalaExports(): { exp: TalaExports; resetClock: () => void } {
  const state = getGlobalState();
  if (state.exports && state.resetClock) return { exp: state.exports, resetClock: state.resetClock };
  const compressed = fs.readFileSync(new URL('./tala.wasm.br', import.meta.url));
  const wasmBytes = zlib.brotliDecompressSync(compressed);
  const mod = new WebAssembly.Module(wasmBytes);

  let mem: WebAssembly.Memory | null = null;
  const view = () => new DataView(mem!.buffer);
  const EBADF = 8;

  // Minimal deterministic WASI preview1 host — avoids node:wasi ExperimentalWarning
  // and eliminates wall-clock / OS-entropy variance across runs and architectures.
  let ticks = 1_000_000_000n;
  const resetClock = () => {
    ticks = 1_000_000_000n;
  };
  const wasi = {
    args_sizes_get(argcPtr: number, argvBufSizePtr: number) {
      const v = view();
      v.setUint32(argcPtr, 0, true);
      v.setUint32(argvBufSizePtr, 0, true);
      return 0;
    },
    args_get: () => 0,
    environ_sizes_get(countPtr: number, bufSizePtr: number) {
      const v = view();
      v.setUint32(countPtr, 0, true);
      v.setUint32(bufSizePtr, 0, true);
      return 0;
    },
    environ_get: () => 0,
    clock_time_get(_id: number, _precision: bigint, outPtr: number) {
      ticks += 1000n;
      view().setBigUint64(outPtr, ticks, true);
      return 0;
    },
    random_get(bufPtr: number, bufLen: number) {
      const u = new Uint8Array(mem!.buffer, bufPtr, bufLen);
      for (let i = 0; i < bufLen; i++) u[i] = (i * 31 + 17) & 0xff;
      return 0;
    },
    sched_yield: () => 0,
    proc_exit(code: number) {
      throw new Error(`TALA WASI exited with code ${code}`);
    },
    fd_write(_fd: number, iovsPtr: number, iovsLen: number, nwrittenPtr: number) {
      const v = view();
      let total = 0;
      for (let i = 0; i < iovsLen; i++) total += v.getUint32(iovsPtr + i * 8 + 4, true);
      v.setUint32(nwrittenPtr, total, true);
      return 0;
    },
    fd_close: () => EBADF,
    fd_pread: () => EBADF,
    fd_read: () => EBADF,
    fd_fdstat_get(fd: number, bufPtr: number) {
      if (fd > 2) return EBADF;
      const u = new Uint8Array(mem!.buffer, bufPtr, 24);
      u.fill(0);
      u[0] = 2; // character_device
      return 0;
    },
    fd_fdstat_set_flags: () => EBADF,
    fd_prestat_get: () => EBADF,
    fd_prestat_dir_name: () => EBADF,
    path_filestat_get: () => EBADF,
    path_open: () => EBADF,
    poll_oneoff(_inPtr: number, _outPtr: number, _nsub: number, neventsPtr: number) {
      view().setUint32(neventsPtr, 0, true);
      return 0;
    },
  };

  const inst = new WebAssembly.Instance(mod, { wasi_snapshot_preview1: wasi });
  const exp = inst.exports as unknown as TalaExports;
  mem = exp.memory;
  exp._initialize();
  state.exports = exp;
  state.resetClock = resetClock;
  return { exp, resetClock };
}

/** Execute one raw TALA layout pass synchronously. */
export function runTalaRaw(input: TalaInputGraph): TalaOutputGraph {
  const { exp, resetClock } = getTalaExports();
  resetClock();
  const payload = Buffer.from(JSON.stringify(input), 'utf8');
  const inPtr = exp.tala_alloc(payload.length);
  new Uint8Array(exp.memory.buffer, inPtr, payload.length).set(payload);
  const outLen = exp.tala_layout(inPtr, payload.length);
  const outPtr = exp.tala_out_ptr();
  const json = Buffer.from(exp.memory.buffer, outPtr, outLen).toString('utf8');
  const parsed = JSON.parse(json) as TalaOutputGraph;
  if (parsed.error) throw new Error(parsed.error);
  return parsed;
}

const M = 12;
const r2 = (n: number) => Math.round(n * 2) / 2;

function simplify(points: Point[]): Point[] {
  const out: Point[] = [];
  for (const p of points) {
    const last = out[out.length - 1];
    if (last && Math.abs(last.x - p.x) < 0.01 && Math.abs(last.y - p.y) < 0.01) continue;
    out.push({ x: p.x, y: p.y });
    while (out.length >= 3) {
      const [a, b, c] = out.slice(-3) as [Point, Point, Point];
      const collinear = (Math.abs(a.x - b.x) < 0.01 && Math.abs(b.x - c.x) < 0.01) || (Math.abs(a.y - b.y) < 0.01 && Math.abs(b.y - c.y) < 0.01);
      if (!collinear) break;
      out.splice(out.length - 2, 1);
    }
  }
  return out;
}

/**
 * Only reverse true node-level DFS cycle back-edges (plus edges violating explicit pin="start"|"end").
 * Unlike ELK, TALA natively handles cross-container return flows (e.g. biz -> local back into g_device)
 * without needing group-level reversal, which keeps opposite-direction arrowheads on separate ports.
 */
function cycleBackEdges(s: GraphStructure): Set<string> {
  const ids = new Set(s.nodes.map((n) => n.id));
  const order = new Map(s.nodes.map((n, i) => [n.id, i]));
  const pinOf = new Map(s.nodes.map((n) => [n.id, n.pin]));
  const plain = s.edges.filter((e) => ids.has(e.from) && ids.has(e.to) && e.from !== e.to);
  const out = new Map<string, GEdge[]>();
  const indeg = new Map<string, number>();
  for (const e of plain) {
    out.set(e.from, [...(out.get(e.from) ?? []), e]);
    indeg.set(e.to, (indeg.get(e.to) ?? 0) + 1);
  }
  const rank = (id: string) => (pinOf.get(id) === 'start' ? 0 : pinOf.get(id) === 'end' ? 2 : 1);
  const roots = [...s.nodes]
    .map((n) => n.id)
    .sort((a, b) => rank(a) - rank(b) || (indeg.get(a) ? 1 : 0) - (indeg.get(b) ? 1 : 0) || order.get(a)! - order.get(b)!);
  const back = new Set<string>();
  const state = new Map<string, 1 | 2>();
  const visit = (v: string) => {
    state.set(v, 1);
    for (const e of out.get(v) ?? []) {
      const st = state.get(e.to);
      if (st === 1 || pinOf.get(e.to) === 'start' || pinOf.get(v) === 'end') back.add(e.id);
      else if (!st) visit(e.to);
    }
    state.set(v, 2);
  };
  for (const r of roots) if (!state.has(r)) visit(r);
  return back;
}

/** Longest-path DAG ranks for pin="start" | "end" sibling constraints. */
function siblingRanks(units: string[], edges: [string, string][]): Map<string, number> {
  const indeg = new Map(units.map((u) => [u, 0]));
  const out = new Map<string, string[]>();
  for (const [a, b] of edges) {
    if (a === b || !indeg.has(a) || !indeg.has(b)) continue;
    out.set(a, [...(out.get(a) ?? []), b]);
    indeg.set(b, (indeg.get(b) ?? 0) + 1);
  }
  const rank = new Map(units.map((u) => [u, 0]));
  const queue = units.filter((u) => !indeg.get(u));
  const visited = new Set<string>();
  while (queue.length) {
    const u = queue.shift()!;
    visited.add(u);
    for (const v of out.get(u) ?? []) {
      rank.set(v, Math.max(rank.get(v)!, rank.get(u)! + 1));
      indeg.set(v, indeg.get(v)! - 1);
      if (!indeg.get(v)) queue.push(v);
    }
  }
  if (visited.size < units.length) {
    for (const u of units) if (!visited.has(u)) rank.set(u, 0);
  }
  return rank;
}

/** Generate invisible rank-constraint edges inside each container for pin="start" | "end". */
function pinConstraintEdges(s: GraphStructure, reversed: Set<string>): { edges: TalaInputEdge[]; pinnedContainers: Set<string | null> } {
  const parentOf = new Map<string, string | null>([
    ...s.nodes.map((n) => [n.id, n.parent] as const),
    ...s.groups.map((g) => [g.id, g.parent] as const),
  ]);
  const pinOf = new Map<string, 'start' | 'end' | undefined>([
    ...s.nodes.map((n) => [n.id, n.pin] as const),
    ...s.groups.map((g) => [g.id, g.pin] as const),
  ]);
  const pinnedContainers = new Set<string | null>();
  if (![...pinOf.values()].some(Boolean)) return { edges: [], pinnedContainers };

  const chain = (id: string): (string | null)[] => {
    const out: (string | null)[] = [id];
    const seen = new Set([id]);
    for (let q = parentOf.get(id) ?? null; q && !seen.has(q); q = parentOf.get(q) ?? null) {
      seen.add(q);
      out.push(q);
    }
    out.push(null);
    return out;
  };

  const childrenByParent = new Map<string | null, string[]>();
  const allItems = [
    ...s.groups.map((g) => ({ id: g.id, parent: g.parent, seq: g.seq })),
    ...s.nodes.map((n) => ({ id: n.id, parent: n.parent, seq: n.seq })),
  ].sort((a, b) => a.seq - b.seq);
  for (const it of allItems) {
    childrenByParent.set(it.parent, [...(childrenByParent.get(it.parent) ?? []), it.id]);
  }

  const liftedByParent = new Map<string | null, [string, string][]>();
  for (const e of s.edges) {
    if (!parentOf.has(e.from) || !parentOf.has(e.to) || e.from === e.to) continue;
    const [src, dst] = reversed.has(e.id) ? [e.to, e.from] : [e.from, e.to];
    const cs = chain(src);
    const cd = chain(dst);
    const lca = cs.find((c) => c !== cs[0] && cd.includes(c) && c !== cd[0]);
    if (lca === undefined) continue;
    const u = cs[cs.indexOf(lca) - 1];
    const v = cd[cd.indexOf(lca) - 1];
    if (u && v && u !== v) {
      liftedByParent.set(lca, [...(liftedByParent.get(lca) ?? []), [u, v]]);
    }
  }

  const constraints: TalaInputEdge[] = [];
  let seq = 0;
  for (const [parent, units] of childrenByParent) {
    if (units.length < 2 || !units.some((u) => pinOf.get(u))) continue;
    pinnedContainers.add(parent);
    const edges = liftedByParent.get(parent) ?? [];
    const ranks = siblingRanks(units, edges);
    for (const u of units) {
      const pin = pinOf.get(u);
      if (pin === 'end') {
        const others = units.filter((v) => v !== u && pinOf.get(v) !== 'end');
        if (!others.length) continue;
        const maxOther = Math.max(...others.map((v) => ranks.get(v) ?? 0));
        const targetPredRank = Math.max(0, maxOther - 1);
        const anchor = others.find((v) => (ranks.get(v) ?? 0) === targetPredRank);
        if (anchor && (ranks.get(u) ?? 0) < maxOther) {
          constraints.push({ id: `__pin:${seq++}`, from: anchor, to: u, invisible: true });
        }
      } else if (pin === 'start') {
        const others = units.filter((v) => v !== u && pinOf.get(v) !== 'start');
        if (!others.length) continue;
        const anchor = others.find((v) => (ranks.get(v) ?? 0) === 1) ?? others[0];
        if (anchor && !edges.some(([a, b]) => a === u && b === anchor)) {
          constraints.push({ id: `__pin:${seq++}`, from: u, to: anchor, invisible: true });
        }
      }
    }
  }
  return { edges: constraints, pinnedContainers };
}

export function toTalaInput(s: GraphStructure, direction: 'right' | 'down'): TalaInputGraph {
  const reversed = cycleBackEdges(s);
  const groupBack = feedbackEdges(s);
  const { edges: pinEdges, pinnedContainers } = pinConstraintEdges(s, groupBack);
  const childGroups = new Map<string | null, GraphStructure['groups']>();
  const childNodes = new Map<string | null, GraphStructure['nodes']>();
  for (const g of s.groups) childGroups.set(g.parent, [...(childGroups.get(g.parent) ?? []), g]);
  for (const n of s.nodes) childNodes.set(n.parent, [...(childNodes.get(n.parent) ?? []), n]);

  // When a compound diagram has a unique entry root unit alongside a nested container
  // (e.g. "Client Device" → "AWS"), anchor that entry unit on the upstream side via D2 near
  // so TALA's 2D cluster layout always honors the requested reading direction.
  let rootEntryUnit: string | null = null;
  const rootGroups = childGroups.get(null) ?? [];
  const rootUnits = [...rootGroups.map((g) => g.id), ...(childNodes.get(null) ?? []).map((n) => n.id)];
  const hasCompoundRootGroup = rootGroups.some((g) => (childGroups.get(g.id)?.length ?? 0) > 0);
  if (rootUnits.length >= 2 && hasCompoundRootGroup) {
    const parentOf = new Map<string, string | null>([
      ...s.nodes.map((n) => [n.id, n.parent] as const),
      ...s.groups.map((g) => [g.id, g.parent] as const),
    ]);
    const topOf = (id: string): string | null => {
      let cur: string | null = id;
      const seen = new Set<string>();
      while (cur && parentOf.get(cur) !== null) {
        if (seen.has(cur)) return null;
        seen.add(cur);
        cur = parentOf.get(cur) ?? null;
      }
      return cur;
    };
    const inCount = new Map(rootUnits.map((u) => [u, 0]));
    const outCount = new Map(rootUnits.map((u) => [u, 0]));
    for (const e of s.edges) {
      if (groupBack.has(e.id)) continue;
      const u = topOf(e.from);
      const v = topOf(e.to);
      if (u && v && u !== v) {
        outCount.set(u, (outCount.get(u) ?? 0) + 1);
        inCount.set(v, (inCount.get(v) ?? 0) + 1);
      }
    }
    const sources = rootUnits.filter((u) => (inCount.get(u) ?? 0) === 0 && (outCount.get(u) ?? 0) > 0);
    if (sources.length === 1) rootEntryUnit = sources[0]!;
  }
  const entryNear = direction === 'down' ? 'top-center' : 'center-left';

  const nodes: TalaInputNode[] = [];
  const startEdges: TalaInputEdge[] = [];

  const emitChildren = (parent: string | null) => {
    const items = [
      ...(childGroups.get(parent) ?? []).map((g) => ({ kind: 'group' as const, seq: g.seq, g })),
      ...(childNodes.get(parent) ?? []).map((n) => ({ kind: 'node' as const, seq: n.seq, n })),
    ].sort((a, b) => a.seq - b.seq);

    for (const item of items) {
      if (item.kind === 'group') {
        const g = item.g;
        const hasKids = (childGroups.get(g.id)?.length ?? 0) + (childNodes.get(g.id)?.length ?? 0) > 0;
        const tw = groupTitleWidth(g.label, !!g.icon);
        const th = GROUP_HEAD - 6;
        const hasTitle = Boolean(g.label || g.icon);
        const needsHierarchy = pinnedContainers.has(g.id);
        const near = parent === null && g.id === rootEntryUnit ? entryNear : undefined;
        if (hasKids) {
          nodes.push({
            id: g.id,
            ...(g.parent ? { parent: g.parent } : {}),
            isContainer: true,
            ...(needsHierarchy ? { forceHierarchy: true, direction } : {}),
            ...(near ? { near } : {}),
            w: Math.max(tw + 2 * GROUP_PAD, 80),
            h: GROUP_HEAD + 2 * GROUP_PAD,
            ...(hasTitle ? { label: g.label || ' ', lw: tw, lh: th, labelPos: 'INSIDE_TOP_LEFT' } : {}),
          });
          emitChildren(g.id);
        } else {
          nodes.push({
            id: g.id,
            ...(g.parent ? { parent: g.parent } : {}),
            isContainer: false,
            ...(near ? { near } : {}),
            w: tw + 2 * GROUP_PAD,
            h: GROUP_HEAD + 2 * GROUP_PAD + 20,
            ...(hasTitle ? { label: g.label || ' ', lw: tw, lh: th, labelPos: 'INSIDE_TOP_LEFT' } : {}),
          });
        }
      } else {
        const n = item.n;
        const near = parent === null && n.id === rootEntryUnit ? entryNear : undefined;
        if (n.initial) {
          const sid = `${START}${n.id}`;
          nodes.push({
            id: sid,
            ...(n.parent ? { parent: n.parent } : {}),
            w: 14,
            h: 14,
          });
          startEdges.push({ id: sid, from: sid, to: n.id });
        }
        nodes.push({
          id: n.id,
          ...(n.parent ? { parent: n.parent } : {}),
          ...(near ? { near } : {}),
          w: n.w,
          h: n.h,
          label: n.label || n.id,
          lw: Math.max(8, Math.round(n.w - 16)),
          lh: Math.max(8, Math.round(n.h - 12)),
          labelPos: 'INSIDE_MIDDLE_CENTER',
        });
      }
    }
  };
  emitChildren(null);

  const known = new Set([...s.nodes.map((n) => n.id), ...s.groups.map((g) => g.id)]);
  const edges: TalaInputEdge[] = [...startEdges];
  for (const e of s.edges) {
    if (!known.has(e.from) || !known.has(e.to)) continue;
    edges.push({
      id: e.id,
      from: e.from,
      to: e.to,
      ...(reversed.has(e.id) ? { reversed: true } : {}),
      ...(e.label ? { label: e.label, lw: e.lw, lh: e.lh } : {}),
      ...(e.async ? { async: true } : {}),
    });
  }
  edges.push(...pinEdges);

  return { direction, forceHierarchy: true, nodes, edges };
}

/**
 * TALA merges 1-to-N / N-to-1 tree fan stems onto a single center port.
 * In Joplo, each <Diagram.Edge> has independent trace state and hit-testing,
 * so we gently fan shared port stems into concentric non-overlapping lanes
 * whenever doing so introduces no node intersections.
 */
function separateSharedTreeStems(
  s: GraphStructure,
  nodes: Record<string, Box>,
  groups: Record<string, Box>,
  edges: GraphLayout['edges'],
): void {
  const boxOf = (id: string): Box | undefined => nodes[id] ?? groups[id];
  const edgeMeta = new Map(s.edges.map((e) => [e.id, e]));
  const hitsOtherNode = (pts: Point[], fromId: string, toId: string): boolean => {
    const samples = sampleRoute(pts, 4);
    for (const [nid, b] of Object.entries(nodes)) {
      if (nid === fromId || nid === toId) continue;
      if (samples.some((p) => p.x > b.x + 2 && p.x < b.x + b.w - 2 && p.y > b.y + 2 && p.y < b.y + b.h - 2)) return true;
    }
    return false;
  };

  for (const end of ['start', 'end'] as const) {
    const bundles = new Map<string, string[]>();
    for (const [eid, route] of Object.entries(edges)) {
      const meta = edgeMeta.get(eid);
      if (!meta || route.points.length < 2) continue;
      const pts = end === 'start' ? route.points : [...route.points].reverse();
      const p0 = pts[0]!;
      const p1 = pts[1]!;
      const horiz = Math.abs(p0.y - p1.y) < 0.5 && Math.abs(p1.x - p0.x) > 1;
      const vert = Math.abs(p0.x - p1.x) < 0.5 && Math.abs(p1.y - p0.y) > 1;
      if (!horiz && !vert) continue;
      const dir = horiz ? (p1.x > p0.x ? 'R' : 'L') : p1.y > p0.y ? 'D' : 'U';
      const owner = end === 'start' ? meta.from : meta.to;
      const key = `${owner}|${dir}|${Math.round(p0.x)}|${Math.round(p0.y)}`;
      bundles.set(key, [...(bundles.get(key) ?? []), eid]);
    }

    for (const [key, eids] of bundles) {
      if (eids.length < 2) continue;
      const [owner, dir] = key.split('|') as [string, 'R' | 'L' | 'D' | 'U'];
      const b = boxOf(owner);
      if (!b) continue;
      const horiz = dir === 'R' || dir === 'L';
      const sign = dir === 'R' || dir === 'D' ? 1 : -1;

      const items = eids
        .map((eid) => {
          const orig = edges[eid]!.points;
          const pts = (end === 'start' ? orig : [...orig].reverse()).map((p) => ({ ...p }));
          const branchCoord = pts.length >= 3 ? (horiz ? pts[2]!.y : pts[2]!.x) : horiz ? pts[1]!.y : pts[1]!.x;
          return { eid, pts, branchCoord };
        })
        .sort((a, b2) => a.branchCoord - b2.branchCoord || a.eid.localeCompare(b2.eid));

      const span = horiz ? b.h : b.w;
      const step = Math.min(10, Math.max(4, Math.floor((span - 16) / Math.max(1, items.length))));
      const baseCoord = horiz ? items[0]!.pts[0]!.y : items[0]!.pts[0]!.x;

      // Concentric turn offsets prevent vertical/horizontal turn lanes from overlapping or crossing.
      const negCount = items.filter((it) => it.branchCoord < baseCoord - 1).length;
      const posItems = items.filter((it) => it.branchCoord > baseCoord + 1);
      let negIdx = 0;
      let posIdx = 0;

      const updated = new Map<string, Point[]>();
      let ok = true;
      for (let i = 0; i < items.length; i++) {
        const it = items[i]!;
        const delta = (i - (items.length - 1) / 2) * step;
        const newPortCoord = r2(
          Math.max((horiz ? b.y : b.x) + 6, Math.min((horiz ? b.y + b.h : b.x + b.w) - 6, baseCoord + delta)),
        );
        const meta = edgeMeta.get(it.eid)!;
        const otherBox = boxOf(end === 'start' ? meta.to : meta.from);

        let turnShift = 0;
        if (it.branchCoord < baseCoord - 1) {
          turnShift = sign * negIdx * 6 - sign * Math.max(0, (negCount - 1) * 3);
          negIdx++;
        } else if (it.branchCoord > baseCoord + 1) {
          turnShift = sign * (posItems.length - 1 - posIdx) * 6 - sign * Math.max(0, (posItems.length - 1) * 3);
          posIdx++;
        }

        const pts = it.pts.map((p) => ({ ...p }));
        if (pts.length === 2) {
          if (
            otherBox &&
            newPortCoord >= (horiz ? otherBox.y : otherBox.x) + 6 &&
            newPortCoord <= (horiz ? otherBox.y + otherBox.h : otherBox.x + otherBox.w) - 6
          ) {
            if (horiz) {
              pts[0]!.y = newPortCoord;
              pts[1]!.y = newPortCoord;
            } else {
              pts[0]!.x = newPortCoord;
              pts[1]!.x = newPortCoord;
            }
          } else {
            const mid = horiz ? r2((pts[0]!.x + pts[1]!.x) / 2) : r2((pts[0]!.y + pts[1]!.y) / 2);
            const oldCoord = horiz ? pts[1]!.y : pts[1]!.x;
            if (horiz) {
              pts.splice(0, 2, { x: pts[0]!.x, y: newPortCoord }, { x: mid, y: newPortCoord }, { x: mid, y: oldCoord }, { x: pts[1]!.x, y: oldCoord });
            } else {
              pts.splice(0, 2, { x: newPortCoord, y: pts[0]!.y }, { x: newPortCoord, y: mid }, { x: oldCoord, y: mid }, { x: oldCoord, y: pts[1]!.y });
            }
          }
        } else {
          if (horiz) {
            const minX = Math.min(pts[0]!.x, pts[2]!.x) + 8;
            const maxX = Math.max(pts[0]!.x, pts[2]!.x) - 8;
            const turnX = minX <= maxX ? r2(Math.max(minX, Math.min(maxX, pts[1]!.x + turnShift))) : pts[1]!.x;
            pts[0]!.y = newPortCoord;
            pts[1]!.y = newPortCoord;
            pts[1]!.x = turnX;
            pts[2]!.x = turnX;
          } else {
            const minY = Math.min(pts[0]!.y, pts[2]!.y) + 8;
            const maxY = Math.max(pts[0]!.y, pts[2]!.y) - 8;
            const turnY = minY <= maxY ? r2(Math.max(minY, Math.min(maxY, pts[1]!.y + turnShift))) : pts[1]!.y;
            pts[0]!.x = newPortCoord;
            pts[1]!.x = newPortCoord;
            pts[1]!.y = turnY;
            pts[2]!.y = turnY;
          }
        }

        const finalPts = simplify(end === 'start' ? pts : pts.reverse());
        if (hitsOtherNode(finalPts, meta.from, meta.to)) {
          ok = false;
          break;
        }
        updated.set(it.eid, finalPts);
      }

      if (ok) {
        for (const [eid, finalPts] of updated) {
          edges[eid]!.points = finalPts;
        }
      }
    }
  }
}

function layoutTalaDirection(s: GraphStructure, direction: 'right' | 'down'): GraphLayout {
  const input = toTalaInput(s, direction);
  const raw = runTalaRaw(input);
  const gids = new Set(s.groups.map((g) => g.id));
  const nodes: Record<string, Box> = {};
  const groups: Record<string, Box> = {};
  const starts: Record<string, Box> = {};

  for (const [id, b] of Object.entries(raw.boxes ?? {})) {
    if (gids.has(id)) groups[id] = b;
    else if (id.startsWith(START)) starts[id.slice(START.length)] = b;
    else nodes[id] = b;
  }

  const edges: GraphLayout['edges'] = {};
  for (const [id, e] of Object.entries(raw.edges ?? {})) {
    edges[id] = {
      points: simplify(e.points),
      label: e.label ?? null,
    };
  }

  separateSharedTreeStems(s, nodes, groups, edges);

  // Re-anchor any edge labels whose line moved during stem separation, plus any missing or colliding labels.
  const boxOverlap = (a: Box, b: Box) =>
    Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) *
    Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
  const rawTitleBoxes = Object.values(raw.labels ?? {});
  const seenLabelBoxes: Box[] = [];
  const needsRelabel: GEdge[] = s.edges.filter((e) => {
    if (!e.label || !edges[e.id]) return false;
    const lb = edges[e.id]!.label;
    if (!lb) return true;
    const near = Math.min(
      ...sampleRoute(edges[e.id]!.points, 2).map((p) =>
        Math.hypot(Math.max(lb.x - p.x, 0, p.x - (lb.x + lb.w)), Math.max(lb.y - p.y, 0, p.y - (lb.y + lb.h))),
      ),
    );
    if (near > 4) return true;
    if (Object.values(nodes).some((nb) => boxOverlap(lb, nb) > 0)) return true;
    if (rawTitleBoxes.some((tb) => boxOverlap(lb, tb) > 0)) return true;
    if (seenLabelBoxes.some((ob) => boxOverlap(lb, ob) > 0)) return true;
    seenLabelBoxes.push(lb);
    return false;
  });
  if (needsRelabel.length) {
    for (const e of needsRelabel) edges[e.id]!.label = null;
    const heads = Object.values(groups).map((g) => ({ x: g.x, y: g.y, w: g.w, h: GROUP_HEAD }));
    const placed = placeLabels(needsRelabel, edges, [
      ...Object.values(nodes),
      ...heads,
      ...Object.values(edges).flatMap((x) => (x.label ? [x.label] : [])),
    ]);
    for (const [id, box] of placed) edges[id]!.label = box;
  }

  const xs: number[] = [];
  const ys: number[] = [];
  const add = (b: Box) => {
    xs.push(b.x, b.x + b.w);
    ys.push(b.y, b.y + b.h);
  };
  [...Object.values(nodes), ...Object.values(groups), ...Object.values(starts)].forEach(add);
  for (const e of Object.values(edges)) {
    e.points.forEach((p) => add({ x: p.x, y: p.y, w: 0, h: 0 }));
    if (e.label) add(e.label);
  }
  if (!xs.length) {
    return { kind: 'graph', engine: 'tala', width: 0, height: 0, nodes: {}, groups: {}, titles: {}, edges: {} };
  }

  const dx = M - Math.min(...xs);
  const dy = M - Math.min(...ys);
  const mv = (b: Box): Box => ({ x: r2(b.x + dx), y: r2(b.y + dy), w: r2(b.w), h: r2(b.h) });
  const movedNodes = Object.fromEntries(Object.entries(nodes).map(([k, b]) => [k, mv(b)]));
  const movedGroups = Object.fromEntries(Object.entries(groups).map(([k, b]) => [k, mv(b)]));
  const movedEdges = Object.fromEntries(
    Object.entries(edges).map(([k, e]) => [
      k,
      {
        points: e.points.map((p) => ({ x: r2(p.x + dx), y: r2(p.y + dy) })),
        label: e.label ? mv(e.label) : null,
      },
    ]),
  );
  const movedStarts = Object.fromEntries(Object.entries(starts).map(([k, b]) => [k, mv(b)]));

  const fallbackTitles = placeTitles(s, movedGroups, movedEdges);
  const titles: Record<string, Box> = {};
  for (const g of s.groups) {
    const gb = movedGroups[g.id];
    if (!gb || (!g.label && !g.icon)) continue;
    const tb = raw.labels?.[g.id] ? mv(raw.labels[g.id]!) : null;
    if (tb && tb.x >= gb.x && tb.y >= gb.y && tb.x + tb.w <= gb.x + gb.w && tb.y + tb.h <= gb.y + gb.h) {
      titles[g.id] = tb;
    } else if (fallbackTitles[g.id]) {
      titles[g.id] = fallbackTitles[g.id]!;
    }
  }

  return {
    kind: 'graph',
    engine: 'tala',
    direction,
    width: Math.ceil(Math.max(...xs) + dx + M),
    height: Math.ceil(Math.max(...ys) + dy + M),
    nodes: movedNodes,
    groups: movedGroups,
    titles,
    edges: movedEdges,
    ...(Object.keys(movedStarts).length ? { starts: movedStarts } : {}),
  };
}

export function layoutGraphTala(s: GraphStructure, goal: LayoutGoal = { aspect: DEFAULT_ASPECT }): GraphLayout {
  if (!s.nodes.length && !s.groups.length) {
    return { kind: 'graph', engine: 'tala', width: 0, height: 0, nodes: {}, groups: {}, titles: {}, edges: {} };
  }
  const dirs: ('right' | 'down')[] = s.direction === 'auto' ? ['down', 'right'] : [s.direction];
  const target = Math.max(0.2, Math.min(8, goal.aspect || DEFAULT_ASPECT));
  const areaW = goal.width ?? 1200;
  const areaH = goal.height ?? areaW / target;
  let best: { l: GraphLayout; score: number } | null = null;
  for (const direction of dirs) {
    const l = layoutTalaDirection(s, direction);
    const fit = Math.min(1, areaW / Math.max(1, l.width), areaH / Math.max(1, l.height));
    const score = -Math.log(fit) + 0.25 * Math.abs(Math.log(Math.max(1, l.width) / Math.max(1, l.height) / target)) + 0.03 * crossings(l);
    if (!best || score < best.score - 1e-9) best = { l, score };
  }
  return best!.l;
}

const CACHE_MAX = 500;

/** Compile-time D2 TALA layout engine with deterministic structural caching. */
export function talaLayout(s: GraphStructure, goal: LayoutGoal = { aspect: DEFAULT_ASPECT }): GraphLayout {
  const { cache } = getGlobalState();
  const key = `tala|${goal.aspect.toFixed(3)}|${goal.width ?? ''}|${goal.height ?? ''}|${structureKey(s)}`;
  const hit = cache.get(key);
  if (hit) return structuredClone(hit);
  const l = layoutGraphTala(structuredClone(s), goal);
  cache.set(key, l);
  if (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value!);
  return structuredClone(l);
}
