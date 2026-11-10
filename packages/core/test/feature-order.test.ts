import { fixtureConfig as config } from '../../../scripts/test/fixtures.ts';
import { describe, expect, it } from 'vitest';
import { feature, flow, work, page } from '@joplo-app/kit';
import { jsx } from '@joplo-app/kit/jsx-runtime';
import { compile, Project, type AuthoringProject } from '../src/index.ts';

const at = (file: string) => ({ file: `/p/${file}`, source: `/p/${file}:3:16` });
const expected = ['z', 'item9', 'item10', 'last', 'item1', 'item2'];
function source(): AuthoringProject {
  const features = Object.fromEntries(([
    ['item10', 1], ['item2', undefined], ['last', 5], ['z', -2], ['item9', 1], ['item1', undefined],
  ] as const).map(([id, order]) => {
    const fid = String(id);
    return [fid, {
      def: { ...feature({ name: fid, goal: 'g', cases: {}, pick: 'a', ...(order === undefined ? {} : { order }) }), ...at(`features/${fid}/feature.ts`) },
      works: { a: { ...work({ title: 'A', summary: 'i', scenarios: { s: flow('S', { start: '/' }).system('Ready') } }), ...at(`features/${fid}/works/a.tsx`) } },
    }];
  }));
  return {
    root: '/p', config: { ...config({ name: 'Order' }), ...at('joplo.config.ts') }, layouts: {},
    routes: { '/': { ...page({ title: 'Home' }, jsx('ui:Text', { children: 'Home' })), ...at('routes/page.tsx') } }, features,
  };
}

describe('编译器决定唯一的功能顺序', () => {
  it.each(['dev', 'publish'] as const)('%s：显式 order 在前，同值及未声明按文件夹名自然排序', (mode) => {
    const r = compile(source(), mode);
    expect(r.diagnostics.filter(d => d.severity === 'error')).toEqual([]);
    expect(r.project).toMatchObject({ entryIds: expected });
    expect(Object.keys(r.project!.features)).toEqual(expected);
    expect(Object.values(r.project!.works).map(o => o.featureId)).toEqual(expected);
    expect(Object.values(r.project!.scenarios).map(s => s.workId.split('.')[0])).toEqual(expected);
  });

  it('发布时移除未选功能后，保留相对顺序', () => {
    const src = source();
    src.features.item9!.def.pick = null;
    expect(compile(src, 'publish').project).toMatchObject({ entryIds: expected.filter(id => id !== 'item9') });
  });

  it.each([NaN, Infinity, -Infinity, '1', null])('非法 order %s 诊断包含 feature.ts 的文件和行号', (order) => {
    const src = source();
    Object.assign(src.features.z!.def, { order });
    const r = compile(src, 'dev');
    expect(r.project).toBeNull();
    expect(r.diagnostics).toContainEqual(expect.objectContaining({ severity: 'error', code: 'FEATURE_ORDER_INVALID', at: 'features/z/feature.ts:3:16' }));
  });

  it('schema 校验顺序列表完整、无重复且引用现有功能', () => {
    const p = compile(source(), 'dev').project!;
    expect(Project.safeParse({ ...p, entryIds: expected }).success).toBe(true);
    for (const ids of [expected.slice(1), [...expected, 'absent'], [...expected, 'z']]) {
      expect(Project.safeParse({ ...p, entryIds: ids }).success).toBe(false);
    }
  });
});
