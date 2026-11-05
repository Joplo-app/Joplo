/**
 * 镜头的纯计算（D43 / T-layers）：给定画面尺寸与焦点包围盒（这一层自己的内容坐标），算出平移缩放。由 camera.tsx 使用，单测覆盖。
 * - 聚焦：焦点放进画面并四周留 CAMERA_PAD，居中；最多推近 MAX_ZOOM 倍，但对准架构图节点时，
 *   至少推近到节点主标签在屏幕上 ≥ MIN_NODE_PX（nodeScales = 每个节点“内容像素 → 屏幕像素”的比例，含架构图缩放与舞台外层缩放）。
 *   给了 bounds（这一层内容的范围）时，在不破坏内边距的前提下尽量不露出内容以外的空白。
 * - 整层：只缩小不放大，内容比画面大时整体缩进来、居中。
 */
export type Box = { x: number; y: number; w: number; h: number };
export type CameraMode = 'focus' | 'overview';
export type CameraFit = { k: number; tx: number; ty: number };

export const CAMERA_PAD = 28;
export const MAX_ZOOM = 2;
export const MIN_NODE_PX = 16;
export const NODE_FONT_PX = 14;

export function union(bs: Box[]): Box | null {
  if (!bs.length) return null;
  const x0 = Math.min(...bs.map((b) => b.x));
  const y0 = Math.min(...bs.map((b) => b.y));
  const x1 = Math.max(...bs.map((b) => b.x + b.w));
  const y1 = Math.max(...bs.map((b) => b.y + b.h));
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

const clamp = (v: number, lo: number, hi: number) => (lo > hi ? (lo + hi) / 2 : Math.min(hi, Math.max(lo, v)));

/** 一个方向上的平移：先居中，再收进内容范围（不露空白），最后保证焦点四周的内边距（优先级最高）。 */
function axis(view: number, k: number, b0: number, bs: number, c0: number | null, cs: number | null): number {
  let t = view / 2 - k * (b0 + bs / 2);
  if (c0 !== null && cs !== null && k * cs >= view) t = clamp(t, view - k * (c0 + cs), -k * c0);
  return clamp(t, CAMERA_PAD - k * b0, view - CAMERA_PAD - k * (b0 + bs));
}

export function fitCamera(input: { W: number; H: number; mode: CameraMode; bbox: Box; nodeScales?: number[]; bounds?: Box | null; reserve?: { right?: number; bottom?: number } }): CameraFit {
  const { mode, bbox } = input;
  // reserve：聚焦时给解说卡留出的右侧 / 底部（T-director2），焦点放进剩下的区域
  const W = mode === 'focus' ? Math.max(200, input.W - (input.reserve?.right ?? 0)) : input.W;
  const H = mode === 'focus' ? Math.max(160, input.H - (input.reserve?.bottom ?? 0)) : input.H;
  if (mode === 'overview') {
    const k = Math.min(1, W / bbox.w, H / bbox.h);
    if (k === 1) return { k: 1, tx: 0, ty: 0 };
    return { k, tx: W / 2 - k * (bbox.x + bbox.w / 2), ty: H / 2 - k * (bbox.y + bbox.h / 2) };
  }
  const fit = Math.min((W - 2 * CAMERA_PAD) / bbox.w, (H - 2 * CAMERA_PAD) / bbox.h);
  let cap = MAX_ZOOM;
  for (const s of input.nodeScales ?? []) if (s > 0) cap = Math.max(cap, MIN_NODE_PX / (NODE_FONT_PX * s));
  const k = Math.max(0.05, Math.min(fit, cap));
  const c = input.bounds ?? null;
  return { k, tx: axis(W, k, bbox.x, bbox.w, c?.x ?? null, c?.w ?? null), ty: axis(H, k, bbox.y, bbox.h, c?.y ?? null, c?.h ?? null) };
}

/**
 * 滚动容器里的目标：返回让目标（含 pad）进入可视区的新 scrollTop / scrollLeft（一个方向）。
 * start/size：目标相对容器可视区的位置与大小；view：可视区大小；scroll：当前滚动量；max：最大滚动量。
 */
export function revealScroll(start: number, size: number, view: number, scroll: number, max: number, pad = 12): number {
  let next = scroll;
  if (size + 2 * pad >= view) next = scroll + start - pad;
  else if (start < pad) next = scroll + start - pad;
  else if (start + size > view - pad) next = scroll + start + size - view + pad;
  return Math.max(0, Math.min(max, next));
}

/** 内容坐标的盒子经镜头变换后在画面里的位置。 */
export const project = (b: Box, f: Pick<CameraFit, 'k' | 'tx' | 'ty'>): Box => ({ x: f.tx + f.k * b.x, y: f.ty + f.k * b.y, w: f.k * b.w, h: f.k * b.h });

/**
 * 元素实际可见的部分：与所有会裁切它的祖先（overflow 不是 visible 的容器，如固定高度的架构图、滚动区）求交。
 * 镜头与高光都用它——此前直接用元素自己的矩形，元素被容器裁掉时，高光框和推近位置会落在空白处。
 */
export function visibleRect(el: Box, clips: Box[]): Box | null {
  let x0 = el.x;
  let y0 = el.y;
  let x1 = el.x + el.w;
  let y1 = el.y + el.h;
  for (const c of clips) {
    x0 = Math.max(x0, c.x);
    y0 = Math.max(y0, c.y);
    x1 = Math.min(x1, c.x + c.w);
    y1 = Math.min(y1, c.y + c.h);
  }
  return x1 - x0 > 0.5 && y1 - y0 > 0.5 ? { x: x0, y: y0, w: x1 - x0, h: y1 - y0 } : null;
}

/** 高光框：贴着目标的可见包围盒（描边画在框外侧，内沿与目标对齐）。 */
export const highlightRect = (target: Box): Box => ({ ...target });

// ---------- 自由缩放与平移（T-director2） ----------
export const ZOOM_MIN = 0.25;
export const ZOOM_MAX = 4;
/** 平移时至少留在画面里的内容宽度 / 高度（像素）。 */
export const PAN_KEEP = 80;
export type View = { k: number; tx: number; ty: number };

/** 以画面上的点 pt 为中心缩放 factor 倍（总缩放夹在 ZOOM_MIN–ZOOM_MAX）：pt 下面的内容点保持不动。 */
export function zoomAt(v: View, factor: number, pt: { x: number; y: number }): View {
  const k = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, v.k * factor));
  const r = k / v.k;
  return { k, tx: pt.x - (pt.x - v.tx) * r, ty: pt.y - (pt.y - v.ty) * r };
}

/** 平移夹紧：内容（bounds，内容坐标）在画面里至少露出 PAN_KEEP（内容很小时露出全部），不会被拖到看不见。 */
export function clampPan(v: View, W: number, H: number, bounds: Box): View {
  const ax = (t: number, view: number, c0: number, cs: number) => {
    const keep = Math.min(PAN_KEEP, v.k * cs);
    const lo = keep - v.k * (c0 + cs);
    const hi = view - keep - v.k * c0;
    return Math.min(hi, Math.max(lo, t));
  };
  return { k: v.k, tx: ax(v.tx, W, bounds.x, bounds.w), ty: ax(v.ty, H, bounds.y, bounds.h) };
}

/** 滚轮的缩放倍数：触控板捏合（ctrlKey）更灵敏；按行滚动的鼠标按 16px 一行换算。 */
export function wheelFactor(deltaY: number, opts: { ctrlKey?: boolean; deltaMode?: number } = {}): number {
  const dy = opts.deltaMode === 1 ? deltaY * 16 : opts.deltaMode === 2 ? deltaY * 400 : deltaY;
  const f = Math.exp(-dy * (opts.ctrlKey ? 0.01 : 0.0015));
  return Math.min(2, Math.max(0.5, f));
}
