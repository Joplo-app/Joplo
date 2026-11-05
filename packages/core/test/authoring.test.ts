import { afterEach, expect, test, vi } from 'vitest';
import * as fs from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { guide } from '../src/guide.ts';
import { get } from '../src/scope.ts';
import { applyPatch, initProject, readProject, restore } from '../src/store.ts';
import { findNode } from '../src/player.ts';
import { Patch, OperationSchemas } from '../src/ops.ts';
vi.mock('node:fs/promises', async (original) => {
  const actual = await original<typeof fs>();
  return { ...actual, rename: vi.fn(actual.rename) };
});
const realFs = await vi.importActual<typeof fs>('node:fs/promises');
const dirs: string[] = [];
afterEach(async () => {
  vi.mocked(fs.rename).mockImplementation(realFs.rename);
  await Promise.all(
    dirs.splice(0).map((d) => fs.rm(d, { recursive: true, force: true })),
  );
});
async function fixture(empty = false) {
  const d = await fs.mkdtemp(join(tmpdir(), 'joplo-author-'));
  dirs.push(d);
  if (!empty)
    await fs.cp(
      'examples/invite/project.joplo.json',
      join(d, 'project.joplo.json'),
    );
  return d;
}
const node = {
  op: 'updateNode',
  sceneId: 'scene_a_members',
  nodeId: 'btn_invite',
  patch: { props: { label: '新标签', variant: null }, note: '只改一处' },
};
const patch = (operations: unknown[]) => ({
  expectRevision: 1,
  idempotencyKey: 'author',
  summary: '测试',
  operations,
});
test('guide 中所有操作示例都能在独立 init 项目运行', async () => {
  const g = guide('json') as Exclude<
    ReturnType<typeof guide>,
    string | { json: unknown; text: string }
  >;
  expect(Object.keys(g.examples)).toEqual(Object.keys(OperationSchemas));
  for (const example of Object.values(g.examples)) {
    const d = await fixture(true);
    await initProject(d, { name: '工作说明测试' });
    const r = await applyPatch(d, example);
    expect(r.revision).toBe(1);
  }
  expect(guide('text')).toContain('不能创建或修改 decisions');
});
test('schema、历史 scope、selection、comments 与 pendingQuestions', async () => {
  const d = await fixture();
  const schema = await get(d, { scope: 'schema' });
  expect(
    (schema.data?.content as any).patch.properties.operations.minItems,
  ).toBe(1);
  expect((schema.data?.content as any).components).toHaveLength(32);
  await fs.mkdir(join(d, '.joplo'));
  await fs.writeFile(
    join(d, '.joplo/selection.json'),
    JSON.stringify({ sceneId: 'scene_a_members', nodeId: 'btn_invite' }),
  );
  const selected = await get(d, { scope: 'selection' });
  const content = selected.data!.content as any;
  expect(content.node.id).toBe('btn_invite');
  expect(content.rules.some((r: any) => r.id === 'rule_admin_only')).toBe(true);
  expect(content.steps.some((s: any) => s.id === 'a_s1_open')).toBe(true);
  expect(selected.data!.pendingQuestions).toEqual({
    issues: 1,
    aiAssumptions: 2,
  });
  await applyPatch(d, patch([node]));
  const old = await get(d, {
    scope: 'scene',
    id: 'scene_a_members',
    revision: 'rev_1',
  });
  expect(old.revision).toBe(1);
  expect(
    findNode(old.data!.content as any, 'btn_invite')!.node.props!.label,
  ).toBe('邀请成员');
  expect(
    (await get(d, { scope: 'comments', status: 'open' })).data!.content,
  ).toEqual([]);
  await expect(get(d, { scope: 'scene', id: 'missing' })).rejects.toMatchObject(
    { code: 'NOT_FOUND' },
  );
  await expect(get(d, { scope: 'case' })).rejects.toMatchObject({
    code: 'USAGE',
  });
  await fs.writeFile(join(d, '.joplo/selection.json'), 'null');
  await expect(get(d, { scope: 'selection' })).rejects.toMatchObject({
    code: 'INVALID_SCHEMA',
  });
});
test.each([0, 1])(
  '文件系统 rename 第 %d 次失败：project 字节不变，无回执/快照/临时文件',
  async (failAt) => {
    const d = await fixture();
    const before = await fs.readFile(join(d, 'project.joplo.json'));
    const rename = realFs.rename;
    let call = 0;
    vi.mocked(fs.rename).mockImplementation(async (...args) => {
      if (call++ === failAt)
        throw Object.assign(new Error('磁盘写入故障'), { code: 'EIO' });
      return rename(...args);
    });
    await expect(applyPatch(d, patch([node]))).rejects.toThrow();
    expect(await fs.readFile(join(d, 'project.joplo.json'))).toEqual(before);
    expect(
      (await fs.readdir(d, { recursive: true })).filter((n) =>
        n.endsWith('.json'),
      ),
    ).toEqual(['project.joplo.json']);
    expect(
      (await fs.readdir(join(d, '.joplo'))).filter(
        (n) => n === 'lock' || n.startsWith('tmp-') || n === 'transaction.json',
      ),
    ).toEqual([]);
  },
);
test('完整 schema 拒绝空 patch、非法索引及越权字段', () => {
  for (const op of [
    null,
    { op: 'updateNode', sceneId: 's', nodeId: 'n', patch: {} },
    {
      op: 'insertNode',
      sceneId: 's',
      parentId: 'p',
      index: -1,
      value: { id: 'n', type: 'Text' },
    },
    { op: 'updateNode', sceneId: 's', nodeId: 'n', patch: { id: 'new' } },
  ])
    expect(Patch.safeParse(patch([op])).success).toBe(false);
});
test('同批清理引用才可删除；评论失去目标保留锚点', async () => {
  const d = await fixture();
  const p = await readProject(d);
  const r = await applyPatch(
    d,
    patch([
      {
        op: 'addComment',
        value: {
          id: 'c_test',
          target: { kind: 'element', id: 'scene_a_members#btn_invite' },
          text: '这里',
          author: 'agent',
          revision: 1,
          createdAt: '2026-11-05T00:00:00Z',
        },
      },
      { op: 'removeNode', sceneId: 'scene_a_members', nodeId: 'btn_invite' },
      ...Object.values(p.scenarios).map((s) => ({
        op: 'upsertScenario',
        value: {
          ...s,
          steps: s.steps.filter(
            (st) =>
              !('target' in st.action && st.action.target === 'btn_invite'),
          ),
        },
      })),
      ...Object.values(p.rules)
        .filter((r) => r.elementRefs.includes('scene_a_members#btn_invite'))
        .map((r) => ({
          op: 'upsertRule',
          value: {
            ...r,
            elementRefs: [],
            stepIds: [],
            confirmation: 'pending',
          },
        })),
    ]),
  );
  expect(r.diagnostics.some((d) => d.code === 'COMMENT_TARGET_MISSING')).toBe(
    true,
  );
  expect((await readProject(d)).comments.c_test!.target.id).toBe(
    'scene_a_members#btn_invite',
  );
});
test('恢复不能借历史确认规则或更改 Decision', async () => {
  const d = await fixture();
  const p = await readProject(d);
  await applyPatch(
    d,
    patch([
      {
        op: 'upsertRule',
        value: {
          ...p.rules.rule_admin_only!,
          text: '新文本',
          confirmation: 'pending',
        },
      },
    ]),
  );
  await expect(
    restore(d, {
      revision: 1,
      expectRevision: 2,
      idempotencyKey: 'no-confirm',
    }),
  ).rejects.toMatchObject({ code: 'PERMISSION_DENIED' });
  expect((await readProject(d)).revision).toBe(2);
});
test('路径穿越及内部符号链接不越界', async () => {
  const d = await fixture();
  const outside = await fixture(true);
  await fs.symlink(outside, join(d, '.joplo'), 'dir');
  await expect(applyPatch(d, patch([node]))).rejects.toMatchObject({
    code: 'PERMISSION_DENIED',
  });
  expect(await fs.readdir(outside)).toEqual([]);
});
test('合法格式但不存在的原型属性 ID 不会被误认为对象', async () => {
  const d = await fixture();
  await expect(
    get(d, { scope: 'scene', id: 'constructor' }),
  ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  await expect(
    applyPatch(d, patch([{ op: 'remove', kind: 'scene', id: 'toString' }])),
  ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  await expect(
    applyPatch(
      d,
      patch([
        {
          op: 'setCoverage',
          optionId: 'constructor',
          caseId: 'case_happy',
          value: { status: 'missing' },
        },
      ]),
    ),
  ).rejects.toMatchObject({ code: 'NOT_FOUND' });
});
test('不同画面可复用节点 ID；selection 不会误指另一画面的步骤', async () => {
  const d = await fixture();
  const p = await readProject(d);
  p.scenes.scene_second = {
    ...structuredClone(p.scenes.scene_a_members!),
    id: 'scene_second',
  };
  await fs.writeFile(join(d, 'project.joplo.json'), JSON.stringify(p));
  await fs.mkdir(join(d, '.joplo'));
  await fs.writeFile(
    join(d, '.joplo/selection.json'),
    JSON.stringify({ sceneId: 'scene_second', nodeId: 'btn_invite' }),
  );
  const selected = (await get(d, { scope: 'selection' })).data!.content as any;
  expect(selected.node.id).toBe('btn_invite');
  expect(selected.steps).toEqual([]);
  expect(selected.rules).toEqual([]);
});
test.each([
  { schemaVersion: 2 },
  { revision: 9 },
  { id: 'other' },
  { decisions: {} },
  { operations: [{ op: 'upsertDecision', value: { id: 'decision_fake' } }] },
  {
    operations: [
      { op: 'setCommentStatus', id: 'comment_missing', status: 'resolved' },
    ],
  },
  { operations: [{ op: 'replace', path: '/revision', value: 9 }] },
])('人工边界使用 PERMISSION_DENIED：%j', async (extra) => {
  const d = await fixture();
  await expect(
    applyPatch(d, { ...patch([node]), ...extra }),
  ).rejects.toMatchObject({ code: 'PERMISSION_DENIED' });
  expect((await readProject(d)).revision).toBe(1);
});
