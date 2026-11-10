import { expect, it } from 'vitest';
import { $, isBind, bindPath, isNode } from '../src/index.ts';
import { jsx } from '../src/jsx-runtime.ts';
it('exports binding and node guards from the public entry', () => {
  expect(isBind($.ui.title)).toBe(true);
  expect(bindPath($.ui.title)).toBe('ui.title');
  expect(isBind({ title: 'plain' })).toBe(false);
  expect(isNode(jsx('div', { children: 'hello' }))).toBe(true);
  expect(isNode(null)).toBe(false);
});
