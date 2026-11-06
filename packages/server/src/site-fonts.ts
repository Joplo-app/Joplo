import fs from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import type { WebAssets } from './web-assets.ts';
import { collectCodepoints, pruneFontCss } from './font-subsets.ts';

function files(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => e.isDirectory() ? files(path.join(dir, e.name)) : [path.join(dir, e.name)]);
}

/** Runs after IR/JS inlining and author CSS compilation in both source and dist mode. */
export function subsetSiteFonts(staging: string, web: WebAssets): void {
  const all = files(staging);
  const points = new Set<number>();
  const decoder = new TextDecoder('utf-8', { fatal: true });
  for (const file of all) {
    let text: string;
    try { text = decoder.decode(fs.readFileSync(file)); } catch { continue; }
    if (text.includes('\0')) continue;
    for (const cp of collectCodepoints(text)) points.add(cp);
  }
  const retained = new Set<string>();
  const renamed = new Map<string, string>();
  let cssText = '';
  for (const file of all.filter((f) => f.endsWith('.css'))) {
    const original = fs.readFileSync(file, 'utf8');
    const result = pruneFontCss(original, points);
    if (result.css !== original) {
      const hash = createHash('sha256').update(result.css).digest('hex').slice(0, 12);
      const target = file.slice(0, -4) + `-font-${hash}.css`;
      fs.writeFileSync(target, result.css);
      fs.rmSync(file);
      renamed.set(file, target);
    }
    cssText += result.css;
    // Also preserve URLs in unfamiliar/unclosed rules that the conservative parser left untouched.
    for (const m of result.css.matchAll(/url\(\s*(?:"([^"]*)"|'([^']*)'|([^\s)]+))\s*\)/gi)) {
      retained.add(path.resolve(path.dirname(file), m[1] ?? m[2] ?? m[3]!));
    }
  }
  // The original Vite hash predates pruning. A fresh URL prevents stale CSS from requesting deleted subsets.
  for (const file of all.filter((f) => f.endsWith('.html'))) {
    const html = fs.readFileSync(file, 'utf8').replace(/(<link\b[^>]*?\bhref=["'])([^"']+)(["'])/gi, (raw, before, url, after) => {
      const target = renamed.get(path.resolve(path.dirname(file), url));
      return target ? `${before}./${path.relative(path.dirname(file), target).split(path.sep).join('/')}${after}` : raw;
    });
    fs.writeFileSync(file, html);
  }
  // Resolve all stylesheets together: a file shared by two rules or CSS assets must survive.
  for (const file of all) if (file.endsWith('.woff2') && !retained.has(file)) fs.rmSync(file);
  const licenses = web.mode === 'source' ? path.join(web.webDir, 'src/fonts') : path.join(web.webDir, 'dist/fonts');
  for (const [family, license] of [['Joplo Excalifont', 'OFL.txt'], ['Joplo Marker Gothic', 'OFL-MarkerGothic.txt']]) {
    if (!cssText.includes(family!)) continue;
    fs.mkdirSync(path.join(staging, 'fonts'), { recursive: true });
    fs.copyFileSync(path.join(licenses, license!), path.join(staging, 'fonts', license!));
  }
}
