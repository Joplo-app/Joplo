import { cp, lstat, mkdir, readFile, readdir, realpath, rename, rm, mkdtemp } from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';
import { readFeatureDiffBuild, featureDiff, JoploError, type FeatureDiffManifest } from '@joplo-app/core';
import { writeFile } from 'node:fs/promises';
import { diffViewerHtml } from './feature-diff-viewer.ts';

export type DiffBuildOptions = { beforeDir: string; afterDir: string; outDir: string; baseSha?: string; headSha?: string };
export type DiffBuildResult = { outDir: string; manifest: FeatureDiffManifest };
export const publicIRFromHtml = readFeatureDiffBuild;
/** Copy only a build's public payload; no project files, review attachments or symlinks. */
async function checkFiles(dir: string, prefix = ''): Promise<void> {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const relative = prefix + e.name;
    if (e.isSymbolicLink() || /[\\?#%\x00-\x1f\x7f]/.test(e.name) || (!prefix && !['index.html', 'assets', 'fonts', 'voice', '_joplo'].includes(e.name))) throw new JoploError('INVALID_SCHEMA', `Not a independent public build: ${relative}`);
    if (e.isDirectory()) await checkFiles(join(dir, e.name), relative + '/');
    else if (!e.isFile()) throw new JoploError('INVALID_SCHEMA', 'Build contains a non-regular file');
  }
}
export async function buildFeatureDiff(opts: DiffBuildOptions): Promise<DiffBuildResult> {
  const before = await realpath(opts.beforeDir), after = await realpath(opts.afterDir);
  // Never clear an existing directory. Validate both builds before creating any output.
  const output = resolve(opts.outDir);
  await mkdir(dirname(output), { recursive: true });
  const outDir = join(await realpath(dirname(output)), output.slice(dirname(output).length + 1));
  if ([before, after].some(p => outDir === p || p.startsWith(outDir + sep) || outDir.startsWith(p + sep))) throw new JoploError('USAGE', 'Diff output must be separate from both input sites');
  try { await lstat(outDir); throw new JoploError('USAGE', 'Diff output already exists; choose a new directory'); } catch (e) { if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e; }
  await checkFiles(before); await checkFiles(after);
  const beforeHtml = await readFile(join(before, 'index.html'), 'utf8'), afterHtml = await readFile(join(after, 'index.html'), 'utf8');
  let m = featureDiff(publicIRFromHtml(beforeHtml), publicIRFromHtml(afterHtml), opts);
  if (![beforeHtml, afterHtml].every(html => html.includes('<meta name="joplo-feature-diff-player" content="1">'))) {
    m = { ...m, status: 'incompatible', reasons: [...m.reasons, 'player-version'], scenarios: [], summary: { added: [], modified: [], removed: [] } };
  }
  const staging = await mkdtemp(join(dirname(outDir), '.joplo-diff-'));
  try {
    if (m.status !== 'incompatible') {
      await cp(before, join(staging, 'before'), { recursive: true, dereference: false });
      await cp(after, join(staging, 'after'), { recursive: true, dereference: false });
    }
    await writeFile(join(staging, 'feature-diff.json'), JSON.stringify(m, null, 2) + '\n');
    await writeFile(join(staging, 'index.html'), diffViewerHtml(m));
    await rename(staging, outDir);
  } finally { await rm(staging, { recursive: true, force: true }); }
  return { outDir, manifest: m };
}
