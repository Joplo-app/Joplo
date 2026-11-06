import { createHash } from 'node:crypto';
import { readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { extname, join, resolve } from 'node:path';
import { assertReviewManifestSize, JoploError, reviewManifest, type ReviewManifest } from '@joplo-app/core';
import type { buildSite } from '@joplo-app/server';
import { checkWithProject } from './check.ts';
import { CloudError, sizeError, terminalText } from './cloud-error.ts';
import { temporaryDirectory } from './cloud-cleanup.ts';
import { embedSnippets, inlineProjectMode, writePreview, type EmbedSnippets, type RenderPreview } from './cloud-embed.ts';
import { prContext, readPrComment, type PrCommentResult, type SharePr } from './cloud-pr.ts';
import { atomicJson, CloudClient, httpUrl, nonempty, object, retryAfterMillis } from './cloud.ts';

/** 客户端 MIME 映射；值与云端公开上传契约一致，不从私有包导入实现。 */
export const CONTENT_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp', '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf',
  '.txt': 'text/plain; charset=utf-8',
};
type File = { path: string; sha256: string; size: number; contentType: string };
const shareId = (v: unknown): v is string => typeof v === 'string' && /^[A-Za-z0-9]{10}$/.test(v);
const validPath = (p: string) => p.length > 0 && p.length <= 512 && !/^[a-z]:/i.test(p) && !/[\\?#%\x00-\x1f\x7f]/.test(p) && p.split('/').every(s => s !== '' && s !== '.' && s !== '..');
export async function manifest(dir: string): Promise<{ files: File[]; blobs: Map<string, string> }> {
  const files: File[] = [], blobs = new Map<string, string>(), invalid: string[] = [];
  async function visit(relative: string) {
    for (const entry of (await readdir(join(dir, relative), { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
      const path = relative ? `${relative}/${entry.name}` : entry.name;
      if (!validPath(path) || entry.isSymbolicLink()) { invalid.push(path); continue; }
      if (entry.isDirectory()) { await visit(path); continue; }
      const contentType = CONTENT_TYPES[extname(path).toLowerCase()];
      if (!entry.isFile() || !contentType) { invalid.push(path); continue; }
      const data = await readFile(join(dir, path)), sha256 = createHash('sha256').update(data).digest('hex');
      files.push({ path, sha256, size: data.length, contentType }); blobs.set(sha256, join(dir, path));
    }
  }
  await visit('');
  if (invalid.length) throw new JoploError('EXPORT_FAILED', `Unsupported output types or paths; nothing uploaded: ${invalid.join(', ')}`, { details: { files: invalid } });
  if (!files.some(f => f.path === 'index.html')) throw new JoploError('EXPORT_FAILED', 'The build is missing index.html');
  return { files, blobs };
}
/**
 * 项目的分享记录 `.joplo/cloud.json`（契约 8.1）：主链接 `{ shareId, url }` 与评审版 `review: { shareId, url }` 是两个分享，互不覆盖。
 * 旧格式（没有 review）照常读取；属于其他 server 的记录视为空，下次写入时整体替换。
 */
export type ShareLink = { shareId: string; url: string };
export type ShareRecord = { main: ShareLink | null; review: ShareLink | null };
const link = (v: unknown): ShareLink | null => { const o = object(v); return shareId(o.shareId) && typeof o.url === 'string' ? { shareId: o.shareId, url: o.url } : null; };
export async function readShareRecord(project: string, server: string): Promise<ShareRecord> {
  try {
    const r = object(JSON.parse(await readFile(join(project, '.joplo/cloud.json'), 'utf8')));
    if (r.server !== server) return { main: null, review: null };
    return { main: link(r), review: link(r.review) };
  } catch { return { main: null, review: null }; }
}
const recordJson = (server: string, r: ShareRecord) => ({ server, ...(r.main ? { shareId: r.main.shareId, url: r.main.url } : {}), ...(r.review ? { review: { shareId: r.review.shareId, url: r.review.url } } : {}) });

export type ShareResult = { shareId: string; url: string; expiresAt: string | null; version: number; embed: EmbedSnippets; mode?: 'review'; pr?: PrCommentResult | null };
export type ShareOptions = { new?: boolean; title?: string; review?: boolean; pr?: number; repo?: string; sha?: string };
export async function share(client: CloudClient, dir: string, opts: ShareOptions, build: typeof buildSite, render: () => Promise<RenderPreview> = async () => { throw new Error('this @joplo-app/server cannot render screenshots'); }): Promise<{ result: ShareResult; plan: 'free' | 'pro' }> {
  if (opts.title !== undefined && (!opts.title.trim() || opts.title.trim().length > 200)) throw new JoploError('USAGE', '--title must contain 1-200 characters');
  if ((opts.repo !== undefined || opts.sha !== undefined) && opts.pr === undefined) throw new JoploError('USAGE', '--repo and --sha apply only with --pr <number>');
  const project = resolve(dir);
  // PR 信息在任何请求、登录和构建之前补全并校验（契约 8.5）
  const pr: SharePr | undefined = opts.pr === undefined ? undefined : await prContext({ pr: opts.pr, repo: opts.repo, sha: opts.sha }, client.env, project, client.deps.pr);
  const reviewMode = opts.review === true ? 'review' : 'publish';
  let auth = await client.auth(true);
  if (!auth) {
    if (!client.interactive) throw new CloudError('AUTH_REQUIRED', undefined, { fix: 'npx joplo login' });
    client.warn('Sharing requires a free Joplo account'); const credentials = await client.login(); client.warn(`Signed in as ${terminalText(credentials.user.email)}. Continuing publication...`);
    auth = { token: credentials.accessToken, source: 'session' };
  }
  const accessToken = auth.token;
  client.warn('Checking the project...');
  const checked = await (client.deps.check ?? checkWithProject)(project);
  if (checked.summary.error) throw new JoploError('INVALID_SCHEMA', `Project validation failed: ${checked.summary.error} error`, { diagnostics: checked.diagnostics });
  // 评审清单（契约 8.1）：从 dev IR 生成，只放进请求体，不作为文件上传。
  // 超过 512 KiB 时：--review 在构建和请求之前失败；普通发布只警告并省略清单（字段可选），发布照常进行
  let review: ReviewManifest | undefined;
  if (checked.project) {
    review = reviewManifest(checked.project, reviewMode);
    try { assertReviewManifestSize(review); }
    catch (e) {
      if (reviewMode === 'review') throw e;
      review = undefined;
      client.warn(`Skipped the review manifest (${e instanceof Error ? e.message.split('.')[0] : 'too large'}). The share is published without it; the review page will not show rules or questions.`);
    }
  } else if (reviewMode === 'review') throw new JoploError('UNSUPPORTED_ACTION', 'share --review needs the compiled project to build the review manifest');
  const temporary = temporaryDirectory(join(tmpdir(), 'joplo-share-'));
  const staging = temporary.path;
  try {
    client.warn('Validation passed. Building the published site...');
    const built = await build({ projectDir: project, outDir: join(staging, 'site'), ...(reviewMode === 'review' ? { review: true } : {}) });
    if (built.diagnostics.some(d => d.severity === 'error')) throw new JoploError('EXPORT_FAILED', 'The build contains errors; nothing uploaded', { diagnostics: built.diagnostics });
    // 评审版必须真的是评审构建（旧版 @joplo-app/server 会忽略 review 选项，只发布选定方案）
    if (reviewMode === 'review' && inlineProjectMode(await readFile(join(built.outDir, 'index.html'), 'utf8')) !== 'review') throw new JoploError('UNSUPPORTED_ACTION', 'This @joplo-app/server cannot build the review site; update joplo and @joplo-app/server to the same version');
    // 预览图（嵌入契约 _joplo/preview.png）：作为普通文件进清单，计入总量和新上传字节；失败只提示一行，不让 share 失败
    const preview = await writePreview(render, project, built.outDir, join(staging, 'preview.png'));
    if (!preview.ok) client.warn(`Skipped the preview image (${terminalText(preview.reason).replace(/[\r\n\t]+/g, ' ')}). The share page will use a generic image.`);
    const { files, blobs } = await manifest(built.outDir);
    const account = await client.me(accessToken);
    const actualBytes = files.reduce((n, f) => n + f.size, 0), largestFiles = [...files].sort((a, b) => b.size - a.size).slice(0, 5).map(({ path, size }) => ({ path, size }));
    // 只有服务器知道哪些 blob 已存在；maxUploadBytes 不能用于预检清单总量。
    if (actualBytes > account.limits.maxTotalBytes || files.length > account.limits.maxFiles) {
      throw sizeError({ kind: actualBytes > account.limits.maxTotalBytes ? 'total' : 'files', maxBytes: account.limits.maxTotalBytes, actualBytes, maxFiles: account.limits.maxFiles, actualFiles: files.length, largestFiles });
    }
    // 评审版只更新评审分享，普通 share 只更新主链接（契约 8.1：评审版永远不覆盖主链接）；PR 预览两者都不碰
    const record = await readShareRecord(project, client.server);
    const slot = reviewMode === 'review' ? 'review' : 'main';
    const replaceShareId = account.plan === 'pro' && !opts.new && !pr ? record[slot]?.shareId : undefined;
    const title = (opts.title ?? checked.name).trim().slice(0, 200);
    const create = (withReview: boolean) => client.retry(() => client.request('/api/v1/shares', accessToken, { title, files, ...(replaceShareId ? { replaceShareId } : {}), ...(withReview && review ? { review } : {}), ...(pr ? { pr } : {}) }), { create: true });
    let prepared: Record<string, unknown>;
    try { prepared = await create(true); }
    catch (e) {
      // 发布顺序容错（契约 8.1）：旧版 SaaS 拒绝 review 字段时返回 400，此时没有创建任何记录；普通发布去掉清单重试一次。
      // 只认真正的 400（413/422 等不重试），--review 没有清单没有意义，照常报错。
      if (!(e instanceof CloudError && e.code === 'BAD_REQUEST' && e.status === 400 && review && reviewMode === 'publish')) throw e;
      client.warn('The cloud rejected the review manifest (HTTP 400). Retrying once without it; the review page will not show rules or questions for this version.');
      prepared = await create(false);
    }
    if (!shareId(prepared.shareId) || !nonempty(prepared.uploadId) || prepared.uploadId.length > 128 || prepared.uploadId.includes(accessToken) || !Array.isArray(prepared.missing)) throw new CloudError('INVALID_RESPONSE');
    // 完整校验所有上传项后才执行第一个 PUT；不允许服务端请求本地清单之外的文件。
    const missing = prepared.missing.map(raw => {
      const m = object(raw), headers = object(m.headers);
      if (!nonempty(m.sha256) || !blobs.has(m.sha256) || !m.headers || Object.values(headers).some(v => typeof v !== 'string') || Object.keys(headers).some(k => /^(authorization|cookie)$/i.test(k))) throw new CloudError('INVALID_RESPONSE');
      const url = httpUrl(m.uploadUrl);
      if (JSON.stringify({ url, headers }).includes(accessToken)) throw new CloudError('INVALID_RESPONSE');
      return { sha256: m.sha256, uploadUrl: url, headers: headers as Record<string, string> };
    });
    client.warn(`Built ${files.length} files (${actualBytes} bytes). Uploading ${missing.length} new objects...`);
    const uploads = new AbortController();
    const upload = async (item: (typeof missing)[number]) => {
      const body = new Uint8Array(await readFile(blobs.get(item.sha256)!));
      await client.retry(async () => {
        let response: Response;
        try {
          // 预签名 PUT 是协议例外：只使用服务端返回的 headers，不添加 bearer 或版本头。
          response = await fetch(item.uploadUrl, { method: 'PUT', headers: item.headers, body, redirect: 'error', signal: AbortSignal.any([AbortSignal.timeout(Math.ceil(30000 + body.byteLength / (100 * 1024) * 1000)), uploads.signal]) });
        } catch { throw new CloudError('NETWORK'); }
        if (!response.ok) {
          // 已知 HTTP 状态优先于正文读取；4xx 的响应中断不能触发重试。
          await response.body?.cancel().catch(() => {});
          if (response.status === 412) return;
          throw new CloudError(response.status >= 500 ? 'NETWORK' : response.status === 403 ? 'UPLOAD_EXPIRED' : response.status === 413 ? 'TOO_LARGE' : 'BAD_REQUEST', undefined, undefined, { afterMs: response.status === 503 ? retryAfterMillis(response.headers.get('retry-after'), client.now()) : undefined });
        }
        try { await response.arrayBuffer(); } catch { throw new CloudError('NETWORK'); }
      }, { signal: uploads.signal });
    };
    // 失败后取消所有在途请求和退避等待；仍等所有 worker 结束再清理目录及 SIGINT 监听器。
    let cursor = 0, failed = false, failure: unknown;
    await Promise.all(Array.from({ length: Math.min(4, missing.length) }, async () => {
      while (!failed && cursor < missing.length) {
        const item = missing[cursor++]!;
        try { await upload(item); } catch (e) { if (!failed) { failed = true; failure = e; uploads.abort(e); } }
      }
    }));
    if (failed) throw failure;
    client.warn('Upload complete. Finalizing publication...');
    const final = await client.retry(() => client.request(`/api/v1/shares/${prepared.shareId}/finalize`, accessToken, { uploadId: prepared.uploadId }));
    if (!shareId(final.shareId) || final.shareId !== prepared.shareId || !Number.isSafeInteger(final.version) || Number(final.version) < 1 || !(final.expiresAt === null || typeof final.expiresAt === 'string' && Number.isFinite(Date.parse(final.expiresAt)))) throw new CloudError('INVALID_RESPONSE');
    const url = httpUrl(final.url);
    const published = { shareId: final.shareId, url, expiresAt: final.expiresAt as string | null, version: final.version as number };
    if (JSON.stringify(published).includes(accessToken)) throw new CloudError('INVALID_RESPONSE');
    // PR 预览是独立链接，不写记录；其余只更新本次的那一项（主链接或评审版），保留另一项
    if (!pr) {
      try { await atomicJson(join(project, '.joplo/cloud.json'), recordJson(client.server, { ...record, [slot]: { shareId: published.shareId, url } })); }
      catch {
        client.warn('Could not save the share record. The next publication will not update this link');
        try { await rm(join(project, '.joplo/cloud.json'), { force: true }); }
        catch { client.warn('Could not delete the old share record. Remove .joplo/cloud.json manually.'); }
      }
    }
    const prComment = pr ? readPrComment(final.pr ?? prepared.pr) : undefined;
    return { result: { ...published, embed: embedSnippets(published.url, title), ...(reviewMode === 'review' ? { mode: 'review' as const } : {}), ...(pr ? { pr: prComment ?? null } : {}) }, plan: account.plan };
  } finally { try { await rm(staging, { recursive: true, force: true }); } finally { temporary.release(); } }
}
