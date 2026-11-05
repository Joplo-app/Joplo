/**
 * 架构图连线的正交走线（T-director3，纯函数，结果确定）。dagre 只负责节点位置，连线全部在这里重新走：
 *
 * 在“沿层方向为 x”的坐标里计算（down 方向交换坐标轴）。节点按层排成列，列与列之间是空隙（gap）。
 * - 出入口：连线从朝向对方的一侧出入（同列的连线都走右侧）。同一个空隙两侧的所有出入口（左列的右侧 + 右列的左侧）
 *   一起排布，互相至少相距 SP（10px），所以同一节点同一侧的出入口不重合，空隙里的横段也不会共线；
 *   相邻两列、高度范围有重叠的连线优先拉直（两端同一高度）。
 * - 竖段（通道）：每条线在空隙里占一条竖直通道；竖直范围有重叠的通道至少相距 SP；通道离节点至少 M，给箭头留位置；
 *   不走在分组标题条里，尽量不贴着分组边框。
 * - 跨越多列的连线：在中间走一条横向“轨道”，避开途经列里的节点，与其他轨道、途经空隙里的出入口至少相距 SP。
 * - 某个空隙放不下所需的通道时，返回 deficit（还差多少像素），调用方加大层间距重新布局。
 */
import type { Box, DEdge, Point } from './diagram-layout';

/** 平行段（以及同侧出入口）之间的最小间距。 */
export const SP = 10;
/** 通道离列边缘（节点、箭头）的最小距离。 */
const M = 14;
/** 出入口离节点角的最小距离。 */
const PORT_MARGIN = 8;
const OUTER = 90;

const T = (p: Point, flip: boolean): Point => (flip ? { x: p.y, y: p.x } : p);
const TB = (b: Box, flip: boolean): Box => (flip ? { x: b.y, y: b.x, w: b.h, h: b.w } : b);

type End = { edge: string; end: 's' | 't'; node: string; side: 'L' | 'R'; gap: number; key: number };
type Item = { ends: End[]; lo: number; hi: number; want: number; y: number };

export type RouteResult = {
  routes: Map<string, Point[]>;
  /** 某个空隙还差多少像素才放得下所需的通道（> 0 时调用方加大层间距重排）。 */
  deficit: number;
  /** 出入口太多、放不下 SP 间距的节点：需要的最小边长（沿出入口那一侧，原坐标里 right 方向是高度、down 方向是宽度）。 */
  grow: Record<string, number>;
};

export function routeOrthogonal(list: DEdge[], nodeBoxes: Record<string, Box>, flip: boolean, groupBoxes: Box[], titleH: number): RouteResult {
  const boxes: Record<string, Box> = Object.fromEntries(Object.entries(nodeBoxes).map(([k, b]) => [k, TB(b, flip)]));
  const groups = groupBoxes.map((b) => TB(b, flip));
  // 分组标题条（原坐标里分组顶部 titleH 高的一条）：通道与轨道不沿着它走
  const strips = groupBoxes.map((g) => TB({ x: g.x, y: g.y, w: g.w, h: titleH + 2 }, flip));
  const routes = new Map<string, Point[]>();
  const ids = Object.keys(boxes);
  if (!ids.length) return { routes, deficit: 0, grow: {} };
  const cx = (b: Box) => b.x + b.w / 2;
  const cy = (b: Box) => b.y + b.h / 2;
  // 列：中心 x 相同（dagre 同一层的节点中心对齐）
  const centers: number[] = [];
  for (const id of ids.sort((a, b) => cx(boxes[a]!) - cx(boxes[b]!))) {
    const c = cx(boxes[id]!);
    if (!centers.length || Math.abs(c - centers[centers.length - 1]!) > 1) centers.push(c);
  }
  const colOf = (id: string) => centers.findIndex((c) => Math.abs(c - cx(boxes[id]!)) <= 1);
  const n = centers.length;
  const colNodes = centers.map((_, i) => ids.filter((id) => colOf(id) === i));
  const colL = colNodes.map((ns) => Math.min(...ns.map((id) => boxes[id]!.x)));
  const colR = colNodes.map((ns) => Math.max(...ns.map((id) => boxes[id]!.x + boxes[id]!.w)));
  /** 空隙 g：第 g 列右侧与第 g+1 列左侧之间；-1 与 n-1 是外侧。 */
  const gapOf = (g: number): [number, number] => (g < 0 ? [colL[0]! - OUTER, colL[0]!] : g >= n - 1 ? [colR[n - 1]!, colR[n - 1]! + OUTER] : [colR[g]!, colL[g + 1]!]);

  type E = { e: DEdge; S: Box; D: Box; cS: number; cD: number; sideS: 'L' | 'R'; sideD: 'L' | 'R'; gS: number; gD: number; sy: number; ty: number; yt: number | null; straight: boolean };
  const es: E[] = [];
  for (const e of list) {
    const S = boxes[e.from];
    const D = boxes[e.to];
    if (!S || !D) continue;
    if (e.from === e.to) {
      // 自环：从右侧出去绕一圈回来
      const x = S.x + S.w;
      routes.set(e.id, [{ x, y: S.y + S.h * 0.35 }, { x: x + 24, y: S.y + S.h * 0.35 }, { x: x + 24, y: S.y + S.h * 0.65 }, { x, y: S.y + S.h * 0.65 }].map((p) => T(p, flip)));
      continue;
    }
    const cS = colOf(e.from);
    const cD = colOf(e.to);
    const fwd = cD > cS;
    const back = cD < cS;
    const sideS: 'L' | 'R' = back ? 'L' : 'R';
    const sideD: 'L' | 'R' = fwd ? 'L' : 'R';
    const gS = back ? cS - 1 : cS;
    const gD = fwd ? cD - 1 : cD;
    es.push({ e, S, D, cS, cD, sideS, sideD, gS, gD, sy: 0, ty: 0, yt: null, straight: false });
  }

  // ---------- 出入口 ----------
  const items = new Map<number, Item[]>();
  const pushItem = (g: number, it: Item) => items.set(g, [...(items.get(g) ?? []), it]);
  const range = (b: Box): [number, number] => {
    const m = Math.min(PORT_MARGIN, b.h / 4);
    return [b.y + m, b.y + b.h - m];
  };
  // 每个节点每一侧的出入口按另一端的位置排序，先均匀分布作为期望位置
  const sideEnds = new Map<string, End[]>();
  for (const r of es) {
    const a: End = { edge: r.e.id, end: 's', node: r.e.from, side: r.sideS, gap: r.gS, key: cy(r.D) };
    const b: End = { edge: r.e.id, end: 't', node: r.e.to, side: r.sideD, gap: r.gD, key: cy(r.S) };
    for (const x of [a, b]) sideEnds.set(`${x.node}:${x.side}`, [...(sideEnds.get(`${x.node}:${x.side}`) ?? []), x]);
  }
  const grow: Record<string, number> = {};
  for (const [k, list2] of sideEnds) {
    const id = k.slice(0, k.lastIndexOf(':'));
    const need = (list2.length - 1) * SP + 2 * PORT_MARGIN + 4;
    if (need > boxes[id]!.h + 0.5) grow[id] = Math.max(grow[id] ?? 0, need);
  }
  const want = new Map<string, number>();
  for (const [k, list2] of sideEnds) {
    const b = boxes[k.slice(0, k.lastIndexOf(':'))]!;
    list2.sort((p, q) => p.key - q.key || (p.edge < q.edge ? -1 : 1));
    list2.forEach((x, i) => want.set(`${x.edge}:${x.end}`, list2.length === 1 ? Math.max(range(b)[0], Math.min(range(b)[1], x.key)) : b.y + (b.h * (i + 1)) / (list2.length + 1)));
  }
  for (const r of es) {
    const [sl, sh] = range(r.S);
    const [dl, dh] = range(r.D);
    const ws = want.get(`${r.e.id}:s`)!;
    const wt = want.get(`${r.e.id}:t`)!;
    const adjacent = r.gS === r.gD && r.cS !== r.cD;
    const lo = Math.max(sl, dl);
    const hi = Math.min(sh, dh);
    const ends: End[] = [
      { edge: r.e.id, end: 's', node: r.e.from, side: r.sideS, gap: r.gS, key: 0 },
      { edge: r.e.id, end: 't', node: r.e.to, side: r.sideD, gap: r.gD, key: 0 },
    ];
    if (adjacent && hi - lo >= 12) {
      // 拉直：两端同一高度
      r.straight = true;
      pushItem(r.gS, { ends, lo, hi, want: Math.max(lo, Math.min(hi, (ws + wt) / 2)), y: 0 });
    } else {
      pushItem(r.gS, { ends: [ends[0]!], lo: sl, hi: sh, want: ws, y: 0 });
      pushItem(r.gD, { ends: [ends[1]!], lo: dl, hi: dh, want: wt, y: 0 });
    }
  }
  // 同一空隙两侧的出入口一起排布，互相至少相距 SP（来回推几遍，夹在各自节点的范围内）
  for (const list2 of items.values()) {
    list2.sort((a, b) => a.want - b.want || (a.ends[0]!.edge < b.ends[0]!.edge ? -1 : 1));
    for (const it of list2) it.y = Math.max(it.lo, Math.min(it.hi, it.want));
    for (let pass = 0; pass < 6; pass++) {
      for (let i = 1; i < list2.length; i++) list2[i]!.y = Math.min(list2[i]!.hi, Math.max(list2[i]!.y, list2[i - 1]!.y + SP));
      for (let i = list2.length - 2; i >= 0; i--) list2[i]!.y = Math.max(list2[i]!.lo, Math.min(list2[i]!.y, list2[i + 1]!.y - SP));
    }
    for (const it of list2) for (const x of it.ends) {
      const r = es.find((q) => q.e.id === x.edge)!;
      if (x.end === 's') r.sy = it.y;
      else r.ty = it.y;
    }
  }
  const portYs = (g: number) => (items.get(g) ?? []).flatMap((it) => it.ends.map((x) => ({ edge: x.edge, side: x.side, node: x.node, y: it.y })));

  // ---------- 跨列连线的轨道 ----------
  const tracks: { edge: string; y: number; x0: number; x1: number }[] = [];
  const near = (a: number, b: number, d = SP) => Math.abs(a - b) < d;
  for (const r of es) {
    if (r.gS === r.gD) continue;
    const lo = Math.min(r.gS, r.gD);
    const hi = Math.max(r.gS, r.gD);
    const x0 = gapOf(lo)[0];
    const x1 = gapOf(hi)[1];
    // 途经的列：两个空隙之间的列
    const midCols: number[] = [];
    for (let c = lo + 1; c <= hi; c++) midCols.push(c);
    const blockers = midCols.flatMap((c) => colNodes[c]!.map((id) => boxes[id]!));
    // 途经空隙（含起止两个空隙）里别的连线的出入口：轨道与它们的横段至少相距 SP（保守：不区分两侧）
    const ports: number[] = [];
    for (let g = lo; g <= hi; g++) for (const p of portYs(g)) if (p.edge !== r.e.id) ports.push(p.y);
    const ok = (y: number) =>
      !blockers.some((b) => y > b.y - 8 && y < b.y + b.h + 8) &&
      !ports.some((p) => near(p, y)) &&
      !tracks.some((t) => t.x1 > x0 && t.x0 < x1 && near(t.y, y)) &&
      !strips.some((s) => s.x < x1 && s.x + s.w > x0 && y > s.y - 3 && y < s.y + s.h + 3);
    const soft = (y: number) => !groups.some((g) => g.x < x1 && g.x + g.w > x0 && (near(y, g.y, 4) || near(y, g.y + g.h, 4)));
    const cands = [r.sy, r.ty];
    const mid = (r.sy + r.ty) / 2;
    for (let k = 1; k < 400; k++) cands.push(mid - k * 4, mid + k * 4);
    const yt = cands.find((y) => ok(y) && soft(y)) ?? cands.find(ok) ?? mid;
    r.yt = yt;
    tracks.push({ edge: r.e.id, y: yt, x0, x1 });
  }

  // ---------- 通道 ----------
  type V = { edge: string; end: 's' | 't'; y0: number; y1: number; x: number };
  const verts = new Map<number, V[]>();
  const pushV = (g: number, v: V) => verts.set(g, [...(verts.get(g) ?? []), v]);
  for (const r of es) {
    if (r.straight) continue;
    if (r.gS === r.gD) {
      if (!near(r.sy, r.ty, 0.5)) pushV(r.gS, { edge: r.e.id, end: 's', y0: Math.min(r.sy, r.ty), y1: Math.max(r.sy, r.ty), x: 0 });
    } else {
      const yt = r.yt!;
      if (!near(r.sy, yt, 0.5)) pushV(r.gS, { edge: r.e.id, end: 's', y0: Math.min(r.sy, yt), y1: Math.max(r.sy, yt), x: 0 });
      if (!near(r.ty, yt, 0.5)) pushV(r.gD, { edge: r.e.id, end: 't', y0: Math.min(r.ty, yt), y1: Math.max(r.ty, yt), x: 0 });
    }
  }
  let deficit = 0;
  const laneX = new Map<string, number>();
  for (const [g, vs] of verts) {
    const [g0, g1] = gapOf(g);
    const a = g0 + M;
    const b = g1 - M;
    // 长的先放（更难放），同长按位置
    vs.sort((p, q) => q.y1 - q.y0 - (p.y1 - p.y0) || p.y0 - q.y0 || (p.edge < q.edge ? -1 : 1));
    const placed: V[] = [];
    const cands: number[] = [];
    const center = (a + b) / 2;
    if (b >= a) {
      const steps = Math.floor((b - a) / 2);
      for (let k = 0; k <= steps; k++) cands.push(center - k * 2, center + k * 2);
    }
    const okX = (v: V, x: number) =>
      x >= a - 1e-6 && x <= b + 1e-6 &&
      !placed.some((p) => near(p.x, x) && p.y1 > v.y0 - SP && p.y0 < v.y1 + SP) &&
      !strips.some((s) => x > s.x - 3 && x < s.x + s.w + 3 && s.y < v.y1 && s.y + s.h > v.y0);
    const softX = (v: V, x: number) => !groups.some((gb) => (near(x, gb.x, 4) || near(x, gb.x + gb.w, 4)) && gb.y < v.y1 && gb.y + gb.h > v.y0);
    let need = 0;
    for (const v of vs) {
      const x = cands.find((c) => okX(v, c) && softX(v, c)) ?? cands.find((c) => okX(v, c));
      if (x === undefined) {
        need++;
        v.x = center + (placed.length % 2 ? 1 : -1) * SP * Math.ceil(placed.length / 2);
      } else v.x = x;
      placed.push(v);
      laneX.set(`${v.edge}:${v.end}`, v.x);
    }
    if (need) deficit = Math.max(deficit, need * SP + 2 * SP);
  }

  // ---------- 输出折线 ----------
  for (const r of es) {
    const sx = r.sideS === 'R' ? r.S.x + r.S.w : r.S.x;
    const dx = r.sideD === 'R' ? r.D.x + r.D.w : r.D.x;
    let pts: Point[];
    if (r.straight) pts = [{ x: sx, y: r.sy }, { x: dx, y: r.ty }];
    else if (r.gS === r.gD) {
      const x = laneX.get(`${r.e.id}:s`) ?? (sx + dx) / 2;
      pts = [{ x: sx, y: r.sy }, { x, y: r.sy }, { x, y: r.ty }, { x: dx, y: r.ty }];
    } else {
      const yt = r.yt!;
      const xs = laneX.get(`${r.e.id}:s`);
      const xd = laneX.get(`${r.e.id}:t`);
      pts = [{ x: sx, y: r.sy }];
      if (xs !== undefined) pts.push({ x: xs, y: r.sy }, { x: xs, y: yt });
      if (xd !== undefined) pts.push({ x: xd, y: yt }, { x: xd, y: r.ty });
      pts.push({ x: dx, y: r.ty });
    }
    routes.set(r.e.id, simplify(pts).map((p) => T(p, flip)));
  }
  return { routes, deficit, grow };
}

/** 去掉重复点与共线的中间点。 */
function simplify(pts: Point[]): Point[] {
  const out: Point[] = [];
  for (const p of pts) {
    const q = out[out.length - 1];
    if (q && Math.abs(q.x - p.x) < 0.01 && Math.abs(q.y - p.y) < 0.01) continue;
    out.push(p);
    while (out.length >= 3) {
      const [a, b, c] = out.slice(-3) as [Point, Point, Point];
      const colinear = (Math.abs(a.x - b.x) < 0.01 && Math.abs(b.x - c.x) < 0.01) || (Math.abs(a.y - b.y) < 0.01 && Math.abs(b.y - c.y) < 0.01);
      if (!colinear) break;
      out.splice(out.length - 2, 1);
    }
  }
  return out;
}
