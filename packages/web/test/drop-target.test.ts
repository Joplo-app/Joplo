/** D92 U1：拖动松手的落点判定（屏幕坐标）。 */
import { expect, it } from 'vitest';
import { dropTarget } from '../src/runtime/input';
const box = (left: number, top: number, w: number, h: number) => ({ left, top, right: left + w, bottom: top + h });
const targets = [{ id: 'a', r: box(100, 0, 150, 28) }, { id: 'b', r: box(400, 0, 150, 28) }];
it('prefers the target under the pointer', () => {
  expect(dropTarget({ x: 120, y: 10 }, box(380, 0, 90, 30), targets, 48)).toBe('a');
});
it('then the target the dragged element overlaps most', () => {
  expect(dropTarget({ x: 600, y: 60 }, box(390, 20, 120, 40), targets, 0)).toBe('b');
});
it('then the nearest target within the radius (a scrubber row below its labels)', () => {
  expect(dropTarget({ x: 470, y: 60 }, box(420, 45, 100, 36), targets, 48)).toBe('b');
  expect(dropTarget({ x: 470, y: 120 }, box(420, 105, 100, 36), targets, 48)).toBeNull();
});
it('returns null when nothing is close, so the source snaps back', () => {
  expect(dropTarget({ x: 900, y: 500 }, null, targets, 48)).toBeNull();
  expect(dropTarget({ x: 120, y: 10 }, null, [], 48)).toBeNull();
});
