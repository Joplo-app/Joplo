/** 浮动反馈入口的位置按舞台可用空间保存比例；缩放窗口和切换全屏时不丢到屏幕外。 */
export type ReviewPoint = { x: number; y: number };
export type ReviewBounds = { width: number; height: number; controlWidth: number; controlHeight: number };
export const REVIEW_POSITION_KEY = 'joplo.review.position';
export const REVIEW_DRAG_THRESHOLD = 6;
export const DEFAULT_REVIEW_POSITION: ReviewPoint = { x: 1, y: 0.5 };
const unit = (n: number) => Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0;
function axis(size: number, control: number) {
  const available = Math.max(0, size - control);
  const margin = Math.min(12, available / 2);
  return { margin, travel: Math.max(0, available - 2 * margin) };
}
export function reviewPixelPosition(point: ReviewPoint, bounds: ReviewBounds): ReviewPoint {
  const x = axis(bounds.width, bounds.controlWidth), y = axis(bounds.height, bounds.controlHeight);
  return { x: x.margin + unit(point.x) * x.travel, y: y.margin + unit(point.y) * y.travel };
}
export function reviewRelativePosition(point: ReviewPoint, bounds: ReviewBounds): ReviewPoint {
  const x = axis(bounds.width, bounds.controlWidth), y = axis(bounds.height, bounds.controlHeight);
  return { x: x.travel ? unit((point.x - x.margin) / x.travel) : 0, y: y.travel ? unit((point.y - y.margin) / y.travel) : 0 };
}
export function readReviewPosition(): ReviewPoint {
  try {
    const p = JSON.parse(localStorage.getItem(REVIEW_POSITION_KEY) ?? 'null') as ReviewPoint | null;
    if (p && Number.isFinite(p.x) && Number.isFinite(p.y)) return { x: unit(p.x), y: unit(p.y) };
  } catch { /* 存储不可用时仍可拖动。 */ }
  return DEFAULT_REVIEW_POSITION;
}
export function saveReviewPosition(point: ReviewPoint): void {
  try { localStorage.setItem(REVIEW_POSITION_KEY, JSON.stringify(point)); } catch { /* 保留本页的位置。 */ }
}
