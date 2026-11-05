/**
 * `joplo build`：静态发布站。
 *
 * 1. 用 Vite（中间件模式，不监听端口）ssrLoadModule 载入项目，compile(…, 'publish')：只含选定方案，
 *    已去掉规则、情况、问题、备注、源路径（D33）。这里再去掉 IR 中创作侧的空字段与约束、角色。
 * 2. vite build 发布站入口（packages/web/site.html），Tailwind 以项目目录为 @source。
 * 3. 后处理：IR 内联到 index.html；入口脚本内联为 <script type="module">、去掉 crossorigin，
 *    这样直接双击 index.html（file://）也能离线运行。产物是普通静态目录，可 `wrangler deploy --assets` 或任何静态托管发布。
 *
 * 目标目录非空且没有 overwrite 时拒绝写入；永远不清空项目目录本身或它的上级目录。
 *
 * 从 npm 安装时（web-assets.ts 的 dist 形态）第 2 步不编译界面源码：复制 @joplo/web 预构建的发布站，
 * 只用 Tailwind 编译作者 className 用到的工具类（project.css → assets/project-*.css），再做第 3 步。
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import tailwindcss from '@tailwindcss/vite';
import { build as viteBuild, createServer, type Rollup } from 'vite';
import { JoploError, type Project } from '@joplo/core';
import type { BuildOptions, BuildResult } from './contract.ts';
import { compileProject } from './project.ts';
import { joploProjectPlugin, kitAliases, locateWebAssets, realProjectDir } from './vite-shared.ts';
import type { DistWeb, SourceWeb } from './web-assets.ts';

/** 发布站只需要的 IR：去掉创作侧字段（publish 模式下它们本来就为空）。 */
export function publishPayload(project: Project, home: string | null): { project: Record<string, unknown>; home: string | null } {
  const { rules: _r, cases: _c, issues: _i, ...rest } = project;
  const features = Object.fromEntries(Object.entries(project.features).map(([id, f]) => [id, { id: f.id, name: f.name, goal: f.goal, optionIds: f.optionIds, pick: f.pick }]));
  const options = Object.fromEntries(Object.entries(project.options).map(([id, o]) => [id, { id: o.id, featureId: o.featureId, key: o.key, name: o.name, idea: o.idea, routes: o.routes, coverage: {} }]));
  const scenarios = Object.fromEntries(
    Object.entries(project.scenarios).map(([id, s]) => {
      const { caseIds: _ci, ...sr } = s;
      return [id, { ...sr, caseIds: [], steps: s.steps.map(({ ruleIds: _ri, ...st }) => ({ ...st, ruleIds: [] })) }];
    }),
  );
  return { project: { ...rest, features, options, scenarios }, home: home && project.routes[home] ? home : null };
}

/** 把 JSON 安全地放进 <script type="application/json">。 */
export const jsonForHtml = (v: unknown) => JSON.stringify(v).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');

/** 后处理 vite 产出的 HTML：内联 IR、内联入口脚本、去掉 crossorigin（file:// 下 CORS 会失败）。 */
export function finalizeHtml(html: string, readAsset: (rel: string) => string, inline: { project: unknown; home: string | null }): { html: string; inlined: string[] } {
  const inlined: string[] = [];
  let out = html.replace(/\s+crossorigin(?:="[^"]*")?/g, '');
  out = out.replace(/<link rel="modulepreload"[^>]*>\s*/g, '');
  out = out.replace(/<script type="module" src="\.\/([^"]+)"><\/script>/g, (_m, rel: string) => {
    inlined.push(rel);
    const code = readAsset(rel).replace(/<\/script/gi, '<\\/script');
    return `<script type="module">${code}</script>`;
  });
  const data = `<script type="application/json" id="joplo-ir">${jsonForHtml(inline)}</script>`;
  out = out.replace('</head>', `    ${data}\n  </head>`);
  return { html: out, inlined };
}

function listFiles(dir: string, base = dir): string[] {
  const out: string[] = [];
  for (const name of fs.readdirSync(dir).sort()) {
    const p = path.join(dir, name);
    if (fs.statSync(p).isDirectory()) out.push(...listFiles(p, base));
    else out.push(path.relative(base, p).split(path.sep).join('/'));
  }
  return out;
}

function realish(p: string): string {
  const abs = path.resolve(p);
  const rest: string[] = [];
  let cur = abs;
  for (;;) {
    try {
      return path.join(fs.realpathSync(cur), ...rest);
    } catch {
      const parent = path.dirname(cur);
      if (parent === cur) return abs;
      rest.unshift(path.basename(cur));
      cur = parent;
    }
  }
}

export async function buildSite(opts: BuildOptions): Promise<BuildResult> {
  const projectDir = realProjectDir(opts.projectDir);
  if (!fs.existsSync(projectDir)) throw new JoploError('NOT_FOUND', `项目目录不存在：${projectDir}`);
  const outDir = realish(opts.outDir ?? path.join(projectDir, 'dist'));

  // 目标目录安全检查（先于任何耗时工作）
  if (outDir === projectDir || projectDir.startsWith(outDir + path.sep) || outDir === os.homedir() || outDir === path.parse(outDir).root)
    throw new JoploError('USAGE', `不能把发布站写到 ${outDir}：它是项目目录本身或它的上级目录`);
  if (outDir === path.join(projectDir, '.joplo') || outDir.startsWith(path.join(projectDir, '.joplo') + path.sep)) throw new JoploError('USAGE', `不能写入 .joplo/：${outDir}`);
  const nonEmpty = fs.existsSync(outDir) && (!fs.statSync(outDir).isDirectory() || fs.readdirSync(outDir).length > 0);
  if (nonEmpty && !opts.overwrite) throw new JoploError('USAGE', `目标目录非空：${outDir}。确认可以清空后请传 overwrite: true（CLI：--overwrite）`);
  if (nonEmpty && fs.existsSync(path.join(outDir, 'joplo.config.ts'))) throw new JoploError('USAGE', `目标目录看起来是一个 Joplo 项目（含 joplo.config.ts），拒绝清空：${outDir}`);

  const web = locateWebAssets();

  // 1. 编译（publish）
  const loader = await createServer({
    configFile: false,
    envDir: false,
    root: projectDir,
    logLevel: 'error',
    appType: 'custom',
    resolve: { alias: kitAliases(web, projectDir) },
    plugins: [joploProjectPlugin(projectDir, web)],
    server: { middlewareMode: true, hmr: false, watch: null },
    optimizeDeps: { noDiscovery: true, include: [] },
  });
  let compiled: Awaited<ReturnType<typeof compileProject>>;
  try {
    compiled = await compileProject(loader, projectDir, 'publish');
  } finally {
    await loader.close();
  }
  if (!compiled.project) {
    const errs = compiled.diagnostics.filter((d) => d.severity === 'error');
    throw new JoploError('EXPORT_FAILED', `项目编译失败，未生成发布站：\n${errs.map((d) => `${d.at ?? ''}  ${d.message}`).join('\n')}`, { diagnostics: compiled.diagnostics });
  }
  const project = compiled.project;
  const inline = publishPayload(project, compiled.home);

  // 2. vite build 到临时目录
  const staging = fs.mkdtempSync(path.join(os.tmpdir(), 'joplo-build-'));
  // React 与 plugin-react 依据 NODE_ENV 判断生产构建（测试运行器会把它设为 test）；构建期间强制 production。
  const prevEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';
  try {
    if (web.mode === 'dist') await stageDistSite(web, projectDir, staging);
    else await buildSourceSite(web, projectDir, staging);

    // 3. 后处理
    const siteHtml = path.join(staging, 'site.html');
    const { html, inlined } = finalizeHtml(fs.readFileSync(siteHtml, 'utf8'), (rel) => fs.readFileSync(path.join(staging, rel), 'utf8'), inline);
    fs.rmSync(siteHtml);
    for (const rel of inlined) fs.rmSync(path.join(staging, rel));
    fs.writeFileSync(path.join(staging, 'index.html'), html.replace('<title>Joplo · 概念原型</title>', `<title>${escapeHtml(project.name)} · 概念原型</title>`));

    // 4. 写入目标目录
    if (fs.existsSync(outDir)) fs.rmSync(outDir, { recursive: true, force: true });
    fs.mkdirSync(path.dirname(outDir), { recursive: true });
    fs.cpSync(staging, outDir, { recursive: true });
  } finally {
    if (prevEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = prevEnv;
    fs.rmSync(staging, { recursive: true, force: true });
  }
  return {
    outDir,
    files: listFiles(outDir),
    routes: Object.keys(project.routes).sort(),
    scenarios: Object.keys(project.scenarios),
    diagnostics: compiled.diagnostics,
  };
}

/** 仓库里：直接编译 packages/web 的发布站入口。 */
async function buildSourceSite(web: SourceWeb, projectDir: string, staging: string) {
  const { default: react } = await import('@vitejs/plugin-react');
  await viteBuild({
    configFile: false,
    envDir: false,
    root: web.webDir,
    base: './',
    mode: 'production',
    logLevel: 'error',
    resolve: { alias: [{ find: /^@joplo\/core$/, replacement: path.join(web.webDir, 'src/site/core-lite.ts') }, ...kitAliases(web, projectDir)] },
    define: { 'process.env.NODE_ENV': '"production"' },
    plugins: [joploProjectPlugin(projectDir, web), react(), tailwindcss()],
    build: {
      minify: true,
      sourcemap: false,
      outDir: staging,
      emptyOutDir: true,
      assetsInlineLimit: 0,
      chunkSizeWarningLimit: 4000,
      modulePreload: false,
      reportCompressedSize: false,
      rolldownOptions: { input: path.join(web.webDir, 'site.html'), output: { codeSplitting: false } },
    },
  });
}

/** 从 npm 安装时：复制预构建的发布站，单独编译作者 className 的 CSS 并在 site.html 里引用。 */
export async function stageDistSite(web: DistWeb, projectDir: string, staging: string) {
  for (const rel of web.siteFiles) {
    const to = path.join(staging, rel);
    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.copyFileSync(path.join(web.appDir, rel), to);
  }
  const cssOut = fs.mkdtempSync(path.join(os.tmpdir(), 'joplo-css-'));
  try {
    const out = (await viteBuild({
      configFile: false,
      envDir: false,
      root: path.dirname(web.projectCss),
      base: './',
      mode: 'production',
      logLevel: 'error',
      plugins: [joploProjectPlugin(projectDir, web), tailwindcss()],
      build: { outDir: cssOut, emptyOutDir: true, minify: true, sourcemap: false, reportCompressedSize: false, write: true, rolldownOptions: { input: { project: web.projectCss } } },
    })) as Rollup.RollupOutput | Rollup.RollupOutput[];
    const files = (Array.isArray(out) ? out : [out]).flatMap((o) => o.output.map((x) => x.fileName)).filter((f) => f.endsWith('.css'));
    if (files.length !== 1) throw new JoploError('EXPORT_FAILED', `作者 className 的样式编译结果异常：${files.join(', ') || '没有 CSS'}`);
    const rel = `assets/${path.basename(files[0]!)}`;
    fs.mkdirSync(path.join(staging, 'assets'), { recursive: true });
    fs.copyFileSync(path.join(cssOut, files[0]!), path.join(staging, rel));
    const siteHtml = path.join(staging, 'site.html');
    const html = fs.readFileSync(siteHtml, 'utf8');
    if (!html.includes('</head>')) throw new JoploError('EXPORT_FAILED', '预构建的 site.html 缺少 </head>');
    fs.writeFileSync(siteHtml, html.replace('</head>', `  <link rel="stylesheet" href="./${rel}">\n  </head>`));
  } finally {
    fs.rmSync(cssOut, { recursive: true, force: true });
  }
}

const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
