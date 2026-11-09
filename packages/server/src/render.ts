/**
 * renderStep：用随机端口启动一次性的 dev 服务（只编译一次、不监听），Playwright 打开渲染路由，
 * 截取舞台并返回元素索引（带 at）与渲染告警：遮挡、溢出、Toast 重叠、字体（PRD 8.8 / AC-22）。
 * 页面读取的 IR 与这里用来计算位置、隐藏元素的 IR 是同一份（无 TOCTOU）。
 *
 * Playwright 不装进项目（D66）：由 export-runtime 解析 Joplo 托管的运行时（兼容项目里已有的 playwright）；
 * 都没有时抛 EXPORT_COMPONENT_MISSING（带安装命令），这里从不下载。dev/check/build 不受影响。
 */
import fs from 'node:fs';
import path from 'node:path';
import type { Browser } from 'playwright-core';
import { JoploError, VIEWPORT_SIZE, isAppearanceFont, isAppearanceStroke, type AppearanceFont, type AppearanceStroke, displaySceneId, findNode, isNodeDisabled, nodeLabel, positionAfterStep, resolveProps, scopeProject, stateAt, walkNodes, type PlayState } from '@joplo-app/core';
import { exportLocale } from './locale.ts';
import type { RenderOptions, RenderResult, RenderedElement, SheetOptions, SheetResult } from './contract.ts';
import { createDev } from './dev.ts';
import { realProjectDir } from './vite-shared.ts';
import { joploHome } from './home.ts';
import { EXPORT_DOWNLOAD_MB, NOT_NEEDED, SETUP_COMMAND, loadPlaywright, type PlaywrightModule } from './export-runtime.ts';

const STAGE_SIZE = VIEWPORT_SIZE;

export { loadPlaywright, type PlaywrightModule } from './export-runtime.ts';

/** 浏览器启动失败时的一行提示（托管运行时与项目里的 Playwright 都适用：重装 Joplo 自己的导出组件）。 */
export function launchHint(e: unknown): string {
  const first = (e instanceof Error ? e.message : String(e)).split('\n')[0]!.trim();
  return `Screenshots need Chromium, but it failed to start (${first}). Run: ${SETUP_COMMAND} --force to reinstall the Joplo export component (about ${EXPORT_DOWNLOAD_MB} MB). ${NOT_NEEDED}`;
}

export async function launch({ chromium }: PlaywrightModule): Promise<Browser> {
  try {
    return await chromium.launch({ headless: true });
  } catch (first) {
    try {
      return await chromium.launch({ headless: true, channel: 'chrome' });
    } catch {
      throw new JoploError('RENDER_FAILED', launchHint(first));
    }
  }
}

/** 解析符号链接后的绝对路径；不存在的部分按原样拼接（以最近的已存在祖先为基准）。 */
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

/** 截图不得覆盖项目源文件或 .joplo/（即使传了 overwrite）。 */
function assertNotProjectData(projectDir: string, out: string) {
  const fold = (p: string) => (process.platform === 'darwin' || process.platform === 'win32' ? p.toLowerCase() : p);
  const o = fold(realish(out));
  const dir = fold(realish(projectDir));
  const dataDir = path.join(dir, '.joplo');
  if (o === dataDir || o.startsWith(dataDir + path.sep)) throw new JoploError('USAGE', `Cannot write to project data: ${out} (.joplo/ is managed by Joplo)`);
  if (/\.(tsx?|jsx?|mts)$/.test(o) && o.startsWith(dir + path.sep)) throw new JoploError('USAGE', `Cannot overwrite a project source file with a screenshot: ${out}`);
}

type PageReport = { elements: RenderedElement[]; warnings: string[] };

/**
 * 渲染路由的参数（纯函数）：主题必填（调用方缺省时传项目主题）；字体与线条（D55）只在指定且合法时带上，
 * 缺省 = 跟随主题，与 D55 之前的截图一致。
 */
export function renderQuery(q: { projectId: string; scenarioId: string; position: number; theme: string; locale?: string; content?: string; font?: AppearanceFont | null; stroke?: AppearanceStroke | null; viewport?: { width: number; height: number } }): string {
  return new URLSearchParams({
    render: '1',
    project: q.projectId,
    scenario: q.scenarioId,
    position: String(q.position),
    theme: q.theme,
    ...(exportLocale(q.locale) ? { locale: exportLocale(q.locale)! } : {}),
    ...(exportLocale(q.content) ? { content: exportLocale(q.content)! } : {}),
    ...(isAppearanceFont(q.font) ? { font: q.font } : {}),
    ...(isAppearanceStroke(q.stroke) ? { stroke: q.stroke } : {}),
    ...(q.viewport ? { w: String(q.viewport.width), h: String(q.viewport.height) } : {}),
  }).toString();
}

export async function renderStep(opts: RenderOptions): Promise<RenderResult> {
  const projectDir = realProjectDir(opts.projectDir);
  const out = path.resolve(opts.out);
  assertNotProjectData(projectDir, out);
  if (fs.existsSync(out) && !opts.overwrite) throw new JoploError('USAGE', `Output file already exists: ${out}. To overwrite, pass overwrite: true (CLI: --overwrite)`);

  // 先确认 Playwright 可用，再启动编译服务（缺失时尽快失败）
  const playwright = await loadPlaywright({ home: joploHome(), projectDir });
  const server = await createDev({ projectDir, port: 0, watch: false, log: () => undefined });
  let browser: Browser | null = null;
  try {
    const payload = server.payload();
    if (!payload.project) {
      const errs = payload.diagnostics.filter((d) => d.severity === 'error');
      throw new JoploError('INVALID_SCHEMA', `Project compilation failed: ${errs.map((d) => `${d.at ?? ''} ${d.message}`).join('; ')}`, { diagnostics: payload.diagnostics });
    }
    // 按场景保密分享（D75）：渲染页从同一个 payload 读 IR，替换成裁剪后的（watch: false，不会被重新编译覆盖）
    if (opts.scope?.length) payload.project = scopeProject(payload.project, opts.scope, 'publish').project;
    const project = payload.project;
    const sc = project.scenarios[opts.scenarioId];
    if (!sc) throw new JoploError('NOT_FOUND', `Scenario does not exist: ${opts.scenarioId} (available: ${Object.keys(project.scenarios).join(', ') || 'none'})`);
    // 内容语言（D84）写错时报错，不静默按源语言截图
    if (opts.content !== undefined && !project.i18n?.locales.includes(opts.content))
      throw new JoploError('USAGE', project.i18n ? `--content ${opts.content} is not in config locales (${project.i18n.locales.join(', ')})` : `--content needs config({ locales }); this project has a single language`);
    const position = opts.stepId ? positionAfterStep(project, sc.id, opts.stepId) : 0;
    const state: PlayState = stateAt(project, sc.id, position); // 回放失败会抛出 PLAYBACK_FAILED
    // 有层级的方案：截图与元素索引用这一步导演层的画面（每层一个独立画面）
    const scene = project.scenes[displaySceneId(project, sc.id, position)]!;
    const theme = opts.theme ?? project.theme ?? 'sketch';
    const next = state.completed ? undefined : sc.steps[position];
    const nextTargetId = next && 'target' in next.action ? next.action.target : null;
    const stage = STAGE_SIZE[scene.viewport === 'mobile' ? 'mobile' : 'desktop'];
    // 字幕与步骤标题条浮在舞台上（D97）：页面就是舞台大小
    const viewport = opts.viewport ?? { width: stage.width, height: stage.height };

    browser = await launch(playwright);
    const page = await browser.newPage({ viewport, deviceScaleFactor: opts.scale ?? 1, reducedMotion: 'reduce' });
    // D44：舞台宽度固定为页面自己的 viewport；指定 viewport 时它只是截图尺寸（舞台按比例放进去）
    const q = renderQuery({ projectId: server.projectId, scenarioId: sc.id, position, theme, locale: opts.locale, content: opts.content, font: opts.font, stroke: opts.stroke, ...(opts.viewport ? { viewport: opts.viewport } : {}) });
    await page.goto(`${server.url}?${q}`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => (window as unknown as { __JOPLO_READY__?: boolean }).__JOPLO_READY__ === true, null, { timeout: 60000 });
    const err = await page.evaluate(() => (window as unknown as { __JOPLO_ERROR__?: string | null }).__JOPLO_ERROR__ ?? null);
    if (err) throw new JoploError('RENDER_FAILED', `Render route reported an error: ${err}`);

    const report = (await page.evaluate(`(${COLLECT_REPORT})(${JSON.stringify({ nextTargetId, theme })})`)) as PageReport;
    const png = await page.locator(opts.viewport ? '[data-jshot]' : '[data-jrender]').screenshot({ type: 'png', animations: 'disabled' });
    fs.mkdirSync(path.dirname(out), { recursive: true });
    if (opts.overwrite) fs.writeFileSync(out, png);
    else fs.writeFileSync(out, png, { flag: 'wx' });

    // DOM 中没有的节点（隐藏/未渲染）也列入索引，visible=false
    const seen = new Set(report.elements.map((e) => e.id));
    const hidden: RenderedElement[] = [];
    walkNodes(scene.root, (node) => {
      if (seen.has(node.id) || node.type === '#text') return;
      hidden.push({
        id: node.id,
        type: node.type,
        label: nodeLabel({ type: node.type, props: resolveProps(node, state), children: node.children }),
        visible: false,
        disabled: isNodeDisabled(node, state),
        at: node.source ?? null,
        box: { x: 0, y: 0, width: 0, height: 0 },
      });
    });
    const elements = [...report.elements, ...hidden];
    const warnings = [...report.warnings];
    if (nextTargetId && findNode(scene, nextTargetId) && !elements.find((e) => e.id === nextTargetId && e.visible)) warnings.push(`Next action target ${nextTargetId} is not visible in the stage`);
    return { path: out, sceneId: scene.id, position, elements, warnings, scale: opts.scale ?? 1 };
  } finally {
    await browser?.close().catch(() => undefined);
    await server.close();
  }
}

const esc = (t: string) => t.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

/**
 * 分镜（storyboard）：一个场景从初始画面到最后一步，每一步截一张（与 renderStep 同一渲染路由），
 * 拼成网格；每格下面写步号、字幕、旁白（narrate，没有时是台词 say）。Agent 一张图看完整场的画面与节奏，
 * 检查空镜、出画、遮挡、字太小，再对照旁白读一遍。告警按步号前缀汇总。
 */
export async function renderSheet(opts: SheetOptions): Promise<SheetResult> {
  const projectDir = realProjectDir(opts.projectDir);
  const out = path.resolve(opts.out);
  assertNotProjectData(projectDir, out);
  if (fs.existsSync(out) && !opts.overwrite) throw new JoploError('USAGE', `Output file already exists: ${out}. To overwrite, pass overwrite: true (CLI: --overwrite)`);
  const columns = Math.max(1, Math.min(6, Math.round(opts.columns ?? 3)));
  const cellWidth = Math.max(240, Math.min(1280, Math.round(opts.cellWidth ?? 480)));
  const playwright = await loadPlaywright({ home: joploHome(), projectDir });
  const server = await createDev({ projectDir, port: 0, watch: false, log: () => undefined });
  let browser: Browser | null = null;
  try {
    const payload = server.payload();
    if (!payload.project) {
      const errs = payload.diagnostics.filter((d) => d.severity === 'error');
      throw new JoploError('INVALID_SCHEMA', `Project compilation failed: ${errs.map((d) => `${d.at ?? ''} ${d.message}`).join('; ')}`, { diagnostics: payload.diagnostics });
    }
    const project = payload.project;
    const sc = project.scenarios[opts.scenarioId];
    if (!sc) throw new JoploError('NOT_FOUND', `Scenario does not exist: ${opts.scenarioId} (available: ${Object.keys(project.scenarios).join(', ') || 'none'})`);
    if (opts.content !== undefined && !project.i18n?.locales.includes(opts.content))
      throw new JoploError('USAGE', project.i18n ? `--content ${opts.content} is not in config locales (${project.i18n.locales.join(', ')})` : `--content needs config({ locales }); this project has a single language`);
    const theme = opts.theme ?? project.theme ?? 'sketch';
    browser = await launch(playwright);
    const cells: { png: string; label: string; caption: string; voice: string }[] = [];
    const warnings: string[] = [];
    for (let position = 0; position <= sc.steps.length; position++) {
      const state: PlayState = stateAt(project, sc.id, position);
      const scene = project.scenes[displaySceneId(project, sc.id, position)]!;
      const stage = STAGE_SIZE[scene.viewport === 'mobile' ? 'mobile' : 'desktop'];
      const next = state.completed ? undefined : sc.steps[position];
      const nextTargetId = next && 'target' in next.action ? next.action.target : null;
      const page = await browser.newPage({ viewport: { width: stage.width, height: stage.height }, deviceScaleFactor: 1, reducedMotion: 'reduce' });
      const q = renderQuery({ projectId: server.projectId, scenarioId: sc.id, position, theme, locale: opts.locale, content: opts.content, font: opts.font, stroke: opts.stroke });
      await page.goto(`${server.url}?${q}`, { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => (window as unknown as { __JOPLO_READY__?: boolean }).__JOPLO_READY__ === true, null, { timeout: 60000 });
      const err = await page.evaluate(() => (window as unknown as { __JOPLO_ERROR__?: string | null }).__JOPLO_ERROR__ ?? null);
      if (err) throw new JoploError('RENDER_FAILED', `Render route reported an error at step ${position}: ${err}`);
      const report = (await page.evaluate(`(${COLLECT_REPORT})(${JSON.stringify({ nextTargetId, theme })})`)) as PageReport;
      for (const w of report.warnings) warnings.push(`Step ${position}: ${w}`);
      const png = await page.locator('[data-jrender]').screenshot({ type: 'png', animations: 'disabled' });
      await page.close();
      const step = position > 0 ? sc.steps[position - 1] : undefined;
      cells.push({
        png: png.toString('base64'),
        label: position === 0 ? '0 · start' : `${position} · ${step!.kind}`,
        caption: step?.caption ?? sc.description ?? sc.name,
        voice: step?.narrate ?? step?.say ?? '',
      });
    }
    const html = `<!doctype html><meta charset="utf-8"><style>
      body{margin:0;padding:24px;background:#16181d;color:#e8e8ea;font:14px/1.45 -apple-system,"PingFang SC","Noto Sans SC",system-ui,sans-serif}
      h1{font-size:18px;margin:0 0 16px} .grid{display:grid;grid-template-columns:repeat(${columns},${cellWidth}px);gap:18px}
      .cell img{width:100%;display:block;border-radius:6px;border:1px solid #2c2f38} .meta{padding:6px 2px 0}
      .n{color:#ffb020;font-weight:700} .cap{font-weight:600} .voice{color:#a0a4b0;margin-top:2px}
    </style><h1>${esc(sc.name)} · ${esc(sc.id)} · ${sc.steps.length} steps</h1><div class="grid">${cells.map((c) => `<div class="cell"><img src="data:image/png;base64,${c.png}"><div class="meta"><span class="n">${esc(c.label)}</span> <span class="cap">${esc(c.caption)}</span>${c.voice ? `<div class="voice">${esc(c.voice)}</div>` : ''}</div></div>`).join('')}</div>`;
    const sheet = await browser.newPage({ viewport: { width: columns * cellWidth + (columns - 1) * 18 + 48, height: 800 }, deviceScaleFactor: 1 });
    await sheet.setContent(html, { waitUntil: 'load' });
    const png = await sheet.screenshot({ type: 'png', fullPage: true });
    fs.mkdirSync(path.dirname(out), { recursive: true });
    if (opts.overwrite) fs.writeFileSync(out, png);
    else fs.writeFileSync(out, png, { flag: 'wx' });
    return { path: out, steps: sc.steps.length, warnings };
  } finally {
    await browser?.close().catch(() => undefined);
    await server.close();
  }
}

const COLLECT_REPORT = fs.readFileSync(path.join(import.meta.dirname, 'page-report.js'), 'utf8').replace(/^\/\*[\s\S]*?\*\/\s*/, '');
