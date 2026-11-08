import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, writeFile, readFile, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildFeatureDiff } from '../src/feature-diff.ts';
import { jsonForHtml } from '../src/build.ts';
import { diffProject } from '../../core/test/fixtures/feature-diff.ts';
let root: string;
beforeEach(async () => { root = await mkdtemp(join(tmpdir(), 'joplo-feature-diff-')); });
afterEach(async () => { await rm(root, { recursive: true, force: true }); });
async function site(name: string, p: unknown = diffProject()) {
  const dir = join(root, name); await mkdir(dir); await mkdir(join(dir, 'assets'));
  await writeFile(join(dir, 'assets/site.css'), 'body{}');
  await writeFile(join(dir, 'index.html'), `<meta name="joplo-feature-diff-player" content="1"><script type="application/json" id="joplo-ir">${jsonForHtml({ project: p })}</script>`);
  return dir;
}
describe('static diff bundle', () => {
  it('copies real builds and emits matching public manifest and self-contained viewer', async () => {
    const beforeDir = await site('b'), afterDir = await site('a');
    const result = await buildFeatureDiff({ beforeDir, afterDir, outDir: join(root, 'diff') });
    expect(result.manifest.status).toBe('unchanged');
    expect(await readFile(join(result.outDir, 'before/index.html'), 'utf8')).toBe(await readFile(join(beforeDir, 'index.html'), 'utf8'));
    expect(JSON.parse(await readFile(join(result.outDir, 'feature-diff.json'), 'utf8'))).toEqual(result.manifest);
    const html = await readFile(join(result.outDir, 'index.html'), 'utf8');
    expect(html).toContain('joplo:goto'); expect(html).toContain('allow-scripts'); expect(html).not.toContain('__name');
    expect(() => new Function(html.split('<script>')[1]!.split('</script>')[0]!)).not.toThrow();
  });
  it('does not mistake a missing baseline for a new feature', async () => {
    await expect(buildFeatureDiff({ beforeDir: join(root, 'missing'), afterDir: await site('a'), outDir: join(root, 'diff') })).rejects.toThrow();
    await expect(readFile(join(root, 'diff/index.html'))).rejects.toThrow();
  });
  it('rejects authoring/review data, symlinks, foreign files and overlapping output', async () => {
    const beforeDir = await site('b'), afterDir = await site('a');
    await expect(buildFeatureDiff({ beforeDir, afterDir, outDir: join(beforeDir, 'diff') })).rejects.toThrow(/separate/);
    await writeFile(join(beforeDir, 'review.json'), '{}');
    await expect(buildFeatureDiff({ beforeDir, afterDir, outDir: join(root, 'diff') })).rejects.toThrow(/standalone/);
    await rm(join(beforeDir, 'review.json'));
    await symlink(join(afterDir, 'index.html'), join(beforeDir, 'assets/private.html'));
    await expect(buildFeatureDiff({ beforeDir, afterDir, outDir: join(root, 'diff') })).rejects.toThrow(/standalone/);
    const review = await site('review', { ...diffProject(), mode: 'review' });
    await expect(buildFeatureDiff({ beforeDir: review, afterDir, outDir: join(root, 'diff') })).rejects.toThrow(/publish/);
  });
  it.each([false, true])('incompatible local preview never copies future IR or identity payload (identity=%s)', async futureIdentity => {
    const beforeDir = await site('b', { schemaVersion: 999, secret: 'not-public' });
    if (futureIdentity) await writeFile(join(beforeDir, 'index.html'), (await readFile(join(beforeDir, 'index.html'), 'utf8')) + '<script type="application/json" id="joplo-step-keys">{"formatVersion":99,"secret":"not-public"}</script>');
    const result = await buildFeatureDiff({ beforeDir, afterDir: await site('a'), outDir: join(root, 'diff') });
    expect(result.manifest.status).toBe('incompatible');
    await expect(readFile(join(result.outDir, 'before/index.html'))).rejects.toThrow();
    expect(await readFile(join(result.outDir, 'index.html'), 'utf8')).not.toContain('not-public');
  });
});

it('keeps stable keys outside strict legacy playback Project and validates identity references', async () => {
  const { publishPayload, finalizeHtml } = await import('../src/build.ts');
  const { stepIdentity, readFeatureDiffBuild } = await import('@joplo-app/core');
  const p = diffProject(); p.scenarios['invite.main.send']!.steps[0]!.key = 'open';
  const inline = publishPayload(p, null);
  expect((inline.project.scenarios as any)['invite.main.send'].steps[0]).not.toHaveProperty('key');
  const html = finalizeHtml('<html><head></head></html>', () => '', inline, stepIdentity(p)).html;
  expect((readFeatureDiffBuild(html) as any).scenarios['invite.main.send'].steps[0].key).toBe('open');
  expect(() => readFeatureDiffBuild(html.replace('"invite.main.send#1":"open"', '"missing-step":"open"'))).toThrow(/missing step/);
  expect(() => readFeatureDiffBuild(html + html)).toThrow(/Expected one/);
});

it('ordinary new published payload passes actual pinned Core 0.2.10 strict Reader', async () => {
  const { Project: LegacyProject } = await import('@joplo-app/core-legacy');
  const { publishPayload, finalizeHtml } = await import('../src/build.ts');
  const { stepIdentity, readFeatureDiffBuild } = await import('@joplo-app/core');
  const project = diffProject(); project.scenarios['invite.main.send']!.steps[0]!.key = 'open';
  expect(LegacyProject.safeParse(project).success).toBe(false); // Proves this is the strict old reader.
  const payload = publishPayload(project, null);
  const html = finalizeHtml('<head></head>', () => '', payload, stepIdentity(project)).html;
  const oldInput = JSON.parse(/id="joplo-ir">([\s\S]*?)<\/script>/.exec(html)![1]!).project;
  const read = LegacyProject.safeParse(oldInput);
  expect(read.success, JSON.stringify(read)).toBe(true);
  expect((readFeatureDiffBuild(html) as any).scenarios['invite.main.send'].steps[0].key).toBe('open');
});

it('rejects old runtime capability explicitly instead of showing a cover as initial-state comparison', async () => {
  const beforeDir = await site('b'), afterDir = await site('a');
  const html = await readFile(join(beforeDir, 'index.html'), 'utf8');
  await writeFile(join(beforeDir, 'index.html'), html.replace('<meta name="joplo-feature-diff-player" content="1">', ''));
  const result = await buildFeatureDiff({ beforeDir, afterDir, outDir: join(root, 'diff') });
  expect(result.manifest.status).toBe('incompatible'); expect(result.manifest.reasons).toContain('player-version');
  await expect(readFile(join(result.outDir, 'before/index.html'))).rejects.toThrow();
});
it('public shell dictionaries cover every supported locale without missing keys', async () => {
  const { exportLocales } = await import('../src/locale.ts');
  const dictionaries = JSON.parse(await readFile(new URL('../src/feature-diff-locales.json', import.meta.url), 'utf8'));
  expect(Object.keys(dictionaries).sort()).toEqual([...exportLocales].sort());
  for (const dictionary of Object.values(dictionaries)) {
    expect(Object.keys(dictionary as object).sort()).toEqual(Object.keys(dictionaries.en).sort());
    expect(Object.values(dictionary as object).every(value => typeof value === 'string' && value.length)).toBe(true);
  }
});
