import { safeRecords } from './records.ts';
import { z } from 'zod';
import {
  readFile,
  writeFile,
  mkdir,
  rename,
  rm,
  readdir,
  access,
} from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { Project, parseRevision } from './schema.ts';
import {
  Patch,
  RevisionInput,
  IdempotencyKey,
  checkPatchPermissions,
  applyOperations,
  protectRestore,
} from './ops.ts';
import { validate } from './validate.ts';
import { JoploError } from './result.ts';
import type { DomainResult } from './result.ts';
import { safePath, withProjectLock } from './lock.ts';
export const canonicalJSON = (v: unknown): string =>
  JSON.stringify(sortJSON(v));
function sortJSON(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(sortJSON);
  if (v && typeof v === 'object')
    return Object.fromEntries(
      Object.entries(v)
        .sort(([a], [b]) => a.localeCompare(b, 'en'))
        .map(([k, x]) => [k, sortJSON(x)]),
    );
  return v;
}
const encode = (v: unknown) => JSON.stringify(v, null, 2) + '\n';
const hash = (v: string) => createHash('sha256').update(v).digest('hex');
const missing = (e: unknown) => (e as NodeJS.ErrnoException).code === 'ENOENT';
export function parseProject(raw: unknown): Project {
  if (
    raw &&
    typeof raw === 'object' &&
    'schemaVersion' in raw &&
    (raw as { schemaVersion: unknown }).schemaVersion !== 1
  )
    throw new JoploError(
      'UNSUPPORTED_SCHEMA_VERSION',
      '不支持的 schemaVersion',
      { details: { schemaVersion: (raw as any).schemaVersion } },
    );
  const result = Project.safeParse(raw);
  if (!result.success)
    throw new JoploError('INVALID_SCHEMA', '项目格式不合法', {
      details: result.error.issues,
    });
  return safeRecords(result.data);
}
export async function readJSON(path: string): Promise<unknown> {
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch (e) {
    if (e instanceof SyntaxError)
      throw new JoploError('INVALID_SCHEMA', 'JSON 解析失败', {
        details: { message: e.message },
      });
    if (missing(e)) throw new JoploError('NOT_FOUND', '项目或对象文件不存在');
    throw e;
  }
}
export async function readProject(dir: string): Promise<Project> {
  return parseProject(
    await readJSON(await safePath(dir, 'project.joplo.json')),
  );
}
export function result<T>(
  p: Pick<Project, 'id' | 'revision'>,
  summary: string,
  data: T,
  opts: Partial<DomainResult<T>> = {},
): DomainResult<T> {
  return {
    ok: true,
    projectId: p.id,
    revision: p.revision,
    requestId: randomUUID(),
    summary,
    changedIds: [],
    diagnostics: [],
    artifacts: [],
    data,
    ...opts,
  };
}
function parseInput<T>(schema: z.ZodType<T>, raw: unknown): T {
  const r = schema.safeParse(raw);
  if (!r.success)
    throw new JoploError('INVALID_SCHEMA', '变更格式不合法', {
      details: r.error.issues,
    });
  return r.data;
}
function checkRevision(p: Project, expected: string | number) {
  if (parseRevision(expected) !== p.revision)
    throw new JoploError('REVISION_CONFLICT', '项目修订已变化，请重新读取', {
      details: {
        currentRevision: p.revision,
        currentRevisionLabel: `rev_${p.revision}`,
        expectRevision: expected,
      },
    });
}
function checkReferences(p: Project) {
  const report = validate(p, { mode: 'structure' });
  if (
    report.diagnostics.some(
      (d) => d.severity === 'error' && d.source === 'reference',
    )
  )
    throw new JoploError('INVALID_REFERENCE', '变更导致无效引用', {
      diagnostics: report.diagnostics,
    });
  return report.diagnostics;
}
type Receipt = { fingerprint: string; result: DomainResult };
async function receiptPath(dir: string, key: string) {
  return safePath(dir, '.joplo', 'receipts', `${hash(key)}.json`);
}
async function findReceipt(
  dir: string,
  key: string,
  fingerprint: string,
): Promise<DomainResult | undefined> {
  const path = await receiptPath(dir, key);
  let receipt: Receipt;
  try {
    receipt = JSON.parse(await readFile(path, 'utf8'));
  } catch (e) {
    if (missing(e)) return;
    throw e;
  }
  // 读者可能撞上另一个进程尚未替换 project 的阶段；该回执还不算提交。
  if (receipt.result.revision > (await readProject(dir)).revision) return;
  if (receipt.fingerprint !== fingerprint)
    throw new JoploError('IDEMPOTENCY_MISMATCH', '幂等键已用于不同内容');
  return receipt.result;
}
/** journal 在 project rename 前已持久化。崩溃后依权威项目恢复提交或清理半成品。 */
type Journal = {
  revision: number;
  projectHash: string;
  created: string[];
  tempDir: string;
};
async function cleanupTemps(dir: string) {
  const meta = await safePath(dir, '.joplo');
  for (const name of await readdir(meta))
    if (/^tmp-[a-f0-9-]+$/.test(name))
      await rm(await safePath(dir, '.joplo', name), {
        recursive: true,
        force: true,
      });
}
async function recover(dir: string) {
  const journalPath = await safePath(dir, '.joplo', 'transaction.json');
  let j: Journal;
  try {
    j = JSON.parse(await readFile(journalPath, 'utf8'));
  } catch (e) {
    if (missing(e)) {
      await cleanupTemps(dir);
      return;
    }
    throw e;
  }
  const journalSchema = z.strictObject({
    revision: z.number().int().nonnegative(),
    projectHash: z.string().regex(/^[a-f0-9]{64}$/),
    created: z.array(
      z
        .string()
        .regex(/^\.joplo\/(revisions\/rev_\d+|receipts\/[a-f0-9]{64})\.json$/),
    ),
    tempDir: z.string().regex(/^\.joplo\/tmp-[a-f0-9-]+$/),
  });
  j = parseInput(journalSchema, j);
  let committed = false;
  try {
    committed =
      hash(
        await readFile(await safePath(dir, 'project.joplo.json'), 'utf8'),
      ) === j.projectHash;
  } catch (e) {
    if (!missing(e)) throw e;
  }
  if (!committed)
    for (const path of j.created)
      await rm(await safePath(dir, path), { force: true });
  await rm(await safePath(dir, j.tempDir), { recursive: true, force: true });
  await rm(journalPath, { force: true });
  await cleanupTemps(dir);
}
async function commit(
  dir: string,
  before: Project | undefined,
  after: Project,
  key: string,
  fingerprint: string,
  receipt: DomainResult,
  assertOwned: () => void,
) {
  await mkdir(await safePath(dir, '.joplo', 'revisions'), { recursive: true });
  await mkdir(await safePath(dir, '.joplo', 'receipts'), { recursive: true });
  const tempRel = `.joplo/tmp-${randomUUID()}`;
  const temp = await safePath(dir, tempRel);
  await mkdir(temp);
  const created: string[] = [];
  const moves: { from: string; to: string }[] = [];
  let projectCommitted = false;
  const journalPath = await safePath(dir, '.joplo', 'transaction.json');
  const projectBytes = encode(after);
  async function stage(rel: string, bytes: string) {
    const to = await safePath(dir, rel);
    try {
      await access(to);
      throw new JoploError('INVALID_SCHEMA', `不可变文件已存在：${rel}`);
    } catch (e) {
      if (!missing(e)) throw e;
    }
    const from = join(temp, String(moves.length));
    await writeFile(from, bytes, { flag: 'wx', flush: true });
    moves.push({ from, to });
    created.push(rel);
  }
  try {
    if (before) {
      const path = await safePath(
        dir,
        '.joplo',
        'revisions',
        `rev_${before.revision}.json`,
      );
      try {
        await access(path);
      } catch (e) {
        if (!missing(e)) throw e;
        await stage(
          `.joplo/revisions/rev_${before.revision}.json`,
          encode(before),
        );
      }
    }
    await stage(`.joplo/revisions/rev_${after.revision}.json`, projectBytes);
    const receiptRel = `.joplo/receipts/${hash(key)}.json`;
    await stage(receiptRel, encode({ fingerprint, result: receipt }));
    const stagedProject = join(temp, 'project.json');
    await writeFile(stagedProject, projectBytes, { flag: 'wx', flush: true });
    const stagedJournal = join(temp, 'journal.json');
    await writeFile(
      stagedJournal,
      encode({
        revision: after.revision,
        projectHash: hash(projectBytes),
        created,
        tempDir: tempRel,
      }),
      { flag: 'wx', flush: true },
    );
    await rename(stagedJournal, journalPath);
    assertOwned();
    for (const m of moves) await rename(m.from, m.to);
    assertOwned();
    await rename(stagedProject, await safePath(dir, 'project.joplo.json'));
    projectCommitted = true;
  } catch (e) {
    if (!projectCommitted)
      for (const rel of created)
        await rm(await safePath(dir, rel), { force: true });
    throw e;
  } finally {
    await rm(temp, { recursive: true, force: true });
    await rm(journalPath, { force: true });
  }
}
export async function applyPatch(
  dir: string,
  raw: unknown,
  options: { dryRun?: boolean } = {},
): Promise<DomainResult> {
  checkPatchPermissions(raw);
  const patch = parseInput(Patch, raw);
  const normalized = {
    ...patch,
    expectRevision: parseRevision(patch.expectRevision),
  };
  const fingerprint = hash(canonicalJSON({ type: 'apply', ...normalized }));
  const execute = async (assertOwned: () => void) => {
    if (!options.dryRun) await recover(dir);
    const prior = await findReceipt(dir, patch.idempotencyKey, fingerprint);
    if (prior) return prior;
    const before = await readProject(dir);
    checkRevision(before, patch.expectRevision);
    const applied = applyOperations(before, patch.operations);
    const after = parseProject({
      ...applied.project,
      revision: before.revision + 1,
      updatedAt: new Date().toISOString(),
    });
    const diagnostics = checkReferences(after);
    const receipt = result(
      after,
      patch.summary,
      { dryRun: Boolean(options.dryRun) },
      { changedIds: applied.changedIds, diagnostics },
    );
    if (!options.dryRun)
      await commit(
        dir,
        before,
        after,
        patch.idempotencyKey,
        fingerprint,
        receipt,
        assertOwned,
      );
    return receipt;
  };
  // 无持久化的 dry-run 以一次原子读取为基线，绝不创建锁或元数据目录。
  return options.dryRun ? execute(() => {}) : withProjectLock(dir, execute);
}
export async function history(
  dir: string,
): Promise<
  DomainResult<{ revision: number; updatedAt: string; current: boolean }[]>
> {
  const p = await readProject(dir);
  let names: string[] = [];
  try {
    names = await readdir(await safePath(dir, '.joplo', 'revisions'));
  } catch (e) {
    if (!missing(e)) throw e;
  }
  const revisions = new Map<
    number,
    { revision: number; updatedAt: string; current: boolean }
  >();
  for (const name of names.filter((n) => /^rev_\d+\.json$/.test(n))) {
    const snapshot = parseProject(
      await readJSON(await safePath(dir, '.joplo', 'revisions', name)),
    );
    if (snapshot.revision <= p.revision)
      revisions.set(snapshot.revision, {
        revision: snapshot.revision,
        updatedAt: snapshot.updatedAt,
        current: snapshot.revision === p.revision,
      });
  }
  revisions.set(p.revision, {
    revision: p.revision,
    updatedAt: p.updatedAt,
    current: true,
  });
  return result(
    p,
    '修订历史',
    [...revisions.values()].sort((a, b) => a.revision - b.revision),
  );
}
export async function readRevision(
  dir: string,
  revision: string | number,
): Promise<Project> {
  const n = parseInput(RevisionInput, revision);
  const p = await readProject(dir);
  if (p.revision === parseRevision(n)) return p;
  if (parseRevision(n)! > p.revision)
    throw new JoploError('NOT_FOUND', '修订尚未提交或不存在');
  return parseProject(
    await readJSON(
      await safePath(
        dir,
        '.joplo',
        'revisions',
        `rev_${parseRevision(n)}.json`,
      ),
    ),
  );
}
const Restore = z.strictObject({
  revision: RevisionInput,
  expectRevision: RevisionInput,
  idempotencyKey: IdempotencyKey,
});
export async function restore(
  dir: string,
  raw: z.input<typeof Restore>,
): Promise<DomainResult> {
  const opts = parseInput(Restore, raw);
  const fingerprint = hash(
    canonicalJSON({
      type: 'restore',
      revision: parseRevision(opts.revision),
      expectRevision: parseRevision(opts.expectRevision),
      idempotencyKey: opts.idempotencyKey,
    }),
  );
  return withProjectLock(dir, async (assertOwned) => {
    await recover(dir);
    const prior = await findReceipt(dir, opts.idempotencyKey, fingerprint);
    if (prior) return prior;
    const p = await readProject(dir);
    checkRevision(p, opts.expectRevision);
    const target = await readRevision(dir, opts.revision);
    protectRestore(p, target);
    const next = parseProject({
      ...target,
      revision: p.revision + 1,
      updatedAt: new Date().toISOString(),
    });
    const diagnostics = checkReferences(next);
    const receipt = result(
      next,
      `恢复 rev_${target.revision}`,
      { restoredFrom: target.revision },
      {
        changedIds: [
          ...new Set([
            ...Object.keys(p.features),
            ...Object.keys(p.cases),
            ...Object.keys(p.options),
            ...Object.keys(p.rules),
            ...Object.keys(p.scenes),
            ...Object.keys(p.scenarios),
            ...Object.keys(p.comments),
            ...Object.keys(p.issues),
            ...Object.keys(target.features),
            ...Object.keys(target.cases),
            ...Object.keys(target.options),
            ...Object.keys(target.rules),
            ...Object.keys(target.scenes),
            ...Object.keys(target.scenarios),
            ...Object.keys(target.comments),
            ...Object.keys(target.issues),
          ]),
        ].sort(),
        diagnostics,
      },
    );
    await commit(
      dir,
      p,
      next,
      opts.idempotencyKey,
      fingerprint,
      receipt,
      assertOwned,
    );
    return receipt;
  });
}
export async function initProject(
  dir: string,
  { name }: { name: string },
): Promise<DomainResult> {
  if (typeof name !== 'string' || !name.trim())
    throw new JoploError('INVALID_SCHEMA', '项目名称不能为空');
  await mkdir(dir, { recursive: true });
  return withProjectLock(dir, async (assertOwned) => {
    await recover(dir);
    const file = await safePath(dir, 'project.joplo.json');
    try {
      await access(file);
      throw new JoploError('PERMISSION_DENIED', '项目已存在，拒绝覆盖');
    } catch (e) {
      if (!missing(e)) throw e;
    }
    const p = parseProject({
      schemaVersion: 1,
      id: `prj_${randomUUID().replaceAll('-', '')}`,
      name,
      revision: 0,
      updatedAt: new Date().toISOString(),
    });
    const receipt = result(p, '项目已创建', {});
    await commit(
      dir,
      undefined,
      p,
      'init',
      hash(canonicalJSON({ name })),
      receipt,
      assertOwned,
    );
    return receipt;
  });
}
