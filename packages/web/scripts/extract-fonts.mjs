/**
 * 从 @excalidraw/excalidraw 的 npm 包（已解包目录）提取 Excalifont 字体子集，
 * 生成本地 @font-face（含 unicode-range）。运行时不访问 CDN。
 *
 * 用法：node scripts/extract-fonts.mjs <解包后的 package 目录>
 * 字体许可：SIL OFL 1.1（见 src/fonts/OFL.txt）。
 */
import fs from 'node:fs';
import path from 'node:path';

const pkg = process.argv[2];
if (!pkg) throw new Error('用法：node scripts/extract-fonts.mjs <excalidraw package 目录>');
const prod = path.join(pkg, 'dist/prod');
const js = fs.readdirSync(prod).filter((f) => f.endsWith('.js')).map((f) => fs.readFileSync(path.join(prod, f), 'utf8')).join('\n');
const outDir = path.resolve(import.meta.dirname, '../src/fonts');
fs.mkdirSync(outDir, { recursive: true });

const vars = new Map();
for (const m of js.matchAll(/var (\w+)="\.\/fonts\/(Excalifont)\/([\w-]+\.woff2)"/g)) vars.set(m[1], { family: m[2], file: m[3] });
const faces = [];
for (const m of js.matchAll(/\{uri:(\w+),descriptors:\{unicodeRange:"([^"]+)"\}\}/g)) {
  const v = vars.get(m[1]);
  if (v) faces.push({ ...v, range: m[2] });
}
const families = { Excalifont: 'Joplo Excalifont' };
let css = '/* 由 scripts/extract-fonts.mjs 生成。字体许可：SIL OFL 1.1（见 OFL.txt）。 */\n';
for (const f of faces) {
  const dir = path.join(outDir, f.family);
  fs.mkdirSync(dir, { recursive: true });
  fs.copyFileSync(path.join(prod, 'fonts', f.family, f.file), path.join(dir, f.file));
  css += `@font-face{font-family:'${families[f.family]}';src:url('./${f.family}/${f.file}') format('woff2');font-display:block;unicode-range:${f.range};}\n`;
}
fs.writeFileSync(path.join(outDir, 'fonts.css'), css);
console.log(`写入 ${faces.length} 个 @font-face（Excalifont）`);
