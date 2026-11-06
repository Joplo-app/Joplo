import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { afterAll, beforeAll, expect, it, vi } from 'vitest';

const root = path.resolve(import.meta.dirname, '../../..');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'joplo-font-build-'));
const files = (dir: string): string[] => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => e.isDirectory() ? files(path.join(dir, e.name)) : [path.join(dir, e.name)]);
beforeAll(() => {
  execFileSync(process.execPath, ['scripts/build-dist.mjs'], { cwd: path.join(root, 'packages/web'), stdio: 'pipe' });
  fs.cpSync(path.join(root, 'examples/invite'), path.join(temp, 'project'), { recursive: true });
  fs.mkdirSync(path.join(temp, 'project/themes'), { recursive: true });
  fs.writeFileSync(path.join(temp, 'project/themes/sketch.css'), String.raw`:root { --jp-stroke: rough } .jbox::after { content: '\9f98'; }`);
}, 120_000);
afterAll(() => { vi.unstubAllEnvs(); fs.rmSync(temp, { recursive: true, force: true }); });

it('changes stylesheet URLs when pruning changes CSS, preserving shared files across stylesheets', async () => {
  const { subsetSiteFonts } = await import('../src/site-fonts.ts');
  const outputs: string[] = [];
  for (const [id, text] of [['one', '中'], ['two', '한']]) {
    const dir = path.join(temp, id!);
    fs.mkdirSync(path.join(dir, 'assets'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'index.html'), `<head><link rel="stylesheet" href="./assets/fonts.css"><link rel="stylesheet" href="./assets/other.css"></head>${text}`);
    fs.writeFileSync(path.join(dir, 'assets/fonts.css'), `@font-face{font-family:test;src:url('./han.woff2');unicode-range:U+4E00-9FFF}@font-face{font-family:test;src:url('./korean.woff2');unicode-range:U+AC00-D7AF}`);
    fs.writeFileSync(path.join(dir, 'assets/other.css'), `@font-face{font-family:test;src:url('./han.woff2')}`);
    for (const name of ['han.woff2', 'korean.woff2', 'orphan.woff2']) fs.writeFileSync(path.join(dir, 'assets', name), Buffer.from([0, 255]));
    subsetSiteFonts(dir, { mode: 'source', webDir: dir, indexCss: '', kitSrc: '' });
    const html = fs.readFileSync(path.join(dir, 'index.html'), 'utf8');
    const href = /href="([^"]+)"/.exec(html)![1]!;
    expect(fs.existsSync(path.resolve(dir, href))).toBe(true);
    expect(fs.existsSync(path.join(dir, 'assets/han.woff2'))).toBe(true);
    expect(fs.existsSync(path.join(dir, 'assets/orphan.woff2'))).toBe(false);
    outputs.push(href);
  }
  expect(outputs[0]).not.toBe(outputs[1]);
});

it.each(['source', 'dist'])('%s build preserves font coverage, URLs and licenses without unused fonts', async (mode) => {
  vi.stubEnv('JOPLO_WEB', mode);
  vi.resetModules();
  const { buildSite } = await import('../src/build.ts');
  const { collectCodepoints, rangeIntersects } = await import('../src/font-subsets.ts');
  const result = await buildSite({ projectDir: path.join(temp, 'project'), outDir: path.join(temp, mode) });
  const all = files(result.outDir);
  const styles = all.filter((f) => f.endsWith('.css'));
  const referenced = new Set<string>();
  for (const file of styles) {
    const css = fs.readFileSync(file, 'utf8');
    expect(css).not.toMatch(/Xiaolai|WenKai|url\(["']?https?:\/\//);
    for (const [, url] of css.matchAll(/url\(["']?([^)'"\s]+)["']?\)/g)) {
      if (url!.startsWith('data:')) continue;
      const target = path.resolve(path.dirname(file), url!);
      expect(fs.existsSync(target), url).toBe(true);
      if (target.endsWith('.woff2')) referenced.add(target);
    }
  }
  expect(all.filter((f) => f.endsWith('.woff2')).sort()).toEqual([...referenced].sort());
  expect(result.files.join('\n')).not.toMatch(/Xiaolai|WenKai/);
  expect(result.files).toContain('fonts/OFL.txt');
  expect(result.files).toContain('fonts/OFL-MarkerGothic.txt');
  expect(referenced.size).toBeLessThan(150);
  const html = fs.readFileSync(path.join(result.outDir, 'index.html'), 'utf8');
  expect(html).not.toContain('cdn.jsdelivr.net');
  // Check all Han appearing in payload, every locale's JS dictionary and author CSS escapes.
  const points = collectCodepoints(html + styles.map((f) => fs.readFileSync(f, 'utf8')).join('\n'));
  expect(points.has(0x9f98)).toBe(true);
  const original = fs.readFileSync(path.join(root, 'packages/web/src/fonts/MarkerGothic.css'), 'utf8');
  const ranges = (css: string) => [...css.matchAll(/@font-face\s*\{[^}]*unicode-range:([^;}]+)/g)].map((m) => m[1]!);
  const kept = ranges(styles.map((f) => fs.readFileSync(f, 'utf8')).join('\n'));
  for (const cp of points) {
    if (!/\p{Script=Han}/u.test(String.fromCodePoint(cp))) continue;
    const one = new Set([cp]);
    if (ranges(original).some((r) => rangeIntersects(r, one))) expect(kept.some((r) => rangeIntersects(r, one)), cp.toString(16)).toBe(true);
  }
}, 120_000);
