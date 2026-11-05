/** joplo build：静态发布站用 file:// 和本地静态服务器打开都能播放成功场景；产物不含创作侧信息。 */
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import type { Page } from '@playwright/test';
import { buildSite } from '../../server/src/build.ts';
import { copyExample, demoClick, expect, node, playState, test } from './fixtures';

let projectDir = '';
let outDir = '';

test.beforeAll(async () => {
  projectDir = copyExample();
  outDir = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'joplo-site-')), 'site');
  const r = await buildSite({ projectDir, outDir });
  expect(r.files).toContain('index.html');
  expect(r.routes).toEqual(['/members', '/settings']);
});
test.afterAll(() => {
  fs.rmSync(projectDir, { recursive: true, force: true });
  fs.rmSync(path.dirname(outDir), { recursive: true, force: true });
});

async function playSuccess(page: Page) {
  await expect(page.getByTestId('concept-badge').first()).toContainText('概念原型');
  await page.getByTestId('site-scenario-invite.a-modal.success').click();
  await node(page, 'btn_invite').waitFor();
  await demoClick(page, 'btn_invite');
  await demoClick(page, 'in_email');
  await demoClick(page, 'sel_role');
  await demoClick(page, 'btn_send');
  await expect(page.locator('[data-jtoast]')).toContainText('已向 li.lei@example.com 发送邀请');
  await expect(node(page, 'tbl_pending').locator('tbody tr')).toHaveCount(2);
  expect((await playState(page))!.completed?.outcome).toBe('success');
  // 自动播放同样走到成功
  await page.getByTestId('ctl-play').click();
  await page.waitForFunction(() => (window as any).__JOPLO_STATE__?.completed && !(window as any).__JOPLO_UI__.playing, null, { timeout: 30_000 });
  await expect(node(page, 'tbl_pending').locator('tbody tr')).toHaveCount(2);
}

test('file:// 直接打开（离线）：整体布局可浏览、成功场景可播放', async ({ page, context }) => {
  const requests: string[] = [];
  context.on('request', (r) => requests.push(r.url()));
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`file://${path.join(outDir, 'index.html')}`);
  // 首页：只有一个项目，列出功能（同看板的布局）
  await expect(page.getByTestId('site-home')).toBeVisible();
  await expect(page.getByTestId('site-feature-row-invite')).toContainText('空间管理员邀请成员加入空间');
  await page.getByTestId('site-view-invite').click();
  await node(page, 'btn_invite').waitFor();
  // 演示页：同一套布局；没有缺口、规则、抽屉、编辑器、视频导出
  await expect(page.getByTestId('topbar').getByTestId('crumb-feature')).toHaveText('团队成员邀请');
  await expect(page.getByTestId('device-switch')).toBeVisible();
  for (const id of ['gap-count', 'gap-notice', 'case-nav', 'stage-hint', 'option-switch']) await expect(page.getByTestId(id)).toHaveCount(0);
  await page.getByTestId('more-menu').click();
  await expect(page.getByTestId('menu').getByRole('menuitem')).toHaveText(['导出图片（当前步骤）', '复制当前步骤的链接']);
  await expect(page.getByTestId('menu-theme')).toBeVisible();
  await expect(page.getByTestId('menu-video')).toHaveCount(0);
  await expect(page.getByTestId('menu-editor')).toHaveCount(0);
  await page.keyboard.press('Escape');
  // ⌥+单击在发布站按普通单击处理，不弹抽屉
  await node(page, 'btn_invite').click({ modifiers: ['Alt'] });
  await expect(page.getByTestId('inspect-drawer')).toHaveCount(0);
  await page.getByTestId('ctl-reset').click();
  await playSuccess(page);
  // 浏览器内导出图片
  const download = page.waitForEvent('download');
  await page.getByTestId('more-menu').click();
  await page.getByTestId('menu-image').click();
  expect((await download).suggestedFilename()).toMatch(/^invite\.a-modal\.success-\d+\.png$/);
  // 完全离线：没有任何非 file:// 的请求
  expect(requests.filter((u) => !u.startsWith('file://') && !u.startsWith('data:'))).toEqual([]);
  expect(errors).toEqual([]);
  // 只读：没有检查抽屉
  await expect(page.getByTestId('inspect-drawer')).toHaveCount(0);
});

test('本地静态服务器打开：成功场景可播放', async ({ page }) => {
  const server = http.createServer((req, res) => {
    const rel = decodeURIComponent(new URL(req.url ?? '/', 'http://x').pathname);
    const file = path.join(outDir, rel === '/' ? 'index.html' : rel);
    if (!file.startsWith(outDir) || !fs.existsSync(file)) {
      res.writeHead(404).end();
      return;
    }
    const type = file.endsWith('.html') ? 'text/html' : file.endsWith('.css') ? 'text/css' : file.endsWith('.woff2') ? 'font/woff2' : 'application/octet-stream';
    res.writeHead(200, { 'content-type': type });
    fs.createReadStream(file).pipe(res);
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
  const port = (server.address() as { port: number }).port;
  try {
    await page.goto(`http://127.0.0.1:${port}/#/s/invite.a-modal.success`);
    await playSuccess(page);
  } finally {
    server.close();
  }
});

test('产物不含规则、源路径、未选定方案、绝对路径', () => {
  const texts: [string, string][] = [];
  const walk = (d: string) => {
    for (const n of fs.readdirSync(d)) {
      const p = path.join(d, n);
      if (fs.statSync(p).isDirectory()) walk(p);
      else if (!n.endsWith('.woff2')) texts.push([path.relative(outDir, p), fs.readFileSync(p, 'utf8')]);
    }
  };
  walk(outDir);
  expect(texts.length).toBeGreaterThan(1);
  for (const [name, t] of texts) {
    for (const needle of [
      // IR 的 rules 键（库代码里的 cssRules 不算）；规则文字在下面单独检查
      '"rules"', 'a-modal.tsx', 'b-batch', 'B · 独立页面', projectDir, os.homedir(), os.tmpdir(), '/private/', 'features/invite',
      // D39：本机信息与创作信息（项目列表、缺口、规则文字、选中、本机接口）
      'projects.json', '.joplo', '/__joplo/', '缺口', '缺失', '待决定', '只有空间管理员可以发起邀请', '发送中禁用', 'selection.json', 'npx joplo check',
    ])
      expect(t.includes(needle), `${name} 不应包含 ${needle}`).toBe(false);
  }
});
