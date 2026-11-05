/**
 * 生成文档截图（唯一写入 docs/screenshots 的途径）：对 examples/invite 的临时副本
 *   1. 调用 renderStep 输出舞台截图（手绘 / 线框；桌面与手机宽度）；
 *   2. 启动看板进程（临时 JOPLO_HOME，登记 invite、joplo-dist、一个编译出错的项目和一个已删除的目录），截取新界面（D39）：
 *      首页、演示页（电脑 / 手机）、缺口、检查抽屉、「…」菜单、导出视频进度、编译错误；
 *   3. 调用 buildSite，用 file:// 打开发布站截图；
 *   4. 把 examples/joplo-board 原型里对应的场景也渲染出来（prototype-*），与新界面放在一起对照；
 *   5. 架构图（Diagram）测试夹具的调用链截图（stage-diagram-*），以及 examples/agent-arch 的两步（stage-agent-arch-*，1600×1000）。
 * 用法：pnpm docs:screenshots [输出目录]
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { chromium, type Page } from 'playwright';
import { buildSite } from '../src/build.ts';
import { createHub } from '../src/dev.ts';
import { renderStep } from '../src/render.ts';

const root = path.resolve(import.meta.dirname, '../../..');
const outDir = path.resolve(process.argv[2] ?? path.join(root, 'docs/screenshots'));
const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'joplo-docs-')));
fs.cpSync(path.join(root, 'examples/invite'), tmp, { recursive: true, filter: (s) => !/[/\\](\.joplo|dist)([/\\]|$)/.test(s) });
fs.mkdirSync(outDir, { recursive: true });
for (const f of fs.readdirSync(outDir)) if (f.endsWith('.png')) fs.rmSync(path.join(outDir, f));

const A = 'invite.a-modal';
const MOBILE = { width: 390, height: 844 };
const shots: { name: string; scenarioId: string; stepId?: string; viewport?: { width: number; height: number } }[] = [
  { name: 'stage-a-success-0-initial', scenarioId: `${A}.success` },
  { name: 'stage-a-success-1-dialog', scenarioId: `${A}.success`, stepId: `${A}.success#1` },
  { name: 'stage-a-success-3-filled', scenarioId: `${A}.success`, stepId: `${A}.success#3` },
  { name: 'stage-a-success-5-toast', scenarioId: `${A}.success`, stepId: `${A}.success#5` },
  { name: 'stage-a-failure-5-error', scenarioId: `${A}.failure`, stepId: `${A}.failure#5` },
  { name: 'stage-a-denied', scenarioId: `${A}.denied` },
  { name: 'stage-b-partial-5-results', scenarioId: 'invite.b-batch.partial', stepId: 'invite.b-batch.partial#5' },
  // 同一画面按手机宽度渲染：AppShell 收起导航、显示 Burger，响应式属性取 base
  { name: 'stage-a-success-0-initial-mobile', scenarioId: `${A}.success`, viewport: MOBILE },
  { name: 'stage-a-success-3-filled-mobile', scenarioId: `${A}.success`, stepId: `${A}.success#3`, viewport: MOBILE },
];
let bad = 0;
for (const theme of ['sketch', 'clean'] as const) {
  for (const s of shots) {
    const r = await renderStep({ projectDir: tmp, scenarioId: s.scenarioId, stepId: s.stepId, theme, out: path.join(outDir, `${s.name}.${theme}.png`), overwrite: true, ...(s.viewport ? { viewport: s.viewport } : {}) });
    console.log(`${path.relative(root, r.path)}  position=${r.position} 可见元素=${r.elements.filter((e) => e.visible).length} 告警=${r.warnings.length}`);
    for (const w of r.warnings) console.log(`  ⚠ ${w}`);
    bad += r.warnings.length;
  }
}

// 架构图（Diagram，D41）：测试夹具 packages/server/scripts/fixtures/diagram 的调用链，sketch / clean 各两步
const diagramFixture = path.join(root, 'packages/server/scripts/fixtures/diagram');
for (const theme of ['sketch', 'clean'] as const) {
  for (const [name, step] of [['stage-diagram-1-active', 'arch.a.call#1'], ['stage-diagram-3-error', 'arch.a.call#3']] as const) {
    const r = await renderStep({ projectDir: diagramFixture, scenarioId: 'arch.a.call', stepId: step, theme, out: path.join(outDir, `${name}.${theme}.png`), overwrite: true });
    console.log(`${path.relative(root, r.path)}  position=${r.position} 告警=${r.warnings.length}`);
    for (const w of r.warnings) console.log(`  ⚠ ${w}`);
    bad += r.warnings.length;
  }
}

// 真实演示 examples/agent-arch：1600×1000 下架构图的可读性（节点主标签实际 ≥ 12px，放不下时图内滚动）
for (const [name, scenarioId, step] of [['stage-agent-arch-happy-7', 'agent.a-hybrid.happy', 'agent.a-hybrid.happy#7'], ['stage-agent-arch-quota-3', 'agent.a-hybrid.quota', 'agent.a-hybrid.quota#3']] as const) {
  const r = await renderStep({ projectDir: path.join(root, 'examples/agent-arch'), scenarioId, stepId: step, theme: 'sketch', viewport: { width: 1600, height: 1000 }, out: path.join(outDir, `${name}.sketch.png`), overwrite: true });
  console.log(`${path.relative(root, r.path)}  position=${r.position} 告警=${r.warnings.length}`);
  for (const w of r.warnings) console.log(`  ⚠ ${w}`);
  bad += r.warnings.length;
}

const home = fs.mkdtempSync(path.join(os.tmpdir(), 'joplo-docs-home-'));
const dist = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'joplo-docs-dist-')));
fs.cpSync(path.join(root, 'examples/joplo-dist'), dist, { recursive: true, filter: (s) => !/[/\\](\.joplo|dist|node_modules)([/\\]|$)/.test(s) });
const shop = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'shop-')));
fs.writeFileSync(path.join(shop, 'joplo.config.ts'), "import { config } from '@tokenroll/joplo-kit';\nexport default config({ name: '网店结算' });\n");
fs.mkdirSync(path.join(shop, 'features/cart'), { recursive: true });
fs.writeFileSync(path.join(shop, 'features/cart/feature.ts'), "import { feature } from '@tokenroll/joplo-kit';\nexport default feature({ name: '购物车', goal: '结算', cases: {}, pick: 'c-fast' });\n");
const gone = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'old-demo-')));
const hub = await createHub({ port: 0, home, log: () => undefined });
hub.addProject(gone, { compile: false });
fs.rmSync(gone, { recursive: true, force: true });
hub.addProject(shop);
hub.addProject(dist);
const inv = hub.addProject(tmp);
await inv.slot!.ready;
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const idle = () => page.waitForFunction(() => { const u = (window as any).__JOPLO_UI__; return u && !u.busy && !u.playing; });
  const n = (id: string) => page.locator(`[data-joplo-stage] [data-jid="${id}"]`).first();
  const click = async (id: string) => { await n(id).click(); await idle(); };
  const shot = async (p: Page, name: string) => {
    await p.mouse.move(2, 2);
    await p.waitForTimeout(350);
    await p.screenshot({ path: path.join(outDir, `${name}.png`) });
    console.log(`docs/screenshots/${name}.png`);
  };
  const play = (q = '') => `${hub.url}#/${inv.id}/f/invite${q ? `?${q}` : ''}`;
  // 首页
  await page.goto(hub.url);
  await page.getByTestId('feature-invite').waitFor();
  await shot(page, 'board-home');
  await page.getByTestId(`home-project-${hub.projects().find((p) => p.dir === shop)!.id}`).click();
  await page.getByTestId('home-errors').waitFor();
  await shot(page, 'board-home-compile-error');
  // 演示页
  await page.getByTestId(`home-project-${inv.id}`).click();
  await page.getByTestId('view-invite').click();
  await n('btn_invite').waitFor();
  await shot(page, 'board-play-initial');
  // 自动播放到“输入邮箱”的打字动画中途，暂停
  await page.getByTestId('ctl-play').click();
  await page.waitForFunction(() => document.querySelector('[data-joverlay="sample"]') !== null);
  await page.waitForTimeout(400);
  await page.getByTestId('ctl-play').click();
  await page.waitForTimeout(150);
  await page.screenshot({ path: path.join(outDir, 'board-play-autoplay-typing.png') });
  console.log('docs/screenshots/board-play-autoplay-typing.png');
  await page.getByTestId('ctl-reset').click();
  for (const id of ['btn_invite', 'in_email', 'sel_role', 'btn_send']) await click(id);
  await shot(page, 'board-play-success-complete');
  await page.getByTestId('case-invite.no_permission').click();
  await n('btn_invite').waitFor();
  { const b = (await n('btn_invite').boundingBox())!; await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2); }
  await page.waitForTimeout(250);
  await page.screenshot({ path: path.join(outDir, 'board-play-denied-reason.png') });
  console.log('docs/screenshots/board-play-denied-reason.png');
  // 缺口：方案 B 没有表达“发送请求失败”
  await page.goto(play('o=invite.b-batch&c=invite.request_failed'));
  await page.getByTestId('gap-notice').waitFor();
  await shot(page, 'board-play-gap');
  // 手机
  await page.goto(play('c=invite.happy&step=1&d=mobile'));
  await n('dlg_invite').waitFor();
  await shot(page, 'board-play-mobile');
  // 检查抽屉（⌥+单击）
  await page.goto(play('c=invite.happy&step=1'));
  await n('btn_send').waitFor();
  await n('btn_send').click({ modifiers: ['Alt'] });
  await page.getByTestId('selection-sync').and(page.locator('[data-status="ok"]')).waitFor();
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(outDir, 'board-inspect-drawer.png') });
  console.log('docs/screenshots/board-inspect-drawer.png');
  await page.getByTestId('drawer-close').click();
  // 「…」菜单
  await page.getByTestId('more-menu').click();
  await page.waitForTimeout(200);
  await page.screenshot({ path: path.join(outDir, 'board-more-menu.png') });
  console.log('docs/screenshots/board-more-menu.png');
  // 导出视频：进度与完成
  await page.getByTestId('menu-video').click();
  await page.getByTestId('video-start').click();
  await page.waitForFunction(() => /正在录制第 [2-9]/.test(document.querySelector('[data-testid="video-progress"]')?.textContent ?? ''), null, { timeout: 60000 });
  await page.screenshot({ path: path.join(outDir, 'board-video-progress.png') });
  console.log('docs/screenshots/board-video-progress.png');
  await page.getByTestId('video-done').or(page.getByTestId('video-error')).first().waitFor({ timeout: 120000 });
  await page.screenshot({ path: path.join(outDir, 'board-video-done.png') });
  console.log('docs/screenshots/board-video-done.png');
  if (await page.getByTestId('video-error').count()) bad++;
  await page.getByTestId('video-close').click();

  // 编译错误：保留上一次成功的画面，显示 文件:行号
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
  await sp.getByTestId('site-home').waitFor();
  await shot(sp, 'site-home');
  await sp.getByTestId('site-view-invite').click();
  const sn = (id: string) => sp.locator(`[data-joplo-stage] [data-jid="${id}"]`).first();
  await sn('btn_invite').click();
  await sp.waitForFunction(() => !(window as any).__JOPLO_UI__.busy);
  await shot(sp, 'site-play-dialog');
  await sp.getByTestId('device-mobile').click();
  await shot(sp, 'site-play-mobile');
  await sp.getByTestId('more-menu').click();
  await shot(sp, 'site-more-menu');
} finally {
  await browser.close();
  await hub.close();
  for (const d of [tmp, dist, shop, home]) fs.rmSync(d, { recursive: true, force: true });
}

// 原型对照：examples/joplo-board 中与上面各图对应的场景（sketch）
const proto = path.join(root, 'examples/joplo-board');
const PROTO: { name: string; scenarioId: string; stepId?: string; viewport?: { width: number; height: number } }[] = [
  { name: 'prototype-home', scenarioId: 'home.a-recent.recent' },
  { name: 'prototype-home-compile-error', scenarioId: 'home.a-recent.second_dev', stepId: 'home.a-recent.second_dev#1' },
  { name: 'prototype-play', scenarioId: 'player.b-by-case.play', stepId: 'player.b-by-case.play#1' },
  { name: 'prototype-play-gap', scenarioId: 'player.b-by-case.switch', stepId: 'player.b-by-case.switch#2' },
  { name: 'prototype-play-mobile', scenarioId: 'player.b-by-case.device', stepId: 'player.b-by-case.device#2' },
  { name: 'prototype-inspect-drawer', scenarioId: 'player.b-by-case.inspect', stepId: 'player.b-by-case.inspect#1' },
  { name: 'prototype-more-menu', scenarioId: 'player.b-by-case.export_image', stepId: 'player.b-by-case.export_image#1' },
  { name: 'prototype-video-progress', scenarioId: 'player.b-by-case.export_video', stepId: 'player.b-by-case.export_video#4' },
  { name: 'prototype-site-home', scenarioId: 'home.a-recent.publish_home' },
];
for (const s of PROTO) {
  const r = await renderStep({ projectDir: proto, scenarioId: s.scenarioId, stepId: s.stepId, theme: 'sketch', out: path.join(outDir, `${s.name}.png`), overwrite: true });
  console.log(`${path.relative(root, r.path)}  原型对照`);
}
if (bad) process.exitCode = 1;
