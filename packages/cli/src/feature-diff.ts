import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';
import { readFeatureDiffBuild, canonical, featureDiff, FeatureDiffManifest, GitSha, JoploError } from '@joplo-app/core';
import { CloudClient } from './cloud.ts';
import { CloudError, sizeError } from './cloud-error.ts';
import { manifest, uploadPreparedFiles } from './cloud-share.ts';
import { prContext, prCommentLine, readPrComment, type SharePr } from './cloud-pr.ts';

const Prepared = z.strictObject({ comparisonId: z.string().min(1).max(200), generation: z.number().int().positive(), baseSha: GitSha, headSha: GitSha });
const Receipt = z.strictObject({ formatVersion: z.literal(1), server: z.string().url(), pr: z.strictObject({ provider: z.literal('github'), repo: z.string(), number: z.number().int().positive(), headSha: GitSha, runUrl: z.string().nullable() }), prepared: Prepared });
export type ComparisonReceipt = z.infer<typeof Receipt>;
export type ComparisonOptions = { pr: number; repo?: string; sha?: string };
export async function prepareComparison(client: CloudClient, opts: ComparisonOptions & { baseSha: string; out: string }): Promise<ComparisonReceipt> {
  const pr = await prContext(opts, client.env, process.cwd(), client.deps.pr);
  pr.repo = pr.repo.toLowerCase();
  const baseSha = GitSha.safeParse(opts.baseSha);
  if (!baseSha.success) throw new JoploError('USAGE', '--base-sha must be a normalized 40-character git SHA');
  // Avoid allocating another generation when the output would overwrite a previous receipt.
  try { await readFile(opts.out); throw new JoploError('USAGE', 'Prepare output already exists; choose a new receipt file'); }
  catch (e) { if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e; }
  const auth = await client.requireAuth();
  const raw = await client.request('/api/v1/pr-comparisons/prepare', auth.token, { provider: 'github', repo: pr.repo, number: pr.number, baseSha: baseSha.data, headSha: pr.headSha });
  const parsed = Prepared.safeParse(raw);
  if (!parsed.success || parsed.data.headSha !== pr.headSha || JSON.stringify(parsed.data).includes(auth.token)) throw new CloudError('INVALID_RESPONSE');
  const receipt: ComparisonReceipt = { formatVersion: 1, server: client.server, pr, prepared: parsed.data };
  await writeFile(opts.out, JSON.stringify(receipt, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
  return receipt;
}
export async function readComparisonReceipt(file: string): Promise<ComparisonReceipt> {
  try { return Receipt.parse(JSON.parse(await readFile(file, 'utf8'))); }
  catch { throw new JoploError('INVALID_SCHEMA', 'Invalid prepare receipt. Run joplo diff prepare again and rebuild using its returned baseline'); }
}

/** Validate only data. Never load TSX, package.json, build scripts or configuration from artifacts. */
export async function publishComparison(client: CloudClient, dir: string, opts: ComparisonOptions & { prepared: string; title?: string }) {
  const receipt = await readComparisonReceipt(opts.prepared);
  const pr: SharePr = await prContext(opts, client.env, process.cwd(), client.deps.pr);
  pr.repo = pr.repo.toLowerCase();
  if (client.server !== receipt.server || canonical([pr.provider, pr.repo, pr.number, pr.headSha]) !== canonical([receipt.pr.provider, receipt.pr.repo, receipt.pr.number, receipt.pr.headSha])) throw new JoploError('USAGE', 'Prepare receipt does not match this server, repository, PR or head');
  const { files, blobs } = await manifest(dir);
  if (files.some(f => f.path !== 'index.html' && f.path !== 'feature-diff.json' && !/^(before|after)\/(index\.html|(?:assets|fonts|voice|_joplo)\/.+)$/.test(f.path))) throw new JoploError('INVALID_SCHEMA', 'Diff bundle contains files outside the public viewer and version builds');
  const readArtifact = async (path: string) => {
    const entry = files.find(f => f.path === path);
    const bytes = await readFile(join(dir, path));
    if (!entry || createHash('sha256').update(bytes).digest('hex') !== entry.sha256) throw new JoploError('INVALID_SCHEMA', 'Artifact changed during validation; rebuild and retry');
    return bytes.toString('utf8');
  };
  const file = files.find(f => f.path === 'feature-diff.json');
  if (!file) throw new JoploError('INVALID_SCHEMA', 'Missing feature-diff.json');
  let m: FeatureDiffManifest;
  try { m = FeatureDiffManifest.parse(JSON.parse(await readArtifact(file.path))); }
  catch { throw new JoploError('INVALID_SCHEMA', 'Invalid feature diff manifest'); }
  if (m.base.sha !== receipt.prepared.baseSha || m.head.sha !== receipt.prepared.headSha) throw new JoploError('INVALID_SCHEMA', 'Build SHA does not match the pinned prepare baseline/head. Rebuild using prepare output');
  if (m.status === 'incompatible') throw new JoploError('UNSUPPORTED_SCHEMA_VERSION', 'Cannot publish incompatible builds. Rebuild both versions with compatible Joplo versions');
  if (!files.some(f => f.path === 'before/index.html') || !files.some(f => f.path === 'after/index.html')) throw new JoploError('INVALID_SCHEMA', 'Both real version builds are required');
  const beforeHtml = await readArtifact('before/index.html'), afterHtml = await readArtifact('after/index.html');
  if (![beforeHtml, afterHtml].every(html => html.includes('<meta name="joplo-feature-diff-player" content="1">'))) throw new JoploError('UNSUPPORTED_SCHEMA_VERSION', 'Rebuild both source versions with the fixed diff-capable CLI; older players cover the initial state');
  const b = readFeatureDiffBuild(beforeHtml), a = readFeatureDiffBuild(afterHtml);
  if (!b || !a || canonical(m) !== canonical(featureDiff(b, a, { baseSha: receipt.prepared.baseSha, headSha: receipt.prepared.headSha }))) throw new JoploError('INVALID_SCHEMA', 'Manifest does not describe the supplied builds. Rebuild the diff bundle');
  const root = await readArtifact('index.html');
  const embedded = /<script type="application\/json" id="joplo-feature-diff">([\s\S]*?)<\/script>/.exec(root);
  if (!embedded || canonical(JSON.parse(embedded[1]!)) !== canonical(m)) throw new JoploError('INVALID_SCHEMA', 'Root viewer does not match the manifest');
  if (opts.title !== undefined && (!opts.title.trim() || opts.title.length > 200)) throw new JoploError('USAGE', '--title must contain 1-200 characters');
  const auth = await client.requireAuth();
  const account = await client.me(auth.token);
  const actualBytes = files.reduce((n, f) => n + f.size, 0);
  if (actualBytes > account.limits.maxTotalBytes || files.length > account.limits.maxFiles) throw sizeError({ kind: files.length > account.limits.maxFiles ? 'files' : 'total', maxBytes: account.limits.maxTotalBytes, actualBytes, actualFiles: files.length, maxFiles: account.limits.maxFiles, largestFiles: [...files].sort((a, b) => b.size - a.size).slice(0, 5) });
  const comparison = { ...receipt.prepared, manifestPath: 'feature-diff.json', manifestSha256: file.sha256, summary: m.summary };
  const prepared = await client.retry(() => client.request('/api/v1/shares', auth.token, { title: opts.title?.trim() ?? 'PR feature diff', files, pr, comparison }), { create: true });
  // No review manifest, replaceShareId, project record, or compatibility fallback.
  const { published, final } = await uploadPreparedFiles(client, auth.token, prepared, blobs);
  const comment = readPrComment(final.pr ?? prepared.pr);
  const notice = comment ? prCommentLine(comment, client.server) : null;
  if (notice) client.warn(notice);
  return { ...published, comparison, pr: comment };
}
