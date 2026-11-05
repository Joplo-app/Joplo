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

    // 连线：点它的标签（标签在连线之上单独一层，点标签等于点连线）
    const label = (id: string) => page.locator(`[data-joplo-stage] [data-jedge-for="${id}"]`);
    await label('client->brain').getByText('发送消息').click({ modifiers: ['Alt'] });
    await expect(drawer.getByTestId('sel-label')).toHaveText('发送消息');
    await expect(drawer.getByTestId('sel-endpoints')).toHaveText('client → brain');
    await expect(drawer.getByTestId('sel-state')).toHaveAttribute('data-state', 'ok');
    await expect.poll(() => readSelection(dir)?.nodeId).toBe('client->brain');
    const sel = readSelection(dir);
    expect(sel.at).toMatch(/^features\/arch\/options\/a\.tsx:\d+:\d+$/);
    await drawer.getByTestId('drawer-close').click();
    // 显式 id 的连线
    await label('call_tool').getByText('工具调用').click({ modifiers: ['Alt'] });
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

test.describe('Diagram 可读性：examples/agent-arch（1600×1000）', () => {
  let dir: string;
  let dev: InternalDevHandle;
  test.beforeAll(async () => {
    dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'joplo-agent-arch-')));
    fs.cpSync(path.join(import.meta.dirname, '../../../examples/agent-arch'), dir, { recursive: true, filter: (s) => !/[/\\](\.joplo|dist|node_modules|exports)([/\\]|$)/.test(s) });
    dev = await createDev({ projectDir: dir, port: 0, watch: false, log: () => undefined });
    expect(dev.payload().ok, JSON.stringify(dev.payload().diagnostics)).toBe(true);
  });
  test.afterAll(async () => {
    await dev.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  for (const [scenario, position] of [['agent.a-hybrid.happy', 7], ['agent.a-hybrid.quota', 3]] as const)
    test(`${scenario}#${position}：节点主标签 ≥ 12px、description ≥ 10px；标签互不重叠；放不下时可以拖动平移`, async ({ page }) => {
      await page.setViewportSize({ width: 1600, height: 1000 });
      await page.goto(`${dev.url}?render=1&project=${dev.projectId}&scenario=${scenario}&position=${position}&theme=sketch&w=1600&h=1000`);
      await page.waitForFunction(() => (window as any).__JOPLO_READY__ === true);
      const d = page.locator('[data-jtype="Diagram"]');
      const scale = Number(await d.getAttribute('data-scale'));
      const sizes = await page.locator('[data-jtype="Diagram.Node"]').evaluateAll((els) =>
        els.map((e) => ({ label: parseFloat(getComputedStyle(e.querySelector('.jtrunc')!).fontSize), desc: e.querySelector('[data-jdesc]') ? parseFloat(getComputedStyle(e.querySelector('[data-jdesc]')!).fontSize) : null })),
      );
      expect(sizes.length).toBeGreaterThanOrEqual(10);
      for (const s of sizes) {
        expect(s.label * scale).toBeGreaterThanOrEqual(12);
        if (s.desc !== null) expect(s.desc * scale).toBeGreaterThanOrEqual(10);
      }
      // 实际渲染出的连线标签、节点、分组标题两两不重叠（浏览器里量）
      const boxes = await page.evaluate(() => {
        const r = (el: Element) => (({ x, y, width, height }) => ({ x, y, w: width, h: height }))(el.getBoundingClientRect());
        return {
          labels: Array.from(document.querySelectorAll('[data-jedge-label] rect')).map(r),
          nodes: Array.from(document.querySelectorAll('[data-jtype="Diagram.Node"]')).map(r),
          titles: Array.from(document.querySelectorAll('[data-jgroup-title]')).map(r),
        };
      });
      const ov = (a: { x: number; y: number; w: number; h: number }, b: typeof a) => Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x) > 1 && Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y) > 1;
      for (let i = 0; i < boxes.labels.length; i++) {
        for (let j = i + 1; j < boxes.labels.length; j++) expect(ov(boxes.labels[i]!, boxes.labels[j]!), `标签 ${i} 与 ${j} 重叠`).toBe(false);
        for (const n of boxes.nodes) expect(ov(boxes.labels[i]!, n), `标签 ${i} 压住节点`).toBe(false);
        for (const t of boxes.titles) expect(ov(boxes.labels[i]!, t), `标签 ${i} 压住分组标题`).toBe(false);
      }
      // 放不下时：内部滚动，拖动可以平移
      if ((await d.getAttribute('data-scroll')) !== null) {
        const box = (await d.boundingBox())!;
        const before = await d.evaluate((el) => [el.scrollLeft, el.scrollTop]);
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        await page.mouse.down();
        await page.mouse.move(box.x + box.width / 2 - 160, box.y + box.height / 2 - 120, { steps: 6 });
        await page.mouse.up();
        const after = await d.evaluate((el) => [el.scrollLeft, el.scrollTop]);
        expect(after[0]! + after[1]!, '拖动后应平移').toBeGreaterThan(before[0]! + before[1]!);
      }
    });
});
