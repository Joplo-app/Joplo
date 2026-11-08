/** Trusted CI publisher. Artifacts are read as bytes/JSON, never imported or executed. */
import { appendFile, lstat, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { JoploError, readFeatureDiffBuild, readPublicProject } from '@joplo-app/core';
import { CloudClient } from '../../packages/cli/src/cloud.ts';
import { CLOUD_MESSAGES, CloudError, sizeError } from '../../packages/cli/src/cloud-error.ts';
import { manifest, uploadPreparedFiles } from '../../packages/cli/src/cloud-share.ts';

export type MainDesignOptions = { shareId: string; title: string; assertCurrent?: () => Promise<void> };
const SHARE_ID = /^[A-Za-z0-9]{10}$/;
const invalidArtifact = () => new JoploError('INVALID_SCHEMA', 'Expected a standalone public Joplo build without private attachments');

// Limit this dedicated publisher to the actual static build surface. JSON review
// attachments, authoring files and nested HTML are not part of that surface.
function publicAsset(path: string): boolean {
  return path === 'index.html' || path === '_joplo/preview.png' ||
    /^assets\/.+\.(?:css|js|mjs|png|jpg|jpeg|gif|webp|svg|woff2|woff|ttf)$/i.test(path) ||
    /^fonts\/(?:[^/]+\.(?:woff2|woff|ttf)|(?:OFL|LICENSE)[A-Za-z0-9_.-]*\.txt)$/i.test(path) ||
    /^voice\/[a-f0-9]{64}\.(?:mp3|wav|ogg|flac|m4a|aac)$/i.test(path);
}

function validatePublicHtml(html: string): void {
  const jsonScripts = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)]
    .filter(([, attrs]) => /\btype\s*=\s*(?:"application\/json"|'application\/json'|application\/json(?=\s|$))/i.test(attrs!));
  let home: unknown;
  const ids = new Set<string>();
  for (const [, attrs, content] of jsonScripts) {
    const match = /\bid\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\s"'=<>`]+))/i.exec(attrs!);
    const id = match?.[1] ?? match?.[2] ?? match?.[3];
    if (id !== 'joplo-ir' && id !== 'joplo-step-keys' || ids.has(id)) throw invalidArtifact();
    ids.add(id);
    if (id === 'joplo-ir') {
      // This is the HTML transport envelope only; Core owns the business schema.
      let envelope: unknown;
      try { envelope = JSON.parse(content!); } catch { throw invalidArtifact(); }
      if (!envelope || typeof envelope !== 'object' || Array.isArray(envelope) ||
          Object.keys(envelope).some(k => !['project', 'home', 'scoped'].includes(k))) throw invalidArtifact();
      const value = envelope as Record<string, unknown>;
      home = value.home;
      if (home !== undefined && home !== null && typeof home !== 'string' ||
          value.scoped !== undefined && value.scoped !== true) throw invalidArtifact();
    }
  }
  // Reads exactly one inert IR and validates optional identity metadata. Strict
  // public-project validation rejects dev/review IR and private authoring fields.
  const project = readPublicProject(readFeatureDiffBuild(html));
  if (typeof home === 'string' && !Object.hasOwn(project.routes, home)) throw invalidArtifact();
}

async function current(assertCurrent?: () => Promise<void>): Promise<void> {
  try { await assertCurrent?.(); }
  catch { throw new JoploError('REVISION_CONFLICT', 'Main changed or could not be verified; nothing finalized'); }
}

export async function publishMainDesign(client: CloudClient, siteDir: string, options: MainDesignOptions) {
  if (!SHARE_ID.test(options.shareId) || !options.title.trim() || options.title.trim().length > 200)
    throw new JoploError('USAGE', 'A fixed share ID and a 1–200 character title are required');
  const root = resolve(siteDir);
  const dir = await lstat(root);
  if (!dir.isDirectory() || dir.isSymbolicLink()) throw invalidArtifact();
  const { files, blobs } = await manifest(root); // rejects dangerous paths and nested symlinks
  if (files.some(file => !publicAsset(file.path))) throw invalidArtifact();
  const index = files.find(file => file.path === 'index.html')!;
  const bytes = await readFile(blobs.get(index.sha256)!);
  if (createHash('sha256').update(bytes).digest('hex') !== index.sha256) throw invalidArtifact();
  validatePublicHtml(bytes.toString('utf8'));
  await current(options.assertCurrent);
  const auth = await client.requireAuth();
  const account = await client.me(auth.token);
  if (account.plan !== 'pro') throw new CloudError('PLAN_REQUIRED');
  const actualBytes = files.reduce((sum, file) => sum + file.size, 0);
  if (actualBytes > account.limits.maxTotalBytes || files.length > account.limits.maxFiles)
    throw sizeError({
      kind: actualBytes > account.limits.maxTotalBytes ? 'total' : 'files',
      maxBytes: account.limits.maxTotalBytes, actualBytes, maxFiles: account.limits.maxFiles, actualFiles: files.length,
      largestFiles: [...files].sort((a, b) => b.size - a.size).slice(0, 5).map(({ path, size }) => ({ path, size })),
    });
  const prepared = await client.retry(() => client.request('/api/v1/shares', auth.token, {
    title: options.title.trim(), files, replaceShareId: options.shareId,
  }), { create: true });
  // Never turn a fixed-link update into a new share if the server ignores replace.
  if (prepared.shareId !== options.shareId) throw new CloudError('INVALID_RESPONSE');
  const finalizePath = `/api/v1/shares/${options.shareId}/finalize`;
  const request: CloudClient['request'] = async (path, token, body, requestOptions) => {
    if (path === finalizePath) await current(options.assertCurrent);
    return client.request(path, token, body, requestOptions);
  };
  // Keep the common uploader untouched. Only guard its finalize boundary, including
  // retry attempts, after all PUT workers have settled. Bind other methods normally.
  const guarded = new Proxy(client, {
    get(target, key) {
      if (key === 'request') return request;
      const value = Reflect.get(target, key, target);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
  const { published } = await uploadPreparedFiles(guarded, auth.token, prepared, blobs);
  const url = new URL(published.url);
  if (published.shareId !== options.shareId || url.search || url.hash ||
      ![`/s/${options.shareId}`, `/s/${options.shareId}/`].includes(url.pathname))
    throw new CloudError('INVALID_RESPONSE');
  return published;
}

/** Fixed GitHub API origin; the token is never sent to an artifact-provided URL. */
export async function assertCurrentMain(repo: string, head: string, token: string, fetcher: typeof fetch = fetch) {
  if (!/^[A-Za-z0-9][A-Za-z0-9-]{0,38}\/[A-Za-z0-9_.-]{1,100}$/.test(repo) ||
      ['.', '..'].includes(repo.split('/')[1]!) || !/^[a-f0-9]{40}$/.test(head) || !token.trim())
    throw new JoploError('USAGE', 'A repository, full commit SHA and GH_TOKEN are required');
  try {
    const response = await fetcher(`https://api.github.com/repos/${repo}/git/ref/heads/main`, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' },
      redirect: 'error', signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) throw new Error();
    const data = await response.json() as { ref?: unknown; object?: { type?: unknown; sha?: unknown } };
    if (data.ref !== 'refs/heads/main' || data.object?.type !== 'commit' || data.object.sha !== head) throw new Error();
  } catch { throw new JoploError('REVISION_CONFLICT', 'Main changed or could not be verified; nothing finalized'); }
}

const SAFE_ERRORS = {
  USAGE: 'Use --site, --share-id, --repo and --head with JOPLO_API_KEY and GH_TOKEN.',
  INVALID_SCHEMA: 'The artifact is not a safe public Joplo build. Rebuild it with the trusted CLI.',
  INVALID_REFERENCE: 'The artifact has invalid public playback references. Rebuild it with the trusted CLI.',
  EXPORT_FAILED: 'The artifact contains unsupported files, unsafe paths, or changed bytes. Nothing finalized.',
  REVISION_CONFLICT: 'Main changed or could not be verified. Nothing finalized; publish the latest successful main run.',
} as const;
export function safePublishError(error: unknown): { code: string; message: string } {
  if (error instanceof CloudError && Object.hasOwn(CLOUD_MESSAGES, error.code)) return { code: error.code, message: CLOUD_MESSAGES[error.code] };
  if (error instanceof JoploError && Object.hasOwn(SAFE_ERRORS, error.code)) return { code: error.code, message: SAFE_ERRORS[error.code as keyof typeof SAFE_ERRORS] };
  return { code: 'PUBLICATION_FAILED', message: 'Publication failed. Check the trusted workflow configuration and rerun the latest successful main build.' };
}

type CliIO = { env?: NodeJS.ProcessEnv; stdout?: (text: string) => void; stderr?: (text: string) => void; fetchGitHub?: typeof fetch };
export async function runPublishSelfDesign(argv: string[], io: CliIO = {}): Promise<number> {
  const env = io.env ?? process.env, stdout = io.stdout ?? (s => process.stdout.write(s)), stderr = io.stderr ?? (s => process.stderr.write(s));
  const secrets = new Set([env.JOPLO_API_KEY, env.GH_TOKEN].filter((v): v is string => !!v));
  const redact = (s: string) => [...secrets].reduce((text, secret) => text.replaceAll(secret, '[redacted]').replaceAll(encodeURIComponent(secret), '[redacted]'), s);
  try {
    let values;
    try { ({ values } = parseArgs({ args: argv, options: { site: { type: 'string' }, 'share-id': { type: 'string' }, head: { type: 'string' }, repo: { type: 'string' } }, strict: true })); }
    catch { throw new JoploError('USAGE', SAFE_ERRORS.USAGE); }
    if (!values.site || !values['share-id'] || !values.head || !values.repo || !env.JOPLO_API_KEY || !env.GH_TOKEN)
      throw new JoploError('USAGE', SAFE_ERRORS.USAGE);
    const { version } = JSON.parse(await readFile(new URL('../../packages/cli/package.json', import.meta.url), 'utf8')) as { version: string };
    const client = new CloudClient(undefined, version, text => stderr(`${redact(text)}\n`), token => secrets.add(token), { env, interactive: false });
    const head = values.head, repo = values.repo;
    const result = await publishMainDesign(client, values.site, {
      shareId: values['share-id'], title: 'Joplo · 真实功能设计过程',
      assertCurrent: () => assertCurrentMain(repo, head, env.GH_TOKEN!, io.fetchGitHub),
    });
    const output = { shareId: result.shareId, url: result.url, version: result.version, head };
    stdout(`${redact(JSON.stringify(output))}\n`);
    try {
      if (env.GITHUB_OUTPUT) await appendFile(env.GITHUB_OUTPUT, redact(`share_id=${output.shareId}\nurl=${output.url}\nversion=${output.version}\nhead=${head}\n`));
      if (env.GITHUB_STEP_SUMMARY) await appendFile(env.GITHUB_STEP_SUMMARY, redact(`## Joplo design publication\n\n[Open the design project](${output.url})\n\nVersion: ${output.version}\n\nCommit: \`${head}\`\n`));
    } catch { stderr('Published successfully, but GitHub output/summary files could not be written. The link is in stdout.\n'); }
    return 0;
  } catch (error) {
    const failure = safePublishError(error);
    stderr(`${redact(JSON.stringify({ ok: false, error: failure }))}\n`);
    return failure.code === 'USAGE' ? 2 : 1;
  }
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url)
  process.exitCode = await runPublishSelfDesign(process.argv.slice(2));
