import { expect, it } from 'vitest';
import { visibleLabel } from '../src/label.ts';

it('allows a cinematic interactive model to hide its label without dropping its name', () => {
  const props = { label: 'A fruit to rotate', showLabel: false };
  expect(visibleLabel(props, true)).toBeNull();
  expect(props.label).toBe('A fruit to rotate');
});

it('keeps default interactive labels and explicitly requested decorative labels', () => {
  expect(visibleLabel({ label: 'Lamp' }, true)).toBe('Lamp');
  expect(visibleLabel({ label: 'Wall' }, false)).toBeNull();
  expect(visibleLabel({ label: 'Wall', showLabel: true }, false)).toBe('Wall');
  expect(visibleLabel({ label: '', showLabel: true }, true)).toBeNull();
});
