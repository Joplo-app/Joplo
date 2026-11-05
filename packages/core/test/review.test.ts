import { afterEach, expect, test } from 'vitest';
import {
  mkdtemp,
  cp,
  readFile,
  writeFile,
  rm,
  readdir,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { applyPatch, readProject, initProject, restore } from '../src/store.ts';
import { protectRestore, applyOperations, Patch } from '../src/ops.ts';
const dirs: string[] = [];
afterEach(async () => {
  await Promise.all(
    dirs.splice(0).map((d) => rm(d, { recursive: true, force: true })),
  );
});
async function fixture(empty = false) {
  const d = await mkdtemp(join(tmpdir(), 'joplo-review-'));
  dirs.push(d);
  if (!empty)
    await cp(
      'examples/invite/project.joplo.json',
      join(d, 'project.joplo.json'),
    );
  return d;
}
const patch = (operations: unknown[], key = 'review', revision = 1) => ({
  expectRevision: revision,
  idempotencyKey: key,
  summary: '评审回归',
  operations,
});
const edit = {
  op: 'updateNode',
  sceneId: 'scene_a_members',
  nodeId: 'btn_invite',
  patch: { note: '评审修改' },
};
test.each(['removeNode', 'upsertScene'])(
  'R2 %s 不可删除步骤目标',
  async (op) => {
    const d = await fixture();
    const p = await readProject(d);
    for (const r of Object.values(p.rules)) r.elementRefs = [];
    await writeFile(join(d, 'project.joplo.json'), JSON.stringify(p));
    const value = {
      ...p.scenes.scene_a_members!,
      root: { id: 'page', type: 'Page' },
    };
    await expect(
      applyPatch(
        d,
        patch([
          op === 'removeNode'
            ? { op, sceneId: 'scene_a_members', nodeId: 'btn_invite' }
            : { op, value },
        ]),
      ),
    ).rejects.toMatchObject({ code: 'INVALID_REFERENCE' });
    expect((await readProject(d)).revision).toBe(1);
  },
);
test.each([
  'upsertScene',
  'upsertScenario',
  'upsertRule',
  'upsertCase',
  'upsertOption',
  'upsertIssue',
])('R3 %s 不可转移对象归属', async (op) => {
  const d = await fixture();
  const p = await readProject(d);
  const tables = {
    upsertScene: p.scenes,
    upsertScenario: p.scenarios,
    upsertRule: p.rules,
    upsertCase: p.cases,
    upsertOption: p.options,
    upsertIssue: p.issues,
  };
  const value = {
    ...Object.values(tables[op as keyof typeof tables])[0]!,
    ...(op === 'upsertCase' || op === 'upsertOption'
      ? { featureId: 'other' }
      : { optionId: 'other' }),
  };
  expect(() =>
    applyOperations(
      p,
      Patch.parse(
        patch([
          {
            op,
            value: {
              ...value,
              ...(op === 'upsertRule' ? { confirmation: 'pending' } : {}),
            },
          },
        ]),
      ).operations,
    ),
  ).toThrowError(expect.objectContaining({ code: 'INVALID_REFERENCE' }));
});
test('R3 确认规则的关联字段修改自动回到 pending', async () => {
  const d = await fixture();
  const p = await readProject(d);
  await applyPatch(
    d,
    patch([
      {
        op: 'upsertRule',
        value: {
          ...p.rules.rule_admin_only!,
          elementRefs: [],
          confirmation: 'pending',
        },
      },
    ]),
  );
  expect((await readProject(d)).rules.rule_admin_only!.confirmation).toBe(
    'pending',
  );
  const d2 = await fixture();
  const p2 = await readProject(d2);
  await applyPatch(
    d2,
    patch([
      {
        op: 'upsertRule',
        value: {
          ...p2.rules.rule_admin_only!,
          elementRefs: [],
          confirmation: 'out_of_scope',
        },
      },
    ]),
  );
  expect((await readProject(d2)).rules.rule_admin_only!.confirmation).toBe(
    'pending',
  );
});
test('R6 用户仍可使用 init 幂等键', async () => {
  const d = await fixture(true);
  await initProject(d, { name: '新项目' });
  expect(
    (
      await applyPatch(
        d,
        patch(
          [
            {
              op: 'upsertFeature',
              value: { id: 'f', name: '功能', goal: '目标' },
            },
          ],
          'init',
          0,
        ),
      )
    ).revision,
  ).toBe(1);
});
test.each(['accepted', 'resolved'])(
  'R7 Agent 不能将 issue 标为 %s',
  async (status) => {
    const d = await fixture();
    const p = await readProject(d);
    await expect(
      applyPatch(
        d,
        patch([
          {
            op: 'upsertIssue',
            value: { ...p.issues.iss_already_member!, status },
          },
        ]),
      ),
    ).rejects.toMatchObject({ code: 'PERMISSION_DENIED' });
  },
);
test.each(['user', 'resolved'])(
  'R7 addComment 不能冒充用户或关闭评论 %s',
  async (value) => {
    const d = await fixture();
    await expect(
      applyPatch(
        d,
        patch([
          {
            op: 'addComment',
            value: {
              id: 'c',
              target: { kind: 'feature', id: 'feat_invite' },
              text: '评论',
              author: value === 'user' ? 'user' : 'agent',
              status: value === 'resolved' ? 'resolved' : 'open',
              revision: 1,
              createdAt: 'now',
            },
          },
        ]),
      ),
    ).rejects.toMatchObject({ code: 'PERMISSION_DENIED' });
  },
);
test.each(['delete', 'reopen', 'resolve', 'decision'])(
  'R7 protectRestore 阻止 %s',
  async (mode) => {
    const d = await fixture();
    const p = await readProject(d);
    p.comments.c = {
      id: 'c',
      target: { kind: 'feature', id: 'feat_invite' },
      text: '评论',
      author: 'user',
      status: mode === 'resolve' ? 'open' : 'resolved',
      revision: 1,
      createdAt: 'now',
      replies: [],
    };
    const target = structuredClone(p);
    if (mode === 'delete') delete target.comments.c;
    else if (mode === 'reopen') target.comments.c!.status = 'open';
    else if (mode === 'resolve') target.comments.c!.status = 'resolved';
    else
      target.decisions.d = {
        id: 'd',
        featureId: 'feat_invite',
        optionId: 'opt_a',
        revision: 1,
        rationale: '人工',
        acceptedExceptions: [],
        confirmedBy: 'user',
        confirmedAt: 'now',
      };
    expect(() => protectRestore(p, target)).toThrowError(
      expect.objectContaining({ code: 'PERMISSION_DENIED' }),
    );
  },
);
test('R8 restore 无效版本为 USAGE', async () => {
  const d = await fixture();
  await expect(
    restore(d, { revision: 'abc', expectRevision: 1, idempotencyKey: 'r' }),
  ).rejects.toMatchObject({ code: 'USAGE' });
});
test.each([{ props: {} }, { props: { label: '邀请成员' } }])(
  'R9 无变化不能产生新修订 %j',
  async (fields) => {
    const d = await fixture();
    expect(
      (await applyPatch(d, patch([{ ...edit, patch: fields }]))).data,
    ).toMatchObject({ unchanged: true });
    expect((await readProject(d)).revision).toBe(1);
    expect(
      (await readdir(d, { recursive: true })).some((p) =>
        p.includes('receipts/'),
      ),
    ).toBe(false);
  },
);
test('R10 dry-run 命中旧回执必须标明重放', async () => {
  const d = await fixture();
  const raw = patch([edit]);
  const r = await applyPatch(d, raw);
  const before = await readFile(join(d, 'project.joplo.json'));
  expect((await applyPatch(d, raw, { dryRun: true })).data).toMatchObject({
    dryRun: true,
    replayedReceipt: true,
  });
  expect(await readFile(join(d, 'project.joplo.json'))).toEqual(before);
  expect((await readProject(d)).revision).toBe(r.revision);
});
test('R1 不可变文件冲突时，项目不变且既有快照不被覆盖或删除', async () => {
  const d = await fixture();
  const fs = await import('node:fs/promises');
  await fs.mkdir(join(d, '.joplo/revisions'), { recursive: true });
  const p = await readProject(d);
  const protectedBytes = JSON.stringify({
    ...p,
    revision: 2,
    name: '已存在的快照',
  });
  const path = join(d, '.joplo/revisions/rev_2.json');
  await fs.writeFile(path, protectedBytes);
  const before = await readFile(join(d, 'project.joplo.json'));
  await expect(applyPatch(d, patch([edit]))).rejects.toMatchObject({
    code: 'INVALID_REFERENCE',
  });
  expect(await readFile(path, 'utf8')).toBe(protectedBytes);
  expect(await readFile(join(d, 'project.joplo.json'))).toEqual(before);
});
test('R7 已人工处理 issue 可保持状态，不能通过恢复重新关闭 open 问题', async () => {
  const d = await fixture();
  const p = await readProject(d);
  p.issues.iss_already_member!.status = 'accepted';
  await writeFile(join(d, 'project.joplo.json'), JSON.stringify(p));
  await applyPatch(
    d,
    patch([
      {
        op: 'upsertIssue',
        value: {
          ...p.issues.iss_already_member!,
          text: '保留人工接受，补充解释',
        },
      },
    ]),
  );
  expect((await readProject(d)).issues.iss_already_member!.status).toBe(
    'accepted',
  );
  const target = structuredClone(p);
  p.issues.iss_already_member!.status = 'open';
  expect(() => protectRestore(p, target)).toThrowError(
    expect.objectContaining({ code: 'PERMISSION_DENIED' }),
  );
});
test('R1 死亡旧持有者的未提交 journal 不会阻塞 B 后续提交', async () => {
  const d = await fixture();
  await applyPatch(d, patch([edit], 'b'));
  const fs = await import('node:fs/promises');
  const { createHash } = await import('node:crypto');
  const bytes = JSON.stringify({
    ...(await readProject(d)),
    name: '未提交的 A',
  });
  const digest = createHash('sha256').update(bytes).digest('hex');
  const temp = join(
    d,
    '.joplo/tmp-2147483647-aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  );
  await fs.mkdir(temp);
  await fs.writeFile(join(temp, 'file_0'), bytes);
  await fs.writeFile(
    join(temp, 'journal.json'),
    JSON.stringify({
      pid: 2147483647,
      revision: 2,
      projectHash: digest,
      files: [
        { temp: 'file_0', target: '.joplo/revisions/rev_2.json', hash: digest },
      ],
    }),
  );
  const snapshot = await readFile(join(d, '.joplo/revisions/rev_2.json'));
  expect(
    (await applyPatch(d, patch([{ ...edit, patch: { note: 'C' } }], 'c', 2)))
      .revision,
  ).toBe(3);
  expect(await readFile(join(d, '.joplo/revisions/rev_2.json'))).toEqual(
    snapshot,
  );
});
test('R3 同批 remove 再 upsert 不能绕过归属保护', async () => {
  const d = await fixture();
  const p = await readProject(d);
  const value = { ...p.scenes.scene_a_members!, optionId: 'other' };
  expect(() =>
    applyOperations(
      p,
      Patch.parse(
        patch([
          { op: 'remove', kind: 'scene', id: value.id },
          { op: 'upsertScene', value },
        ]),
      ).operations,
    ),
  ).toThrowError(expect.objectContaining({ code: 'INVALID_REFERENCE' }));
});
test('R9 没有 props 的节点接收空 props 也不能产生修订', async () => {
  const d = await fixture();
  const p = await readProject(d);
  p.scenes.scene_a_members!.root.children!.push({ id: 'plain', type: 'Text' });
  await writeFile(join(d, 'project.joplo.json'), JSON.stringify(p));
  expect(
    (
      await applyPatch(
        d,
        patch([{ ...edit, nodeId: 'plain', patch: { props: {} } }]),
      )
    ).data,
  ).toMatchObject({ unchanged: true });
  expect((await readProject(d)).revision).toBe(1);
});
test('R3 同批后续操作不能清掉已修改确认规则的 pending 状态', async () => {
  const d = await fixture();
  const p = await readProject(d);
  const value = { ...p.rules.rule_admin_only!, elementRefs: [] };
  await applyPatch(
    d,
    patch([
      { op: 'upsertRule', value: { ...value, confirmation: 'pending' } },
      { op: 'upsertRule', value: { ...value, confirmation: 'out_of_scope' } },
    ]),
  );
  expect((await readProject(d)).rules.rule_admin_only!.confirmation).toBe(
    'pending',
  );
});
