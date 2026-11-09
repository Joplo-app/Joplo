import type { Mark } from '@joplo-app/core/runtime';
import { visibleRect, type Box } from './camera-math';

/** 屏幕矩形 → 内容坐标；仅取裁切祖先与当前舞台内可见的部分。 */
export function markBox(rect: Box, origin: { x: number; y: number }, scale: number, clips: Box[]): Box | null {
  if (!(scale > 0) || !Number.isFinite(scale)) return null;
  const visible = visibleRect(rect, clips);
  return visible ? { x: (visible.x - origin.x) / scale, y: (visible.y - origin.y) / scale, w: visible.w / scale, h: visible.h / scale } : null;
}
/** 标注图形与箭头尾注的位置，空目标不生成路径，避免在原点画假标注。 */
export function markGeometry(kind: Mark['kind'], box: Box | null, width: number, height: number): { d: string; note: { x: number; y: number; width: number } } | null {
  if (!box || box.w <= 0 || box.h <= 0 || ![box.x, box.y, box.w, box.h].every(Number.isFinite)) return null;
  const { x, y, w, h } = box;
  const pad = 6, X = x - pad, Y = y - pad, W = w + pad * 2, H = h + pad * 2;
  const note = { x: Math.max(8, Math.min(width - 168, x)), y: Math.max(8, Math.min(height - 54, y + h + 14)), width: Math.min(160, Math.max(40, width - 16)) };
  let d: string;
  if (kind === 'circle') d = `M${X},${y + h / 2} a${W / 2},${H / 2} 0 1,0 ${W},0 a${W / 2},${H / 2} 0 1,0 ${-W},0`;
  else if (kind === 'underline') d = `M${X},${y + h + 4} H${X + W}`;
  else if (kind === 'box') d = `M${X},${Y} H${X + W} V${Y + H} H${X} Z`;
  else {
    // 优先放在目标左侧，靠边时放到上下空白；箭头终点落在目标边缘。
    const left = x >= 180, above = !left && y >= 90;
    note.x = left ? Math.max(8, x - 174) : Math.max(8, Math.min(width - 168, x));
    note.y = left ? Math.max(8, Math.min(height - 54, y + h / 2 - 60)) : above ? y - 78 : Math.min(height - 54, y + h + 26);
    const sx = note.x + 80, sy = note.y + 30;
    const ex = left ? x - 4 : x + w / 2, ey = left ? y + h / 2 : above ? y - 4 : y + h + 4;
    const angle = Math.atan2(ey - sy, ex - sx), len = 11;
    d = `M${sx},${sy} Q${sx},${ey} ${ex},${ey} M${ex - len * Math.cos(angle - 0.5)},${ey - len * Math.sin(angle - 0.5)} L${ex},${ey} L${ex - len * Math.cos(angle + 0.5)},${ey - len * Math.sin(angle + 0.5)}`;
  }
  return { d, note };
}
