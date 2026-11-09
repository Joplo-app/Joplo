import { fixtureConfigSource } from '../../../scripts/test/fixtures.ts';
/** Real browser proof for universal attributes/observers, plugin themes and deterministic content playback. */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { buildSite } from '../src/build.ts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { chromium, type Browser, type Page } from 'playwright';
import { createDev } from '../src/dev.ts';
import { launch, renderSheet } from '../src/render.ts';
import type { DevHandle } from '../src/contract.ts';

const REPO = path.resolve(import.meta.dirname, '../../..');
describe('content and a second attribute/theme plugin (real Chromium)', () => {
  let root: string, server: DevHandle, browser: Browser, page: Page;
  const errors: string[] = [];
  beforeAll(async () => {
    root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'joplo-content-')));
    fs.mkdirSync(path.join(root, 'node_modules/@joplo-app'), { recursive: true });
    fs.symlinkSync(path.join(REPO, 'packages/core'), path.join(root, 'node_modules/@joplo-app/core'));
    fs.symlinkSync(path.join(REPO, 'plugins/content'), path.join(root, 'node_modules/@joplo-app/plugin-content'));
    const write = (name: string, source: string) => { const f = path.join(root, name); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, source); };
    write('joplo.config.ts', fixtureConfigSource(`import { config } from '@joplo-app/kit'; import probe from './probe.ts'; export default config({ name: 'Content fixture', theme: 'probe:night', plugins: [probe] });`));
    write('probe.ts', `import { definePlugin } from '@joplo-app/kit/plugin'; export default definePlugin({ id:'probe', title:'Probe', runtime:new URL('./runtime.ts',import.meta.url), components:{}, properties:{badge:{type:'string',attribute:'data-jp-probe-badge'}}, themes:{night:':root{--jp-ink:#ddeeff;--jp-bg:#111827;--jp-stroke:clean} [data-jp-probe-badge]{color:rgb(221,238,255)}'} });`);
    write('runtime.ts', `import { defineRuntime } from '@joplo-app/kit/plugin'; export default defineRuntime({ id:'probe', components:{}, observe(root) { window.observedMounts=(window.observedMounts??0)+1; return { update({frame}) { root.dataset.probePosition=String(frame.position); root.dataset.probeBadge=root.querySelector('[data-jp-probe-badge]')?.getAttribute('data-jp-probe-badge'); }, destroy() {window.observedDestroys=(window.observedDestroys??0)+1;} }; } });`);
    write('routes/page.tsx', `import { $, page } from '@joplo-app/kit'; import { Canvas } from '@joplo-app/plugin-content';
export default page({title:'World',layout:false}, <Canvas id="world"><div id="moving" motion="piece" badge="host-anchor" style={{position:'absolute',left:$.ui.x,top:100,width:$.ui.width,height:80,background:'#ffb020',transform:'rotate(5deg)'}}>moving</div><div id="fixed" screen style={{position:'absolute',left:12,top:12}}>screen</div></Canvas>);`);
    write('features/f/feature.ts', `import { feature } from '@joplo-app/kit'; export default feature({name:'F',goal:'G',cases:{},pick:'a'});`);
    write('features/f/options/a.ts', `import { $, flow, option, patch, narrate } from '@joplo-app/kit'; import { camera } from '@joplo-app/plugin-content'; export default option({name:'A',idea:'I',state:{ui:{x:50,width:100}},scenarios:{s:flow('S',{start:'/'}).system('Move',patch($.ui,{x:400,width:160}),camera('moving',{ms:1200}),narrate('A narrated move')).system('Move again',patch($.ui,{x:700,width:120})).system('Whole',camera())}});`);
    // Test-only React harness, served by the same Vite host/registry as the board. No player hooks are replaced.
    write('harness.ts', `import { createElement } from 'react'; import {createRoot} from 'react-dom/client'; import {stateAt, projectThemes} from '@joplo-app/core'; import {Stage} from ${JSON.stringify(path.join(REPO, 'packages/web/src/renderer/Stage.tsx'))}; import {ThemeStyles} from ${JSON.stringify(path.join(REPO, 'packages/web/src/renderer/ThemeStyles.tsx'))}; import {loadPluginRuntimes} from ${JSON.stringify(path.join(REPO, 'packages/web/src/renderer/plugins.ts'))};
let reactRoot, project; window.fixtureStart=async(p,urls)=>{project=p;await loadPluginRuntimes(urls);const el=document.createElement('div');el.id='fixture';document.body.replaceChildren(el);reactRoot=createRoot(el);window.fixtureAt(0,false);};window.fixtureAt=(position,animate)=>reactRoot.render(createElement('div',{},createElement(ThemeStyles,{themes:projectThemes(project)}),createElement(Stage,{project,state:stateAt(project,'f.a.s',position),theme:project.theme,mode:'demo',animate})));window.fixtureUnmount=()=>reactRoot.unmount();`);
    write('fixture.html', `<!doctype html><style>body{margin:0}</style><script type="module">import RefreshRuntime from '/@react-refresh';RefreshRuntime.injectIntoGlobalHook(window);window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>type=>type;window.__vite_plugin_react_preamble_installed__=true;await import('./harness.ts');</script>`);
    server = await createDev({ projectDir: root, port: 0, watch: false, log: () => undefined });
    expect(server.payload().diagnostics.filter(d => d.severity === 'error')).toEqual([]);
    browser = await launch({ chromium });
    page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    page.on('pageerror', e => errors.push(e.message));
    page.on('requestfailed', r => errors.push(`${r.url()}: ${r.failure()?.errorText}`));
    page.on('response', r => { if (r.status() >= 400) errors.push(`${r.status()} ${r.url()}`); });
    await page.goto(`${server.url}@fs/${root}/fixture.html`);
    await page.waitForFunction(() => typeof (window as any).fixtureStart === 'function', null, {timeout:10000}).catch(() => { throw new Error(`Harness failed: ${errors.join('; ')}`); });
    const payload = server.payload();
    await page.evaluate(({ project, urls }) => (window as any).fixtureStart(project, urls), { project: payload.project, urls: payload.plugins });
    await page.waitForSelector('[data-probe-position="0"]');
  }, 120000);
  afterAll(async () => { await browser?.close(); await server?.close(); if (root) fs.rmSync(root, { recursive: true, force: true }); });
  async function at(position: number, animate: boolean) {
    await page.evaluate(({ position, animate }) => (window as any).fixtureAt(position, animate), { position, animate });
    await page.waitForSelector(`[data-probe-position="${position}"]`);
    await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
  }
  it('a component-free second plugin observes host anchors and receives the current frame', async () => {
    expect(await page.locator('[data-joplo-stage]').getAttribute('data-probe-badge')).toBe('host-anchor');
    expect(await page.locator('[data-jid="moving"]').evaluate(el => getComputedStyle(el).color)).toBe('rgb(221, 238, 255)');
    expect(await page.locator('[data-jcanvas-screen] [data-jid="fixed"]').count()).toBe(1);
    expect(await page.locator('[data-jcanvas-world] [data-jid="fixed"]').count()).toBe(0);
  });
  it('plays FLIP without touching author transform, then cancels it for a still frame', async () => {
    await at(1, true);
    const flight = await page.locator('[data-jid="moving"]').evaluate(el => {
      const a = el.getAnimations().find(a => a.id === 'jmotion');
      return { transform: (el as HTMLElement).style.transform, duration: a?.effect?.getTiming().duration, keys: (a?.effect as KeyframeEffect)?.getKeyframes() };
    });
    expect(flight.transform).toBe('rotate(5deg)');
    expect(flight.duration).toBe(1200);
    expect(flight.keys?.[0]).toHaveProperty('translate');
    await at(1, false);
    expect(await page.locator('[data-jid="moving"]').evaluate(el => el.getAnimations().some(a => a.id === 'jmotion'))).toBe(false);
    expect(await page.locator('[data-jcanvas-world]').evaluate(el => getComputedStyle(el).transitionDuration)).toBe('0s');
  });
  it('sequential advancement and a fresh direct jump produce identical pixels', async () => {
    await at(2, false);
    const sequential = await page.locator('#fixture').screenshot();
    await page.evaluate(() => (window as any).fixtureUnmount());
    const payload = server.payload();
    await page.evaluate(async ({ project, urls }) => { await (window as any).fixtureStart(project, urls); (window as any).fixtureAt(2, false); }, { project: payload.project, urls: payload.plugins });
    await page.waitForSelector('[data-probe-position="2"]');
    await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
    expect(await page.locator('#fixture').screenshot()).toEqual(sequential);
    expect(await page.evaluate(() => (window as any).observedDestroys)).toBe(1);
    expect(errors).toEqual([]);
  });
  it('plays the real explainer from file:// with networking disabled and no author code', async () => {
    const outDir = path.join(root, 'offline-site');
    const built = await buildSite({ projectDir: path.join(REPO, 'examples/llm-explainer'), outDir });
    expect(built.diagnostics.filter(d => d.severity === 'error')).toEqual([]);
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce', offline: true });
    try {
      const offline = await context.newPage();
      const failures: string[] = [], network: string[] = [];
      offline.on('pageerror', e => failures.push(e.message));
      offline.on('requestfailed', r => failures.push(r.url()));
      offline.on('request', r => { if (/^https?:/.test(r.url())) network.push(r.url()); });
      await offline.goto(pathToFileURL(path.join(outDir, 'index.html')).href + '#/f/llm?s=llm.a-studio.tokens&step=2');
      await offline.waitForSelector('[data-jcanvas-world]');
      await offline.evaluate(() => document.fonts.ready);
      const transform = await offline.locator('[data-jcanvas-world]').evaluate(el => (el as HTMLElement).style.transform);
      expect(transform).not.toContain('scale(0)');
      expect(await offline.locator('[data-joplo-stage]').getAttribute('data-theme')).toBe('content:studio');
      await offline.keyboard.press('ArrowRight');
      await offline.waitForFunction(() => location.hash.includes('step=3'));
      await offline.keyboard.press('ArrowLeft');
      await offline.waitForFunction(() => location.hash.includes('step=2'));
      expect(await offline.locator('[data-jcanvas-world]').evaluate(el => (el as HTMLElement).style.transform)).toBe(transform);
      expect(await offline.locator('[data-testid="playback-error"]').count()).toBe(0);
      expect(failures).toEqual([]);
      expect(network).toEqual([]);
      const scripts = await offline.locator('script:not([type="application/json"])').allTextContents();
      expect(scripts.join('\n')).not.toMatch(/CAMERA_UNKNOWN|CAMERA_INVALID|Required: review before handing over/);
    } finally { await context.close(); }
  }, 120000);
  it('renders a two-column storyboard with every step, initial frame and narration', async () => {
    // renderSheet resolves the existing project Playwright package; no browser installation.
    fs.mkdirSync(path.join(root, 'node_modules'), { recursive: true });
    fs.symlinkSync(path.join(REPO, 'packages/server/node_modules/playwright'), path.join(root, 'node_modules/playwright'));
    const out = path.join(root, 'board.png');
    const result = await renderSheet({ projectDir: root, scenarioId: 'f.a.s', columns: 2, out });
    expect(result.steps).toBe(3);
    const png = fs.readFileSync(out);
    expect(png.readUInt32BE(16)).toBe(1026); // 2*480 + gap 18 + padding 48
    expect(result.warnings.every(w => /^Step \d+:/.test(w))).toBe(true);
  }, 120000);
});
