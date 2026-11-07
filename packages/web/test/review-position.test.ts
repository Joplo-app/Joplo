import { afterEach, expect, it, vi } from 'vitest';
import { DEFAULT_REVIEW_POSITION, readReviewPosition, REVIEW_POSITION_KEY, reviewPixelPosition, reviewRelativePosition, saveReviewPosition } from '../src/board/review-position';

afterEach(() => vi.unstubAllGlobals());
const bounds = { width: 1000, height: 600, controlWidth: 36, controlHeight: 58 };
it('starts at the right, allows movement in both axes, and clamps every edge', () => {
  expect(reviewPixelPosition(DEFAULT_REVIEW_POSITION, bounds)).toEqual({ x: 952, y: 271 });
  const moved = reviewPixelPosition(reviewRelativePosition({ x: 250, y: 170 }, bounds), bounds);
  expect(moved.x).toBeCloseTo(250); expect(moved.y).toBeCloseTo(170);
  expect(reviewPixelPosition(reviewRelativePosition({ x: -500, y: -100 }, bounds), bounds)).toEqual({ x: 12, y: 12 });
  expect(reviewPixelPosition(reviewRelativePosition({ x: 5000, y: 9000 }, bounds), bounds)).toEqual({ x: 952, y: 530 });
});
it('keeps the chosen relative position visible on smaller windows and fullscreen layouts', () => {
  const position = reviewRelativePosition({ x: 480, y: 200 }, bounds);
  for (const size of [{ width: 320, height: 240 }, { width: 1920, height: 1080 }]) {
    const resized = { ...bounds, ...size }, pixel = reviewPixelPosition(position, resized);
    expect(pixel.x).toBeGreaterThanOrEqual(12); expect(pixel.x + 36).toBeLessThanOrEqual(size.width - 12);
    expect(pixel.y).toBeGreaterThanOrEqual(12); expect(pixel.y + 58).toBeLessThanOrEqual(size.height - 12);
    const normalized = reviewRelativePosition(pixel, resized);
    expect(normalized.x).toBeCloseTo(position.x); expect(normalized.y).toBeCloseTo(position.y);
  }
});
it('never produces negative or invalid coordinates when the stage is temporarily too small', () => {
  const tiny = { ...bounds, width: 20, height: 20 };
  expect(reviewPixelPosition({ x: 1, y: 1 }, tiny)).toEqual({ x: 0, y: 0 });
  expect(reviewRelativePosition({ x: 100, y: 100 }, tiny)).toEqual({ x: 0, y: 0 });
});
it('remembers the chosen position across remounts without depending on project or scenario', () => {
  const values = new Map<string, string>();
  vi.stubGlobal('localStorage', { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value) });
  expect(readReviewPosition()).toEqual(DEFAULT_REVIEW_POSITION);
  saveReviewPosition({ x: 0.3, y: 0.8 });
  expect(readReviewPosition()).toEqual({ x: 0.3, y: 0.8 });
  expect(values.has(REVIEW_POSITION_KEY)).toBe(true);
});
it.each(['{', '{"x":"left","y":0}', '{"x":null,"y":0}'])('ignores malformed stored position %s', value => {
  vi.stubGlobal('localStorage', { getItem: () => value });
  expect(readReviewPosition()).toEqual(DEFAULT_REVIEW_POSITION);
});
it('works with blocked storage and clamps legacy offscreen values', () => {
  vi.stubGlobal('localStorage', { getItem: () => '{"x":5,"y":-2}', setItem: () => { throw new Error('Storage blocked'); } });
  expect(readReviewPosition()).toEqual({ x: 1, y: 0 });
  expect(() => saveReviewPosition({ x: 0, y: 1 })).not.toThrow();
});
