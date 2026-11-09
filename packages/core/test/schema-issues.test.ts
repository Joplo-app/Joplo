import { expect, test } from 'vitest';
import { schemaDiagnostics } from '../src/schema-issues.ts';
import { Project } from '../src/schema.ts';

const node = (when: unknown) => ({ id: 'n', type: 'ui:Alert', when, source: 'features/f/options/a.tsx:12:5' });
const ir = (when: unknown, scenes = ['@/a', 'f.a@/a', 'f.a@layer:main']) => ({ scenes: Object.fromEntries(scenes.map(id => [id, { id, root: { id: 'r', type: 'ui:Stack', children: [node(when)] } }])) });
const issues = (root: unknown, n: number) => Array.from({ length: n }, (_, i) => ({ path: ['scenes', Object.keys((root as { scenes: object }).scenes)[i]!, 'root', 'children', 0, 'when'], message: 'Invalid input' }));

test.each([[false, 'boolean (false)'], [0, 'number (0)'], ['code', 'string ("code")'], [null, 'null (null)']])('when=%j 合并成一条 INVALID_CONDITION，定位到元素，计 1 条', (value, shown) => {
  const root = ir(value);
  const out = schemaDiagnostics(root, issues(root, 3));
  expect(out).toHaveLength(1);
  expect(out[0]).toMatchObject({ severity: 'error', code: 'INVALID_CONDITION', source: 'schema', at: 'features/f/options/a.tsx:12:5', affects: ['@/a', 'f.a@/a', 'f.a@layer:main'] });
  expect(out[0]!.message).toContain(`<ui:Alert> when received a plain ${shown}`);
  expect(out[0]!.message).toMatch(/\(affects 3 views\)$/);
});
test('只出现一次时不加 affects；对象形状错误仍是 INVALID_SCHEMA 但定位到元素', () => {
  const root = ir({ truthy: 1 }, ['@/a']);
  const [d] = schemaDiagnostics(root, [{ path: ['scenes', '@/a', 'root', 'children', 0, 'when'], message: 'Invalid input' }]);
  expect(d).toEqual({ severity: 'error', code: 'INVALID_SCHEMA', source: 'schema', at: 'features/f/options/a.tsx:12:5', message: '<ui:Alert> when: Invalid input' });
});
test('没有源位置时沿用完整路径说明且不合并不同路径；rel 转相对路径；limit 截断', () => {
  const out = schemaDiagnostics({ options: { a: {}, b: {} } }, [{ path: ['options', 'a', 'name'], message: 'Required' }, { path: ['options', 'b', 'name'], message: 'Required' }]);
  expect(out.map(d => [d.code, d.message, d.at])).toEqual([['INVALID_SCHEMA', 'options.a.name: Required', undefined], ['INVALID_SCHEMA', 'options.b.name: Required', undefined]]);
  expect(schemaDiagnostics({ x: { source: '/p/a.ts:1:1' } }, [{ path: ['x', 'y'], message: 'Bad' }], { rel: s => s.replace('/p/', '') })[0]!.at).toBe('a.ts:1:1');
  expect(schemaDiagnostics({}, [{ path: [], message: 'A' }, { path: ['q'], message: 'B' }], { limit: 1 })).toHaveLength(1);
});
test('与真实 schema 对接：zod 的 when 问题路径能被识别', () => {
  const project = { schemaVersion: 2, name: 'p', mode: 'dev', scenes: { s: { id: 's', root: { id: 'r', type: 'ui:Alert', when: true, source: 'routes/page.tsx:3:4' } } } };
  const parsed = Project.safeParse(project);
  expect(parsed.success).toBe(false);
  const out = schemaDiagnostics(project, parsed.error!.issues).filter(d => d.code === 'INVALID_CONDITION');
  expect(out).toHaveLength(1);
  expect(out[0]!.at).toBe('routes/page.tsx:3:4');
});
