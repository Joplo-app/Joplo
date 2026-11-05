/**
 * renderStep：用随机端口启动一次性的 dev 服务（只编译一次、不监听），Playwright 打开渲染路由，
 * 截取舞台并返回元素索引（带 at）与渲染告警：遮挡、溢出、Toast 重叠、字体（PRD 8.8 / AC-22）。
 * 页面读取的 IR 与这里用来计算位置、隐藏元素的 IR 是同一份（无 TOCTOU）。
 */
import fs from 'node:fs';
import path from 'node:path';
import { chromium, type Browser } from 'playwright';
import { JoploError, VIEWPORT_SIZE, findNode, isNodeDisabled, nodeLabel, positionAfterStep, resolveProps, stateAt, walkNodes, type PlayState } from '@joplo/core';
import type { RenderOptions, RenderResult, RenderedElement } from './contract.ts';
import { createDev } from './dev.ts';
import { realProjectDir } from './vite-shared.ts';

const STAGE_SIZE = VIEWPORT_SIZE;

async function launch(): Promise<Browser> {
  try {
    return await chromium.launch({ headless: true });
  } catch (first) {
    try {
      return await chromium.launch({ headless: true, channel: 'chrome' });
    } catch {
      throw new JoploError('RENDER_FAILED', `无法启动浏览器：${first instanceof Error ? first.message.split('\n')[0] : String(first)}。可运行 pnpm exec playwright install chromium`);
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
  if (o === dataDir || o.startsWith(dataDir + path.sep)) throw new JoploError('USAGE', `不能写入项目数据：${out}（.joplo/ 由 Joplo 管理）`);
  if (/\.(tsx?|jsx?|mts)$/.test(o) && o.startsWith(dir + path.sep)) throw new JoploError('USAGE', `不能用截图覆盖项目源文件：${out}`);
}

type PageReport = { elements: RenderedElement[]; warnings: string[] };

export async function renderStep(opts: RenderOptions): Promise<RenderResult> {
  const projectDir = realProjectDir(opts.projectDir);
  const out = path.resolve(opts.out);
  assertNotProjectData(projectDir, out);
  if (fs.existsSync(out) && !opts.overwrite) throw new JoploError('USAGE', `目标文件已存在：${out}。如需覆盖请传 overwrite: true（CLI：--overwrite）`);

  const server = await createDev({ projectDir, port: 0, watch: false, log: () => undefined });
  let browser: Browser | null = null;
  try {
    const payload = server.payload();
    const project = payload.project;
    if (!project) {
      const errs = payload.diagnostics.filter((d) => d.severity === 'error');
      throw new JoploError('INVALID_SCHEMA', `项目编译失败：${errs.map((d) => `${d.at ?? ''} ${d.message}`).join('；')}`, { diagnostics: payload.diagnostics });
    }
    const sc = project.scenarios[opts.scenarioId];
    if (!sc) throw new JoploError('NOT_FOUND', `场景不存在：${opts.scenarioId}（可用：${Object.keys(project.scenarios).join('、') || '无'}）`);
    const position = opts.stepId ? positionAfterStep(project, sc.id, opts.stepId) : 0;
    const state: PlayState = stateAt(project, sc.id, position); // 回放失败会抛出 PLAYBACK_FAILED
    const scene = project.scenes[state.sceneId]!;
    const theme = opts.theme ?? 'sketch';
    const next = state.completed ? undefined : sc.steps[position];
    const nextTargetId = next && 'target' in next.action ? next.action.target : null;
    const stage = STAGE_SIZE[scene.viewport === 'mobile' ? 'mobile' : 'desktop'];
    const viewport = opts.viewport ?? stage;

    browser = await launch();
    const page = await browser.newPage({ viewport, deviceScaleFactor: opts.scale ?? 1, reducedMotion: 'reduce' });
    // 指定 viewport 时舞台按该尺寸渲染（响应式属性、visibleFrom/hiddenFrom、AppShell 收起随之变化）
    const q = new URLSearchParams({ render: '1', scenario: sc.id, position: String(position), theme, ...(opts.viewport ? { w: String(opts.viewport.width), h: String(opts.viewport.height) } : {}) });
    await page.goto(`${server.url}?${q}`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => (window as unknown as { __JOPLO_READY__?: boolean }).__JOPLO_READY__ === true, null, { timeout: 60000 });
    const err = await page.evaluate(() => (window as unknown as { __JOPLO_ERROR__?: string | null }).__JOPLO_ERROR__ ?? null);
    if (err) throw new JoploError('RENDER_FAILED', `渲染路由报告错误：${err}`);

    const report = (await page.evaluate(`(${COLLECT_REPORT})(${JSON.stringify({ nextTargetId, theme })})`)) as PageReport;
    const png = await page.locator('[data-joplo-stage]').screenshot({ type: 'png', animations: 'disabled' });
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
    if (nextTargetId && findNode(scene, nextTargetId) && !elements.find((e) => e.id === nextTargetId && e.visible)) warnings.push(`下一步操作的目标 ${nextTargetId} 没有显示在画面中`);
    return { path: out, sceneId: state.sceneId, position, elements, warnings, scale: opts.scale ?? 1 };
  } finally {
    await browser?.close().catch(() => undefined);
    await server.close();
  }
}

const COLLECT_REPORT = fs.readFileSync(path.join(import.meta.dirname, 'page-report.js'), 'utf8').replace(/^\/\*[\s\S]*?\*\/\s*/, '');
