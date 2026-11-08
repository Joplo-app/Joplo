/**
 * 舞台里所有“元素在哪”的测量都走这里（镜头、聚焦提示、手绘标注、光标、弹出菜单）。
 * 手机锁着竖屏点「横屏」时（mobile_watch），播放区被 CSS 顺时针转了 90°（容器带 data-jrotated）。
 * getBoundingClientRect 返回的是转过之后的屏幕坐标，宽高对调、方向也变了，直接拿来算镜头会缩错、跑偏；
 * 这里把它换回旋转前的布局坐标。不在旋转容器里时与 getBoundingClientRect 完全相同。
 */
export const ROTATED_ATTR = 'data-jrotated';

type Box = { left: number; top: number; width: number; height: number; right: number; bottom: number };
export type LayoutRect = Box & { x: number; y: number };

const rect = (x: number, y: number, width: number, height: number): LayoutRect => ({ x, y, left: x, top: y, width, height, right: x + width, bottom: y + height });

/**
 * 顺时针转 90° 的容器（transform-origin 左上角，转后向右平移一个容器高度）：局部点 (x, y) 在屏幕上是 (host.right − y, host.top + x)。
 * 反过来，屏幕上的矩形在旋转前的坐标里：x = r.top − host.top，y = host.right − r.right，宽高对调。
 */
export function unrotate(r: Box, host: Box): LayoutRect {
  return rect(r.top - host.top, host.right - r.right, r.height, r.width);
}

export function rectOf(el: Element): LayoutRect {
  const r = el.getBoundingClientRect();
  const host = el.closest?.(`[${ROTATED_ATTR}]`);
  if (!host) return rect(r.left, r.top, r.width, r.height);
  return unrotate(r, host.getBoundingClientRect());
}
