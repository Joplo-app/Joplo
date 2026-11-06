/**
 * 发包前预构建 @joplo-app/web 的运行时资源（`pnpm --filter @joplo-app/web build`）。运行时不再读取 src/。
 *
 *   dist/app/index.html        看板（`joplo dev` 与 `joplo render` 用；Vite 开发服务以它为 root 提供）
 *   dist/app/site.html         发布站模板（`joplo build` 复制、内联 IR 与入口脚本）
 *   dist/app/assets/*          两者共用的 JS / CSS / 字体（字体按内容哈希命名，只存一份）
 *   dist/site-files.json       发布站候选文件清单（不含看板专用 JS / 文楷；build 时按 staging 的全部文本裁剪字体）
 *   dist/project.css           作者 className 的 Tailwind 入口：与 index.css 相同的主题，但不扫描任何目录；
 *                              运行时由 @joplo-app/server 追加 `@source <项目目录>` 后编译
 *   dist/fonts/OFL*.txt        手绘字体（Excalifont、霞鹜漫黑）的 SIL OFL 1.1 许可证
 *   dist/manifest.json         版本与格式号，server 据此确认资源齐全
 *
 * 看板的 IR 推送依赖 `import.meta.hot`（Vite HMR 自定义事件）。预构建产物里没有 HMR 运行时，所以这里把
 * src 中的 `import.meta.hot` 改写为 `globalThis.__JOPLO_HOT__`；`joplo dev` 在页面里先用
 * Vite 客户端的 createHotContext 创建它（见 @joplo-app/server 的 web-assets.ts）。
 */
import fs from 'node:fs';
import path from 'node:path';
import { build } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const WEB = path.resolve(import.meta.dirname, '..');
const SRC = path.join(WEB, 'src');
const DIST = path.join(WEB, 'dist');
const APP = path.join(DIST, 'app');
const pkg = JSON.parse(fs.readFileSync(path.join(WEB, 'package.json'), 'utf8'));

/** 预构建产物里用全局 HMR 句柄代替 import.meta.hot。 */
const hotShim = {
  name: 'joplo:hot-shim',
  enforce: 'pre',
  transform(code, id) {
    const file = id.split('?')[0];
    if (!file.startsWith(SRC + path.sep) || !code.includes('import.meta.hot')) return;
    return { code: code.replaceAll('import.meta.hot', 'globalThis.__JOPLO_HOT__'), map: null };
  },
};

const common = (extra) => ({
  configFile: false,
  envDir: false,
  root: WEB,
  base: './',
  mode: 'production',
  logLevel: 'warn',
  define: { 'process.env.NODE_ENV': '"production"' },
  plugins: [hotShim, react(), tailwindcss()],
  ...extra,
});

process.env.NODE_ENV = 'production';
fs.rmSync(DIST, { recursive: true, force: true });

// 1. 看板（允许代码分割）
await build(common({
  resolve: { alias: { '@': SRC } },
  build: { outDir: APP, emptyOutDir: true, assetsInlineLimit: 0, chunkSizeWarningLimit: 4000, reportCompressedSize: false, sourcemap: false, rolldownOptions: { input: path.join(WEB, 'index.html') } },
}));

// 2. 发布站：与 server 的 buildSite 同样的选项（单个入口脚本，便于内联成 file:// 可打开的页面）
const siteOut = await build(common({
  resolve: { alias: [{ find: /^@joplo-app\/core$/, replacement: path.join(SRC, 'site/core-lite.ts') }, { find: /^@\//, replacement: SRC + '/' }] },
  build: {
    outDir: APP,
    emptyOutDir: false,
    minify: true,
    sourcemap: false,
    assetsInlineLimit: 0,
    chunkSizeWarningLimit: 4000,
    modulePreload: false,
    reportCompressedSize: false,
    rolldownOptions: { input: path.join(WEB, 'site.html'), output: { codeSplitting: false } },
  },
}));
const outputs = (Array.isArray(siteOut) ? siteOut : [siteOut]).flatMap((o) => o.output.map((x) => x.fileName));
const siteFiles = [...new Set(outputs)].sort();
if (!siteFiles.includes('site.html')) throw new Error(`发布站构建缺少 site.html：${siteFiles.join(', ')}`);
fs.writeFileSync(path.join(DIST, 'site-files.json'), JSON.stringify(siteFiles, null, 2) + '\n');
// D33 / I4: shared runtime may hold board message keys, but never board prose or dictionaries.
for (const file of siteFiles.filter((f) => /\.(?:js|html)$/.test(f))) {
  const text = fs.readFileSync(path.join(APP, file), 'utf8');
  for (const sentinel of ['Joplo · Board', 'AI assumption', 'Add a scenario for', 'Saved .joplo/selection.json', 'Could not sync selection to Agent']) {
    if (text.includes(sentinel)) throw new Error(`Published site includes board text: ${file}: ${sentinel}`);
  }
}


// 3. 作者 className 的 Tailwind 入口
const indexCss = fs.readFileSync(path.join(SRC, 'index.css'), 'utf8');
if (!/^@import "tailwindcss";$/m.test(indexCss)) throw new Error('index.css 缺少 @import "tailwindcss";，无法生成 project.css');
const projectCss = indexCss
  .replace(/^@import "tailwindcss";$/m, '@import "tailwindcss" source(none);')
  .replace(/^@import "\.\/fonts\/[\w-]+\.css";\n/gm, '')
  .replace(/^@source .*;\n/gm, '');
if (/^@import "\.\//m.test(projectCss)) throw new Error('index.css 新增了相对 @import；请同步更新 build-dist.mjs');
fs.writeFileSync(path.join(DIST, 'project.css'), `/* 由 scripts/build-dist.mjs 从 src/index.css 生成：只编译作者 className 用到的工具类。 */\n${projectCss}`);

// 4. 字体许可证
fs.mkdirSync(path.join(DIST, 'fonts'), { recursive: true });
for (const f of ['OFL.txt', 'OFL-MarkerGothic.txt']) fs.copyFileSync(path.join(SRC, 'fonts', f), path.join(DIST, 'fonts', f));

// 5. 清单
for (const f of ['index.html', 'site.html']) if (!fs.existsSync(path.join(APP, f))) throw new Error(`缺少 ${f}`);
fs.writeFileSync(path.join(DIST, 'manifest.json'), JSON.stringify({ name: pkg.name, version: pkg.version, format: 1, board: 'app/index.html', site: 'app/site.html', siteFiles: 'site-files.json', projectCss: 'project.css' }, null, 2) + '\n');
console.log(`@joplo-app/web ${pkg.version}：看板与发布站资源已写入 dist/（发布站 ${siteFiles.length} 个文件）`);
