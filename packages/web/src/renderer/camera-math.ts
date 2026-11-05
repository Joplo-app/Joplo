/**
 * 镜头的纯计算（D43）：给定画面尺寸与焦点包围盒（内容坐标），算出平移缩放与遮罩洞。由 camera.tsx 使用，单测覆盖。
 * - 聚焦 / 层级：焦点放进画面并四周留 CAMERA_PAD；最多推近 MAX_ZOOM 倍，但对准架构图节点时，
 *   至少推近到节点主标签在屏幕上 ≥ MIN_NODE_PX（nodeScales = 每个节点“内容像素 → 屏幕像素”的比例，含架构图缩放与舞台外层缩放）。
 * - 全景：只缩小不放大，内容比画面大时整体缩进来、水平居中、垂直居中。
 */
export type Box = { x: number; y: number; w: number; h: number };
export type CameraMode = 'focus' | 'layer' | 'overview';
export type CameraFit = { k: number; tx: number; ty: number; hole: Box | null };

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

export function fitCamera(input: { W: number; H: number; mode: CameraMode; bbox: Box; nodeScales?: number[] }): CameraFit {
  const { W, H, mode, bbox } = input;
  if (mode === 'overview') {
    const k = Math.min(1, W / bbox.w, H / bbox.h);
    if (k === 1) return { k: 1, tx: 0, ty: 0, hole: null };
    return { k, tx: W / 2 - k * (bbox.x + bbox.w / 2), ty: H / 2 - k * (bbox.y + bbox.h / 2), hole: null };
  }
  const fit = Math.min((W - 2 * CAMERA_PAD) / bbox.w, (H - 2 * CAMERA_PAD) / bbox.h);
  let cap = MAX_ZOOM;
  for (const s of input.nodeScales ?? []) if (s > 0) cap = Math.max(cap, MIN_NODE_PX / (NODE_FONT_PX * s));
  const k = Math.max(0.05, Math.min(fit, cap));
  const tx = W / 2 - k * (bbox.x + bbox.w / 2);
  const ty = H / 2 - k * (bbox.y + bbox.h / 2);
  const m = CAMERA_PAD * 0.5 / k;
  return { k, tx, ty, hole: { x: bbox.x - m, y: bbox.y - m, w: bbox.w + 2 * m, h: bbox.h + 2 * m } };
}

/** 内容坐标的盒子经镜头变换后在画面里的位置。 */
export const project = (b: Box, f: Pick<CameraFit, 'k' | 'tx' | 'ty'>): Box => ({ x: f.tx + f.k * b.x, y: f.ty + f.k * b.y, w: f.k * b.w, h: f.k * b.h });
