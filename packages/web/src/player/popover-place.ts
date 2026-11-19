/**
 * 浮层定位（纯函数，D55 不变量 8）：委托给 @tokenroll/juice/primitives 的 placeFloating，
 * 浮层用 portal 渲染、position: fixed，坐标只由锚点和视口决定，不会被父级 overflow 裁掉。
 * 放不下时翻到另一侧；两侧都放不下时选空间大的一侧，最后夹回视口。
 */
import { placeFloating, type FloatingPlacement } from '@tokenroll/juice/primitives';

export type Placement = 'bottom-start' | 'bottom-end' | 'bottom-center' | 'top-start' | 'top-end' | 'top-center' | 'right-start';
export type AnchorRect = { left: number; top: number; right: number; bottom: number };

/** 浮层与锚点的间距、与视口边缘的最小距离。 */
export const POP_GAP = 6;
export const POP_MARGIN = 8;

function toJuicePlacement(placement: Placement): FloatingPlacement {
  if (placement === 'bottom-center') return 'bottom';
  if (placement === 'top-center') return 'top';
  return placement;
}

export function placePopover(anchor: AnchorRect, size: { width: number; height: number }, viewport: { width: number; height: number }, placement: Placement, gap = POP_GAP, margin = POP_MARGIN): { x: number; y: number; side: 'top' | 'bottom' | 'left' | 'right' } {
  const fullAnchor = {
    left: anchor.left,
    top: anchor.top,
    right: anchor.right,
    bottom: anchor.bottom,
    width: Math.max(0, anchor.right - anchor.left),
    height: Math.max(0, anchor.bottom - anchor.top),
  };
  if (margin === POP_MARGIN) {
    const { x, y, side } = placeFloating(fullAnchor, size, viewport, toJuicePlacement(placement), gap);
    const clampedX = Math.max(margin, Math.min(x, viewport.width - margin - size.width));
    const clampedY = Math.max(margin, Math.min(y, viewport.height - margin - size.height));
    return { x: Math.max(0, Math.round(clampedX)), y: Math.max(0, Math.round(clampedY)), side };
  }
  if (placement === 'right-start') {
    const right = viewport.width - anchor.right - gap - margin;
    const left = anchor.left - gap - margin;
    const side = size.width > right && left > right ? 'left' : 'right';
    const x = side === 'right' ? anchor.right + gap : anchor.left - gap - size.width;
    const y = Math.max(margin, Math.min(anchor.top, viewport.height - margin - size.height));
    return { x: Math.max(0, Math.round(x)), y: Math.max(0, Math.round(y)), side };
  }
  const [want, align] = placement.split('-') as ['top' | 'bottom', 'start' | 'end' | 'center'];
  const below = viewport.height - anchor.bottom - gap - margin;
  const above = anchor.top - gap - margin;
  let side = want;
  if (want === 'bottom' && size.height > below && above > below) side = 'top';
  if (want === 'top' && size.height > above && below > above) side = 'bottom';
  let y = side === 'bottom' ? anchor.bottom + gap : anchor.top - gap - size.height;
  let x = align === 'start' ? anchor.left : align === 'end' ? anchor.right - size.width : (anchor.left + anchor.right) / 2 - size.width / 2;
  x = Math.max(margin, Math.min(x, viewport.width - margin - size.width));
  y = Math.max(margin, Math.min(y, viewport.height - margin - size.height));
  return { x: Math.max(0, Math.round(x)), y: Math.max(0, Math.round(y)), side };
}

/** 浮层挂载点：全屏时必须挂在全屏元素里（Fullscreen API 只显示它的子树），否则挂在 body。 */
export function portalHostOf(doc: Pick<Document, 'body' | 'fullscreenElement'>): Element {
  return doc.fullscreenElement ?? doc.body;
}
