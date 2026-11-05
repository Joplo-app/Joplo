/**
 * 生成文档截图（唯一写入 docs/screenshots 的途径）：对 examples/invite 的临时副本
 *   1. 调用 renderStep 输出舞台截图（手绘 / 线框）；
 *   2. 启动 startDev，截取看板（演示 / 审阅 / 路径树 / 比较方案 / 编译错误）；
 *   3. 调用 buildSite，用 file:// 打开发布站截图。
 * 用法：pnpm docs:screenshots [输出目录]
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { chromium, type Page } from 'playwright';
import { buildSite } from '../src/build.ts';
import { createDev } from '../src/dev.ts';
import { renderStep } from '../src/render.ts';

const root = path.resolve(import.meta.dirname, '../../..');
const outDir = path.resolve(process.argv[2] ?? path.join(root, 'docs/screenshots'));
const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'joplo-docs-')));
fs.cpSync(path.join(root, 'examples/invite'), tmp, { recursive: true, filter: (s) => !/[/\\](\.joplo|dist)([/\\]|$)/.test(s) });
fs.mkdirSync(outDir, { recursive: true });
for (const f of fs.readdirSync(outDir)) if (f.endsWith('.png')) fs.rmSync(path.join(outDir, f));

const A = 'invite.a-modal';
const shots: { name: string; scenarioId: string; stepId?: string }[] = [
  { name: 'stage-a-success-0-initial', scenarioId: `${A}.success` },
  { name: 'stage-a-success-1-dialog', scenarioId: `${A}.success`, stepId: `${A}.success#1` },
  { name: 'stage-a-success-3-filled', scenarioId: `${A}.success`, stepId: `${A}.success#3` },
  { name: 'stage-a-success-5-toast', scenarioId: `${A}.success`, stepId: `${A}.success#5` },
  { name: 'stage-a-failure-5-error', scenarioId: `${A}.failure`, stepId: `${A}.failure#5` },
  { name: 'stage-a-denied', scenarioId: `${A}.denied` },
  { name: 'stage-b-partial-5-results', scenarioId: 'invite.b-batch.partial', stepId: 'invite.b-batch.partial#5' },
];
let bad = 0;
for (const theme of ['sketch', 'clean'] as const) {
  for (const s of shots) {
    const r = await renderStep({ projectDir: tmp, scenarioId: s.scenarioId, stepId: s.stepId, theme, out: path.join(outDir, `${s.name}.${theme}.png`), overwrite: true });
    console.log(`${path.relative(root, r.path)}  position=${r.position} 可见元素=${r.elements.filter((e) => e.visible).length} 告警=${r.warnings.length}`);
    for (const w of r.warnings) console.log(`  ⚠ ${w}`);
    bad += r.warnings.length;
  }
}

const dev = await createDev({ projectDir: tmp, port: 0, log: () => undefined });
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  const idle = () => page.waitForFunction(() => { const u = (window as any).__JOPLO_UI__; return u && !u.busy && !u.playing; });
  const n = (id: string) => page.locator(`[data-joplo-stage] [data-jid="${id}"]`).first();
  const click = async (id: string) => { await n(id).click(); await idle(); };
  const shot = async (p: Page, name: string) => {
    await p.mouse.move(2, 2);
    await p.waitForTimeout(350);
    await p.screenshot({ path: path.join(outDir, `${name}.png`) });
    console.log(`docs/screenshots/${name}.png`);
  };
  await page.goto(dev.url);
  await n('btn_invite').waitFor();
  await shot(page, 'board-demo-initial');
  // 自动播放到“输入邮箱”的打字动画中途，暂停
  await page.getByTestId('ctl-play').click();
  await page.waitForFunction(() => document.querySelector('[data-joverlay="sample"]') !== null);
  await page.waitForTimeout(400);
  await page.getByTestId('ctl-play').click();
  await page.waitForTimeout(150);
  await page.screenshot({ path: path.join(outDir, 'board-demo-autoplay-typing.png') });
  console.log('docs/screenshots/board-demo-autoplay-typing.png');
  await page.getByTestId('ctl-reset').click();
  for (const id of ['btn_invite', 'in_email', 'sel_role', 'btn_send']) await click(id);
  await shot(page, 'board-demo-success-complete');
  await page.getByTestId('scenario-select').selectOption(`${A}.denied`);
  { const b = (await n('btn_invite').boundingBox())!; await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2); }
  await page.waitForTimeout(250);
  await page.screenshot({ path: path.join(outDir, 'board-demo-denied-reason.png') });
  await n('nav_settings').click();
  await page.waitForTimeout(250);
  await page.screenshot({ path: path.join(outDir, 'board-demo-uncovered.png') });
  console.log('docs/screenshots/board-demo-denied-reason.png\ndocs/screenshots/board-demo-uncovered.png');

  await page.getByTestId('scenario-select').selectOption(`${A}.success`);
  await page.getByTestId('mode-review').click();
  await page.getByTestId('chip-invite.a-modal.success#1').click();
  await page.waitForTimeout(200);
  await n('sel_role').click();
  await page.getByTestId('selection-sync').and(page.locator('[data-status="ok"]')).waitFor();
  await shot(page, 'board-review-selected');
  await page.getByTestId('route-tree').locator('[data-route="/members/invite"] > button').click();
  await shot(page, 'board-review-route-tree-browse');
  await page.getByTestId('mode-demo').click();
  await page.getByTestId('view-compare').click();
  await page.getByTestId('compare-case-invite.request_failed').click();
  await shot(page, 'board-compare-options');

  // 编译错误：保留上一次成功的画面，显示 文件:行号
  await page.getByTestId('view-stage').click();
  const file = path.join(tmp, 'features/invite/options/a-modal.tsx');
  const good = fs.readFileSync(file, 'utf8');
  fs.writeFileSync(file, good.replace('<Button id="btn_send"', '<Button id="btn_send" ={'));
  await page.getByTestId('diagnostics').waitFor();
  await shot(page, 'board-compile-error');
  fs.writeFileSync(file, good);
  await page.getByTestId('diagnostics').waitFor({ state: 'detached' });

  // 发布站（file://）
  const site = path.join(tmp, 'dist');
  await buildSite({ projectDir: tmp, outDir: site, overwrite: true });
  const sp = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await sp.goto(`file://${path.join(site, 'index.html')}`);
  await sp.locator('[data-joplo-stage]').waitFor();
  await shot(sp, 'site-browse-members');
  await sp.getByTestId('site-scenario-invite.a-modal.success').click();
  const sn = (id: string) => sp.locator(`[data-joplo-stage] [data-jid="${id}"]`).first();
  await sn('btn_invite').click();
  await sp.waitForFunction(() => !(window as any).__JOPLO_UI__.busy);
  await shot(sp, 'site-scenario-dialog');
} finally {
  await browser.close();
  await dev.close();
  fs.rmSync(tmp, { recursive: true, force: true });
}
if (bad) process.exitCode = 1;
