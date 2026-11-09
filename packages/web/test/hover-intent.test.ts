import { afterEach, expect, it, vi } from 'vitest';
import { HoverIntent } from '../src/runtime/input';

afterEach(() => vi.useRealTimers());

it('recognizes a canvas hit with the author dwell time and fires only once until leaving', () => {
  vi.useFakeTimers();
  const dispatch = vi.fn();
  const action = { type: 'hover' as const, target: 'fruit', ms: 600 };
  const hover = new HoverIntent(id => id === 'fruit' ? action : undefined, () => false, dispatch);
  hover.move('fruit'); vi.advanceTimersByTime(599);
  expect(dispatch).not.toHaveBeenCalled();
  hover.move('fruit'); vi.advanceTimersByTime(1);
  expect(dispatch).toHaveBeenCalledExactlyOnceWith(action);
  hover.move('fruit'); vi.advanceTimersByTime(1000);
  expect(dispatch).toHaveBeenCalledTimes(1);
  hover.move(null); hover.move('fruit'); vi.advanceTimersByTime(600);
  expect(dispatch).toHaveBeenCalledTimes(2);
});

it('cancels on leave, reset, resuming playback, or a vanished target', () => {
  vi.useFakeTimers();
  let playing = false, visible = true;
  const dispatch = vi.fn();
  const action = { type: 'hover' as const, target: 'fruit', ms: 400 };
  const hover = new HoverIntent(() => visible ? action : undefined, () => playing, dispatch);
  hover.move('fruit'); vi.advanceTimersByTime(200); hover.move(null); vi.advanceTimersByTime(400);
  hover.move('fruit'); hover.reset(); vi.advanceTimersByTime(400);
  hover.move('fruit'); playing = true; vi.advanceTimersByTime(400);
  hover.move(null); hover.move('fruit'); vi.advanceTimersByTime(400);
  playing = false; hover.move('fruit'); visible = false; vi.advanceTimersByTime(400);
  expect(dispatch).not.toHaveBeenCalled();
});
