/**
 * 浮层定位（纯函数，D55 不变量 8）：浮层用 portal 渲染、position: fixed，坐标只由锚点和视口决定，
 * 因此不会被任何父级的 overflow 裁掉。放不下时翻到另一侧；两侧都放不下时选空间大的一侧，最后夹回视口。
 */
export type Placement = 'bottom-start' | 'bottom-end' | 'bottom-center' | 'top-start' | 'top-end' | 'top-center';
export type AnchorRect = { left: number; top: number; right: number; bottom: number };

/** 浮层与锚点的间距、与视口边缘的最小距离。 */
export const POP_GAP = 6;
export const POP_MARGIN = 8;

export function placePopover(anchor: AnchorRect, size: { width: number; height: number }, viewport: { width: number; height: number }, placement: Placement, gap = POP_GAP, margin = POP_MARGIN): { x: number; y: number; side: 'top' | 'bottom' } {
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
  // 视口比浮层还小时，保证不出现负坐标
  return { x: Math.max(0, Math.round(x)), y: Math.max(0, Math.round(y)), side };
}

/** 浮层挂载点：全屏时必须挂在全屏元素里（Fullscreen API 只显示它的子树），否则挂在 body。 */
export function portalHostOf(doc: Pick<Document, 'body' | 'fullscreenElement'>): Element {
  return doc.fullscreenElement ?? doc.body;
}
