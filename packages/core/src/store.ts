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
import {
  readFileSync,
  writeFileSync,
  linkSync,
  renameSync,
  existsSync,
} from 'node:fs';
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
import { safePath, withProjectLock, withCommitGuard } from './lock.ts';
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
    if (!missing(e)) throw e;
    const p = await readProject(dir);
    const staged = (await committedStaging(dir, p)).find(
      (f) => f.target === `.joplo/receipts/${hash(key)}.json`,
    );
    if (!staged) return;
    receipt = JSON.parse(staged.bytes);
  }
  // 读者可能撞上另一个进程尚未替换 project 的阶段；该回执还不算提交。
  if (receipt.result.revision > (await readProject(dir)).revision) return;
  if (receipt.fingerprint !== fingerprint)
    throw new JoploError('IDEMPOTENCY_MISMATCH', '幂等键已用于不同内容');
  return receipt.result;
}
/** 每个事务的 journal 只位于自己的临时目录，不共享可覆盖的 journal 路径。 */
const JournalSchema = z.strictObject({
  pid: z.number().int().positive(),
  revision: z.number().int().nonnegative(),
  projectHash: z.string().regex(/^[a-f0-9]{64}$/),
  files: z.array(
    z.strictObject({
      temp: z.string().regex(/^file_\d+$/),
      target: z
        .string()
        .regex(/^\.joplo\/(revisions\/rev_\d+|receipts\/[a-f0-9]{64})\.json$/),
      hash: z.string().regex(/^[a-f0-9]{64}$/),
    }),
  ),
});
type Journal = z.infer<typeof JournalSchema>;
async function committedStaging(
  dir: string,
  p: Project,
): Promise<{ target: string; bytes: string }[]> {
  const meta = await safePath(dir, '.joplo');
  let names: string[];
  try {
    names = await readdir(meta);
  } catch (e) {
    if (missing(e)) return [];
    throw e;
  }
  const currentHash = hash(
    await readFile(await safePath(dir, 'project.joplo.json'), 'utf8'),
  );
  const found: { target: string; bytes: string }[] = [];
  for (const name of names) {
    const match = /^tmp-(\d+)-[a-f0-9-]+$/.exec(name);
    if (!match) continue;
    const temp = await safePath(dir, '.joplo', name);
    let journal: Journal;
    try {
      journal = parseInput(
        JournalSchema,
        JSON.parse(await readFile(join(temp, 'journal.json'), 'utf8')),
      );
    } catch (e) {
      if (missing(e)) continue;
      throw e;
    }
    if (journal.pid !== Number(match[1]))
      throw new JoploError('INVALID_SCHEMA', '事务持有者与暂存目录不一致');
    if (journal.revision !== p.revision || journal.projectHash !== currentHash)
      continue;
    for (const f of journal.files) {
      let bytes: string;
      try {
        bytes = await readFile(join(temp, f.temp), 'utf8');
      } catch (e) {
        if (!missing(e)) throw e;
        bytes = await readFile(await safePath(dir, f.target), 'utf8');
      }
      if (hash(bytes) !== f.hash)
        throw new JoploError('INVALID_SCHEMA', '暂存快照完整性校验失败');
      found.push({ target: f.target, bytes });
    }
  }
  return found;
}
function alive(pid: number) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return (e as NodeJS.ErrnoException).code !== 'ESRCH';
  }
}
function promote(dir: string, temp: string, journal: Journal) {
  for (const file of journal.files) {
    const source = join(temp, file.temp);
    const target = join(dir, file.target);
    if (existsSync(target)) {
      if (hash(readFileSync(target, 'utf8')) !== file.hash)
        throw new JoploError('INVALID_REFERENCE', '不可覆盖不可变快照或回执');
      continue;
    }
    // hard link 的 EEXIST 语义禁止覆盖；永远不删除/回滚已发布文件。
    if (hash(readFileSync(source, 'utf8')) !== file.hash)
      throw new JoploError('INVALID_SCHEMA', '暂存文件完整性校验失败');
    linkSync(source, target);
  }
}
async function recover(dir: string, assertOwned: () => void) {
  const meta = await safePath(dir, '.joplo');
  for (const name of await readdir(meta)) {
    const match = /^tmp-(\d+)-[a-f0-9-]+$/.exec(name);
    if (!match) continue;
    const pid = Number(match[1]);
    if (alive(pid)) {
      const temp = await safePath(dir, '.joplo', name);
      try {
        const j = parseInput(
          JournalSchema,
          JSON.parse(await readFile(join(temp, 'journal.json'), 'utf8')),
        );
        const current = await readFile(
          await safePath(dir, 'project.joplo.json'),
          'utf8',
        );
        if (hash(current) === j.projectHash)
          throw new JoploError(
            'REVISION_CONFLICT',
            '已提交事务等待原持有者完成持久化',
            { details: { reason: 'LOCK_BUSY' } },
          );
      } catch (e) {
        if (!missing(e)) throw e;
      }
      continue;
    } // 活着的旧持有者只能清理自己的暂存目录。
    const temp = await safePath(dir, '.joplo', name);
    const journalPath = join(temp, 'journal.json');
    let journal: Journal | undefined;
    try {
      journal = parseInput(
        JournalSchema,
        JSON.parse(await readFile(journalPath, 'utf8')),
      );
    } catch (e) {
      if (!missing(e)) throw e;
    }
    if (journal) {
      if (journal.pid !== pid)
        throw new JoploError('INVALID_SCHEMA', '事务持有者与暂存目录不一致');
      for (const file of journal.files) await safePath(dir, file.target);
      await withCommitGuard(dir, () => {
        assertOwned();
        if (alive(pid)) return;
        const projectPath = join(dir, 'project.joplo.json');
        if (existsSync(projectPath)) {
          const bytes = readFileSync(projectPath, 'utf8');
          const current = parseProject(JSON.parse(bytes));
          const snapshotPath = join(
            dir,
            '.joplo',
            'revisions',
            `rev_${journal.revision}.json`,
          );
          const committedCurrent =
            current.revision === journal.revision &&
            hash(bytes) === journal.projectHash;
          const committedPast =
            current.revision >= journal.revision &&
            existsSync(snapshotPath) &&
            hash(readFileSync(snapshotPath, 'utf8')) === journal.projectHash;
          if (committedCurrent || committedPast) promote(dir, temp, journal);
          // 相同 revision 的快照属于另一个事务，说明本 journal 从未提交；只清理它自己的暂存文件。
        }
      });
    }
    await rm(temp, { recursive: true, force: true });
  }
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
  const root = await safePath(dir);
  await mkdir(await safePath(dir, '.joplo', 'revisions'), { recursive: true });
  await mkdir(await safePath(dir, '.joplo', 'receipts'), { recursive: true });
  const temp = await safePath(
    dir,
    '.joplo',
    `tmp-${process.pid}-${randomUUID()}`,
  );
  await mkdir(temp);
  const files: Journal['files'] = [];
  let committed = false;
  let complete = false;
  const projectBytes = encode(after);
  async function stage(target: string, bytes: string) {
    await safePath(dir, target);
    const name = `file_${files.length}`;
    await writeFile(join(temp, name), bytes, { flag: 'wx', flush: true });
    files.push({ temp: name, target, hash: hash(bytes) });
  }
  try {
    if (before)
      await stage(
        `.joplo/revisions/rev_${before.revision}.json`,
        encode(before),
      );
    await stage(`.joplo/revisions/rev_${after.revision}.json`, projectBytes);
    await stage(
      `.joplo/receipts/${hash(key)}.json`,
      encode({ fingerprint, result: receipt }),
    );
    const journal: Journal = {
      pid: process.pid,
      revision: after.revision,
      projectHash: hash(projectBytes),
      files,
    };
    await writeFile(join(temp, 'journal.tmp'), encode(journal), {
      flag: 'wx',
      flush: true,
    });
    assertOwned();
    await rename(join(temp, 'journal.tmp'), join(temp, 'journal.json'));
    await writeFile(join(temp, 'project.tmp'), projectBytes, {
      flag: 'wx',
      flush: true,
    });
    assertOwned();
    await rename(join(temp, 'project.tmp'), join(temp, 'project.ready'));
    await withCommitGuard(dir, () => {
      assertOwned();
      const projectPath = join(root, 'project.joplo.json');
      if (before) {
        const current = parseProject(
          JSON.parse(readFileSync(projectPath, 'utf8')),
        );
        checkRevision(current, before.revision);
        if (canonicalJSON(current) !== canonicalJSON(before))
          throw new JoploError('REVISION_CONFLICT', '项目内容已变化');
      } else if (existsSync(projectPath))
        throw new JoploError('PERMISSION_DENIED', '项目已存在');
      for (const f of files) {
        const target = join(root, f.target);
        if (existsSync(target) && hash(readFileSync(target, 'utf8')) !== f.hash)
          throw new JoploError('INVALID_REFERENCE', '不可覆盖不可变文件');
      }
      assertOwned();
      renameSync(join(temp, 'project.ready'), projectPath);
      committed = true;
      promote(root, temp, journal);
      complete = true;
    });
  } catch (e) {
    if (!committed) throw e; // 项目已替换：提交成功，保留自己的 journal 供进程退出后的恢复。
  } finally {
    if (!committed || complete)
      try {
        await rm(temp, { recursive: true, force: true });
      } catch {
        /* 清理不能把已经提交成功的结果改成失败。 */
      }
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
    if (!options.dryRun) await recover(dir, assertOwned);
    const prior = await findReceipt(dir, patch.idempotencyKey, fingerprint);
    if (prior)
      return options.dryRun
        ? {
            ...prior,
            data: {
              ...(prior.data as object),
              dryRun: true,
              replayedReceipt: true,
            },
          }
        : prior;
    const before = await readProject(dir);
    checkRevision(before, patch.expectRevision);
    const applied = applyOperations(before, patch.operations);
    if (canonicalJSON(applied.project) === canonicalJSON(before))
      return result(
        before,
        '变更无实际变化',
        { dryRun: Boolean(options.dryRun), unchanged: true },
        { diagnostics: checkReferences(before) },
      );
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
  for (const file of await committedStaging(dir, p))
    if (/^\.joplo\/revisions\/rev_\d+\.json$/.test(file.target)) {
      const snapshot = parseProject(JSON.parse(file.bytes));
      if (!revisions.has(snapshot.revision))
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
  const target = `.joplo/revisions/rev_${parseRevision(n)}.json`;
  try {
    return parseProject(await readJSON(await safePath(dir, target)));
  } catch (e) {
    if (!(e instanceof JoploError && e.code === 'NOT_FOUND')) throw e;
    const staged = (await committedStaging(dir, p)).find(
      (f) => f.target === target,
    );
    if (staged) return parseProject(JSON.parse(staged.bytes));
    throw e;
  }
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
  const parsed = Restore.safeParse(raw);
  if (!parsed.success)
    throw new JoploError('USAGE', '恢复参数无效', {
      details: parsed.error.issues,
    });
  const opts = parsed.data;
  const fingerprint = hash(
    canonicalJSON({
      type: 'restore',
      revision: parseRevision(opts.revision),
      expectRevision: parseRevision(opts.expectRevision),
      idempotencyKey: opts.idempotencyKey,
    }),
  );
  return withProjectLock(dir, async (assertOwned) => {
    await recover(dir, assertOwned);
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
    await recover(dir, assertOwned);
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
      '\0joplo:internal:init',
      hash(canonicalJSON({ name })),
      receipt,
      assertOwned,
    );
    return receipt;
  });
}
