import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test as base, expect, type Page } from '@playwright/test';
import { startServer, type ServeHandle } from '@joplo/server';
import { Project, type PlayState } from '@joplo/core';

export const ROOT = path.resolve(import.meta.dirname, '../../..');
export const EXAMPLE = path.join(ROOT, 'examples/invite/project.joplo.json');

/** 把 examples/invite 复制到临时目录。 */
export function copyExample(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'joplo-e2e-'));
  fs.copyFileSync(EXAMPLE, path.join(dir, 'project.joplo.json'));
  return dir;
}

export function loadExample(): Project {
  return Project.parse(JSON.parse(fs.readFileSync(EXAMPLE, 'utf8')));
}

type Fixtures = { projectDir: string; server: ServeHandle; app: Page };

export const test = base.extend<Fixtures>({
  projectDir: async ({}, use) => {
    const dir = copyExample();
    await use(dir);
    fs.rmSync(dir, { recursive: true, force: true });
  },
  server: async ({ projectDir }, use) => {
    const s = await startServer({ projectDir, port: 0, skipBuild: true, log: () => undefined });
    await use(s);
    await s.close();
  },
  app: async ({ page, server }, use) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(server.url);
    await page.locator('[data-joplo-stage]').waitFor();
    await use(page);
    expect(errors, `页面不应有未捕获异常：${errors.join('\n')}`).toEqual([]);
  },
});
export { expect };

export const playState = (page: Page) => page.evaluate(() => (window as unknown as { __JOPLO_STATE__: PlayState }).__JOPLO_STATE__);
export const uiState = (page: Page) => page.evaluate(() => (window as unknown as { __JOPLO_UI__: { playing: boolean; paused: boolean; busy: boolean; mode: string } }).__JOPLO_UI__);

/** 等待演示动画与自动播放结束。 */
export async function waitIdle(page: Page) {
  await page.waitForFunction(() => {
    const ui = (window as unknown as { __JOPLO_UI__?: { busy: boolean; playing: boolean } }).__JOPLO_UI__;
    return !!ui && !ui.busy && !ui.playing;
  });
}

export const node = (page: Page, id: string) => page.locator(`[data-joplo-stage] [data-jid="${id}"]`);

/** 演示模式下点击舞台元素并等待动画结束。 */
export async function demoClick(page: Page, id: string) {
  await node(page, id).click();
  await waitIdle(page);
}

/** 用真实鼠标按元素中心坐标点击（不经 Playwright 的可操作性检查，等同用户点击禁用按钮）。 */
export async function mouseClickNode(page: Page, id: string) {
  const box = await node(page, id).boundingBox();
  if (!box) throw new Error(`元素 ${id} 不可见`);
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
}

/** 步骤栏显示的“第 k / n 步”中的 k。 */
export async function shownStep(page: Page): Promise<number> {
  const t = await page.getByTestId('caption').innerText();
  const m = /第\s*(\d+)\s*\/\s*\d+\s*步/.exec(t);
  if (!m) throw new Error(`字幕中没有步数：${t}`);
  return Number(m[1]);
}

export const toastCount = (page: Page) => page.evaluate(() => document.querySelectorAll('[data-jtoast]').length);
