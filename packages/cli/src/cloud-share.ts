import { PUBLIC_UNSUPPORTED } from './share-messages.ts';
import { shareChoices } from './share-choice.ts';
import { createHash } from 'node:crypto';
import { readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { extname, join, resolve } from 'node:path';
import { assertReviewManifestSize, borrowedLine, hasScope, JoploError, resolveScope, reviewManifest, scopeKey, scopeProject, type Project, type ReviewManifest, type ScopeInfo } from '@joplo-app/core';
import type { buildSite } from '@joplo-app/server';
import { checkWithProject } from './check.ts';
import { CloudError, sizeError, terminalText } from './cloud-error.ts';
import { temporaryDirectory } from './cloud-cleanup.ts';
import { embedSnippets, inlineProject, inlineProjectMode, writePreview, type EmbedSnippets, type RenderPreview } from './cloud-embed.ts';
import { prContext, readPrComment, type PrCommentResult, type SharePr } from './cloud-pr.ts';
import { atomicJson, CloudClient, httpUrl, nonempty, object, readStorage, retryAfterMillis } from './cloud.ts';

/** 客户端 MIME 映射；值与云端公开上传契约一致，不从私有包导入实现。 */
export const CONTENT_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp', '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf',
  '.txt': 'text/plain; charset=utf-8',
  // 朗读音频（D74，build 写进 voice/）；云端分享契约需同时接受这些类型
  '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.ogg': 'audio/ogg', '.flac': 'audio/flac', '.m4a': 'audio/mp4', '.aac': 'audio/aac',
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
 * 范围分享（D75）每个范围一条，记在 `scoped: { <范围键>: { shareId, url } }`，也不覆盖主链接和评审链接。
 * 旧格式（没有 review / scoped）照常读取；属于其他 server 的记录视为空，下次写入时整体替换。
 */
export type Visibility = 'public' | 'private';
export type Portfolio = { workUrl: string | null; profileUrl: string | null; needsUsername: boolean; setupPath: string };
export type ShareLink = { shareId: string; url: string; visibility?: Visibility };
export function readPortfolio(value: unknown): Portfolio | undefined {
  const p = object(value);
  if (typeof p.needsUsername !== 'boolean' || typeof p.setupPath !== 'string' || !/^\/(?!\/)[^\s\\]*$/.test(p.setupPath)) return;
  const url = (v: unknown) => {
    if (v === null) return true;
    if (typeof v !== 'string') return false;
    try { const u = new URL(v); return ['https:', 'http:'].includes(u.protocol) && !u.username && !u.password; } catch { return false; }
  };
  if (!url(p.workUrl) || !url(p.profileUrl)) return;
  return { workUrl: p.workUrl as string | null, profileUrl: p.profileUrl as string | null, needsUsername: p.needsUsername, setupPath: p.setupPath };
}
export type ShareRecord = { main: ShareLink | null; review: ShareLink | null; scoped?: Record<string, ShareLink> };
const link = (v: unknown): ShareLink | null => { const o = object(v); return shareId(o.shareId) && typeof o.url === 'string' ? { shareId: o.shareId, url: o.url, ...(['public', 'private'].includes(String(o.visibility)) ? { visibility: o.visibility as Visibility } : {}) } : null; };
const validKey = (key: string) => key.length > 0 && key.length <= 4096;
const links = (v: unknown): Record<string, ShareLink> => Object.fromEntries(Object.entries(object(v)).map(([key, x]) => [key, link(x)] as const).filter((e): e is [string, ShareLink] => e[1] !== null && validKey(e[0])));
export async function readShareRecord(project: string, server: string): Promise<ShareRecord> {
  try {
    const r = object(JSON.parse(await readFile(join(project, '.joplo/cloud.json'), 'utf8')));
    if (r.server !== server) return { main: null, review: null };
    const scoped = links(r.scoped);
    return { main: link(r), review: link(r.review), ...(Object.keys(scoped).length ? { scoped } : {}) };
  } catch { return { main: null, review: null }; }
}
const recordJson = (server: string, r: ShareRecord) => ({
  server,
  ...(r.main ? r.main : {}),
  ...(r.review ? { review: r.review } : {}),
  ...(r.scoped && Object.keys(r.scoped).length ? { scoped: Object.fromEntries(Object.entries(r.scoped).map(([key, l]) => [key, l])) } : {}),
});

export type ShareResult = { visibility?: Visibility; portfolio?: Portfolio; review?: ShareResult; shareId: string; url: string; expiresAt: string | null; version: number; embed: EmbedSnippets; mode?: 'review'; pr?: PrCommentResult | null; /** 范围分享（D75）：范围、借用了哪些别的功能的内容。 */ scope?: ScopeInfo; /** 发布后的账号容量与这次大小（C27）；旧服务器不返回。 */ storage?: { usedBytes: number; quotaBytes: number; shareBytes: number } };
/** scenarios / features：按场景保密分享（D75，`--scenario` / `--feature`），可以一起用；都不写时分享整个项目。 */
/** update（D84）：要更新的已有分享的链接；没有 .joplo/cloud.json 时（例如换了一台电脑）用它指定，并从它沿用朗读音频。 */
export type ShareOptions = { public?: boolean; private?: boolean; new?: boolean; title?: string; review?: boolean; pr?: number; repo?: string; sha?: string; scenarios?: string[]; features?: string[]; update?: string };

/** `--update <链接>`：分享页链接，路径里有 /s/<10 位分享 id>。 */
export function parseUpdateLink(v: string): ShareLink {
  let u: URL;
  try { u = new URL(v); } catch { throw new JoploError('USAGE', `--update needs the share link, for example https://joplo.app/s/AbCdE12345/; got ${JSON.stringify(v)}`); }
  const m = /\/s\/([A-Za-z0-9]{10})(?:\/|$)/.exec(u.pathname);
  if (!m || !['https:', 'http:'].includes(u.protocol)) throw new JoploError('USAGE', `--update needs the share link, for example https://joplo.app/s/AbCdE12345/; got ${JSON.stringify(v)}`);
  return { shareId: m[1]!, url: `${u.origin}${u.pathname.slice(0, m.index)}/s/${m[1]}/` };
}
export async function share(client: CloudClient, dir: string, opts: ShareOptions, build: typeof buildSite, render: () => Promise<RenderPreview> = async () => { throw new Error('this @joplo-app/server cannot render screenshots'); }): Promise<{ result: ShareResult; plan: 'free' | 'pro' }> {
  const choices = await shareChoices(client, opts);
  if (opts.title !== undefined && (!opts.title.trim() || opts.title.trim().length > 200)) throw new JoploError('USAGE', '--title must contain 1-200 characters');
  if ((opts.repo !== undefined || opts.sha !== undefined) && opts.pr === undefined) throw new JoploError('USAGE', '--repo and --sha apply only with --pr <number>');
  if (opts.update !== undefined && (opts.new || opts.pr !== undefined)) throw new JoploError('USAGE', '--update cannot be combined with --new or --pr');
  if (opts.update !== undefined) parseUpdateLink(opts.update);
  let checked: Awaited<ReturnType<typeof checkWithProject>> | undefined;
  let mainOptions = { ...opts, review: false };
  if (choices.review) {
    checked = await (client.deps.check ?? checkWithProject)(resolve(dir)) as Awaited<ReturnType<typeof checkWithProject>>;
    if (checked.summary.error) throw new JoploError('INVALID_SCHEMA', `Project validation failed: ${checked.summary.error} error`, { diagnostics: checked.diagnostics });
    if (!checked.project) throw new JoploError('UNSUPPORTED_ACTION', 'share --review needs the compiled project to build the review manifest');
    const request = { scenarios: opts.scenarios ?? [], features: opts.features ?? [] };
    const ids = hasScope(request) ? resolveScope(checked.project, request, 'review') : undefined;
    assertReviewManifestSize(reviewManifest(ids ? scopeProject(checked.project, ids, 'review').project : checked.project, 'review'));
    if (ids) {
      // 先按 review 校验完整范围，再筛选普通版：未选方案只能出现在独立私密评审里。
      const project = checked.project;
      const picked = ids.filter(id => {
        const option = project.options[project.scenarios[id]!.optionId];
        return option && project.features[option.featureId]?.pick === option.id;
      });
      if (!picked.length) {
        client.warn('The scope has no picked scenarios. Publishing only the private review version; the ordinary share and --update target are unchanged.');
        return publishShare(client, dir, { ...opts, review: true, update: undefined }, 'private', build, render, checked);
      }
      mainOptions = { ...mainOptions, scenarios: picked, features: [] };
    }
  }
  const result = await publishShare(client, dir, mainOptions, choices.visibility, build, render, checked);
  if (choices.review) {
    // 两条独立链接：主分享先成功并持久化；评审失败时保留主链接并给出恢复入口。
    try {
      const reviewed = await publishShare(client, dir, { ...opts, review: true, update: undefined }, 'private', build, render, checked);
      result.result.review = reviewed.result;
      if (reviewed.result.storage) result.result.storage = reviewed.result.storage;
    } catch (e) {
      client.warn(`The main share is already published: ${result.result.url}. The review publication failed; rerun with the same visibility and --review to retry.`);
      throw e;
    }
  }
  return result;
}

async function publishShare(client: CloudClient, dir: string, opts: ShareOptions, visibility: Visibility, build: typeof buildSite, render: () => Promise<RenderPreview>, prechecked?: Awaited<ReturnType<typeof checkWithProject>>): Promise<{ result: ShareResult; plan: 'free' | 'pro' }> {
  const updateLink = opts.update !== undefined ? parseUpdateLink(opts.update) : undefined;
  const project = resolve(dir);
  // PR 信息在任何请求、登录和构建之前补全并校验（契约 8.5）
  const pr: SharePr | undefined = opts.pr === undefined ? undefined : await prContext({ pr: opts.pr, repo: opts.repo, sha: opts.sha }, client.env, project, client.deps.pr);
  const reviewMode = opts.review === true ? 'review' : 'publish';
  const scopeRequest = { scenarios: opts.scenarios ?? [], features: opts.features ?? [] };
  const scoped = hasScope(scopeRequest);
  let auth = await client.auth(true);
  if (!auth) {
    if (!client.interactive) throw new CloudError('AUTH_REQUIRED', undefined, { fix: 'npx joplo login' });
    client.warn('Sharing requires a free Joplo account'); const credentials = await client.login(); client.warn(`Signed in as ${terminalText(credentials.user.email)}. Continuing publication...`);
    auth = { token: credentials.accessToken, source: 'session' };
  }
  const accessToken = auth.token;
  client.warn('Checking the project...');
  const checked = prechecked ?? await (client.deps.check ?? checkWithProject)(project);
  if (checked.summary.error) throw new JoploError('INVALID_SCHEMA', `Project validation failed: ${checked.summary.error} error`, { diagnostics: checked.diagnostics });
  // 评审清单（契约 8.1）：从 dev IR 生成，只放进请求体，不作为文件上传。
  // 超过 512 KiB 时：--review 在构建和请求之前失败；普通发布只警告并省略清单（字段可选），发布照常进行
  // 范围（D75）：在 dev IR 上解析，写错场景 / 功能、没有选定方案时在构建和任何请求之前失败
  let scenarioIds: string[] | undefined;
  if (scoped) {
    if (!checked.project) throw new JoploError('UNSUPPORTED_ACTION', 'share --scenario / --feature needs the compiled project to resolve the scope');
    scenarioIds = resolveScope(checked.project, scopeRequest, reviewMode);
  }
  let review: ReviewManifest | undefined;
  if (checked.project) {
    // 评审清单也只含范围内的功能、方案、场景及其规则、问题、情况
    review = reviewManifest(scenarioIds ? scopeProject(checked.project, scenarioIds, reviewMode).project : checked.project, reviewMode);
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
    // 重新发布（D84）：上一次的分享里已有的音频（同样的文字和声音）直接沿用，换一台电脑也不用重新生成
    const before = await readShareRecord(project, client.server);
    const beforeLink = updateLink ?? (scenarioIds ? before.scoped?.[scopeKey(scenarioIds, reviewMode)] : before[reviewMode === 'review' ? 'review' : 'main']);
    const sharedVoice = beforeLink ? await (client.deps.sharedVoice ?? previousShareVoice)(beforeLink.url) : undefined;
    const built = await build({ projectDir: project, outDir: join(staging, 'site'), ...(reviewMode === 'review' ? { review: true } : {}), ...(scenarioIds ? { scope: { scenarios: scenarioIds } } : {}), ...(sharedVoice ? { sharedVoice } : {}) });
    if (built.diagnostics.some(d => d.severity === 'error')) throw new JoploError('EXPORT_FAILED', 'The build contains errors; nothing uploaded', { diagnostics: built.diagnostics });
    // 范围分享必须真的裁剪过（旧版 @joplo-app/server 会忽略 scope，产物里是整个项目）：产物里的场景只能是范围内的
    if (scenarioIds) {
      const inlined = inlineProject(await readFile(join(built.outDir, 'index.html'), 'utf8'));
      const allowed = new Set(scenarioIds);
      if (!built.scope || !inlined || Object.keys(inlined.scenarios ?? {}).some(id => !allowed.has(id))) throw new JoploError('UNSUPPORTED_ACTION', 'This @joplo-app/server cannot build scoped sites; nothing uploaded. Update joplo and @joplo-app/server to the same version');
      for (const b of built.scope.borrowed) client.warn(`Borrowed from another feature: ${terminalText(borrowedLine(b))}. Only this is included; the feature's name, scenarios, and other elements are not. To leave it out, change the scenario so it no longer references it.`);
    }
    // 评审版必须真的是评审构建（旧版 @joplo-app/server 会忽略 review 选项，只发布选定方案）
    if (reviewMode === 'review' && inlineProjectMode(await readFile(join(built.outDir, 'index.html'), 'utf8')) !== 'review') throw new JoploError('UNSUPPORTED_ACTION', 'This @joplo-app/server cannot build the review site; update joplo and @joplo-app/server to the same version');
    // 预览图（嵌入契约 _joplo/preview.png）：作为普通文件进清单，计入总量和新上传字节；失败只提示一行，不让 share 失败
    const preview = await writePreview(render, project, built.outDir, join(staging, 'preview.png'), scenarioIds);
    if (!preview.ok) client.warn(`Skipped the preview image (${terminalText(preview.reason).replace(/[\r\n\t]+/g, ' ')}). The share page will use a generic image.`);
    const voiceLine = voiceSummary(built.voice);
    if (voiceLine) client.warn(voiceLine);
    const { files, blobs } = await manifest(built.outDir);
    const account = await client.me(accessToken);
    const actualBytes = files.reduce((n, f) => n + f.size, 0), largestFiles = [...files].sort((a, b) => b.size - a.size).slice(0, 5).map(({ path, size }) => ({ path, size }));
    // 只有服务器知道哪些 blob 已存在；maxUploadBytes 不能用于预检清单总量。
    if (actualBytes > account.limits.maxTotalBytes || files.length > account.limits.maxFiles) {
      throw sizeError({ kind: actualBytes > account.limits.maxTotalBytes ? 'total' : 'files', maxBytes: account.limits.maxTotalBytes, actualBytes, maxFiles: account.limits.maxFiles, actualFiles: files.length, largestFiles });
    }
    // 评审版只更新评审分享，普通 share 只更新主链接（契约 8.1：评审版永远不覆盖主链接）；PR 预览两者都不碰
    const record = before;
    const slot = reviewMode === 'review' ? 'review' : 'main';
    // 范围分享单独一条（键 = 排序后的场景 id，评审版加前缀），不碰主链接和评审链接
    const key = scenarioIds ? scopeKey(scenarioIds, reviewMode) : null;
    const previous = updateLink ?? (key ? record.scoped?.[key] : record[slot]);
    // C27：免费账号也更新同一个链接（链接不再过期；每次新建既浪费容量也堆满作品集）；--new 与 PR 预览照旧新建
    const replaceShareId = !opts.new && !pr ? previous?.shareId : undefined;
    const firstName = scenarioIds && checked.project ? checked.project.scenarios[scenarioIds[0]!]?.name : undefined;
    const defaultTitle = scenarioIds ? `${checked.name} · ${scenarioIds.length === 1 && firstName ? firstName : `${scenarioIds.length} scenarios`}` : checked.name;
    const title = (opts.title ?? defaultTitle).trim().slice(0, 200);
    // 记录只用于 wire 兼容，不替用户选择：仅已知 public → private 的更新需要显式取消公开。
    const known = [record.main, record.review, ...Object.values(record.scoped ?? {})].find(l => l?.shareId === replaceShareId);
    const sendVisibility = visibility === 'public' || !!replaceShareId && known?.visibility === 'public';
    const create = (withReview: boolean) => client.retry(() => client.request('/api/v1/shares', accessToken, { title, files, ...(replaceShareId ? { replaceShareId } : {}), ...(withReview && review ? { review } : {}), ...(pr ? { pr } : {}), ...(sendVisibility ? { visibility } : {}) }), { create: true });
    let prepared: Record<string, unknown>;
    try { prepared = await create(true); }
    catch (e) {
      if (e instanceof CloudError && e.status === 400 && sendVisibility && object(e.details).unknownVisibility) throw new CloudError('BAD_REQUEST', PUBLIC_UNSUPPORTED, undefined, undefined, 400);
      // 发布顺序容错（契约 8.1）：旧版 SaaS 拒绝 review 字段时返回 400，此时没有创建任何记录；普通发布去掉清单重试一次。
      // 只认真正的 400（413/422 等不重试），--review 没有清单没有意义，照常报错。
      if (!(e instanceof CloudError && e.code === 'BAD_REQUEST' && e.status === 400 && review && reviewMode === 'publish')) throw e;
      client.warn('The cloud rejected the review manifest (HTTP 400). Retrying once without it; the review page will not show rules or questions for this version.');
      prepared = await create(false);
    }
    client.warn(`Built ${files.length} files (${actualBytes} bytes).`);
    const { published, final } = await uploadPreparedFiles(client, accessToken, prepared, blobs);
    const url = published.url;
    // PR 预览是独立链接，不写记录；其余只更新本次的那一项（主链接或评审版），保留另一项
    if (!pr) {
      const next: ShareRecord = key ? { ...record, scoped: { ...record.scoped, [key]: { shareId: published.shareId, url, ...(published.visibility ? { visibility: published.visibility } : {}) } } } : { ...record, [slot]: { shareId: published.shareId, url, ...(published.visibility ? { visibility: published.visibility } : {}) } };
      try { await atomicJson(join(project, '.joplo/cloud.json'), recordJson(client.server, next)); }
      catch {
        client.warn('Could not save the share record. The next publication will not update this link');
        try { await rm(join(project, '.joplo/cloud.json'), { force: true }); }
        catch { client.warn('Could not delete the old share record. Remove .joplo/cloud.json manually.'); }
      }
    }
    const prComment = pr ? readPrComment(final.pr ?? prepared.pr) : undefined;
    return { result: { ...published, ...(readPortfolio(final.portfolio) ? { portfolio: readPortfolio(final.portfolio) } : {}), embed: embedSnippets(published.url, title), ...(reviewMode === 'review' ? { mode: 'review' as const } : {}), ...(pr ? { pr: prComment ?? null } : {}), ...(built.scope ? { scope: built.scope } : {}), ...(readStorage(final.storage, ['shareBytes']) ? { storage: readStorage(final.storage, ['shareBytes'])! } : {}) }, plan: account.plan };
  } finally { try { await rm(staging, { recursive: true, force: true }); } finally { temporary.release(); } }
}

/**
 * 朗读音频（D74）的一行说明：带上了几段、多大；还有几步没有当前声音的音频（观众端这些步骤用浏览器朗读，不阻止分享）。
 * 没有选用声音供应商时为 null（不打扰）。
 */
export function voiceSummary(v: { clips: number; bytes: number; missing: number; profile: string | null; reused?: number; locales?: Record<string, { missing: number }> } | undefined): string | null {
  if (!v || !v.profile) return null;
  const kb = Math.max(1, Math.round(v.bytes / 1024));
  const reused = v.reused ? `, ${v.reused} reused from the previous share` : '';
  const head = v.clips ? `Narration: ${v.clips} audio clip(s) from ${v.profile} (${kb} KB${reused}) included` : `Narration: no generated audio from ${v.profile} yet`;
  // 内容多语言（D84）：按语言列出还缺几步
  const per = v.locales ? Object.entries(v.locales).filter(([, x]) => x.missing).map(([l, x]) => `${l} ${x.missing}`).join(', ') : '';
  return v.missing ? `${head}; ${v.missing} step(s) have no audio for the current text${per ? ` (${per})` : ''} and will use the viewer's browser voice. Generate them in the board (Voice → Generate) to include them.` : `${head}.`;
}

type SharedVoice = { index: NonNullable<Project['voiceIndex']>; fetch: (file: string) => Promise<Uint8Array | null> };
const MAX_SHARED_CLIP = 20 * 1024 * 1024;
/**
 * 读上一次发布的分享里的朗读音频（D84）：公开分享页内联的 voiceIndex（片段键 → voice/<sha256>.<ext>），以及按相对路径下载文件。
 * 只接受 https（本机测试服务可以是 http://127.0.0.1）；任何失败都当作没有，不影响分享。下载的文件由服务端按 sha256 校验后才收下。
 */
export async function previousShareVoice(url: string, fetchImpl: typeof fetch = fetch): Promise<SharedVoice | undefined> {
  let base: URL;
  try { base = new URL(url); } catch { return undefined; }
  if (base.protocol !== 'https:' && !(base.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(base.hostname))) return undefined;
  try {
    const res = await fetchImpl(base, { redirect: 'error', signal: AbortSignal.timeout(10_000) });
    if (!res.ok) return undefined;
    const index = (inlineProject(await res.text()) as { voiceIndex?: unknown } | null)?.voiceIndex as SharedVoice['index'] | undefined;
    if (!index || typeof index !== 'object' || !index.clips || !Object.keys(index.clips).length) return undefined;
    return {
      index,
      fetch: async (file) => {
        if (!/^voice\/[0-9a-f]{64}\.(mp3|wav|ogg|flac|m4a|aac)$/.test(file)) return null;
        const r = await fetchImpl(new URL(file, base), { redirect: 'error', signal: AbortSignal.timeout(30_000) });
        if (!r.ok || Number(r.headers.get('content-length') ?? 0) > MAX_SHARED_CLIP) return null;
        const body = new Uint8Array(await r.arrayBuffer());
        return body.byteLength > MAX_SHARED_CLIP ? null : body;
      },
    };
  } catch { return undefined; }
}

/** Shared content-addressed upload/finalize path; no project execution. */
export async function uploadPreparedFiles(client: CloudClient, accessToken: string, prepared: Record<string, unknown>, blobs: Map<string, string>) {
  if (!shareId(prepared.shareId) || !nonempty(prepared.uploadId) || prepared.uploadId.length > 128 || prepared.uploadId.includes(accessToken) || !Array.isArray(prepared.missing)) throw new CloudError('INVALID_RESPONSE');
  // 完整校验所有上传项后才执行第一个 PUT；不允许服务端请求本地清单之外的文件。
  const missing = prepared.missing.map(raw => {
    const m = object(raw), headers = object(m.headers);
    if (!nonempty(m.sha256) || !blobs.has(m.sha256) || !m.headers || Object.values(headers).some(v => typeof v !== 'string') || Object.keys(headers).some(k => /^(authorization|cookie)$/i.test(k))) throw new CloudError('INVALID_RESPONSE');
    const url = httpUrl(m.uploadUrl);
    if (JSON.stringify({ url, headers }).includes(accessToken)) throw new CloudError('INVALID_RESPONSE');
    return { sha256: m.sha256, uploadUrl: url, headers: headers as Record<string, string> };
  });
  client.warn(`Uploading ${missing.length} new objects...`);
  const uploads = new AbortController();
  const upload = async (item: (typeof missing)[number]) => {
    const body = new Uint8Array(await readFile(blobs.get(item.sha256)!));
    if (createHash('sha256').update(body).digest('hex') !== item.sha256) throw new JoploError('EXPORT_FAILED', 'Artifact changed after preparation; nothing finalized. Rebuild and retry');
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
  const published = { shareId: final.shareId, url, expiresAt: final.expiresAt as string | null, version: final.version as number, ...(['public', 'private'].includes(String(final.visibility)) ? { visibility: final.visibility as Visibility } : {}) };
  if (JSON.stringify(published).includes(accessToken)) throw new CloudError('INVALID_RESPONSE');
  return { published, final };
}
