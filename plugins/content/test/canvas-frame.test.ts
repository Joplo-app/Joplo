/** 画布镜头取景（canvasFrame）：目标范围等比放进设计视口、居中，放大不超过 zoom。 */
import { describe, expect, it } from 'vitest';
import { canvasFrame } from '../src/runtime.tsx';

describe('canvasFrame', () => {
  const view = { w: 1280, h: 800 };
  it('fits the whole world without zoom cap and centers it', () => {
    const f = canvasFrame({ x: 0, y: 0, w: 2560, h: 1600 }, view, Infinity);
    expect(f).toEqual({ k: 0.5, tx: 0, ty: 0 });
  });
  it('centers a wide region vertically', () => {
    const f = canvasFrame({ x: 100, y: 100, w: 1280, h: 400 }, view);
    expect(f.k).toBe(1);
    expect(f.tx).toBe(-100);
    expect(f.ty).toBe((800 - 400) / 2 - 100);
  });
  it('caps zoom on small targets', () => {
    expect(canvasFrame({ x: 0, y: 0, w: 10, h: 10 }, view, 3).k).toBe(3);
  });
});


it('waypoint interpolation is clamped, deterministic and uses destination easing', async () => {
 const { sequenceFrameAt } = await import('../src/runtime.tsx');
 const points = [{ atMs: 0, frame: { k: 1, tx: 0, ty: 0 } }, { atMs: 2500, frame: { k: 2, tx: 100, ty: 50 }, ease: 'linear' }, { atMs: 6500, frame: { k: 3, tx: 200, ty: 100 }, ease: 'easeOut' }];
 expect(sequenceFrameAt(points, -1)).toEqual(points[0]!.frame);
 expect(sequenceFrameAt(points, 1250)).toEqual({ k: 1.5, tx: 50, ty: 25 });
 expect(sequenceFrameAt(points, 4500)).toEqual({ k: 2.875, tx: 187.5, ty: 93.75 });
 expect(sequenceFrameAt(points, Infinity)).toEqual(points[2]!.frame);
});
