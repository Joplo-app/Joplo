/**
 * 焦点提示的纯几何（D67）：聚光的挖洞路径、标注气泡选边与避让、编号角标的位置。由 Cues.tsx 使用，单测覆盖。
 * 坐标都是镜头容器里的“内容坐标”；屏幕上固定大小的东西（气泡、角标、留白）按镜头缩放 k 换算（÷ k）。
 */
import type { Box } from './camera-math';

export type Side = 'top' | 'right' | 'bottom' | 'left';
export const SIDES_AUTO: readonly Side[] = ['right', 'left', 'bottom', 'top'];

/** 聚光洞比目标大一圈（屏幕像素）。 */
export const SPOT_PAD = 8;
/** 聚光以外区域的覆盖范围：足够大，镜头缩小到整层时也盖得住。 */
const FAR = 100000;

/** 镜头此刻看得见的内容范围（内容坐标）：画面 W×H 经镜头变换 (k, tx, ty) 反算。 */
export function visibleRegion(W: number, H: number, view: { k: number; tx: number; ty: number } | null): Box {
  const k = view && view.k > 0 ? view.k : 1;
  const tx = view?.tx ?? 0;
  const ty = view?.ty ?? 0;
  return { x: -tx / k || 0, y: -ty / k || 0, w: W / k, h: H / k };
}

/** 圆角矩形（顺时针）。 */
function roundRect(b: Box, r: number): string {
  const rr = Math.max(0, Math.min(r, b.w / 2, b.h / 2));
  const { x, y, w, h } = b;
  return `M${x + rr},${y} H${x + w - rr} A${rr},${rr} 0 0 1 ${x + w},${y + rr} V${y + h - rr} A${rr},${rr} 0 0 1 ${x + w - rr},${y + h} H${x + rr} A${rr},${rr} 0 0 1 ${x},${y + h - rr} V${y + rr} A${rr},${rr} 0 0 1 ${x + rr},${y} Z`;
}

/** 洞：目标外扩 pad（内容坐标）；重叠的洞合并成一个包围盒，避免 evenodd 把重叠处又盖回去。 */
export function spotlightHoles(targets: Box[], pad: number): Box[] {
  let holes = targets.filter((b) => b.w > 0 && b.h > 0).map((b) => ({ x: b.x - pad, y: b.y - pad, w: b.w + 2 * pad, h: b.h + 2 * pad }));
  for (let merged = true; merged; ) {
    merged = false;
    outer: for (let i = 0; i < holes.length; i++) {
      for (let j = i + 1; j < holes.length; j++) {
        if (overlaps(holes[i]!, holes[j]!)) {
          const a = holes[i]!, b = holes[j]!;
          const x = Math.min(a.x, b.x), y = Math.min(a.y, b.y);
          holes[i] = { x, y, w: Math.max(a.x + a.w, b.x + b.w) - x, h: Math.max(a.y + a.h, b.y + b.h) - y };
          holes.splice(j, 1);
          merged = true;
          break outer;
        }
      }
    }
  }
  return holes;
}

/** 聚光遮罩的路径（fill-rule evenodd）：一个很大的外框，减去每个洞。没有洞时返回 null（不压暗整屏）。 */
export function spotlightPath(holes: Box[], radius: number): string | null {
  if (!holes.length) return null;
  return `M${-FAR},${-FAR} H${FAR} V${FAR} H${-FAR} Z ${holes.map((h) => roundRect(h, radius)).join(' ')}`;
}

export function overlaps(a: Box, b: Box): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

export type CalloutPlacement = {
  /** 气泡的位置与大小（内容坐标）。 */
  box: Box;
  side: Side;
  /** 引线：从气泡边缘到目标边缘（内容坐标）。 */
  from: { x: number; y: number };
  to: { x: number; y: number };
};

/**
 * 标注气泡放在目标哪一侧：写了 side 就用它；否则按 右 → 左 → 下 → 上 取第一个完整放得下、且不压住目标与已放好的气泡的一侧；
 * 都放不下时取空间最大的一侧。最后把气泡夹进可见范围（留 margin）。gap、margin 是内容坐标。
 */
export function placeCallout(target: Box, size: { w: number; h: number }, region: Box, opts: { side?: Side; placed?: Box[]; gap: number; margin: number }): CalloutPlacement {
  const { gap, margin } = opts;
  const placed = opts.placed ?? [];
  const at = (side: Side): Box => {
    const cx = target.x + target.w / 2 - size.w / 2;
    const cy = target.y + target.h / 2 - size.h / 2;
    if (side === 'right') return { x: target.x + target.w + gap, y: cy, w: size.w, h: size.h };
    if (side === 'left') return { x: target.x - gap - size.w, y: cy, w: size.w, h: size.h };
    if (side === 'bottom') return { x: cx, y: target.y + target.h + gap, w: size.w, h: size.h };
    return { x: cx, y: target.y - gap - size.h, w: size.w, h: size.h };
  };
  const inner = { x: region.x + margin, y: region.y + margin, w: region.w - 2 * margin, h: region.h - 2 * margin };
  const fits = (b: Box) => b.x >= inner.x && b.y >= inner.y && b.x + b.w <= inner.x + inner.w && b.y + b.h <= inner.y + inner.h;
  const room: Record<Side, number> = {
    right: inner.x + inner.w - (target.x + target.w),
    left: target.x - inner.x,
    bottom: inner.y + inner.h - (target.y + target.h),
    top: target.y - inner.y,
  };
  let side: Side;
  if (opts.side) side = opts.side;
  else {
    const clear = (s: Side) => { const b = clamp(at(s), inner, s); return fits(at(s)) && !placed.some((p) => overlaps(b, p)); };
    side = SIDES_AUTO.find(clear) ?? [...SIDES_AUTO].sort((a, b) => room[b] / (b === 'left' || b === 'right' ? size.w : size.h) - room[a] / (a === 'left' || a === 'right' ? size.w : size.h))[0]!;
  }
  const box = clamp(at(side), inner, side);
  // 引线：气泡朝向目标的那条边的中点（夹在气泡边上）→ 目标对应边上离它最近的点
  const tcx = Math.max(target.x, Math.min(target.x + target.w, box.x + box.w / 2));
  const tcy = Math.max(target.y, Math.min(target.y + target.h, box.y + box.h / 2));
  const from =
    side === 'right' ? { x: box.x, y: Math.max(box.y + 6, Math.min(box.y + box.h - 6, tcy)) }
    : side === 'left' ? { x: box.x + box.w, y: Math.max(box.y + 6, Math.min(box.y + box.h - 6, tcy)) }
    : side === 'bottom' ? { x: Math.max(box.x + 6, Math.min(box.x + box.w - 6, tcx)), y: box.y }
    : { x: Math.max(box.x + 6, Math.min(box.x + box.w - 6, tcx)), y: box.y + box.h };
  const to =
    side === 'right' ? { x: target.x + target.w, y: Math.max(target.y, Math.min(target.y + target.h, from.y)) }
    : side === 'left' ? { x: target.x, y: Math.max(target.y, Math.min(target.y + target.h, from.y)) }
    : side === 'bottom' ? { x: Math.max(target.x, Math.min(target.x + target.w, from.x)), y: target.y + target.h }
    : { x: Math.max(target.x, Math.min(target.x + target.w, from.x)), y: target.y };
  return { box, side, from, to };
}

/** 夹进可见范围；放不下时贴着目标那一侧对齐（宁可盖住画面别处，也不离开目标）。 */
function clamp(b: Box, inner: Box, _side: Side): Box {
  const x = inner.w >= b.w ? Math.max(inner.x, Math.min(inner.x + inner.w - b.w, b.x)) : inner.x;
  const y = inner.h >= b.h ? Math.max(inner.y, Math.min(inner.y + inner.h - b.h, b.y)) : inner.y;
  return { x, y, w: b.w, h: b.h };
}

/** 编号角标的圆心：目标左上角向外偏半个角标；夹进可见范围。size 是角标直径（内容坐标）。 */
export function badgeCenter(target: Box, size: number, region: Box): { x: number; y: number } {
  const r = size / 2;
  const x = Math.max(region.x + r + 2, Math.min(region.x + region.w - r - 2, target.x));
  const y = Math.max(region.y + r + 2, Math.min(region.y + region.h - r - 2, target.y));
  return { x, y };
}
