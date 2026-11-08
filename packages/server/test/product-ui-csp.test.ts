/**
 * D68 不变量：新组件在发布站的 CSP（与云端分享页相同：sandbox allow-scripts …; connect-src 'none'）下正常工作，
 * 交互状态由步骤驱动并能回放（真实 Chromium）：
 * - 用 examples/invite 的样板（选定方案 A 的“撤销邀请后对方再打开链接”场景：Menu → 确认 Modal → 浮层 Notification → 过渡卡 → EmptyState）；
 * - 深链接跳到每一步，画面与步骤一致；在第 1 步真实点击菜单项，演示前进到确认弹窗；
 * - 全程没有 fetch / XHR / WebSocket 等请求、没有失败的资源请求、没有 CSP 违规和页面错误。
 * 只用仓库 devDependencies 里的 playwright 与本机已下载的浏览器，不访问网络；浏览器不存在时跳过。
 */
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildSite } from '../src/build.ts';

const EXAMPLE = path.resolve(import.meta.dirname, '../../../examples/invite');
const CSP = "sandbox allow-scripts allow-popups allow-downloads; connect-src 'none'; form-action 'none'; base-uri 'none'";
const MIME: Record<string, string> = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.woff2': 'font/woff2', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.txt': 'text/plain' };

type PW = typeof import('playwright');
let pw: PW | null = null;
try {
  pw = await import('playwright');
  if (!fs.existsSync(pw.chromium.executablePath())) pw = null;
} catch {
  pw = null;
}

describe.skipIf(!pw)('发布站 CSP 下的新组件（真实 Chromium）', () => {
  let dir: string;
  let server: http.Server;
  let base: string;
  let browser: import('playwright').Browser;
  beforeAll(async () => {
    dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'joplo-csp-')));
    fs.cpSync(EXAMPLE, dir, { recursive: true });
    const out = path.join(dir, 'dist');
    await buildSite({ projectDir: dir });
    server = http.createServer((req, res) => {
      const url = new URL(req.url ?? '/', 'http://x');
      const file = path.join(out, url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname));
      if (!file.startsWith(out) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404).end(); return; }
      // 与云端分享页相同的 CSP；沙箱文档是 opaque origin，字体要 CORS
      res.writeHead(200, { 'content-type': MIME[path.extname(file)] ?? 'application/octet-stream', 'content-security-policy': CSP, 'access-control-allow-origin': '*' });
      fs.createReadStream(file).pipe(res);
    });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
    base = `http://127.0.0.1:${(server.address() as { port: number }).port}/`;
    browser = await pw!.chromium.launch();
  }, 180_000);
  afterAll(async () => {
    await browser?.close();
    await new Promise((r) => server?.close(r));
    if (dir) fs.rmSync(dir, { recursive: true, force: true });
  });

  it('按步骤深链接与真实点击：菜单、确认弹窗、浮层通知、失效页都随步骤出现；没有网络请求和 CSP 违规', async () => {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const problems: string[] = [];
    const requests: string[] = [];
    page.on('pageerror', (e) => problems.push(`pageerror ${e.message}`));
    page.on('console', (m) => { if (m.type() === 'error' && !/Content Security Policy|localStorage|SecurityError/.test(m.text())) problems.push(`console ${m.text()}`); });
    page.on('requestfailed', (r) => problems.push(`failed ${r.url()}`));
    page.on('request', (r) => { if (['fetch', 'xhr', 'websocket', 'eventsource'].includes(r.resourceType())) requests.push(`${r.resourceType()} ${r.url()}`); });
    await page.addInitScript(() => {
      (window as unknown as { __csp: string[] }).__csp = [];
      document.addEventListener('securitypolicyviolation', (e) => (window as unknown as { __csp: string[] }).__csp.push(`${e.violatedDirective} ${e.blockedURI}`));
    });
    const at = async (step: number) => {
      // examples/invite 有英文译文（D83）：断言按中文原文写，固定内容语言
      await page.goto(`${base}?lang=zh-CN#/f/invite?s=invite.a-modal.revoke&step=${step}`);
      try {
        await page.waitForSelector('.jstage [data-jid]', { state: 'attached', timeout: 30_000 });
      } catch (e) {
        throw new Error(`stage did not render: ${problems.join(' | ')} | ${(await page.content()).slice(0, 600)}`, { cause: e });
      }
    };
    // 第 1 步：菜单打开，菜单项浮在弹窗层里（不被表格裁掉）
    await at(1);
    const item = page.locator('[data-jid="mi_revoke"]');
    await item.waitFor({ state: 'visible', timeout: 20_000 });
    expect(await page.locator('[data-jlayer="dialog"] [data-jid="mi_revoke"]').count()).toBe(1);
    // 真实点击菜单项 = 播放第 2 步：确认弹窗出现、菜单收起
    await item.click();
    await page.locator('[data-jid="dlg_revoke"]').waitFor({ state: 'visible', timeout: 20_000 });
    await page.locator('[data-jid="mi_revoke"]').waitFor({ state: 'detached', timeout: 20_000 });
    // 第 3 步：撤销后底部浮层通知；待接受表格的状态变成徽章“已撤销”
    await at(3);
    await page.locator('[data-jid="note_revoked"][data-jfloating="bottom"]').waitFor({ state: 'visible', timeout: 20_000 });
    expect(await page.locator('[data-jid="tbl_pending"] [data-jbadge="已撤销"]').count()).toBe(1);
    // 第 5 步：受邀者的失效页（EmptyState）
    await at(5);
    await page.locator('[data-jid="empty_revoked"]').waitFor({ state: 'visible', timeout: 20_000 });
    expect(await page.locator('[data-jid="empty_revoked"]').innerText()).toContain('这个邀请已经失效');
    const csp = await page.evaluate(() => (window as unknown as { __csp: string[] }).__csp);
    expect(csp).toEqual([]);
    expect(requests).toEqual([]);
    expect(problems).toEqual([]);
    await page.close();
  }, 180_000);
});
