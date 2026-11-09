import { binaryAssets, extractSiteAssets } from './binary-assets.ts';
import { inlineResources } from './local-resources.ts';
import { inlinePluginAssets, PLUGIN_ASSET_BASE } from './plugin-assets.ts';
import sharedModules from '@joplo-app/web/shared-modules.json' with { type: 'json' };
/**
 * `joplo build`：静态发布站。
 *
 * 1. 用 Vite（中间件模式，不监听端口）ssrLoadModule 载入项目，compile(…, 'publish')：只含选定方案，
 *    已去掉规则、情况、问题、备注、源路径（D33）。这里再去掉 IR 中创作侧的空字段与约束、角色。
 * 2. vite build 发布站入口（packages/web/site.html），Tailwind 以项目目录为 @source。
 * 3. 后处理：IR 内联到 index.html；入口脚本内联为 <script type="module">、去掉 crossorigin，
 *    这样直接双击 index.html（file://）也能离线运行。产物是普通静态目录，可 `wrangler deploy --assets` 或任何静态托管发布。
 *
 * `review: true`（评审版，D63）时第 1 步用 compile 的 review 模式：含所有功能的所有方案，同样去掉创作侧信息；其余步骤相同。
 *
 * 目标目录非空且没有 overwrite 时拒绝写入；永远不清空项目目录本身或它的上级目录。
 *
 * 从 npm 安装时（web-assets.ts 的 dist 形态）第 2 步不编译界面源码：复制 @joplo-app/web 预构建的发布站，
 * 只用 Tailwind 编译作者 className 用到的工具类（project.css → assets/project-*.css），再做第 3 步。
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import tailwindcss from '@tailwindcss/vite';
import { build as viteBuild, createServer, type Rollup } from 'vite';
import { stepIdentity, type StepIdentity, hasScope, JoploError, entriesOf, entryOf, orderedFeatures, pruneMessages, resolveScope, scopeProject, type Project, type ScopeInfo } from '@joplo-app/core';
import type { BuildOptions, BuildResult } from './contract.ts';
import { compileProject } from './project.ts';
import { joploProjectPlugin, kitAliases, locateWebAssets, realProjectDir } from './vite-shared.ts';
import type { DistWeb, SourceWeb, WebAssets } from './web-assets.ts';
import { subsetSiteFonts } from './site-fonts.ts';
import { joploHome } from './home.ts';
import { ProfileStore, bundleVoice, reuseSharedVoice } from './voice.ts';

/** 发布站只需要的 IR：去掉创作侧字段（publish 模式下它们本来就为空）。层级、镜头、角色（说话人、过渡卡、层级的 role）与 featureIds 顺序属于演示，保留（D43 / D56 / D61）。 */
export function publishPayload(project: Project, home: string | null): { project: Record<string, unknown>; home: string | null } {
  // voiceConfig（D74）：profile 名与音色属于作者本机的设置，发布站只需要 build 写进的 voiceIndex
  const { rules: _r, cases: _c, issues: _i, voiceConfig: _v, ...rest } = project;
  const features = Object.fromEntries(orderedFeatures(project).map(f => [f.id, {
    id: f.id, name: f.name, goal: f.goal, roles: f.roles, optionIds: f.optionIds, pick: f.pick,
    // 作品能力与观众属于公开内容；只复制已有字段，保持旧功能演示的载荷逐字节不变。draft 仍只属于 dev。
    ...(f.standalone !== undefined ? { standalone: f.standalone } : {}),
    ...(f.audience !== undefined ? { audience: f.audience } : {}),
  }]));
  const options = Object.fromEntries(Object.entries(project.options).map(([id, o]) => [id, { id: o.id, featureId: o.featureId, key: o.key, name: o.name, idea: o.idea, routes: o.routes, coverage: {}, layers: o.layers ?? {}, ...(o.sequencing ? { sequencing: o.sequencing } : {}), ...(o.free ? {free:o.free} : {}) }]));
  const scenarios = Object.fromEntries(
    Object.entries(project.scenarios).map(([id, s]) => {
      const { caseIds: _ci, ...sr } = s;
      return [id, { ...sr, caseIds: [], steps: s.steps.map(({ ruleIds: _ri, key: _key, ...st }) => ({ ...st, ruleIds: [] })) }];
    }),
  );
  const out = { ...rest, features, options, scenarios };
  // 译文（D84）在去掉创作侧字段之后再裁剪一次：约束等只给作者看的原文不能作为译文的键留在站点里
  return { project: rest.i18n ? pruneMessages(out as unknown as Project) : out, home: home && project.routes[home] ? home : null };
}

/** 把 JSON 安全地放进 <script type="application/json">。 */
export const jsonForHtml = (v: unknown) => JSON.stringify(v).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');

/** 后处理 vite 产出的 HTML：内联 IR、内联入口脚本、去掉 crossorigin（file:// 下 CORS 会失败）。 */
export function finalizeHtml(html: string, readAsset: (rel: string) => string, inline: { project: unknown; home: string | null; scoped?: true }, identity?: StepIdentity): { html: string; inlined: string[] } {
  const inlined: string[] = [];
  let out = html.replace(/\s+crossorigin(?:="[^"]*")?/g, '');
  // 作者标记只由 Cloud 注入，不能随本地构建或导出传播。
  out = out.replace(/<meta\b[^>]*\bname\s*=\s*["']joplo-author["'][^>]*>/gi, '');
  out = out.replace(/<link rel="modulepreload"[^>]*>\s*/g, '');
  out = out.replace(/<script type="module" src="\.\/([^"]+)"><\/script>/g, (_m, rel: string) => {
    inlined.push(rel);
    const code = readAsset(rel).replace(/<\/script/gi, '<\\/script');
    return `<script type="module">${code}</script>`;
  });
  const data = `<meta name="joplo-feature-diff-player" content="1"><script type="application/json" id="joplo-ir">${jsonForHtml(inline)}</script>` + (identity ? `\n<script type="application/json" id="joplo-step-keys">${jsonForHtml(identity)}</script>` : '');
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
  if (!fs.existsSync(projectDir)) throw new JoploError('NOT_FOUND', `Project directory does not exist: ${projectDir}`);
  const outDir = realish(opts.outDir ?? path.join(projectDir, 'dist'));

  // 目标目录安全检查（先于任何耗时工作）
  if (outDir === projectDir || projectDir.startsWith(outDir + path.sep) || outDir === os.homedir() || outDir === path.parse(outDir).root)
    throw new JoploError('USAGE', `Cannot write the published site to ${outDir}: it is the project directory or its parent`);
  if (outDir === path.join(projectDir, '.joplo') || outDir.startsWith(path.join(projectDir, '.joplo') + path.sep)) throw new JoploError('USAGE', `Cannot write to .joplo/: ${outDir}`);
  const nonEmpty = fs.existsSync(outDir) && (!fs.statSync(outDir).isDirectory() || fs.readdirSync(outDir).length > 0);
  if (nonEmpty && !opts.overwrite) throw new JoploError('USAGE', `Output directory is not empty: ${outDir}. After confirming it can be cleared, pass overwrite: true (CLI: --overwrite)`);
  if (nonEmpty && fs.existsSync(path.join(outDir, 'joplo.config.ts'))) throw new JoploError('USAGE', `Output directory appears to be a Joplo project (contains joplo.config.ts); refusing to clear: ${outDir}`);

  const web = locateWebAssets();

  // 1. 编译（publish；评审版用 review）
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
    compiled = await compileProject(loader, projectDir, opts.review === true ? 'review' : 'publish');
    // 发布编译已跳过草稿与未选功能；范围的公开校验需要原始条目，避免误报不存在。
    if (opts.scope?.features?.length || opts.scope?.scenarios?.length && compiled.diagnostics.some(d => d.code === 'WORK_DRAFT_SKIPPED')) {
      const dev = await compileProject(loader, projectDir, 'dev');
      if (dev.project) {
        for (const id of opts.scope?.features ?? []) {
          const entry = entryOf(dev.project, id);
          if (!entry) throw new JoploError('NOT_FOUND', `Unknown work "${id}". Works: ${entriesOf(dev.project).map(e => e.id).join(', ') || 'none'}`);
          if (entry.featureId === null && !entry.slices.length) throw new JoploError('USAGE', `Work "${id}" has no slices and cannot be published or reviewed. Add at least one flow() or chapter() in scenarios`);
          if (entry.draft) throw new JoploError('USAGE', `Work "${id}" is a draft and cannot be published or reviewed. Remove draft: true when it is ready`);
        }
        for (const id of opts.scope?.scenarios ?? []) {
          const slice = dev.project.scenarios[id];
          const entry = slice && entryOf(dev.project, dev.project.options[slice.optionId]?.featureId);
          if (entry?.draft) throw new JoploError('USAGE', `Work "${entry.id}" is a draft and cannot be published or reviewed. Remove draft: true when it is ready`);
        }
        // 同时保留原有功能未选定、场景拼错与空范围的恢复提示。
        resolveScope(dev.project, opts.scope!, opts.review === true ? 'review' : 'publish');
      }
    }
  } finally {
    await loader.close();
  }
  if (!compiled.project) {
    const errs = compiled.diagnostics.filter((d) => d.severity === 'error');
    throw new JoploError('EXPORT_FAILED', `Project compilation failed; no published site was generated: \n${errs.map((d) => `${d.at ?? ''}  ${d.message}`).join('\n')}`, { diagnostics: compiled.diagnostics });
  }
  if (!entriesOf(compiled.project).length && compiled.diagnostics.some(d => d.code === 'WORK_DRAFT_SKIPPED' || d.code === 'WORK_EMPTY'))
    throw new JoploError('USAGE', compiled.diagnostics.some(d => d.code === 'WORK_EMPTY') ? 'There is no picked option or publishable work. Add at least one flow() or chapter() to an empty work before building' : 'There is no picked option or publishable work. All standalone works are drafts; remove draft: true when ready', { diagnostics: compiled.diagnostics });
  // 按场景保密分享（D75）：先裁剪 IR，再生成产物；写错范围在写任何文件之前报错
  let project = compiled.project;
  let scope: ScopeInfo | undefined;
  if (hasScope(opts.scope)) {
    const mode = opts.review === true ? 'review' : 'publish';
    const r = scopeProject(project, resolveScope(project, opts.scope, mode), mode);
    project = r.project;
    scope = r.info;
  }
  let mediaCredits: string[] = [], mediaLicenses:string[]=[];
  if (compiled.resources) {
    const resources = await inlineResources(project, compiled.resources.requests, compiled.resources.host);
    if (Object.keys(resources.assets).length) project = { ...project, mediaAssets: resources.assets,mediaInfo:resources.audioInfo };
    compiled.diagnostics.push(...resources.diagnostics);
    mediaCredits = resources.credits;mediaLicenses=resources.licenses;
    if(resources.diagnostics.some(d=>d.severity==='error'))throw new JoploError('EXPORT_FAILED','Audio attribution is incomplete; no site was published',{diagnostics:resources.diagnostics});
  }
  binaryAssets(project, {diagnostics:compiled.diagnostics});
  const inline: { project: Record<string, unknown>; home: string | null; scoped?: true } = publishPayload(project, compiled.home);
  if (scope) inline.scoped = true;

  // 2. vite build 到临时目录
  const staging = fs.mkdtempSync(path.join(os.tmpdir(), 'joplo-build-'));
  let voiceReport: BuildResult['voice'];
  // React 与 plugin-react 依据 NODE_ENV 判断生产构建（测试运行器会把它设为 test）；构建期间强制 production。
  const prevEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';
  try {
    if (web.mode === 'dist') await stageDistSite(web, projectDir, staging);
    else await buildSourceSite(web, projectDir, staging);

    // 朗读（D74）：当前声音已生成的音频拷进 voice/，IR 带上 voiceIndex；Key 不进产物
    const store = new ProfileStore(opts.home ?? joploHome());
    // 重新发布（D84）：先从上一次的分享沿用本机没有的音频（同样的文字与声音），不重新生成
    const reused = opts.sharedVoice ? await reuseSharedVoice(projectDir, project, opts.sharedVoice, store, undefined, opts.voiceDefault) : 0;
    const voice = bundleVoice(projectDir, project, staging, store, undefined, opts.sharedVoice?.index, opts.voiceDefault);
    if (reused) voice.report.reused = reused;
    // 朗读角色只留范围内功能的（scopeProject 对 voiceIndex 的同一规则；bundleVoice 按声音配置生成全部角色）
    if (voice.index) inline.project.voiceIndex = scope ? scopeProject({ ...project, voiceIndex: voice.index }, scope.scenarios).project.voiceIndex : voice.index;
    voiceReport = voice.report;

    // 素材写成独立文件（D98）：IR 里的图片、模型、音频、视频 data URL → assets/<sha256>.<ext>，页面按相对路径引用；
    // 构建产物只保证通过 HTTP 打开（Cloud 分享、joplo preview、任意静态服务器），不再支持 file:// 双击。
    inline.project = extractSiteAssets(inline.project, { directory: path.join(staging, 'assets'), prefix: './assets/' }).value;

    // 3. 后处理
    const siteHtml = path.join(staging, 'site.html');
    const { html, inlined } = finalizeHtml(fs.readFileSync(siteHtml, 'utf8'), (rel) => fs.readFileSync(path.join(staging, rel), 'utf8'), inline, stepIdentity(project));
    fs.rmSync(siteHtml);
    for (const rel of inlined) fs.rmSync(path.join(staging, rel));
    // 插件运行时（D86）：每个打成一个文件，内联在入口脚本之前（file:// 也能打开）；只打包 IR 里用到的插件
    const used = Object.fromEntries(Object.entries(compiled.pluginRuntimes).filter(([id]) => project.plugins?.[id]));
    const pluginCode = await bundlePluginRuntimes(used, projectDir, web);
    let withPlugins = injectPluginScripts(html, pluginCode);
    if (mediaCredits.length) {
      if(mediaLicenses.length)fs.writeFileSync(path.join(staging,'music-LICENSE.txt'),mediaLicenses.join('\n\n'));
      fs.writeFileSync(path.join(staging, 'credits.txt'), `Music sound libraries\n\n${mediaCredits.join('\n\n')}\n`);
      withPlugins = withPlugins.replace('</head>', '<link rel="license" href="./credits.txt" title="Music credits"></head>');
    }
    fs.writeFileSync(path.join(staging, 'index.html'), withPlugins.replace(/<title>[^<]*<\/title>/i, () => `<title>${escapeHtml(project.name)} · Joplo</title>`));

    // D59: scan every staged text artifact, then retain only font subsets its content needs.
    subsetSiteFonts(staging, web);

    const siteBytes=listFiles(staging).reduce((n,f)=>n+fs.statSync(path.join(staging,f)).size,0);
    compiled.diagnostics.push({severity:'info',source:'structure',code:'SITE_BUDGET',message:`Complete site: ${siteBytes} bytes (including asset files, fonts and narration)`});
    if(siteBytes>=18*1024*1024)compiled.diagnostics.push({severity:'warning',source:'structure',code:'SITE_BUDGET_LARGE',message:'Site approaches the documented Free 20 MiB single-upload budget (18 MiB warning); actual account limits come from the service'});
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
    ...(entriesOf(project).some(e => e.featureId === null || e.sequencing === 'linear') ? { entries: entriesOf(project).map(e => ({ id: e.id, title: e.title, slices: e.slices.length, sequencing: e.sequencing })) } : {}),
    ...(voiceReport && (voiceReport.clips || voiceReport.profile) ? { voice: voiceReport } : {}),
    ...(scope ? { scope } : {}),
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
    resolve: { alias: [{ find: /^@joplo-app\/core(?:\/runtime)?$/, replacement: path.join(web.webDir, 'src/site/core-lite.ts') }, ...kitAliases(web, projectDir)] },
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
    if (files.length !== 1) throw new JoploError('EXPORT_FAILED', `Unexpected stylesheet compilation result for author className: ${files.join(', ') || 'No CSS'}`);
    const rel = `assets/${path.basename(files[0]!)}`;
    fs.mkdirSync(path.join(staging, 'assets'), { recursive: true });
    fs.copyFileSync(path.join(cssOut, files[0]!), path.join(staging, rel));
    const siteHtml = path.join(staging, 'site.html');
    const html = fs.readFileSync(siteHtml, 'utf8');
    if (!html.includes('</head>')) throw new JoploError('EXPORT_FAILED', 'Prebuilt site.html is missing </head>');
    fs.writeFileSync(siteHtml, html.replace('</head>', `  <link rel="stylesheet" href="./${rel}">\n  </head>`));
  } finally {
    fs.rmSync(cssOut, { recursive: true, force: true });
  }
}

/**
 * 把每个插件运行时打成一个自包含的 ES 模块（依赖一起打进去），执行时注册到 globalThis.__JOPLO_PLUGINS__
 * （web 的 renderer/plugins.ts 取走）。按插件 id 排序，产物稳定。
 */
export async function bundlePluginRuntimes(runtimes: Record<string, string>, projectDir: string, web: WebAssets, mode: 'factory' | 'module' = 'factory'): Promise<string[]> {
  const out: string[] = [];
  const modules: Record<string, string[]> = sharedModules;
  const shared = Object.keys(modules);
  const bridge = (name: string) => {
    const keys = modules[name]!;
    return `const shared = globalThis.__JOPLO_SHARED__[${JSON.stringify(name)}]; export default shared; ${keys.map(k => `export const ${k} = shared.${k};`).join(' ')}`;
  };
  for (const [id, file] of Object.entries(runtimes).sort(([a], [b]) => a.localeCompare(b))) {
    const entry = '\0joplo-plugin-entry';
    const r = (await viteBuild({
      configFile: false,
      envDir: false,
      root: path.dirname(file),
      base: PLUGIN_ASSET_BASE,
      mode: 'production',
      logLevel: 'error',
      resolve: { alias: kitAliases(web, projectDir) },
      define: { 'process.env.NODE_ENV': '"production"' },
      oxc: { jsx: { runtime: 'automatic', importSource: 'react', development: false } },
      plugins: [{
        name: 'joplo:plugin-entry',
        // Resolve shared modules before Vite finds a plugin's installed React copy.
        enforce: 'pre',
        resolveId: (src) => src === 'joplo-plugin-entry' ? entry : shared.includes(src) ? `\0joplo-shared:${src}` : null,
        load: (resolved) => (resolved.startsWith('\0joplo-shared:') ? bridge(resolved.slice('\0joplo-shared:'.length)) : resolved === entry ? `import runtime from ${JSON.stringify(file)};\n${mode === 'module' ? 'export default runtime;' : '(globalThis.__JOPLO_PLUGINS__ ??= []).push(runtime);'}\n` : null),
      }],
      build: { write: false, assetsInlineLimit: 0, cssCodeSplit: false, minify: true, sourcemap: false, modulePreload: false, reportCompressedSize: false, emptyOutDir: false, rolldownOptions: { input: 'joplo-plugin-entry', ...(mode === 'module' ? {preserveEntrySignatures:'strict' as const} : {}), output: { format: 'es', codeSplitting: false } } },
    })) as Rollup.RollupOutput | Rollup.RollupOutput[];
    const output=(Array.isArray(r)?r:[r]).flatMap(o=>o.output);
    const chunks=output.filter((x):x is Rollup.OutputChunk=>x.type==='chunk');
    if (chunks.length !== 1) throw new JoploError('EXPORT_FAILED', `Plugin ${id}: expected one bundled runtime file, got ${chunks.length}`);
    const code=inlinePluginAssets(id,chunks[0]!.code,output.filter((x):x is Rollup.OutputAsset=>x.type==='asset'));
    // Defer evaluation until the host has initialized its shared React instance.
    out.push(mode === 'module' ? code : `(globalThis.__JOPLO_PLUGIN_FACTORIES__ ??= []).push({id:${JSON.stringify(id)},load:()=>{\n${code}\n}});`);
  }
  return out;
}

/** 插件脚本放在第一个模块脚本（入口）之前：模块脚本按文档顺序执行，注册表载入时插件已经就位。 */
export function injectPluginScripts(html: string, codes: string[]): string {
  if (!codes.length) return html;
  const tags = codes.map((c) => `<script type="module" data-joplo-plugin>${c.replace(/<\/script/gi, '<\\/script')}</script>`).join('\n');
  const i = html.indexOf('<script type="module">');
  if (i < 0) throw new JoploError('EXPORT_FAILED', 'Published site has no entry script to put plugin runtimes before');
  return `${html.slice(0, i)}${tags}\n${html.slice(i)}`;
}

const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
