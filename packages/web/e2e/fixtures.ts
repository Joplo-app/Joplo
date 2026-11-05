import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test as base, expect, type Page } from '@playwright/test';
import type { PlayState } from '@tokenroll/joplo-core';
import { createDev, type InternalDevHandle } from '../../server/src/dev.ts';

export const ROOT = path.resolve(import.meta.dirname, '../../..');
export const EXAMPLE = path.join(ROOT, 'examples/invite');

/** 把 examples/invite 复制到临时目录（测试只改副本）。 */
export function copyExample(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'joplo-e2e-'));
  fs.cpSync(EXAMPLE, dir, { recursive: true, filter: (src) => !/[/\\](\.joplo|dist|node_modules)([/\\]|$)/.test(src.slice(EXAMPLE.length)) });
  return fs.realpathSync(dir);
}

/** 源文件中某段文字所在的行号（1 起）。 */
export function lineOf(file: string, needle: string): number {
  const i = fs.readFileSync(file, 'utf8').split('\n').findIndex((l) => l.includes(needle));
  if (i < 0) throw new Error(`${file} 中找不到 ${needle}`);
  return i + 1;
}

type Fixtures = { projectDir: string; dev: InternalDevHandle; app: Page };

export const test = base.extend<Fixtures>({
  projectDir: async ({}, use) => {
    const dir = copyExample();
    await use(dir);
    fs.rmSync(dir, { recursive: true, force: true });
  },
  dev: async ({ projectDir }, use) => {
    const d = await createDev({ projectDir, port: 0, log: () => undefined });
    await use(d);
    await d.close();
  },
  app: async ({ page, dev }, use) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(dev.url);
    await node(page, 'btn_invite').waitFor();
    await use(page);
    expect(errors, `页面不应有未捕获异常：${errors.join('\n')}`).toEqual([]);
  },
});
export { expect };

export const playState = (page: Page) => page.evaluate(() => (window as unknown as { __JOPLO_STATE__: PlayState | null }).__JOPLO_STATE__);
export const uiState = (page: Page) =>
  page.evaluate(() => (window as unknown as { __JOPLO_UI__: { playing: boolean; busy: boolean; mode: string; view: string; scenarioId: string | null; optionId: string | null; version: number } }).__JOPLO_UI__);

/** 等待演示动画与自动播放结束。 */
export async function waitIdle(page: Page) {
  await page.waitForFunction(() => {
    const ui = (window as unknown as { __JOPLO_UI__?: { busy: boolean; playing: boolean } }).__JOPLO_UI__;
    return !!ui && !ui.busy && !ui.playing;
  });
}

export const node = (page: Page, id: string) => page.locator(`[data-joplo-stage] [data-jid="${id}"]`).first();

/** 演示模式下点击舞台元素并等待动画结束。 */
export async function demoClick(page: Page, id: string) {
  await node(page, id).click();
  await waitIdle(page);
}

/** 用真实鼠标按元素中心坐标点击（等同用户点击禁用按钮）。 */
export async function mouseClickNode(page: Page, id: string) {
  const box = await node(page, id).boundingBox();
  if (!box) throw new Error(`元素 ${id} 不可见`);
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
}

export const readSelection = (dir: string) => {
  try {
    return JSON.parse(fs.readFileSync(path.join(dir, '.joplo/selection.json'), 'utf8'));
  } catch {
    return undefined;
  }
};
