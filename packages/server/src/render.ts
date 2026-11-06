/**
 * renderStep：用随机端口启动一次性的 dev 服务（只编译一次、不监听），Playwright 打开渲染路由，
 * 截取舞台并返回元素索引（带 at）与渲染告警：遮挡、溢出、Toast 重叠、字体（PRD 8.8 / AC-22）。
 * 页面读取的 IR 与这里用来计算位置、隐藏元素的 IR 是同一份（无 TOCTOU）。
 *
 * Playwright 是可选依赖（D36）：只在这里按需载入；没装或没有浏览器时给出安装命令，dev/check/build 不受影响。
 */
import fs from 'node:fs';
import path from 'node:path';
import type { Browser } from 'playwright';
import { JoploError, SUBTITLE_HEIGHT, VIEWPORT_SIZE, isAppearanceFont, isAppearanceStroke, type AppearanceFont, type AppearanceStroke, displaySceneId, findNode, isNodeDisabled, nodeLabel, positionAfterStep, resolveProps, stateAt, walkNodes, type PlayState } from '@joplo-app/core';
import { exportLocale } from './locale.ts';
import type { RenderOptions, RenderResult, RenderedElement } from './contract.ts';
import { createDev } from './dev.ts';
import { realProjectDir } from './vite-shared.ts';

const STAGE_SIZE = VIEWPORT_SIZE;

export type PlaywrightModule = typeof import('playwright');
const NOT_NEEDED = 'dev, check, and build do not require it.';

const isMissingModule = (e: unknown) => {
  const code = (e as NodeJS.ErrnoException | null)?.code;
  return (code === 'ERR_MODULE_NOT_FOUND' || code === 'MODULE_NOT_FOUND') && /playwright/.test(e instanceof Error ? e.message : String(e));
};

/** 按需载入 Playwright；没有安装时抛出带安装命令的 RENDER_FAILED。 */
export async function loadPlaywright(importer: () => Promise<PlaywrightModule> = () => import('playwright')): Promise<PlaywrightModule> {
  try {
    return await importer();
  } catch (e) {
    if (!isMissingModule(e)) throw e;
    throw new JoploError('RENDER_FAILED', `Screenshots require Playwright and Chromium, which are not installed. Run: npm i -D playwright && npx playwright install chromium (about 150 MB). ${NOT_NEEDED}`);
  }
}

/** 浏览器启动失败时的一行提示。 */
export function launchHint(e: unknown): string {
  const first = (e instanceof Error ? e.message : String(e)).split('\n')[0]!.trim();
  return `Screenshots require Chromium; browser launch failed (${first}). Run: npx playwright install chromium (about 150 MB). ${NOT_NEEDED}`;
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
export function renderQuery(q: { projectId: string; scenarioId: string; position: number; theme: string; locale?: string; font?: AppearanceFont | null; stroke?: AppearanceStroke | null; viewport?: { width: number; height: number } }): string {
  return new URLSearchParams({
    render: '1',
    project: q.projectId,
    scenario: q.scenarioId,
    position: String(q.position),
    theme: q.theme,
    ...(exportLocale(q.locale) ? { locale: exportLocale(q.locale)! } : {}),
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
  const playwright = await loadPlaywright();
  const server = await createDev({ projectDir, port: 0, watch: false, log: () => undefined });
  let browser: Browser | null = null;
  try {
    const payload = server.payload();
    const project = payload.project;
    if (!project) {
      const errs = payload.diagnostics.filter((d) => d.severity === 'error');
      throw new JoploError('INVALID_SCHEMA', `Project compilation failed: ${errs.map((d) => `${d.at ?? ''} ${d.message}`).join('; ')}`, { diagnostics: payload.diagnostics });
    }
    const sc = project.scenarios[opts.scenarioId];
    if (!sc) throw new JoploError('NOT_FOUND', `Scenario does not exist: ${opts.scenarioId} (available: ${Object.keys(project.scenarios).join(', ') || 'none'})`);
    const position = opts.stepId ? positionAfterStep(project, sc.id, opts.stepId) : 0;
    const state: PlayState = stateAt(project, sc.id, position); // 回放失败会抛出 PLAYBACK_FAILED
    // 有层级的方案：截图与元素索引用这一步导演层的画面（每层一个独立画面）
    const scene = project.scenes[displaySceneId(project, sc.id, position)]!;
    const theme = opts.theme ?? project.theme ?? 'sketch';
    const next = state.completed ? undefined : sc.steps[position];
    const nextTargetId = next && 'target' in next.action ? next.action.target : null;
    const stage = STAGE_SIZE[scene.viewport === 'mobile' ? 'mobile' : 'desktop'];
    // 舞台正下方是字幕区（与演示页一致）：页面高度加上字幕区，截图截舞台 + 字幕区
    const viewport = opts.viewport ?? { width: stage.width, height: stage.height + SUBTITLE_HEIGHT };

    browser = await launch(playwright);
    const page = await browser.newPage({ viewport, deviceScaleFactor: opts.scale ?? 1, reducedMotion: 'reduce' });
    // D44：舞台宽度固定为页面自己的 viewport；指定 viewport 时它只是截图尺寸（舞台按比例放进去）
    const q = renderQuery({ projectId: server.projectId, scenarioId: sc.id, position, theme, locale: opts.locale, font: opts.font, stroke: opts.stroke, ...(opts.viewport ? { viewport: opts.viewport } : {}) });
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

const COLLECT_REPORT = fs.readFileSync(path.join(import.meta.dirname, 'page-report.js'), 'utf8').replace(/^\/\*[\s\S]*?\*\/\s*/, '');
