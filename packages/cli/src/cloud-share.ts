import { createHash } from 'node:crypto';
import { readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { extname, join, resolve } from 'node:path';
import { JoploError } from '@joplo-app/core';
import type { buildSite } from '@joplo-app/server';
import { check } from './check.ts';
import { CloudError, sizeError, terminalText } from './cloud-error.ts';
import { temporaryDirectory } from './cloud-cleanup.ts';
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
export type ShareResult = { shareId: string; url: string; expiresAt: string | null; version: number };
export async function share(client: CloudClient, dir: string, opts: { new?: boolean; title?: string }, build: typeof buildSite): Promise<{ result: ShareResult; plan: 'free' | 'pro' }> {
  if (opts.title !== undefined && (!opts.title.trim() || opts.title.trim().length > 200)) throw new JoploError('USAGE', '--title must contain 1-200 characters');
  let credentials = await client.credentials(true);
  if (!credentials) {
    if (!client.interactive) throw new CloudError('AUTH_REQUIRED', undefined, { fix: 'npx joplo login' });
    client.warn('Sharing requires a free Joplo account'); credentials = await client.login(); client.warn(`Signed in as ${terminalText(credentials.user.email)}. Continuing publication...`);
  }
  const accessToken = credentials.accessToken;
  const project = resolve(dir);
  client.warn('Checking the project...');
  const checked = await (client.deps.check ?? check)(project);
  if (checked.summary.error) throw new JoploError('INVALID_SCHEMA', `Project validation failed: ${checked.summary.error} error`, { diagnostics: checked.diagnostics });
  const temporary = temporaryDirectory(join(tmpdir(), 'joplo-share-'));
  const staging = temporary.path;
  try {
    client.warn('Validation passed. Building the published site...');
    const built = await build({ projectDir: project, outDir: join(staging, 'site') });
    if (built.diagnostics.some(d => d.severity === 'error')) throw new JoploError('EXPORT_FAILED', 'The build contains errors; nothing uploaded', { diagnostics: built.diagnostics });
    const { files, blobs } = await manifest(built.outDir);
    const account = await client.me(accessToken);
    const actualBytes = files.reduce((n, f) => n + f.size, 0), largestFiles = [...files].sort((a, b) => b.size - a.size).slice(0, 5).map(({ path, size }) => ({ path, size }));
    // 只有服务器知道哪些 blob 已存在；maxUploadBytes 不能用于预检清单总量。
    if (actualBytes > account.limits.maxTotalBytes || files.length > account.limits.maxFiles) {
      throw sizeError({ kind: actualBytes > account.limits.maxTotalBytes ? 'total' : 'files', maxBytes: account.limits.maxTotalBytes, actualBytes, maxFiles: account.limits.maxFiles, actualFiles: files.length, largestFiles });
    }
    let replaceShareId: string | undefined;
    if (account.plan === 'pro' && !opts.new) {
      try { const previous = object(JSON.parse(await readFile(join(project, '.joplo/cloud.json'), 'utf8'))); if (previous.server === client.server && shareId(previous.shareId)) replaceShareId = previous.shareId; } catch { /* 缺失或损坏元数据时新建 */ }
    }
    const title = (opts.title ?? checked.name).trim().slice(0, 200);
    const prepared = await client.retry(() => client.request('/api/v1/shares', accessToken, { title, files, ...(replaceShareId ? { replaceShareId } : {}) }), { create: true });
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
    try { await atomicJson(join(project, '.joplo/cloud.json'), { server: client.server, shareId: published.shareId, url }); }
    catch {
      client.warn('Could not save the share record. The next publication will not update this link');
      try { await rm(join(project, '.joplo/cloud.json'), { force: true }); }
      catch { client.warn('Could not delete the old share record. Remove .joplo/cloud.json manually.'); }
    }
    return { result: published, plan: account.plan };
  } finally { try { await rm(staging, { recursive: true, force: true }); } finally { temporary.release(); } }
}
