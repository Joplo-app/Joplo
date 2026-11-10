#!/usr/bin/env node
/**
 * 发布站回放检查（集成 0.2.8；0.2.4–0.2.5“发布产物缺 roles，一播放就白屏”那类问题的回归检查）：
 * 把 `joplo build` 的 dist/ 用本地静态服务提供，加上与云端分享页相同的 CSP（禁止联网），用真实 Chromium
 * 打开每个发布的场景，点「播放」，自动播放到最后一步；再用嵌入模式（?embed=1&autoplay=1）播一遍。
 * 任何页面错误、控制台错误、CSP 违规、网络请求（fetch / XHR / WebSocket / EventSource）、失败的资源请求、
 * 播放错误提示或空白舞台都算失败。
 *
 * 每个场景在“减少动态效果”下播放（产品自带的路径，动画直接到位），等待用 Playwright 的 Clock 快进：每一步照常渲染、
 * 照常走完，只是不用真的等；最短的一个场景再用完整动画、真实时间 1.5× 播一遍（镜头、先全景再推近、结果揭晓的代码路径）。
 *
 * 用法：
 *   node scripts/site-playback.mjs <dist 目录>…        打印每个场景的结果，有问题时退出 1
 * 代码里：import { checkSitePlayback } from './scripts/site-playback.mjs'
 * 只用仓库里 @joplo-app/server 的 devDependencies 里的 playwright 与本机已下载的浏览器，不访问网络。
 */
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

/** 与云端分享页相同（joplo-cloud apps/share 的响应头）。 */
export const SHARE_CSP = "sandbox allow-scripts allow-popups allow-downloads; connect-src 'none'; form-action 'none'; base-uri 'none'";
const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.woff2': 'font/woff2', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.txt': 'text/plain' };
const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');

/** 仓库里 @joplo-app/server 的 playwright；没有安装或浏览器没下载时返回 null。 */
export async function loadChromium() {
  try {
    const req = createRequire(path.join(REPO, 'packages/server/package.json'));
    const pw = await import(pathToFileURL(req.resolve('playwright')).href);
    const chromium = pw.chromium ?? pw.default?.chromium;
    return chromium && fs.existsSync(chromium.executablePath()) ? chromium : null;
  } catch {
    return null;
  }
}

/** 从 dist/index.html 读出内联的发布 IR。 */
export function readSiteIr(dist) {
  const html = fs.readFileSync(path.join(dist, 'index.html'), 'utf8');
  const m = /<script type="application\/json" id="joplo-ir">([\s\S]*?)<\/script>/.exec(html);
  if (!m) throw new Error(`${dist}/index.html has no inlined IR`);
  return JSON.parse(m[1]);
}

/** 静态服务 dist/，每个响应都带 SHARE_CSP；返回 { base, close }。 */
export async function serveDist(dist) {
  const root = fs.realpathSync(dist);
  const server = http.createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://x');
    const file = path.join(root, url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname));
    if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404).end(); return; }
    // 沙箱文档是 opaque origin：字体要 CORS
    res.writeHead(200, { 'content-type': MIME[path.extname(file)] ?? 'application/octet-stream', 'content-security-policy': SHARE_CSP, 'access-control-allow-origin': '*' });
    fs.createReadStream(file).pipe(res);
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', () => r()));
  const base = `http://127.0.0.1:${server.address().port}/`;
  return { base, close: () => new Promise((r) => server.close(() => r())) };
}

/** 给页面挂上问题收集器。 */
async function watch(page) {
  const problems = [];
  page.on('pageerror', (e) => problems.push(`pageerror ${e.message}`));
  // 沙箱里 localStorage 不可用、CSP 拦截的报告另由 securitypolicyviolation 收集
  page.on('console', (m) => { if (m.type() === 'error' && !/Content Security Policy|localStorage|SecurityError/.test(m.text())) problems.push(`console ${m.text()}`); });
  page.on('requestfailed', (r) => problems.push(`requestfailed ${r.url()} ${r.failure()?.errorText ?? ''}`));
  page.on('request', (r) => { if (['fetch', 'xhr', 'websocket', 'eventsource'].includes(r.resourceType())) problems.push(`request ${r.resourceType()} ${r.url()}`); });
  await page.addInitScript(() => {
    window.__csp = [];
    document.addEventListener('securitypolicyviolation', (e) => window.__csp.push(`${e.violatedDirective} ${e.blockedURI}`));
  });
  return problems;
}

/** 舞台不是空白：有渲染出的元素且有尺寸（白屏回归）。 */
async function stageProblems(page) {
  return page.evaluate(() => {
    const out = [];
    if (document.querySelector('[data-testid="playback-error"]')) out.push(`playback-error: ${document.querySelector('[data-testid="playback-error"]').textContent}`);
    const stage = document.querySelector('.jstage');
    if (!stage) out.push('no .jstage');
    else {
      const r = stage.getBoundingClientRect();
      if (r.width < 50 || r.height < 50) out.push(`stage is ${Math.round(r.width)}×${Math.round(r.height)}`);
      if (!stage.querySelector('[data-jid]') && !document.querySelector('[data-jlayer="card"],[data-testid="curtain"]')) out.push('stage has no rendered elements');
    }
    for (const v of window.__csp ?? []) out.push(`csp ${v}`);
    return out;
  });
}

const FAKE_START = new Date('2026-11-06T10:00:00Z');
const errText = (e) => (e instanceof Error ? e.message.split('\n')[0] : String(e));

/**
 * 在发布站播放一个场景：打开 `#/f/<功能>?s=<场景>`，点「播放」，快进直到最后一步是当前步且停止播放。
 * motion = 'reduce'：减少动态效果（产品自带的路径：镜头、打字、淡入直接到位），每一步只等阅读节奏，被快进掉；
 * motion = 'full'：完整动画（镜头过渡、先全景再推近、结果揭晓、打字），真实时间、1.5× 速度，慢一些，只播最短的一个场景。
 */
async function playOnSite(browser, base, project, sc, { viewport, motion, maxFakeMs, maxRealMs = 180_000 }) {
  const featureId = project.works[sc.workId]?.featureId ?? sc.workId;
  const last = sc.steps.at(-1);
  const real = motion === 'full';
  const context = await browser.newContext({ viewport, reducedMotion: real ? 'no-preference' : 'reduce' });
  const page = await context.newPage();
  const problems = await watch(page);
  // 减少动态效果：动画直接到位，只剩阅读节奏的等待，用假时钟快进。完整动画：镜头 / 打字动画按真实时间走，
  // 假时钟快进反而错位，所以按真实时间以 1.5× 播放
  if (!real) await page.clock.install({ time: FAKE_START });
  const tick = (ms) => (real ? page.waitForTimeout(ms / 2) : page.clock.runFor(ms));
  await page.goto(`${base}#/f/${encodeURIComponent(featureId)}?s=${encodeURIComponent(sc.id)}${real ? '&speed=1.5' : ''}`);
  const play = page.locator('[data-testid="ctl-play"]');
  let reached = 0;
  try {
    await play.waitFor({ state: 'visible', timeout: 30_000 });
    if (!last) await tick(3_000); // 没有步骤的场景只展示初始画面：播放按钮不可用，只检查画面
    else {
      for (let t = 0; t < 40 && (await play.isDisabled()); t++) await tick(250);
      await play.click();
      for (let t = 0; t <= (real ? maxRealMs * 2 : maxFakeMs); t += 500) {
        await tick(500);
        const s = await page.evaluate((id) => {
          const chips = [...document.querySelectorAll('[data-testid="step-bar"] button[data-state]')];
          return {
            last: document.querySelector(`[data-testid="chip-${id}"]`)?.getAttribute('data-state') ?? null,
            at: chips.findIndex((c) => c.getAttribute('data-state') === 'current'),
            error: !!document.querySelector('[data-testid="playback-error"]'),
          };
        }, last.id);
        reached = Math.max(reached, s.at);
        if (s.error) break;
        if (s.last === 'current' && reached === sc.steps.length) {
          await tick(5_000); // 让最后一步的动画、结果揭晓跑完
          break;
        }
      }
    }
  } catch (e) {
    problems.push(`playback ${errText(e)}`);
  }
  if (reached !== sc.steps.length) problems.push(`stopped at step ${reached} of ${sc.steps.length}`);
  problems.push(...(await stageProblems(page).catch((e) => [`stage check failed: ${e.message}`])));
  await context.close();
  return { scenarioId: sc.id, mode: motion === 'reduce' ? 'site' : 'site-full-motion', steps: sc.steps.length, reached, problems };
}

/** 嵌入模式（云端嵌入契约，?embed=1&autoplay=1）：跳过封面自动播放（减少动态效果 + 快进），读 embed-progress 判断播到哪一步。 */
async function playEmbedded(browser, base, sc, { maxFakeMs }) {
  const context = await browser.newContext({ viewport: { width: 960, height: 600 }, reducedMotion: 'reduce' });
  const page = await context.newPage();
  const problems = await watch(page);
  await page.clock.install({ time: FAKE_START });
  await page.goto(`${base}?embed=1&autoplay=1&scenario=${encodeURIComponent(sc.id)}`);
  let reached = 0;
  try {
    await page.locator('[data-testid="embed"]').waitFor({ state: 'visible', timeout: 30_000 });
    for (let t = 0; t <= maxFakeMs && reached < sc.steps.length; t += 500) {
      await page.clock.runFor(500);
      const now = await page.evaluate(() => Number(document.querySelector('[data-testid="embed-progress"]')?.getAttribute('aria-valuenow') ?? 0));
      reached = Math.max(reached, now);
      if (await page.locator('[data-testid="playback-error"]').count()) break;
    }
    await page.clock.runFor(5_000);
  } catch (e) {
    problems.push(`embed ${errText(e)}`);
  }
  if (reached !== sc.steps.length) problems.push(`embed stopped at step ${reached} of ${sc.steps.length}`);
  problems.push(...(await stageProblems(page).catch((e) => [`stage check failed: ${e.message}`])));
  await context.close();
  return { scenarioId: sc.id, mode: 'embed', steps: sc.steps.length, reached, problems };
}

/**
 * 检查一个 dist：每个发布的场景在发布站点播放、自动播放到最后一步（减少动态效果，快）；最短的一个有步骤的场景
 * 再用完整动画播一遍，并在嵌入模式自动播放一遍。返回 [{ scenarioId, mode, steps, reached, problems }]。
 */
export async function checkSitePlayback({ dist, chromium, viewport = { width: 1440, height: 900 }, maxFakeMs = 15 * 60_000, full = true, embed = true, log = () => {} }) {
  const { project } = readSiteIr(dist);
  const scenarios = Object.values(project.scenarios ?? {});
  if (!scenarios.length) throw new Error(`${dist}: the published IR has no scenarios (is a feature picked?)`);
  const { base, close } = await serveDist(dist);
  const browser = await chromium.launch();
  const results = [];
  const report = (r) => {
    results.push(r);
    log(`${r.problems.length ? '✗' : '✓'} ${r.mode} ${r.scenarioId}：${r.reached}/${r.steps} 步（${(r.ms / 1000).toFixed(1)}s）${r.problems.length ? `  ${r.problems.join(' | ')}` : ''}`);
  };
  try {
    const timed = async (run) => { const t0 = Date.now(); const r = await run(); report({ ...r, ms: Date.now() - t0 }); };
    for (const sc of scenarios) await timed(() => playOnSite(browser, base, project, sc, { viewport, motion: 'reduce', maxFakeMs }));
    const shortest = scenarios.filter((s) => s.steps.length).sort((a, b) => a.steps.length - b.steps.length)[0];
    if (shortest && full) await timed(() => playOnSite(browser, base, project, shortest, { viewport, motion: 'full', maxFakeMs }));
    if (shortest && embed) await timed(() => playEmbedded(browser, base, shortest, { maxFakeMs }));
  } finally {
    await browser.close();
    await close();
  }
  return results;
}

// ---------------------------------------------------------------- CLI
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const dists = process.argv.slice(2);
  if (!dists.length) {
    console.error('用法：node scripts/site-playback.mjs <dist 目录>…');
    process.exit(2);
  }
  const chromium = await loadChromium();
  if (!chromium) {
    console.error('找不到 playwright 或 Chromium（pnpm install 后运行 pnpm --filter @joplo-app/server exec playwright install chromium）');
    process.exit(2);
  }
  let bad = 0;
  for (const dist of dists) {
    console.log(`— ${dist}`);
    const rs = await checkSitePlayback({ dist, chromium, log: (s) => console.log(`  ${s}`) });
    bad += rs.filter((r) => r.problems.length).length;
  }
  process.exit(bad ? 1 : 0);
}
