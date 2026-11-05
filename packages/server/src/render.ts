/**
 * renderStep：启动临时端口的服务，用 Playwright 打开渲染路由，截取舞台并返回元素索引与渲染告警
 * （PRD 8.8 / AC-22）。
 */
import fs from 'node:fs';
import path from 'node:path';
import { chromium, type Browser } from 'playwright';
import { JoploError, findNode, isNodeDisabled, nodeLabel, positionAfterStep, resolveProps, stateAt, walkNodes, type PlayState } from '@joplo/core';
import type { RenderOptions, RenderResult, RenderedElement } from './types.ts';
import { loadProjectFile, startServer } from './serve.ts';

const STAGE_SIZE = { desktop: { width: 1280, height: 800 }, mobile: { width: 390, height: 844 } };

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

/** 截图不得写到项目数据上：project.joplo.json 与 .joplo/（即使传了 overwrite）。 */
function assertNotProjectData(projectDir: string, out: string) {
  const fold = (p: string) => (process.platform === 'darwin' || process.platform === 'win32' ? p.toLowerCase() : p);
  const o = fold(realish(out));
  const dir = fold(realish(projectDir));
  const projectFile = path.join(dir, 'project.joplo.json');
  const dataDir = path.join(dir, '.joplo');
  if (o === projectFile || o === dataDir || o.startsWith(dataDir + path.sep))
    throw new JoploError('USAGE', `不能写入项目数据：${out}（project.joplo.json 与 .joplo/ 由 Joplo 管理）`);
}

type PageReport = { elements: RenderedElement[]; warnings: string[] };

export async function renderStep(opts: RenderOptions): Promise<RenderResult> {
  const projectDir = path.resolve(opts.projectDir);
  const loaded = loadProjectFile(projectDir);
  if (!loaded.ok) throw new JoploError(loaded.error.code === 'NOT_FOUND' ? 'NOT_FOUND' : 'INVALID_SCHEMA', loaded.error.message, { details: loaded.error.issues });
  const project = loaded.project;
  const sc = project.scenarios[opts.scenarioId];
  if (!sc) throw new JoploError('NOT_FOUND', `场景不存在：${opts.scenarioId}`);
  if (opts.optionId && sc.optionId !== opts.optionId) throw new JoploError('INVALID_REFERENCE', `场景 ${sc.id} 属于方案 ${sc.optionId}，不属于 ${opts.optionId}`);
  const position = opts.stepId ? positionAfterStep(project, sc.id, opts.stepId) : 0;
  const state: PlayState = stateAt(project, sc.id, position); // 回放失败会抛出 PLAYBACK_FAILED
  const scene = project.scenes[state.sceneId]!;
  const theme = opts.theme ?? 'sketch';

  const out = path.resolve(opts.out);
  assertNotProjectData(projectDir, out);
  if (fs.existsSync(out) && !opts.overwrite) throw new JoploError('USAGE', `目标文件已存在：${out}。如需覆盖请传 overwrite: true（CLI：--overwrite）`);
  fs.mkdirSync(path.dirname(out), { recursive: true });

  const next = state.completed ? undefined : sc.steps[position];
  const nextTargetId = next && 'target' in next.action ? next.action.target : null;
  const stage = STAGE_SIZE[scene.viewport === 'mobile' ? 'mobile' : 'desktop'];
  const viewport = opts.viewport ?? stage;

  // 页面读取的是同一份已解析的项目快照：元素索引、告警与截图来自同一次读取（无 TOCTOU）
  const server = await startServer({ projectDir, port: 0, log: () => undefined, projectSnapshot: project });
  let browser: Browser | null = null;
  try {
    browser = await launch();
    const page = await browser.newPage({ viewport, deviceScaleFactor: opts.scale ?? 1, reducedMotion: 'reduce' });
    const q = new URLSearchParams({ render: '1', scenario: sc.id, position: String(position), theme });
    await page.goto(`${server.url}?${q}`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => (window as unknown as { __JOPLO_READY__?: boolean }).__JOPLO_READY__ === true, null, { timeout: 30000 });
    const err = await page.evaluate(() => (window as unknown as { __JOPLO_ERROR__?: string | null }).__JOPLO_ERROR__ ?? null);
    if (err) throw new JoploError('RENDER_FAILED', `渲染路由报告错误：${err}`);

    const report = (await page.evaluate(`(${COLLECT_REPORT})(${JSON.stringify({ nextTargetId, theme })})`)) as PageReport;
    const stageEl = page.locator('[data-joplo-stage]');
    const png = await stageEl.screenshot({ type: 'png', animations: 'disabled' });
    if (opts.overwrite) fs.writeFileSync(out, png);
    else fs.writeFileSync(out, png, { flag: 'wx' });

    // DOM 中没有的节点（隐藏/未渲染）也列入索引，visible=false
    const seen = new Set(report.elements.map((e) => e.id));
    const hidden: RenderedElement[] = [];
    walkNodes(scene.root, (node) => {
      if (seen.has(node.id)) return;
      hidden.push({
        id: node.id,
        type: node.type,
        label: nodeLabel({ type: node.type, props: resolveProps(node, state) }),
        visible: false,
        disabled: isNodeDisabled(node, state),
        box: { x: 0, y: 0, width: 0, height: 0 },
      });
    });
    const elements = [...report.elements, ...hidden];
    // 对照播放器：下一步目标必须可见（热点与元素位置匹配）
    const warnings = [...report.warnings];
    if (nextTargetId && findNode(scene, nextTargetId) && !elements.find((e) => e.id === nextTargetId && e.visible)) warnings.push(`下一步操作的目标 ${nextTargetId} 没有显示在画面中`);
    return { path: out, sceneId: state.sceneId, position, elements, warnings, scale: opts.scale ?? 1 };
  } finally {
    await browser?.close().catch(() => undefined);
    await server.close();
  }
}

const COLLECT_REPORT = fs.readFileSync(path.join(import.meta.dirname, 'page-report.js'), 'utf8').replace(/^\/\*[\s\S]*?\*\/\s*/, '');
