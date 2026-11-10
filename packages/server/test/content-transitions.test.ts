import { installFixturePlugins, fixtureConfigSource } from '../../../scripts/test/fixtures.ts';
/**
 * D92 浏览器证据：content 的进场 / 退场（幽灵）与镜头漂移，走生产的 Stage、演示控制器与引擎时钟。
 * G1 幽灵外观与移除前一致；G2 幽灵没有身份、不可交互；G3 暂停冻结、静态画面不产生；G4 一定会被移除；G5 不破坏 React。
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { chromium, type Browser, type Page } from 'playwright';
import { createDev } from '../src/dev.ts';
import { launch } from '../src/render.ts';

const REPO = path.resolve(import.meta.dirname, '../../..');
describe('D92 content transitions in a real browser', () => {
  let root: string, server: Awaited<ReturnType<typeof createDev>>, browser: Browser, page: Page;
  const errors: string[] = [];
  beforeAll(async () => {
    root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'joplo-transitions-')));
    const write = (name: string, source: string) => { const file = path.join(root, name); fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, source); };
    installFixturePlugins(root);
    write('joplo.config.ts', fixtureConfigSource(`import {config} from '@joplo-app/kit';export default config({name:'Transitions',theme:'room',autoFocus:false});`));
    write('themes/room.css', `.room{position:absolute;inset:0;font-family:serif}.room .panel{position:absolute;left:100px;top:120px;width:400px;height:200px;font-size:31px;color:rgb(10,20,30);background:rgb(200,100,50);padding:12px;border:3px solid rgb(1,2,3)}.room .panel.next{left:600px;background:rgb(50,100,200)}.room .panel .label{font-size:17px;letter-spacing:2px}.row{position:absolute;left:100px;top:500px;display:flex;gap:10px}.chip{display:inline-block;padding:4px 10px;background:#ddd}.spot{position:absolute;left:900px;top:600px;width:100px;height:60px;background:#333}.bar{position:absolute;left:0;top:1300px;width:2560px;height:220px;background:#eee}.yr{position:absolute;top:0;width:300px;height:60px;font-size:40px}.scrub{position:absolute!important;top:90px;width:200px;height:70px}`);
    write('routes/page.tsx', `import {page,$,eq} from '@joplo-app/kit';import {Canvas} from '@joplo-app/plugin-content';import {Button} from '@joplo-app/plugin-ui';export default page({title:'Room',layout:false},<div style={{position:'relative',width:1280,height:800}}><Canvas w={1280} h={800} drift={false}><div className="room"><section id="old" className="panel" when={eq($.ui.era,'a')} exit="fade" exitMs={1200} enter="rise"><p className="label">Old era</p>Old</section><section id="new" className="panel next" when={eq($.ui.era,'b')} enter="zoom" enterMs={1200} exit="iris">New</section><div id="row" className="row"><span id="t" className="chip" when={$.ui.on} enter="shrink" exit="shrink" exitMs={450}>T</span><span id="u" className="chip">U</span></div><div id="spot" className="spot" /><div id="spot2" className="spot" style={{left:100,top:600}} /></div></Canvas><Button id="poke">Poke</Button></div>);`);
    // U1：缩放的 Canvas（2560×1600 设计尺寸放进 1280×800）屏幕层上的时间轴：年份标签在上，游标在下一行
    write('routes/scrub/page.tsx', `import {page,$} from '@joplo-app/kit';import {Canvas} from '@joplo-app/plugin-content';import {Button} from '@joplo-app/plugin-ui';export default page({title:'Scrub',layout:false},<div style={{position:'relative',width:1280,height:800}}><Canvas w={2560} h={1600} view={[2560,1600]} drift={false}><div className="room" /><div screen className="bar"><div id="year_a" className="yr" style={{left:200}}>A</div><div id="year_b" className="yr" style={{left:1400}}>B</div><Button id="scrubber" className="scrub" style={{left:$.ui.sx}} motion="cursor">drag</Button></div></Canvas></div>);`);
    write('routes/other/page.tsx', `import {page} from '@joplo-app/kit';export default page({title:'Other',layout:false},<div id="elsewhere">Elsewhere</div>);`);
    write('features/f/feature.ts', `import{feature}from'@joplo-app/kit';export default feature({name:'F',goal:'G',cases:{},pick:'a'});`);
    const toggles = Array.from({ length: 10 }, (_, i) => `.system('t${i}','Toggle ${i}',set($.ui.on,${i % 2 === 1}))`).join('');
    write('features/f/works/a.tsx', `import{$,work,flow,free,set,hold}from'@joplo-app/kit';import{camera}from'@joplo-app/plugin-content';export default work({title:'A',summary:'I',state:{ui:{era:'a',on:true,poked:false,sx:200}},free:{poke:free.click('poke',set($.ui.poked,true))},scenarios:{
      swap:flow('Swap').system('swap','To new',set($.ui.era,'b'),hold(5)).system('back','Back',set($.ui.era,'a'),hold(5)),
      toggle:flow('Toggle')${toggles},
      drift:flow('Drift').system('look','Look',camera('spot',{ms:300,drift:{zoom:1.25,ms:1500}}),hold(10)).system('away','Away',camera('spot2',{ms:300})),
      leave:flow('Leave').system('go','Go',set($.ui.era,'b')),
      other:flow('Other',{start:'/other'}).system('x','X'),
      scrubA:flow('Scrub A',{start:'/scrub',actionEntry:'after'}).drag('scrubber','year_a','To A',set($.ui.sx,200),hold(5)).system('later','Later',hold(5)),
      scrubB:flow('Scrub B',{start:'/scrub',actionEntry:'after'}).drag('scrubber','year_b','To B',set($.ui.sx,1400),hold(5)),
    }});`);
    write('harness.ts', `import ${JSON.stringify(path.join(REPO, 'packages/web/src/index.css'))};import{createElement as h,useSyncExternalStore}from'react';import{createRoot}from'react-dom/client';import{projectThemes}from'@joplo-app/core';import{Stage}from ${JSON.stringify(path.join(REPO, 'packages/web/src/renderer/Stage.tsx'))};import{ThemeStyles}from ${JSON.stringify(path.join(REPO, 'packages/web/src/renderer/ThemeStyles.tsx'))};import{DemoController}from ${JSON.stringify(path.join(REPO, 'packages/web/src/runtime/demo.ts'))};import{loadPluginRuntimes}from ${JSON.stringify(path.join(REPO, 'packages/web/src/renderer/plugins.ts'))};let project,ctl;window.fixtureAnimate=true;function App(){const s=useSyncExternalStore(ctl.subscribe,ctl.getSnapshot);return h('div',{},h(ThemeStyles,{themes:projectThemes(project)}),h(Stage,{key:window.fixtureStageKey??0,inputs:s.inputs,project,state:s.state,theme:project.theme,mode:'demo',animate:window.fixtureAnimate,playground:s.playground,freeMode:s.freeMode,clock:ctl.clock,epoch:s.epoch,activeStep:s.activeStep,onStageInput:explore=>ctl.stageInput(explore),onAction:(a,n)=>void ctl.act(a,n),stageRef:node=>ctl.setStageEl(node)}));}window.fixtureStart=async(p,urls)=>{project=p;await loadPluginRuntimes(urls);ctl=new DemoController();ctl.autoNext=null;ctl.reducedMotion=true;ctl.setProject(p,1);ctl.setScenario('f.a.swap');window.fixtureCtl=ctl;const el=document.createElement('div');document.body.replaceChildren(el);window.fixtureRoot=createRoot(el);window.fixtureRender=()=>window.fixtureRoot.render(h(App));window.fixtureRender();};`);
    write('fixture.html', `<!doctype html><style>body{margin:0}</style><script type="module">import RefreshRuntime from '/@react-refresh';RefreshRuntime.injectIntoGlobalHook(window);window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>type=>type;window.__vite_plugin_react_preamble_installed__=true;await import('./harness.ts');</script>`);
    server = await createDev({ projectDir: root, port: 0, watch: false, log: () => undefined });
    expect(server.payload().diagnostics.filter(d => d.severity === 'error')).toEqual([]);
    browser = await launch({ chromium }); page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto(`${server.url}@fs/${root}/fixture.html`);
    await page.waitForFunction(() => typeof (window as any).fixtureStart === 'function');
    const payload = server.payload();
    await page.evaluate(({ project, urls }) => (window as any).fixtureStart(project, urls), { project: payload.project, urls: payload.plugins });
    await page.waitForSelector('[data-jid="old"]');
  }, 120000);
  afterAll(async () => { await page?.evaluate(() => (window as any).fixtureCtl?.stop()).catch(() => {}); await browser?.close(); await server?.close(); if (root) fs.rmSync(root, { recursive: true, force: true }); });

  const frame = () => page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
  const ghosts = () => page.locator('[data-jghost]').count();
  async function at(s: string, position = 0) {
    await page.evaluate(({ s, position }) => { const c = (window as any).fixtureCtl; c.stop(); c.speed = 1; c.setScenario('f.a.' + s, position, { quiet: true }); }, { s, position });
    await frame();
  }
  /** 播放到第 n 步刚提交（暂停之前不再推进）。 */
  async function playTo(n: number, opts: { fast?: boolean } = {}) {
    await page.evaluate(fast => { const c = (window as any).fixtureCtl; void c.play(fast ? { fast: () => true } : {}); }, !!opts.fast);
    await page.waitForFunction(n => (window as any).fixtureCtl.getSnapshot().state.position >= n, n, { timeout: 8000 });
  }
  const style = (sel: string) => page.evaluate(sel => {
    const el = document.querySelector(sel) as HTMLElement; const c = getComputedStyle(el); const label = el.querySelector('.label') as HTMLElement | null;
    const r = el.getBoundingClientRect();
    return { rect: [r.x, r.y, r.width, r.height].map(v => Math.round(v * 10) / 10), font: c.fontSize, color: c.color, bg: c.backgroundColor, border: c.borderTopWidth, padding: c.paddingLeft, family: c.fontFamily, label: label ? getComputedStyle(label).fontSize + '/' + getComputedStyle(label).letterSpacing : null };
  }, sel);

  it('G1/G2 the exit ghost matches the removed element and has no identity; enter and exit cross in the same step', async () => {
    await at('swap');
    const before = await style('[data-jid="old"]');
    await playTo(1);
    await page.evaluate(() => (window as any).fixtureCtl.pause(false));
    expect(await ghosts()).toBe(1);
    const ghost = await style('[data-jghost]');
    // G1：同样的选择器上下文、同样的位置大小（暂停在退场刚开始，opacity 之外完全一致）
    expect(ghost).toEqual(before);
    // G2：inert + aria-hidden，没有 id / data-jid / motion / 进退场属性
    const id = await page.evaluate(() => { const g = document.querySelector('[data-jghost]') as HTMLElement; return { inert: g.inert, aria: g.getAttribute('aria-hidden'), ids: g.querySelectorAll('[id],[data-jid],[data-jp-content-motion]').length + (g.id || g.dataset.jid ? 1 : 0), attrs: [g, ...g.querySelectorAll('*')].some(n => n.getAttributeNames().some(a => a.startsWith('data-jp-content-'))) }; });
    expect(id).toEqual({ inert: true, aria: 'true', ids: 0, attrs: false });
    // 新元素同时在进场：交叉转场
    expect(await page.evaluate(() => document.querySelector('[data-jid="new"]')!.getAnimations().some(a => a.id === 'jenter'))).toBe(true);
    await page.evaluate(() => (window as any).fixtureCtl.resume());
  });

  it('G3 pause freezes the transition on the engine clock; G4 a finished exit removes its ghost', async () => {
    await at('swap');
    await playTo(1);
    await page.waitForTimeout(250);
    await page.evaluate(() => (window as any).fixtureCtl.pause(false));
    const read = () => page.evaluate(() => ({ g: Number(getComputedStyle(document.querySelector('[data-jghost]')!).opacity), n: getComputedStyle(document.querySelector('[data-jid="new"]')!).scale }));
    const a = await read(); await page.waitForTimeout(500); const b = await read();
    expect(a).toEqual(b);
    expect(a.g).toBeGreaterThan(0); expect(a.g).toBeLessThan(1);
    await page.evaluate(() => (window as any).fixtureCtl.resume());
    await page.waitForFunction(() => !document.querySelector('[data-jghost]'), null, { timeout: 4000 });
    expect(await page.evaluate(() => document.getAnimations().filter(x => x.id === 'jexit' || x.id === 'jenter').length)).toBe(0);
  });

  it('G4 a jump, the first free input, stopping and leaving the scene all settle immediately', async () => {
    for (const settleBy of ['jump', 'free', 'stop', 'scene'] as const) {
      await at('swap');
      await playTo(1);
      expect(await ghosts()).toBe(1);
      if (settleBy === 'jump') await page.evaluate(() => (window as any).fixtureCtl.goto(0));
      if (settleBy === 'free') await page.locator('[data-jid="poke"]').click();
      if (settleBy === 'stop') await page.evaluate(() => (window as any).fixtureCtl.stop());
      if (settleBy === 'scene') await page.evaluate(() => { const c = (window as any).fixtureCtl; c.stop(); c.setScenario('f.a.other'); });
      await frame();
      expect([settleBy, await ghosts()]).toEqual([settleBy, 0]);
      expect(await page.evaluate(() => document.getAnimations().filter(x => x.id === 'jexit' || x.id === 'jenter').length)).toBe(0);
      if (settleBy === 'free') {
        // 转场中第一下操作：先落定到终态，再处理输入
        expect(await page.evaluate(() => getComputedStyle(document.querySelector('[data-jid="new"]')!).scale)).toBe('none');
        expect(await page.evaluate(() => (window as any).fixtureCtl.getSnapshot().playground?.effects)).toEqual([{ type: 'set', path: 'ui.poked', value: true }]);
      }
    }
  });

  it('G3 static frames (animate=false) never create ghosts or enter animations', async () => {
    await page.evaluate(() => { (window as any).fixtureAnimate = false; (window as any).fixtureRender(); });
    await at('swap');
    await page.evaluate(() => (window as any).fixtureCtl.goto(1));
    await at('leave');
    await playTo(1);
    expect(await ghosts()).toBe(0);
    expect(await page.evaluate(() => document.getAnimations().filter(x => x.id === 'jexit' || x.id === 'jenter').length)).toBe(0);
    await page.evaluate(() => { (window as any).fixtureAnimate = true; (window as any).fixtureRender(); });
    await frame();
  });

  it('G5 ten quick toggles keep the React-managed DOM exactly as React expects, then ghosts drain', async () => {
    errors.length = 0;
    await at('toggle');
    await playTo(10, { fast: true });
    await page.waitForFunction(() => !(window as any).fixtureCtl.getSnapshot().playing, null, { timeout: 8000 });
    await page.waitForFunction(() => !document.querySelector('[data-jghost]'), null, { timeout: 4000 });
    const ids = () => page.evaluate(() => [...document.querySelector('[data-jid="row"]')!.children].map(c => (c as HTMLElement).dataset.jid ?? 'ghost'));
    // 最后一步 on=true：T 与 U 都在，顺序与 JSX 一致，没有残留节点
    expect(await ids()).toEqual(['t', 'u']);
    // React 还能继续正常插入、删除
    await page.evaluate(() => (window as any).fixtureCtl.goto(9));
    await frame();
    expect(await ids()).toEqual(['u']);
    await page.evaluate(() => (window as any).fixtureCtl.goto(10));
    await frame();
    expect(await ids()).toEqual(['t', 'u']);
    expect(errors).toEqual([]);
  });

  // U1：可拖动的源在播放中 / 自由体验中都能真的拖：跟手、松手判定落点、取消回弹，不残留样式与监听器
  async function scrubberDown() {
    const box = (await page.locator('[data-jid="scrubber"]').boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    return box;
  }
  const leftovers = () => page.evaluate(() => { const el = document.querySelector('[data-jid="scrubber"]') as HTMLElement; return { translate: el.style.translate, pe: el.style.pointerEvents, dragging: document.querySelectorAll('[data-jdragging]').length }; });
  it('U1 the dragged source follows the pointer, ignores itself in hit tests, and a release near the destination row resolves it (cross-scenario prompt)', async () => {
    await at('scrubA');
    await page.evaluate(() => { const c = (window as any).fixtureCtl; c.speed = 0.25; void c.play(); });
    const start = await scrubberDown();
    expect(await page.evaluate(() => (window as any).fixtureCtl.getSnapshot().paused)).toBe(true);
    const b = (await page.locator('[data-jid="year_b"]').boundingBox())!;
    // 水平拖到 B 的正下方（游标所在的那一行，不在 B 的标签框里）
    await page.mouse.move(b.x + b.width / 2, start.y + start.height / 2, { steps: 10 });
    const mid = (await page.locator('[data-jid="scrubber"]').boundingBox())!;
    expect(Math.abs(mid.x + mid.width / 2 - (b.x + b.width / 2))).toBeLessThan(3);
    expect(await page.evaluate(() => document.querySelectorAll('[data-jdragging]').length)).toBe(1);
    await page.mouse.up();
    await frame();
    const snap = await page.evaluate(() => { const s = (window as any).fixtureCtl.getSnapshot(); return { prompt: s.switchPrompt?.map((c: any) => c.scenarioId), sc: s.state.scenarioId }; });
    expect(snap).toEqual({ prompt: ['f.a.scrubB'], sc: 'f.a.scrubA' });
    expect(await leftovers()).toEqual({ translate: '', pe: '', dragging: 0 });
    await page.evaluate(() => (window as any).fixtureCtl.confirmSwitch(0));
    await frame();
    expect(await page.evaluate(() => { const s = (window as any).fixtureCtl.getSnapshot(); return [s.state.scenarioId, s.state.position]; })).toEqual(['f.a.scrubB', 1]);
  });
  it('U1 a drop onto the next scripted destination advances; a drop far from every destination snaps back without changing state', async () => {
    await at('scrubA');
    await page.evaluate(() => { const c = (window as any).fixtureCtl; c.speed = 0.25; void c.play(); });
    let start = await scrubberDown();
    await page.mouse.move(start.x + 400, start.y - 250, { steps: 8 });
    await page.mouse.up();
    await frame();
    expect(await page.evaluate(() => { const s = (window as any).fixtureCtl.getSnapshot(); return [s.state.position, !!s.switchPrompt]; })).toEqual([0, false]);
    expect(await page.locator('[data-jid="scrubber"]').boundingBox()).toEqual(start);
    expect(await leftovers()).toEqual({ translate: '', pe: '', dragging: 0 });
    start = await scrubberDown();
    const a = (await page.locator('[data-jid="year_a"]').boundingBox())!;
    await page.mouse.move(a.x + a.width / 2 + 15, start.y + start.height / 2, { steps: 6 });
    await page.mouse.up();
    await page.waitForFunction(() => (window as any).fixtureCtl.getSnapshot().state.position === 1);
  });
  it('U1 Escape or pointercancel mid-drag snaps back with no action and no leftovers', async () => {
    await at('scrubA');
    const start = await scrubberDown();
    const b = (await page.locator('[data-jid="year_b"]').boundingBox())!;
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 6 });
    await page.keyboard.press('Escape');
    expect(await leftovers()).toEqual({ translate: '', pe: '', dragging: 0 });
    await page.mouse.up();
    await frame();
    expect(await page.evaluate(() => { const s = (window as any).fixtureCtl.getSnapshot(); return [s.state.scenarioId, s.state.position, !!s.switchPrompt]; })).toEqual(['f.a.scrubA', 0, false]);
    expect(await page.locator('[data-jid="scrubber"]').boundingBox()).toEqual(start);
    await scrubberDown();
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 6 });
    await page.evaluate(() => document.querySelector('[data-joplo-stage]')!.dispatchEvent(new PointerEvent('pointercancel', { bubbles: true, pointerId: 1 })));
    expect(await leftovers()).toEqual({ translate: '', pe: '', dragging: 0 });
    await page.mouse.up();
    expect(await page.evaluate(() => !!(window as any).fixtureCtl.getSnapshot().switchPrompt)).toBe(false);
  });

  // 评审 RF1：中途步骤首次挂载（停止状态）直接显示落定取景，不冻结在全景
  it('R1 a first mount at a stopped mid-scenario step shows the settled camera frame, not a frozen whole view', async () => {
    await at('drift', 1);
    await page.evaluate(() => { (window as any).fixtureStageKey = ((window as any).fixtureStageKey ?? 0) + 1; (window as any).fixtureRender(); });
    await frame();
    const read = () => page.evaluate(() => (document.querySelector('[data-jcanvas-world]') as HTMLElement).style.transform);
    const initial = await read(); await page.waitForTimeout(150);
    expect(initial).toContain('scale(3)');
    expect(await read()).toBe(initial);
  });
  // 评审 RF6：第一下舞台输入先让幽灵 / 进场落定（普通暂停仍冻结，见 G3）
  it('R6 the first stage input settles exit ghosts and enter animations before the input is handled', async () => {
    await at('swap'); await playTo(1); await page.waitForTimeout(150);
    expect(await ghosts()).toBe(1);
    await page.evaluate(() => (window as any).fixtureCtl.stageInput(true)); await frame();
    expect(await ghosts()).toBe(0);
    expect(await page.evaluate(() => document.getAnimations().filter(x => x.id === 'jexit' || x.id === 'jenter').length)).toBe(0);
    // 拖动开始前的按下（不进入自由体验）也算输入
    await at('swap'); await playTo(1); await page.waitForTimeout(150);
    await page.evaluate(() => (window as any).fixtureCtl.stageInput()); await frame();
    expect(await ghosts()).toBe(0);
  });
  // 评审 RF10 / RF4：第二根指针不能顶掉正在拖的源；窗口失焦取消拖动
  it('R3 a second pointer cannot orphan the dragged source, and window blur cancels the drag', async () => {
    await at('scrubA');
    let start = await scrubberDown();
    await page.mouse.move(start.x + 120, start.y, { steps: 3 });
    await page.evaluate(() => document.querySelector('[data-joplo-stage]')!.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, buttons: 1, pointerType: 'touch', pointerId: 2, isPrimary: false })));
    await page.evaluate(() => document.querySelector('[data-joplo-stage]')!.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, buttons: 1, pointerType: 'touch', pointerId: 2, clientX: 10, clientY: 10 })));
    await page.mouse.up(); await page.keyboard.press('Escape'); await frame();
    expect(await leftovers()).toEqual({ translate: '', pe: '', dragging: 0 });
    await at('scrubA');
    start = await scrubberDown();
    await page.mouse.move(start.x + 100, start.y, { steps: 3 });
    await page.evaluate(() => window.dispatchEvent(new Event('blur')));
    expect(await leftovers()).toEqual({ translate: '', pe: '', dragging: 0 });
    await page.mouse.up(); await frame();
    expect(await page.evaluate(() => !!(window as any).fixtureCtl.getSnapshot().switchPrompt)).toBe(false);
  });

  it('F2 drift runs on the engine clock after the camera settles, freezes on pause, and continues from the actual position', async () => {
    await at('drift');
    const scale = () => page.evaluate(() => { const t = (document.querySelector('[data-jcanvas-world]') as HTMLElement).style.transform; return Number(/scale\(([^)]+)\)/.exec(t)![1]); });
    const settled = await (async () => { await playTo(1); await page.waitForTimeout(350); return scale(); })();
    await page.waitForTimeout(500);
    const later = await scale();
    expect(later).toBeGreaterThan(settled);
    await page.evaluate(() => (window as any).fixtureCtl.pause(false));
    const p1 = await scale(); await page.waitForTimeout(400); const p2 = await scale();
    expect(p2).toBe(p1);
    // 继续播放：不回跳到落定位置
    await page.evaluate(() => (window as any).fixtureCtl.resume());
    await frame();
    expect(await scale()).toBeGreaterThanOrEqual(p1);
    // 跳回这一步（深链）：落定取景，不带漂移；没在播放时保持不动
    await page.evaluate(() => { const c = (window as any).fixtureCtl; c.stop(); c.goto(0); });
    await frame();
    await page.evaluate(() => (window as any).fixtureCtl.goto(1));
    await frame();
    const deep = await scale(); await page.waitForTimeout(300);
    expect(await scale()).toBe(deep);
    expect(deep).toBeLessThan(later);
  });
});
