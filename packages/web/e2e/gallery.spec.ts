/**
 * 目录画廊：COMPONENT_TYPES 中的每个组件都由渲染器实现（舞台里出现对应 data-jtype），渲染时没有 React 报错；
 * 响应式：同一画面在桌面 / 手机宽度下按断点取值，AppShell 窄屏收起导航并显示 Burger。
 */
import fs from 'node:fs';
import path from 'node:path';
import { COMPONENT_TYPES } from '@joplo/core';
import { createDev, type InternalDevHandle } from '../../server/src/dev.ts';
import { copyExample, expect, node, test } from './fixtures';

const GALLERY = fs.readFileSync(path.join(import.meta.dirname, 'gallery.page.tsx.txt'), 'utf8');

test.describe('组件目录画廊', () => {
  let dir: string;
  let dev: InternalDevHandle;
  test.beforeAll(async () => {
    dir = copyExample();
    fs.mkdirSync(path.join(dir, 'routes/gallery'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'routes/gallery/page.tsx'), GALLERY);
    dev = await createDev({ projectDir: dir, port: 0, watch: false, log: () => undefined });
  });
  test.afterAll(async () => {
    await dev.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  test('每个目录组件都有渲染实现，且没有 React 报错', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(m.text());
    });
    expect(dev.payload().ok, JSON.stringify(dev.payload().diagnostics)).toBe(true);
    await page.goto(dev.url);
    await node(page, 'btn_invite').waitFor();
    await page.getByTestId('view-browse').click();
    await page.getByTestId('browse-route-/gallery').click();
    await node(page, 'g_btn').waitFor();
    const rendered = new Set(await page.locator('[data-joplo-stage] [data-jtype]').evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.jtype!)));
    const missing = COMPONENT_TYPES.filter((t) => !rendered.has(t));
    expect(missing, `这些组件没有渲染出来：${missing.join(', ')}`).toEqual([]);
    // 细节：浮层在舞台的弹窗层；DataTable 读 records / columns（嵌套 accessor、缺省 title）；Select 显示选中项
    await expect(page.locator('[data-joplo-stage] [role="dialog"][aria-label="弹窗"]')).toBeVisible();
    await expect(page.locator('[data-joplo-stage] [role="dialog"][aria-label="抽屉"]')).toBeVisible();
    await expect(node(page, 'g_dt')).toContainText('设计');
    await expect(node(page, 'g_dt')).toContainText('Team name');
    await expect(node(page, 'g_dt_empty')).toContainText('空空如也');
    await expect(node(page, 'g_sel')).toContainText('乙');
    await expect(node(page, 'g_text')).toContainText('出错了');
    expect(errors, errors.join('\n')).toEqual([]);
  });

  test('桌面与手机宽度：SimpleGrid 列数、visibleFrom/hiddenFrom、AppShell 收起导航', async ({ page }) => {
    await page.goto(dev.url);
    await node(page, 'btn_invite').waitFor();
    await page.getByTestId('view-browse').click();
    await page.getByTestId('browse-route-/gallery').click();
    await node(page, 'g_btn').waitFor();
    await expect(page.locator('[data-joplo-stage]')).toHaveAttribute('data-width', '1280');
    await expect(node(page, 'g_grid')).toHaveAttribute('data-cols', '4');
    await expect(node(page, 'g_nav')).toBeVisible();
    await expect(page.locator('[data-joplo-stage] [data-jid="g_burger"]')).toHaveCount(0);

    await page.getByTestId('width-mobile').click();
    await expect(page.locator('[data-joplo-stage]')).toHaveAttribute('data-width', '390');
    await expect(node(page, 'g_grid')).toHaveAttribute('data-cols', '1');
    await expect(page.locator('[data-joplo-stage] [data-jid="g_nav"]')).toHaveCount(0);
    await expect(node(page, 'g_burger')).toBeVisible();

    // 回到页面自身的宽度
    await page.getByTestId('width-desktop').click();
    await expect(node(page, 'g_grid')).toHaveAttribute('data-cols', '4');
  });
});
