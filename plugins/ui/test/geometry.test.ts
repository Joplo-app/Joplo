import { describe, expect, it } from 'vitest';
import { boardArrow } from '../src/board-arrow.ts';
import { axisOffset, fittedSize, regionBox, type ImageFit } from '../src/image-geometry.ts';
import { ratioParts } from '../src/ratio.ts';

describe('board arrows', () => {
  const box = { x: 100, y: 50, w: 100, h: 60 };
  it.each([1, -1])('leaves and returns to the outside edge, tangent head, outside label (bend %i)', bend => {
    const { path, label, labelShift } = boardArrow(box, box, true, bend);
    expect(path).toMatch(/^M.* C.* M.* L.* L/);
    const [sx, sy, ax, ay, bx, by, ex, ey, wx, wy, tx, ty, vx, vy] = path.match(/-?[\d.]+/g)!.map(Number);
    expect(sx).toBe(ex);
    expect(ey!).toBeGreaterThan(sy!);
    expect([tx, ty]).toEqual([ex, ey]);
    // The bisector of the two wings is parallel and opposite to the final tangent.
    const dx = (wx! + vx!) / 2 - ex!, dy = (wy! + vy!) / 2 - ey!;
    expect(dx * (ex! - bx!) + dy * (ey! - by!)).toBeLessThan(0);
    expect(Math.abs(dx * (ey! - by!) - dy * (ex! - bx!))).toBeLessThan(10);
    expect((ax! - sx!) * bend).toBeGreaterThan(0);
    expect(ay!).toBeLessThan(sy!);
    expect((label.x - sx!) * bend).toBeGreaterThan(60);
    expect(labelShift).toBe(bend > 0 ? '0%' : '-100%');
  });
  it('keeps different ids on the original quadratic route', () => {
    expect(boardArrow(box, { ...box, x: 400 }, false, 0).path).toMatch(/^M210.0,80.0 Q298.0,80.0 386.0,80.0/);
  });
});

describe('image-space projections', () => {
  it.each([
    ['contain', 200, 200, 0, 50, 120, 68, 44, 9],
    ['cover', 200, 200, -100, 0, 140, 36, 60, 18],
    ['fill', 200, 200, 0, 0, 120, 36, 44, 18],
    ['cover', 400, 100, 0, -50, 240, 0, 88, 4],
    ['contain', 400, 100, 100, 0, 220, 18, 44, 9],
  ] as const)('%s in %i x %i projects and clips the source rectangle', (fit: ImageFit, viewportWidth, viewportHeight, x, y, left, top, width, height) => {
    const size = fittedSize(viewportWidth, viewportHeight, 800, 400, fit);
    const box = regionBox({ ...size, viewportWidth, viewportHeight, x, y }, [0.60, 0.18, 0.22, 0.09])!;
    for (const [key, value] of Object.entries({ left, top, width, height })) expect(box[key as keyof typeof box]).toBeCloseTo(value);
  });
  it('resolves positions against negative crop space and positive letterbox space', () => {
    expect(axisOffset('25%', -200)).toBe('-50px');
    expect(axisOffset('center', 100)).toBe('50px');
    expect(axisOffset('bottom 20px', 100)).toBe('calc(100px - 20px)');
    expect(axisOffset('right 10%', -200)).toBe('calc(-200px - -20px)');
    expect(axisOffset('calc(100% - 1rem)', 100)).toBe('calc(100px - 1rem)');
  });
  it('omits a completely cropped region', () => {
    expect(regionBox({ width: 400, height: 200, viewportWidth: 200, viewportHeight: 200, x: -200, y: 0 }, [0, 0, 0.1, 1])).toBeNull();
  });
});

describe('ratio arithmetic', () => {
  it.each([0, 100])('preserves threshold at %i', threshold => {
    expect(ratioParts({ total: 100, left: 0, threshold })).toMatchObject({ percentages: [0, 0, 100], threshold });
  });
  it('keeps the denominator and accepts decimal counts that fill the bar', () => {
    expect(ratioParts({ total: 200, left: 35, right: 25 })).toMatchObject({ percentages: [17.5, 12.5, 70] });
    expect(ratioParts({ total: 0.3, left: 0.1, right: 0.2 })?.counts[2]).toBe(0);
  });
});
