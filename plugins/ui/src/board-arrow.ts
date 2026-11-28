export type BoardRect = { x: number; y: number; w: number; h: number };
type Point = { x: number; y: number };

/** 从 r 的中心朝 (tx, ty) 出发，落在外扩 pad 的边框上的点。 */
function edgePoint(r: BoardRect, tx: number, ty: number, pad: number) {
  const cx = r.x + r.w / 2, cy = r.y + r.h / 2;
  const dx = tx - cx, dy = ty - cy;
  if (!dx && !dy) return { x: cx, y: cy };
  const t = Math.min(dx ? (r.w / 2 + pad) / Math.abs(dx) : Infinity, dy ? (r.h / 2 + pad) / Math.abs(dy) : Infinity);
  return { x: cx + dx * t, y: cy + dy * t };
}

const point = ({ x, y }: Point) => `${x.toFixed(1)},${y.toFixed(1)}`;

function arrowHead(tip: Point, control: Point) {
  const angle = Math.atan2(tip.y - control.y, tip.x - control.x);
  const wing = (a: number) => point({ x: tip.x - 16 * Math.cos(a), y: tip.y - 16 * Math.sin(a) });
  return `M${wing(angle - 0.45)} L${point(tip)} L${wing(angle + 0.45)}`;
}

export function boardArrow(a: BoardRect, b: BoardRect, self: boolean, bendProp: unknown) {
  const bend = Math.max(-1, Math.min(1, typeof bendProp === 'number' && Number.isFinite(bendProp) ? bendProp : 0.25));
  if (self) {
    const side = bend < 0 ? -1 : 1;
    const edge = side > 0 ? a.x + a.w : a.x;
    const center = a.y + a.h / 2;
    const spread = Math.min(36, a.h / 4);
    const reach = 60 + 40 * Math.abs(bend);
    const start = { x: edge + 8 * side, y: center - spread };
    const end = { x: start.x, y: center + spread };
    const upper = { x: start.x + reach * side, y: start.y - 24 };
    const lower = { x: upper.x, y: end.y + 24 };
    return {
      path: `M${point(start)} C${point(upper)} ${point(lower)} ${point(end)} ${arrowHead(end, lower)}`,
      // A cubic reaches 3/4 of the control-point offset at t=1/2. Put the entire label beyond it.
      label: { x: start.x + (0.75 * reach + 4) * side, y: center },
      labelShift: side > 0 ? '0%' : '-100%',
    };
  }

  const start = edgePoint(a, b.x + b.w / 2, b.y + b.h / 2, 10);
  const end = edgePoint(b, a.x + a.w / 2, a.y + a.h / 2, 14);
  const control = {
    x: (start.x + end.x) / 2 - (end.y - start.y) * bend * 0.3,
    y: (start.y + end.y) / 2 + (end.x - start.x) * bend * 0.3,
  };
  return {
    path: `M${point(start)} Q${point(control)} ${point(end)} ${arrowHead(end, control)}`,
    label: { x: (start.x + 2 * control.x + end.x) / 4, y: (start.y + 2 * control.y + end.y) / 4 },
    labelShift: '-50%',
  };
}
