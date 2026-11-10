import { installFixturePlugins } from '../../../scripts/test/fixtures.ts';
import { fixtureConfigSource } from '../../../scripts/test/fixtures.ts';
/** Real render-route regression: authored z-index must never paint above cards/covers. */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { chromium, type Browser, type Page } from 'playwright';
import { createDev } from '../src/dev.ts';
import { launch, renderQuery } from '../src/render.ts';
import type { DevHandle } from '../src/contract.ts';

describe('render curtain stacking (real Chromium)', () => {
  let root: string;
  let server: DevHandle;
  let browser: Browser;
  let page: Page;
  const errors: string[] = [];
  beforeAll(async () => {
    root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'joplo-curtain-')));
    const write = (file: string, content: string) => {
      const target = path.join(root, file);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, content);
    };
    installFixturePlugins(root);
    write('joplo.config.ts', fixtureConfigSource(`import { config } from '@joplo-app/kit'; export default config({ name: 'Curtain fixture', home: '/' });`));
    for (const [route, viewport] of [['page.tsx', 'desktop'], ['phone/page.tsx', 'mobile']]) {
      write(`routes/${route}`, `import { $, page } from '@joplo-app/kit';
import { Box, Terminal } from '@joplo-app/plugin-ui'; import { Diagram } from '@joplo-app/plugin-diagram';
export default page({title:'Prototype',layout:false,viewport:'${viewport}'},
<Box id="foreground" style={{position:'absolute',inset:0,zIndex:9999,background:'#ffffff'}}>
  <Terminal title="Prototype terminal"><Terminal.Command>design feature</Terminal.Command><Terminal.Output id="result">{$.ui.status}</Terminal.Output></Terminal>
  <Diagram id="architecture" direction="right" h={200}><Diagram.Node id="client" label="Client"/><Diagram.Node id="server" label="Server"/><Diagram.Edge from="client" to="server" label="request"/></Diagram>
</Box>);`);
    }
    write('features/demo/feature.ts', `import { feature } from '@joplo-app/kit'; export default feature({name:'Export',goal:'Keep cards readable',cases:{},pick:'a'});`);
    write('features/demo/works/a.tsx', `import { $, flow, work, set } from '@joplo-app/kit';
const scene = (start) => flow('Design replay',{start}).card('Opening context',{sub:'Read the design problem'}).system('Prototype interaction','Subtitle floats over the stage',set($.ui.status,'after')).card('Closing boundary',{sub:'Keep the evidence readable'});
export default work({title:'A',summary:'Compare scene and curtain',state:{ui:{status:'before'}},scenarios:{desktop:scene('/'),phone:scene('/phone')}});`);
    server = await createDev({ projectDir: root, port: 0, watch: false, log: () => undefined });
    expect(server.payload().diagnostics.filter(d => d.severity === 'error')).toEqual([]);
    browser = await launch({ chromium });
    page = await browser.newPage({ viewport: { width: 1440, height: 1200 }, reducedMotion: 'reduce' });
    page.on('pageerror', e => errors.push(e.message));
  }, 120_000);
  afterAll(async () => {
    await browser?.close();
    await server?.close();
    if (root) fs.rmSync(root, { recursive: true, force: true });
  });

  async function at(scenario: 'desktop' | 'phone', position: number, extra: Record<string, string> = {}) {
    const query = new URLSearchParams(renderQuery({ projectId: server.projectId, scenarioId: `demo.a.${scenario}`, position, theme: 'sketch', locale: 'en' }));
    for (const [key, value] of Object.entries(extra)) query.set(key, value);
    await page.goto(`${server.url}?${query}`, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => (window as unknown as { __JOPLO_READY__?: boolean }).__JOPLO_READY__ === true);
    expect(await page.evaluate(() => (window as unknown as { __JOPLO_ERROR__?: string }).__JOPLO_ERROR__ ?? null)).toBeNull();
    expect(errors).toEqual([]);
  }

  async function curtainIsAbove(titleId: 'card-title' | 'cover-title') {
    return page.evaluate((titleId) => {
      const curtain = document.querySelector<HTMLElement>('[data-jlayer="curtain"]')!;
      const title = curtain.querySelector<HTMLElement>(`[data-testid="${titleId}"]`)!;
      const box = title.getBoundingClientRect();
      const wasPassive = getComputedStyle(curtain).pointerEvents === 'none';
      // Export curtains stay passive. Enable hit testing only for this visual stacking probe.
      const previous = curtain.style.pointerEvents;
      curtain.style.pointerEvents = 'auto';
      const upper = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
      curtain.style.pointerEvents = previous;
      return { wasPassive, curtainOnTop: curtain.contains(upper), title: title.textContent, upper: upper?.closest('[data-jid]')?.getAttribute('data-jid') ?? upper?.tagName };
    }, titleId);
  }

  it('cards cover high-z-index terminal/diagram in plain, fixed-size and framed desktop exports', async () => {
    const modes: Record<string, string>[] = [{}, { w: '640', h: '500' }, { frame: '1' }];
    for (const extra of modes) {
      await at('desktop', 3, extra);
      const probe = await curtainIsAbove('card-title');
      expect(probe, JSON.stringify(extra)).toMatchObject({ wasPassive: true, curtainOnTop: true, title: 'Closing boundary' });
      const bounds = await page.evaluate(() => {
        const curtain = document.querySelector('[data-jlayer="curtain"]')!.getBoundingClientRect();
        const sub = document.querySelector('[data-jsubtitle]')!.getBoundingClientRect();
        const shot = document.querySelector('[data-jshot]')?.getBoundingClientRect();
        return { top: sub.top - curtain.top, bottom: curtain.bottom - sub.bottom, widthGap: sub.width - curtain.width, shot: shot && { width: shot.width, height: shot.height } };
      });
      // D97：字幕浮在舞台上，不再另占一条——字幕层在幕布（= 舞台）范围之内，宽度相同
      expect(bounds.top).toBeGreaterThanOrEqual(-1);
      expect(bounds.bottom).toBeGreaterThanOrEqual(-1);
      expect(Math.abs(bounds.widthGap)).toBeLessThan(1);
      if ('w' in extra) expect(bounds.shot).toEqual({ width: 640, height: 500 });
    }
  }, 120_000);

  it('mobile cards and initial covers span the phone frame; the subtitle layer floats inside it (D97)', async () => {
    for (const position of [0, 1]) {
      await at('phone', position, { frame: '1' });
      expect(await curtainIsAbove(position === 0 ? 'cover-title' : 'card-title')).toMatchObject({ wasPassive: true, curtainOnTop: true });
      const bounds = await page.evaluate(() => {
        const frame = document.querySelector('[data-jphone-frame]')!.getBoundingClientRect();
        const curtain = document.querySelector('[data-jlayer="curtain"]')!.getBoundingClientRect();
        const sub = document.querySelector('[data-jsubtitle]')!.getBoundingClientRect();
        return { frame: { x: frame.x, y: frame.y, width: frame.width, height: frame.height }, curtain: { x: curtain.x, y: curtain.y, width: curtain.width, height: curtain.height }, sub: { top: sub.top, bottom: sub.bottom } };
      });
      expect(bounds.curtain).toEqual(bounds.frame);
      expect(bounds.sub.top).toBeGreaterThanOrEqual(bounds.frame.y - 1);
      expect(bounds.sub.bottom).toBeLessThanOrEqual(bounds.frame.y + bounds.frame.height + 1);
    }
  }, 120_000);

  it('a non-card step still shows the authored state and its subtitle', async () => {
    await at('desktop', 2);
    expect(await page.locator('[data-jlayer="curtain"]').count()).toBe(0);
    expect(await page.locator('[data-jid="result"]').innerText()).toBe('after');
    expect(await page.locator('[data-jsubtitle]').innerText()).toContain('Subtitle floats over the stage');
  }, 120_000);
});
