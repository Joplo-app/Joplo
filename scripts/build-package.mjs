#!/usr/bin/env node
/**
 * 把一个 TS 包构建到 dist/（在包目录里运行：`pnpm --filter @joplo-app/core build`）。
 *
 * - tsc -p tsconfig.build.json：输出 JS 与 .d.ts，`./x.ts` 导入改写为 `./x.js`（rewriteRelativeImportExtensions）。
 * - .d.ts 里的 `./x.ts` 导入同样改写为 `./x.js`（tsc 只改写 JS）。
 * - src 里的非 TS 文件（例如 server 的 page-report.js）原样复制。
 * - publishConfig.bin 指向的文件：shebang 改为 `#!/usr/bin/env node` 并设为可执行（源码里是 tsx）。
 * - 校验：publishConfig.exports / bin 指向的文件都存在；dist 里没有残留的 .ts 相对导入、跨包相对导入。
 *
 * 仓库内的开发不需要它：package.json 的 exports 指向源码，发布时 pnpm 用 publishConfig 覆盖为 dist。
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const dir = path.resolve(process.argv[2] ?? process.cwd());
const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'));
const src = path.join(dir, 'src');
const dist = path.join(dir, 'dist');
const fail = (msg) => {
  console.error(`✗ ${pkg.name}：${msg}`);
  process.exit(1);
};

fs.rmSync(dist, { recursive: true, force: true });
const tsc = createRequire(path.join(ROOT, 'package.json')).resolve('typescript/bin/tsc');
const r = spawnSync(process.execPath, [tsc, '-p', path.join(dir, 'tsconfig.build.json')], { cwd: dir, stdio: 'inherit' });
if (r.status !== 0) fail(`tsc 失败（退出码 ${r.status}）`);

const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
for (const f of walk(src)) {
  if (/\.(ts|tsx|mts)$/.test(f)) continue;
  const to = path.join(dist, path.relative(src, f));
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.copyFileSync(f, to);
}

// tsc 不改写 .d.ts 里的 `./x.ts` 导入（rewriteRelativeImportExtensions 只作用于 JS）
for (const f of walk(dist).filter((x) => x.endsWith('.d.ts'))) {
  const code = fs.readFileSync(f, 'utf8');
  const fixed = code.replace(/((?:from|import)\s*\(?\s*["'])(\.{1,2}\/[^"']*?)\.tsx?(["'])/g, '$1$2.js$3');
  if (fixed !== code) fs.writeFileSync(f, fixed);
}

const pub = pkg.publishConfig ?? {};
for (const target of Object.values(pub.bin ?? {})) {
  const f = path.join(dir, target);
  if (!fs.existsSync(f)) fail(`bin 指向的 ${target} 不存在`);
  const code = fs.readFileSync(f, 'utf8').replace(/^#!.*\n/, '');
  fs.writeFileSync(f, `#!/usr/bin/env node\n${code}`);
  fs.chmodSync(f, 0o755);
}
const targets = (v) => (typeof v === 'string' ? [v] : v && typeof v === 'object' ? Object.values(v).flatMap(targets) : []);
for (const t of targets(pub.exports)) if (!fs.existsSync(path.join(dir, t))) fail(`publishConfig.exports 指向的 ${t} 不存在`);

for (const f of walk(dist).filter((x) => x.endsWith('.js') || x.endsWith('.d.ts'))) {
  const code = fs.readFileSync(f, 'utf8');
  const bad = code.match(/(?:from|import)\s*\(?\s*["'](\.{1,2}\/[^"']*\.tsx?|\.\.\/\.\.\/[^"']*)["']/);
  if (bad) fail(`${path.relative(dir, f)} 仍有源码相对导入：${bad[1]}`);
}
console.log(`✓ ${pkg.name}@${pkg.version} → dist/（${walk(dist).length} 个文件）`);
