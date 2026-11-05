import { afterEach, expect, test, vi } from 'vitest';
import * as syncFs from 'node:fs';
import {
  cp,
  mkdtemp,
  readdir,
  readFile,
  writeFile,
  rename,
  rm,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { applyPatch, history } from '../src/store.ts';
vi.mock('node:fs', async (original) => {
  const actual = await original<typeof syncFs>();
  return { ...actual, linkSync: vi.fn(actual.linkSync) };
});
const actual = await vi.importActual<typeof syncFs>('node:fs');
const dirs: string[] = [];
afterEach(async () => {
  vi.mocked(syncFs.linkSync).mockImplementation(actual.linkSync);
  await Promise.all(
    dirs.splice(0).map((d) => rm(d, { recursive: true, force: true })),
  );
});
test('已替换项目后发布快照失败：保留成功回执，死亡持有者由后续写入补齐', async () => {
  const d = await mkdtemp(join(tmpdir(), 'joplo-publish-'));
  dirs.push(d);
  await cp('examples/invite/project.joplo.json', join(d, 'project.joplo.json'));
  const patch = {
    expectRevision: 1,
    idempotencyKey: 'publish',
    summary: '发布',
    operations: [
      {
        op: 'updateNode',
        sceneId: 'scene_a_members',
        nodeId: 'btn_invite',
        patch: { note: '第一次' },
      },
    ],
  };
  vi.mocked(syncFs.linkSync).mockImplementationOnce(() => {
    throw Object.assign(new Error('发布故障'), { code: 'EIO' });
  });
  const receipt = await applyPatch(d, patch);
  expect(receipt.revision).toBe(2);
  expect((await history(d)).data?.map((r) => r.revision)).toEqual([1, 2]);
  expect((await applyPatch(d, patch, { dryRun: true })).data).toMatchObject({
    dryRun: true,
    replayedReceipt: true,
  });
  const next = {
    ...patch,
    expectRevision: 2,
    idempotencyKey: 'next',
    operations: [{ ...patch.operations[0], patch: { note: '第二次' } }],
  };
  await expect(applyPatch(d, next)).rejects.toMatchObject({
    code: 'REVISION_CONFLICT',
    details: { reason: 'LOCK_BUSY' },
  });
  const name = (await readdir(join(d, '.joplo'))).find((n) =>
    n.startsWith('tmp-'),
  )!;
  const old = join(d, '.joplo', name);
  const journal = JSON.parse(await readFile(join(old, 'journal.json'), 'utf8'));
  journal.pid = 2147483647;
  await writeFile(join(old, 'journal.json'), JSON.stringify(journal));
  await rename(
    old,
    join(d, '.joplo', name.replace(`tmp-${process.pid}-`, 'tmp-2147483647-')),
  );
  expect((await applyPatch(d, next)).revision).toBe(3);
  expect(await applyPatch(d, patch)).toEqual(receipt);
  expect((await history(d)).data).toHaveLength(3);
  expect(
    (await readdir(join(d, '.joplo'))).filter((n) => n.startsWith('tmp-')),
  ).toEqual([]);
});
