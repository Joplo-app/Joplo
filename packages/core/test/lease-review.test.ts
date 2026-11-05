import { afterEach, expect, test } from 'vitest';
import { spawn } from 'node:child_process';
import { mkdtemp, cp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { history, readProject, readRevision } from '../src/store.ts';
const dirs: string[] = [];
afterEach(async () => {
  await Promise.all(
    dirs.splice(0).map((d) => rm(d, { recursive: true, force: true })),
  );
});
async function fixture() {
  const d = await mkdtemp(join(tmpdir(), 'joplo-lease-'));
  dirs.push(d);
  await cp('examples/invite/project.joplo.json', join(d, 'project.joplo.json'));
  return d;
}
function run(dir: string, mode: string) {
  const p = spawn(process.execPath, [
    '--import',
    'tsx',
    resolve('packages/core/test/fixtures/lease.ts'),
    dir,
    mode,
  ]);
  let out = '';
  let err = '';
  let ready!: () => void;
  const started = new Promise<void>((r) => (ready = r));
  p.stdout.on('data', (x) => {
    out += x;
    if (out.includes('READY\n')) ready();
  });
  p.stderr.on('data', (x) => (err += x));
  const done = new Promise<any>((res, rej) => {
    p.on('error', rej);
    p.on('close', () => {
      try {
        if (err) throw new Error(err);
        res(JSON.parse(out.trim().split('\n').at(-1)!));
      } catch (e) {
        rej(e);
      }
    });
  });
  return { started, done };
}
test('R1 旧持有者冻结超过 lease 后不能删除或覆盖 B 的提交', async () => {
  const d = await fixture();
  const a = run(d, 'steal');
  await a.started;
  const b = run(d, 'writer_b');
  let aFinished = false;
  void a.done.then(() => {
    aFinished = true;
  });
  const br = await b.done;
  expect(br.ok).toBe(true);
  expect(aFinished).toBe(false);
  const snapshotBefore = await readFile(join(d, '.joplo/revisions/rev_2.json'));
  const projectBefore = await readFile(join(d, 'project.joplo.json'));
  const ar = await a.done;
  expect(await readFile(join(d, '.joplo/revisions/rev_2.json'))).toEqual(
    snapshotBefore,
  );
  expect(await readFile(join(d, 'project.joplo.json'))).toEqual(projectBefore);
  expect(ar.error.code).toBe('REVISION_CONFLICT');
  expect((await readProject(d)).revision).toBe(2);
  expect((await readRevision(d, 2)).scenes).toEqual(
    (await readProject(d)).scenes,
  );
  expect((await history(d)).data?.map((r) => r.revision)).toEqual([1, 2]);
  const receipts = await readdir(join(d, '.joplo/receipts'));
  expect(receipts).toHaveLength(1);
  expect(
    JSON.parse(await readFile(join(d, '.joplo/receipts', receipts[0]!), 'utf8'))
      .result.requestId,
  ).toBe(br.requestId);
}, 25000);
test('R1/R4 锁被破坏，错误不被 ERELEASED 覆盖', async () => {
  const d = await fixture();
  const before = await readFile(join(d, 'project.joplo.json'));
  const r = await run(d, 'compromise').done;
  expect(r.error.code).toBe('REVISION_CONFLICT');
  expect(await readFile(join(d, 'project.joplo.json'))).toEqual(before);
}, 10000);
test('活跃进程心跳正常，不因持锁超过 stale 被抢占', async () => {
  const d = await fixture();
  const a = run(d, 'active');
  await a.started;
  const b = run(d, 'writer_b');
  expect((await a.done).ok).toBe(true);
  expect((await b.done).ok).toBe(true);
  expect((await readProject(d)).revision).toBe(2);
}, 25000);
