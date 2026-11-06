/** 嵌入模式的场景选择：默认场景、scenario 参数容错（不存在 / 空 / 非字符串 → 默认），与 joplo share 预览图共用。 */
import { expect, it } from 'vitest';
import { embedScenarioIds, embedStartScenario } from '../src/index.ts';

const project = {
  features: {
    b: { id: 'b', optionIds: ['b.a', 'b.b'], pick: 'b.b' },
    a: { id: 'a', optionIds: ['a.a'], pick: null },
    empty: { id: 'empty', optionIds: [], pick: null },
  },
  options: { 'b.a': { id: 'b.a' }, 'b.b': { id: 'b.b' }, 'a.a': { id: 'a.a' } },
  scenarios: {
    'b.a.main': { id: 'b.a.main', optionId: 'b.a' },
    'b.b.main': { id: 'b.b.main', optionId: 'b.b' },
    'a.a.main': { id: 'a.a.main', optionId: 'a.a' },
    'b.b.fail': { id: 'b.b.fail', optionId: 'b.b' },
  },
};

it('lists picked-option scenarios in feature order, falling back to the first option', () => {
  expect(embedScenarioIds(project)).toEqual(['b.b.main', 'b.b.fail', 'a.a.main']);
});

it('starts from the requested scenario only when it is playable', () => {
  expect(embedStartScenario(project)).toBe('b.b.main');
  expect(embedStartScenario(project, 'a.a.main')).toBe('a.a.main');
  for (const bad of [null, undefined, '', 'missing', 'b.a.main', 42, ['a.a.main'], 'x'.repeat(10_000)]) expect(embedStartScenario(project, bad)).toBe('b.b.main');
});

it('returns null for a project without scenarios', () => {
  expect(embedStartScenario({ features: {}, options: {}, scenarios: {} })).toBeNull();
  expect(embedScenarioIds({ features: { f: { id: 'f', optionIds: ['gone'], pick: 'gone' } }, options: {}, scenarios: {} })).toEqual([]);
});
