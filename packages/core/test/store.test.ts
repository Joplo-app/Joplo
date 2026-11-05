import { afterEach, describe, expect, test } from 'vitest';
import {
  mkdtemp,
  readFile,
  writeFile,
  cp,
  readdir,
  rm,
  mkdir,
  utimes,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import {
  applyPatch,
  readProject,
  history,
  restore,
  initProject,
} from '../src/store.ts';
import { get } from '../src/scope.ts';
import { validate } from '../src/validate.ts';
const dirs: string[] = [];
afterEach(async () => {
  await Promise.all(
    dirs.splice(0).map((d) => rm(d, { recursive: true, force: true })),
  );
});
export async function fixture() {
  const dir = await mkdtemp(join(tmpdir(), 'joplo-'));
  dirs.push(dir);
  await cp(
    'examples/invite/project.joplo.json',
    join(dir, 'project.joplo.json'),
  );
  return dir;
}
const operation = {
  op: 'updateNode',
  sceneId: 'scene_a_members',
  nodeId: 'btn_invite',
  patch: { props: { label: '+ 邀请成员' } },
};
const patch = (key = 'test', operations: unknown[] = [operation]) => ({
  expectRevision: 'rev_1',
  idempotencyKey: key,
  summary: '修改按钮',
  operations,
});
async function files(dir: string): Promise<string[]> {
  return (await readdir(dir, { recursive: true })).sort();
}
function child(dir: string, key: string) {
  return new Promise<any>((res, rej) => {
    const p = spawn(
      process.execPath,
      [
        '--import',
        'tsx',
        resolve('packages/core/test/fixtures/apply.ts'),
        dir,
        JSON.stringify(patch(key)),
      ],
      { stdio: ['ignore', 'pipe', 'pipe'] },
    );
    let out = '';
    let err = '';
    p.stdout.on('data', (x) => (out += x));
    p.stderr.on('data', (x) => (err += x));
    p.on('error', rej);
    p.on('close', () => {
      try {
        res(JSON.parse(out));
      } catch {
        rej(new Error(err + out));
      }
    });
  });
}
describe('受控存储不变量', () => {
  test('原子失败：整批、schema、引用错误均不改变任何字节或留下文件', async () => {
    const d = await fixture();
    const before = await readFile(join(d, 'project.joplo.json'));
    for (const ops of [
      [operation, { op: 'removeNode', sceneId: 'absent', nodeId: 'x' }],
      [{ op: 'remove', kind: 'scene', id: 'scene_a_members' }],
      [{ ...operation, patch: null }],
    ]) {
      await expect(applyPatch(d, patch('bad', ops))).rejects.toBeDefined();
      expect(await readFile(join(d, 'project.joplo.json'))).toEqual(before);
      expect(
        (await files(d)).filter(
          (x) => !['project.joplo.json', '.joplo'].includes(x),
        ),
      ).toEqual([]);
    }
  });
  test('dry-run 零写入，成功同时产生基线、新快照和回执', async () => {
    const d = await fixture();
    const before = await readFile(join(d, 'project.joplo.json'));
    const dry = await applyPatch(d, patch(), { dryRun: true });
    expect(dry.revision).toBe(2);
    expect(await files(d)).toEqual(['project.joplo.json']);
    expect(await readFile(join(d, 'project.joplo.json'))).toEqual(before);
    const r = await applyPatch(d, patch());
    expect(r.changedIds).toContain('btn_invite');
    expect((await history(d)).data).toHaveLength(2);
    expect(await readProject(d)).toMatchObject({ revision: 2 });
  });
  test('幂等优先于修订检查，规范化键顺序，相同回执且键不允许复用', async () => {
    const d = await fixture();
    const r = await applyPatch(d, patch());
    await applyPatch(d, { ...patch('next'), expectRevision: 2 });
    expect(
      await applyPatch(d, {
        operations: [operation],
        summary: '修改按钮',
        idempotencyKey: 'test',
        expectRevision: 1,
      }),
    ).toEqual(r);
    await expect(
      applyPatch(d, { ...patch(), summary: '不同' }),
    ).rejects.toMatchObject({ code: 'IDEMPOTENCY_MISMATCH' });
  });
  test('真实并发：恰好一成功、一冲突，错误含当前修订', async () => {
    const d = await fixture();
    const rs = await Promise.all([child(d, 'a'), child(d, 'b')]);
    expect(rs.filter((r) => r.ok)).toHaveLength(1);
    expect(rs.find((r) => !r.ok).error).toMatchObject({
      code: 'REVISION_CONFLICT',
      details: { currentRevision: 2 },
    });
    expect((await readProject(d)).revision).toBe(2);
  });
  test('陈旧锁被回收', async () => {
    const d = await fixture();
    await mkdir(join(d, '.joplo'));
    await mkdir(join(d, '.joplo/lock'));
    await utimes(join(d, '.joplo/lock'), new Date(0), new Date(0));
    expect((await applyPatch(d, patch())).revision).toBe(2);
  });
  test('恢复创建新修订且保护人工确认边界', async () => {
    const d = await fixture();
    await applyPatch(d, patch());
    const r = await restore(d, {
      revision: 'rev_1',
      expectRevision: 2,
      idempotencyKey: 'restore',
    });
    expect(r.revision).toBe(3);
    expect((await history(d)).data).toHaveLength(3);
    const old = await readProject(d);
    expect(old.scenes.scene_a_members?.root).toEqual(
      JSON.parse(await readFile('examples/invite/project.joplo.json', 'utf8'))
        .scenes.scene_a_members.root,
    );
  });
  test.each([
    null,
    {},
    { operations: [] },
    { ...patch(), operations: [] },
    { ...patch(), decisions: {} },
    { ...patch(), revision: 9 },
    {
      ...patch(),
      operations: [{ op: 'setCommentStatus', id: 'x', status: 'resolved' }],
    },
  ])('拒绝边界输入 %j', async (p) => {
    const d = await fixture();
    await expect(applyPatch(d, p)).rejects.toBeDefined();
    expect((await readProject(d)).revision).toBe(1);
  });
  test('人工规则与评论边界', async () => {
    const d = await fixture();
    const p = await readProject(d);
    const rule = Object.values(p.rules)[0]!;
    await expect(
      applyPatch(
        d,
        patch('r', [
          {
            op: 'upsertRule',
            value: { ...rule, text: '新规则', confirmation: 'confirmed' },
          },
        ]),
      ),
    ).rejects.toMatchObject({ code: 'PERMISSION_DENIED' });
    const confirmed = { ...rule, confirmation: 'confirmed' as const };
    p.rules[rule.id] = confirmed;
    await writeFile(join(d, 'project.joplo.json'), JSON.stringify(p));
    await applyPatch(
      d,
      patch('same', [{ op: 'upsertRule', value: confirmed }]),
    );
    await applyPatch(d, {
      ...patch('edit', [
        {
          op: 'upsertRule',
          value: { ...confirmed, text: '已变更', confirmation: 'pending' },
        },
      ]),
      expectRevision: 2,
    });
    expect((await readProject(d)).rules[rule.id]?.confirmation).toBe('pending');
  });
  test('方案隔离、局部属性删除', async () => {
    const d = await fixture();
    const p = await readProject(d);
    const other = structuredClone(p.scenes.scene_a_members!);
    other.id = 'scene_b';
    other.optionId = 'opt_b';
    p.options.opt_b = { ...structuredClone(p.options.opt_a!), id: 'opt_b' };
    p.features.feat_invite!.optionIds.push('opt_b');
    p.scenes.scene_b = other;
    p.options.opt_b.coverage = {};
    await writeFile(join(d, 'project.joplo.json'), JSON.stringify(p));
    await applyPatch(
      d,
      patch('local', [
        { ...operation, patch: { props: { label: '新', variant: null } } },
      ]),
    );
    expect((await readProject(d)).scenes.scene_b).toEqual(other);
  });
  test('未知版本、初始化重复拒绝', async () => {
    const d = await fixture();
    await expect(initProject(d, { name: 'x' })).rejects.toBeDefined();
    const p = await readProject(d);
    await writeFile(
      join(d, 'project.joplo.json'),
      JSON.stringify({ ...p, schemaVersion: 99 }),
    );
    await expect(readProject(d)).rejects.toMatchObject({
      code: 'UNSUPPORTED_SCHEMA_VERSION',
    });
  });
  test('M1：副本 get → 两次 apply → validate', async () => {
    const d = await fixture();
    expect((await get(d, { scope: 'option', id: 'opt_a' })).revision).toBe(1);
    for (const name of ['01-invite-label', '02-already-member'])
      await applyPatch(
        d,
        JSON.parse(
          await readFile(`examples/invite/patches/${name}.json`, 'utf8'),
        ),
      );
    const p = await readProject(d);
    expect(p.scenarios.sc_a_already_member).toBeDefined();
    expect(p.options.opt_a!.coverage.case_already_member).toMatchObject({
      status: 'expressed',
      scenarioIds: ['sc_a_already_member'],
    });
    expect(p.rules.rule_already_member).toMatchObject({
      origin: 'ai_assumption',
      confirmation: 'pending',
    });
    expect(p.issues.iss_already_member!.status).toBe('open');
    const label = JSON.stringify(p.scenes.scene_a_members!.root);
    expect(label).toContain('+ 邀请成员');
    expect(validate(p, { mode: 'all' }).summary.error).toBe(0);
  });
});
test.each(['before', 'after'])(
  '进程在项目替换 %s 被杀后可恢复且幂等',
  async (mode) => {
    const d = await fixture();
    const p = spawn(
      process.execPath,
      [
        '--import',
        'tsx',
        resolve('packages/core/test/fixtures/crash.ts'),
        d,
        JSON.stringify(patch('crash')),
        mode,
      ],
      { stdio: 'pipe' },
    );
    let stderr = '';
    p.stderr!.on('data', (x) => (stderr += x));
    const signal = await new Promise<string | null>((res) =>
      p.on('close', (_code, signal) => res(signal)),
    );
    expect(stderr).toBe('');
    expect(signal).toBe('SIGKILL');
    expect((await readProject(d)).revision).toBe(mode === 'before' ? 1 : 2);
    expect((await history(d)).data).toHaveLength(mode === 'before' ? 1 : 2);
    if (mode === 'before') {
      await expect(
        get(d, { scope: 'project', revision: 2 }),
      ).rejects.toMatchObject({ code: 'NOT_FOUND' });
      expect(
        (await applyPatch(d, patch('crash'), { dryRun: true })).data,
      ).toMatchObject({ dryRun: true });
    }
    await utimes(join(d, '.joplo/lock'), new Date(0), new Date(0));
    const receipt = await applyPatch(d, patch('crash'));
    expect(receipt.revision).toBe(2);
    expect((await readProject(d)).revision).toBe(2);
    expect((await history(d)).data).toHaveLength(2);
    expect(
      (await files(d)).some(
        (n) =>
          n.includes('tmp-') ||
          n.endsWith('/lock') ||
          n.endsWith('transaction.json'),
      ),
    ).toBe(false);
  },
  10000,
);
