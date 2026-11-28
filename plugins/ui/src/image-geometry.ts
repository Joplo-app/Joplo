export type RegionRect = readonly [number, number, number, number];
export type ImageFit = 'cover' | 'contain' | 'fill';

export function isRegionRect(v: unknown): v is RegionRect {
  if (!Array.isArray(v) || v.length !== 4 || !v.every(n => typeof n === 'number' && Number.isFinite(n))) return false;
  const [x, y, w, h] = v;
  return x >= 0 && y >= 0 && w > 0 && h > 0 && x + w <= 1 && y + h <= 1;
}

export function fittedSize(width: number, height: number, naturalWidth: number, naturalHeight: number, fit: ImageFit) {
  if (fit === 'fill') return { width, height };
  const scale = (fit === 'cover' ? Math.max : Math.min)(width / naturalWidth, height / naturalHeight);
  return { width: naturalWidth * scale, height: naturalHeight * scale };
}

export type ImagePlane = {
  x: number; y: number; width: number; height: number; viewportWidth: number; viewportHeight: number;
};

/** Return only the visible portion. A fully cropped target has no focusable anchor. */
export function regionBox(p: ImagePlane, [x, y, w, h]: RegionRect) {
  const left = Math.max(0, p.x + x * p.width);
  const top = Math.max(0, p.y + y * p.height);
  const right = Math.min(p.viewportWidth, p.x + (x + w) * p.width);
  const bottom = Math.min(p.viewportHeight, p.y + (y + h) * p.height);
  return right > left && bottom > top ? { left, top, width: right - left, height: bottom - top } : null;
}

/** The browser resolves CSS lengths and math. Percentages in object-position refer to the
 * unused space, which can be negative for cover. The CSSOM splits the two axes for us. */
export function axisOffset(axis: string, free: number) {
  const [edge, ...offset] = axis.split(' ');
  if (edge === 'center') return `${free / 2}px`;
  const fromEnd = edge === 'right' || edge === 'bottom';
  const fromEdge = fromEnd || edge === 'left' || edge === 'top';
  const length = (fromEdge ? offset.join(' ') || '0px' : axis)
    .replace(/([+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?)%/gi, (_, n: string) => `${Number(n) / 100 * free}px`);
  return fromEnd ? `calc(${free}px - ${length})` : length;
}
