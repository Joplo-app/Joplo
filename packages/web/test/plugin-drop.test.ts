import { expect, it } from 'vitest';
import { resolveDropTarget } from '../src/runtime/input';

it('recognizes a declared DOM destination from a plugin drag in stage coordinates', () => {
  const destinations = ['ground', 'another'];
  const bounds = (id: string) => id === 'ground' ? { x: 300, y: 400, width: 200, height: 40 } : null;
  expect(resolveDropTarget({ x: 350, y: 420 }, destinations, bounds)).toBe('ground');
  expect(resolveDropTarget({ x: 350, y: 470 }, destinations, bounds)).toEqual({ x: 350, y: 470 });
  expect(resolveDropTarget({ x: 350, y: 420 }, ['another'], bounds)).toEqual({ x: 350, y: 420 });
});

it('does not turn hidden or zero-sized anchors into drop zones', () => {
  expect(resolveDropTarget({ x: 0, y: 0 }, ['hidden'], () => ({ x: 0, y: 0, width: 0, height: 0 }))).toEqual({ x: 0, y: 0 });
});
