/**
 * 架构图（Diagram，D41）：播放时状态由 flow 的 set() 驱动、节点不移动；active 连线上有移动的小点；
 * ⌥+单击节点 / 连线弹出检查抽屉（label、description、state、源码位置）；发布站同样显示。
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildSite } from '../../server/src/build.ts';
import { createDev, type InternalDevHandle } from '../../server/src/dev.ts';
import { expect, node, playState, playUrl, readSelection, test, waitIdle } from './fixtures';

const FIXTURE = path.join(import.meta.dirname, 'fixtures/diagram');

test.describe('Diagram', () => {
  let dir: string;
  let dev: InternalDevHandle;
  test.beforeAll(async () => {
    dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'joplo-diagram-')));
    fs.cpSync(FIXTURE, dir, { recursive: true });
    dev = await createDev({ projectDir: dir, port: 0, log: () => undefined });
    expect(dev.payload().ok, JSON.stringify(dev.payload().diagnostics)).toBe(true);
  });
  test.afterAll(async () => {
    await dev.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  const boxes = (page: import('@playwright/test').Page) =>
    page.locator('[data-joplo-stage] [data-jtype="Diagram.Node"], [data-joplo-stage] [data-jtype="Diagram.Group"]').evaluateAll((els) =>
      Object.fromEntries(els.map((e) => [(e as HTMLElement).dataset.jid!, (({ x, y, width, height }) => ({ x, y, width, height }))(e.getBoundingClientRect())])),
    );

  test('播放：state 跟着步骤变，任何节点都不移动；active 的连线上有小点', async ({ page }) => {
    await page.goto(playUrl(dev, '', 'arch'));
    await node(page, 'brain').waitFor();
    await expect(page.locator('[data-joplo-stage] [data-jtype="Diagram.Node"]')).toHaveCount(9);
    await expect(page.locator('[data-joplo-stage] [data-jtype="Diagram.Group"]')).toHaveCount(2);
    await expect(page.locator('[data-joplo-stage] [data-jtype="Diagram.Edge"]')).toHaveCount(8);
    await expect(node(page, 'biz')).toHaveAttribute('data-state', 'dim');
    const before = await boxes(page);
    expect(Object.keys(before)).toHaveLength(11);

    await page.getByTestId('ctl-next').click();
    await waitIdle(page);
    await expect(node(page, 'client->brain')).toHaveAttribute('data-state', 'active');
    await expect(node(page, 'client->brain').locator('[data-jdot]')).toHaveCount(1);
    await expect(node(page, 'client')).toHaveAttribute('data-state', 'active');
    // 小点在动（Motion）
    const at = () => node(page, 'client->brain').locator('[data-jdot]').getAttribute('cx');
    const c1 = await at();
    await page.waitForTimeout(300);
    expect(await at()).not.toBe(c1);
    expect(await boxes(page)).toEqual(before);

    for (let i = 0; i < 3; i++) {
      await page.getByTestId('ctl-next').click();
      await waitIdle(page);
    }
    expect((await playState(page))!.completed?.outcome).toBe('success');
    await expect(node(page, 'client->brain')).toHaveAttribute('data-state', 'ok');
    await expect(node(page, 'client->brain').locator('[data-jdot]')).toHaveCount(0);
    await expect(node(page, 'impl->biz')).toHaveAttribute('data-state', 'error');
    await expect(node(page, 'biz')).toHaveAttribute('data-state', 'error');
    await expect(node(page, 'brain->queue')).toHaveAttribute('data-async', '');
    expect(await boxes(page)).toEqual(before);
  });

  test('⌥+单击节点与连线：抽屉显示 label、description、state 与源码位置；连线 id 缺省为 from->to', async ({ page }) => {
    await page.goto(playUrl(dev, 'step=2', 'arch'));
    await node(page, 'brain').waitFor();
    await node(page, 'brain').click({ modifiers: ['Alt'] });
    const drawer = page.getByTestId('inspect-drawer');
    await expect(drawer.getByTestId('sel-label')).toHaveText('Agent 大脑');
    await expect(drawer.getByTestId('sel-description')).toHaveText('推理循环，只发出工具调用');
    await expect(drawer.getByTestId('sel-state')).toHaveAttribute('data-state', 'active');
    await expect(drawer.getByTestId('sel-at')).toHaveText(/^features\/arch\/options\/a\.tsx:\d+:\d+$/);
    await expect.poll(() => readSelection(dir)?.nodeId).toBe('brain');
    await drawer.getByTestId('drawer-close').click();

    // 连线：点它的标签
    await node(page, 'client->brain').getByText('发送消息').click({ modifiers: ['Alt'] });
    await expect(drawer.getByTestId('sel-label')).toHaveText('发送消息');
    await expect(drawer.getByTestId('sel-endpoints')).toHaveText('client → brain');
    await expect(drawer.getByTestId('sel-state')).toHaveAttribute('data-state', 'ok');
    await expect.poll(() => readSelection(dir)?.nodeId).toBe('client->brain');
    const sel = readSelection(dir);
    expect(sel.at).toMatch(/^features\/arch\/options\/a\.tsx:\d+:\d+$/);
    await drawer.getByTestId('drawer-close').click();
    // 显式 id 的连线
    await node(page, 'call_tool').getByText('工具调用').click({ modifiers: ['Alt'] });
    await expect(drawer.getByTestId('sel-endpoints')).toHaveText('brain → impl');
    // 普通单击架构图不推进演示
    await drawer.getByTestId('drawer-close').click();
    await node(page, 'brain').click();
    expect((await playState(page))!.position).toBe(2);
  });

  test('发布站（file://）同样显示架构图与连线', async ({ page }) => {
    const out = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'joplo-diagram-site-')), 'site');
    await buildSite({ projectDir: dir, outDir: out });
    await page.goto(`file://${path.join(out, 'index.html')}`);
    await page.getByTestId('site-view-arch').click();
    await node(page, 'brain').waitFor();
    await expect(page.locator('[data-joplo-stage] [data-jtype="Diagram.Edge"]')).toHaveCount(8);
    await page.getByTestId('ctl-next').click();
    await waitIdle(page);
    await expect(node(page, 'client->brain')).toHaveAttribute('data-state', 'active');
    fs.rmSync(path.dirname(out), { recursive: true, force: true });
  });
});
