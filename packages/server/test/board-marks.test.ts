import { installFixturePlugins, fixtureConfigSource } from '../../../scripts/test/fixtures.ts';
/**
 * Real render-route regression (D96):
 * - mark() must draw when the page opens directly at its step (deep link / screenshot / first video frame).
 *   Marks lives inside the camera wrapper and used to read the parent ref before React attached it.
 * - ui:Board + ui:Arrow draws a persistent arrow between two elements, and none to a hidden target.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { chromium, type Browser, type Page } from 'playwright';
import { createDev } from '../src/dev.ts';
import { launch, renderQuery } from '../src/render.ts';
import type { DevHandle } from '../src/contract.ts';

describe('board arrows and first-mount marks (real Chromium)', () => {
  let root: string;
  let server: DevHandle;
  let browser: Browser;
  let page: Page;
  const errors: string[] = [];
  beforeAll(async () => {
    root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'joplo-board-marks-')));
    const write = (file: string, content: string) => {
      const target = path.join(root, file);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, content);
    };
    installFixturePlugins(root);
    write('joplo.config.ts', fixtureConfigSource(`import { config } from '@joplo-app/kit'; export default config({ name: 'Board fixture', home: '/' });`));
    write('routes/page.tsx', `import { $, page } from '@joplo-app/kit';
import { Arrow, Board, BrowserWindow, Button, Note, Text } from '@joplo-app/plugin-ui';
export default page({ title: 'Board', layout: false },
<Board>
  <BrowserWindow id="first" label="1. First" url="app/one" pos="absolute" top={80} left={40} w={360} h={260}>
    <Button id="go">Next</Button>
    <Text id="hint">Expires in 15 minutes</Text>
  </BrowserWindow>
  <BrowserWindow id="second" label="2. Second" pos="absolute" top={80} left={620} w={360} h={260} when={$.ui.next}>
    <Text>Done</Text>
  </BrowserWindow>
  <Arrow id="link" from="go" to="second" label="next" when={$.ui.next} />
  <Note id="note" pos="absolute" top={420} left={60}>A note</Note>
</Board>);`);
    write('features/demo/feature.ts', `import { feature } from '@joplo-app/kit'; export default feature({ name: 'Board', goal: 'Show a flow', cases: {}, pick: 'a' });`);
    write('features/demo/works/a.tsx', `import { $, flow, mark, work, set } from '@joplo-app/kit';
export default work({ title: 'A', summary: 'Board', state: { ui: { next: false } }, scenarios: {
  main: flow('Main', { start: '/' })
    .system('Mark first', 'Underline the hint', mark('hint', { kind: 'underline' }))
    .click('go', 'Go to the second screen', set($.ui.next, true)),
} });`);
    server = await createDev({ projectDir: root, port: 0, watch: false, log: () => undefined });
    expect(server.payload().diagnostics.filter(d => d.severity === 'error')).toEqual([]);
    browser = await launch({ chromium });
    page = await browser.newPage({ viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce' });
    page.on('pageerror', e => errors.push(e.message));
  }, 120_000);
  afterAll(async () => {
    await browser?.close();
    await server?.close();
    if (root) fs.rmSync(root, { recursive: true, force: true });
  });

  async function at(position: number) {
    const query = new URLSearchParams(renderQuery({ projectId: server.projectId, scenarioId: 'demo.a.main', position, theme: 'sketch', locale: 'en' }));
    await page.goto(`${server.url}?${query}`, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => (window as unknown as { __JOPLO_READY__?: boolean }).__JOPLO_READY__ === true);
    expect(await page.evaluate(() => (window as unknown as { __JOPLO_ERROR__?: string }).__JOPLO_ERROR__ ?? null)).toBeNull();
    expect(errors).toEqual([]);
  }
  const paths = (selector: string) => page.evaluate(sel => document.querySelectorAll(`${sel} path`).length, selector);

  it('draws mark() when the page opens directly at its step', async () => {
    await at(1);
    await expect.poll(() => paths('[data-jlayer="marks"]'), { timeout: 5000 }).toBeGreaterThan(0);
  }, 60_000);

  it('draws a board arrow only once both ends are on the board', async () => {
    await at(1);
    expect(await page.locator('[data-jid="link"]').count()).toBe(0);
    await at(2);
    await expect.poll(() => paths('svg[data-jid="link"]'), { timeout: 5000 }).toBeGreaterThan(0);
    const label = await page.locator('[data-jboard] >> text="next"').count();
    expect(label).toBe(1);
    // The arrow starts right of the button and ends left of the second screen.
    const geom = await page.evaluate(() => {
      const r = (id: string) => document.querySelector(`[data-jid="${id}"]`)!.getBoundingClientRect();
      const svgPaths = [...document.querySelectorAll('svg[data-jid="link"] path')].map(p => p.getBoundingClientRect());
      const left = Math.min(...svgPaths.map(p => p.left)), right = Math.max(...svgPaths.map(p => p.right));
      return { go: r('go').right, second: r('second').left, left, right };
    });
    expect(geom.left).toBeGreaterThanOrEqual(geom.go - 2);
    expect(geom.right).toBeLessThanOrEqual(geom.second + 2);
  }, 60_000);
});
