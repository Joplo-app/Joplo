/** D88 browser evidence: real pointer/key events through the production Stage and controller. */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { buildSite } from '../src/build.ts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { chromium, type Browser, type Page } from 'playwright';
import { createDev } from '../src/dev.ts';
import { launch } from '../src/render.ts';

const REPO=path.resolve(import.meta.dirname,'../../..');
const hash=(b:Buffer)=>createHash('sha256').update(b).digest('hex');
describe('D88 real browser input and clock',()=>{
  let root:string, server:Awaited<ReturnType<typeof createDev>>, browser:Browser, page:Page;
  const errors:string[]=[];
  beforeAll(async()=>{
    root=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'joplo-playground-')));
    fs.mkdirSync(path.join(root,'node_modules/@joplo-app'),{recursive:true});
    for(const name of ['core','kit'])fs.symlinkSync(path.join(REPO,'packages',name),path.join(root,'node_modules/@joplo-app',name));
    const write=(name:string,source:string)=>{const file=path.join(root,name);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,source);};
    write('joplo.config.ts',`import {config} from '@joplo-app/kit';import probe from './probe.ts';export default config({name:'D88 fixture',theme:'clean',autoFocus:false,plugins:[probe]});`);
    write('probe.ts',`import {definePlugin,pluginComponent} from '@joplo-app/kit/plugin';const p=definePlugin({id:'probe',title:'Probe',runtime:new URL('./runtime.ts',import.meta.url),components:{Widget:{doc:'test',interactive:true}},actions:{turn:{caption:'Turn {label}',durationMs:900,fields:{angle:{type:'number',min:0,max:180,tolerance:2}},targets:['probe:Widget']}}});export const Widget=pluginComponent(p,'Widget');export default p;`);
    write('runtime.ts',`import {defineRuntime} from '@joplo-app/kit/plugin';export default defineRuntime({id:'probe',components:{Widget:{mount(el,ctx){let latest=ctx;const button=document.createElement('button');button.textContent='Turn widget';button.onclick=e=>{e.stopPropagation();latest.act?.(latest.node.id,{type:'plugin',name:'probe:turn',data:{angle:90}});};el.append(button);const draw=c=>{latest=c;el.dataset.clock=String(c.frame.clock?.timeMs??0);const g=c.frame.gesture;el.dataset.progress=String(g?.action.type==='plugin'?g.progress:0);};draw(ctx);return{update:draw,destroy(){el.replaceChildren();}};}}}});`);
    write('routes/page.tsx',`import {page,$} from '@joplo-app/kit';import {Stack,Group,Button,Text,TextInput,Switch,Checkbox,Radio,Select,SegmentedControl,Tabs,Accordion,ScrollArea,Box} from '@joplo-app/kit/ui';import {Widget} from '../probe';export default page({title:'Fixture'},<Stack gap="xs" p="md"><Group><Button id="next">Next</Button><Button id="other">Other scene</Button><Button id="avatar">Profile</Button><Text id="profile" when={$.ui.profile}>Profile open</Text></Group><Group><TextInput id="name" label="Name" value={$.ui.name}/><Switch id="lamp" label="Lamp" checked={$.data.lamp}/><Checkbox id="check" label="Check"/><Select id="select" label="Select" defaultValue="a" data={[{value:'a',label:'Alpha'},{value:'b',label:'Beta'}]}/><SegmentedControl id="segments" defaultValue="a" data={['a','b']}/></Group><Group><Tabs id="tabs" defaultValue="a"><Tabs.List><Tabs.Tab id="tab_a" value="a">Tab A</Tabs.Tab><Tabs.Tab id="tab_b" value="b">Tab B</Tabs.Tab></Tabs.List><Tabs.Panel value="a">Panel A</Tabs.Panel><Tabs.Panel value="b">Panel B</Tabs.Panel></Tabs><Radio.Group id="radio" defaultValue="a"><Radio id="radio_a" value="a" label="Radio A"/><Radio id="radio_b" value="b" label="Radio B"/></Radio.Group><Accordion id="accordion"><Accordion.Item value="details"><Accordion.Control id="expand">Expand</Accordion.Control><Accordion.Panel>Expanded detail</Accordion.Panel></Accordion.Item></Accordion></Group><Group><Button id="tile">Drag tile</Button><Box id="drop" w={160} h={60}>Drop zone</Box><Button id="help">Hover help</Button><Widget id="widget"/></Group><ScrollArea id="list" h={100} w={300}><Box h={500}>Scrollable area</Box><Text id="last">Last row</Text></ScrollArea></Stack>);`);
    write('features/f/feature.ts',`import{feature}from'@joplo-app/kit';export default feature({name:'F',goal:'G',cases:{},pick:'a'});`);
    write('features/f/options/a.tsx',`import{$,option,flow,free,set}from'@joplo-app/kit';export default option({name:'A',idea:'I',state:{ui:{name:''},data:{lamp:true}},free:{profile:free.click('avatar',set($.ui.profile,true))},scenarios:{main:flow('Main').click('next').type('name','Ada').toggle('lamp',false).drag('tile','drop',set($.ui.dragged,true)).hover('help',120,set($.ui.hovered,true)).scroll('list','last').act('probe:turn','widget',{angle:90}),other:flow('Other').click('other'),coordinates:flow('Coordinates').drag('tile',{x:900,y:650}),hover:flow('Hover').hover('help',120),plugin:flow('Plugin').act('probe:turn','widget',{angle:90})}});`);
    write('harness.ts',`import ${JSON.stringify(path.join(REPO,'packages/web/src/index.css'))};import{createElement as h,useSyncExternalStore}from'react';import{createRoot}from'react-dom/client';import{projectThemes}from'@joplo-app/core';import{Stage}from ${JSON.stringify(path.join(REPO,'packages/web/src/renderer/Stage.tsx'))};import{ThemeStyles}from ${JSON.stringify(path.join(REPO,'packages/web/src/renderer/ThemeStyles.tsx'))};import{DemoController}from ${JSON.stringify(path.join(REPO,'packages/web/src/runtime/demo.ts'))};import{Overlay}from ${JSON.stringify(path.join(REPO,'packages/web/src/player/Overlay.tsx'))};import{PlaygroundNotice}from ${JSON.stringify(path.join(REPO,'packages/web/src/player/PlaygroundNotice.tsx'))};import{loadPluginRuntimes}from ${JSON.stringify(path.join(REPO,'packages/web/src/renderer/plugins.ts'))};let project,ctl,el,stage;function App(){const s=useSyncExternalStore(ctl.subscribe,ctl.getSnapshot);return h('div',{},h(ThemeStyles,{themes:projectThemes(project)}),h(Stage,{project,state:s.state,theme:project.theme,mode:'demo',animate:true,playground:s.playground,freeMode:s.freeMode,clock:ctl.clock,gesture:s.gesture,epoch:s.epoch,preview:s.preview,activeStep:s.activeStep,onStageInput:()=>ctl.stageInput(),onAction:(a,n)=>void ctl.act(a,n),onNodeClick:(id,pt,o)=>void ctl.clickNode(id,pt,o),stageRef:node=>{stage=node;ctl.setStageEl(node);},zoom:{resetKey:String(s.epoch)},overlay:h(Overlay,{snap:s,stage,nextTargetId:null,setCursorEl:ctl.setCursorEl,onBackToDemo:()=>{},onDismiss:()=>{}})}),h('button',{id:'play',onClick:()=>ctl.togglePlay()},'Playback'),h('button',{id:'jump',onClick:()=>ctl.goto(0)},'Jump'),s.freeMode?h(PlaygroundNotice,{ctl,snap:s}):null);}window.fixtureStart=(p,urls)=>{project=p;loadPluginRuntimes(urls);ctl=new DemoController();ctl.setProject(p,1);window.fixtureCtl=ctl;el=document.createElement('div');el.id='fixture';document.body.replaceChildren(el);createRoot(el).render(h(App));};`);
    write('fixture.html',`<!doctype html><style>body{margin:0}</style><script type="module">import RefreshRuntime from '/@react-refresh';RefreshRuntime.injectIntoGlobalHook(window);window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>type=>type;window.__vite_plugin_react_preamble_installed__=true;await import('./harness.ts');</script>`);
    server=await createDev({projectDir:root,port:0,watch:false,log:()=>undefined});
    expect(server.payload().diagnostics.filter(d=>d.severity==='error')).toEqual([]);
    browser=await launch({chromium});page=await browser.newPage({viewport:{width:1280,height:1000}});page.on('pageerror',e=>errors.push(e.message));
    await open(page);
  },120000);
  async function open(p:Page){await p.goto(`${server.url}@fs/${root}/fixture.html`);await p.waitForFunction(()=>typeof(window as any).fixtureStart==='function');const payload=server.payload();await p.evaluate(({project,urls})=>(window as any).fixtureStart(project,urls),{project:payload.project,urls:payload.plugins});await p.waitForSelector('[data-jid="widget"] button');}
  afterAll(async()=>{await page?.evaluate(()=>(window as any).fixtureCtl?.stop()).catch(()=>{});await browser?.close();await server?.close();if(root)fs.rmSync(root,{recursive:true,force:true});});
  async function at(s='main',position=0){await page.evaluate(({s,position})=>(window as any).fixtureCtl.setScenario('f.a.'+s,position),{s,position});await page.mouse.move(1270,950);await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));}
  const snapshot=()=>page.evaluate(()=>{const c=(window as any).fixtureCtl,s=c.getSnapshot();return{state:s.state,freeMode:s.freeMode,layer:s.playground,paused:s.paused,playing:s.playing,progress:s.gesture?.progress,prompt:s.switchPrompt,time:c.clock.time};});
  async function position(n:number){await page.waitForFunction(n=>(window as any).fixtureCtl.getSnapshot().state.position===n,n,{timeout:3000}).catch(async()=>{await page.screenshot({path:path.join(REPO,'output/playwright/p1d-input-failure.png')});throw new Error(`Expected position ${n}: ${JSON.stringify(await snapshot())}`);});}

  it('native UI behavior and editing keys stay local; cross-scenario requires confirmation',async()=>{
    await at();const before=(await snapshot()).state;
    await page.locator('[data-jid="tabs"] [data-jid="tab_b"]').click();expect(await page.getByText('Panel B',{exact:true}).isVisible()).toBe(true);
    await page.getByRole('button',{name:'Expand',exact:true}).click();expect(await page.getByText('Expanded detail',{exact:true}).isVisible()).toBe(true);
    await page.getByRole('textbox',{name:'Name',exact:true}).fill('local');await page.keyboard.press('Space');await page.keyboard.press('ArrowLeft');expect(await page.getByRole('textbox',{name:'Name',exact:true}).inputValue()).toBe('local ');
    await page.locator('[data-jid="lamp"]').click();expect(await page.locator('[data-jid="lamp"] [role="switch"] > span').evaluate(el=>getComputedStyle(el).left)).toBe('2px');await page.locator('[data-jid="check"]').click();await page.locator('[data-jid="radio_b"]').click();
    await page.locator('[data-jid="segments"] [role="radio"]').last().click();
    await page.locator('[data-jid="select"] [role="combobox"]').click();await page.getByRole('option',{name:'Beta',exact:true}).click();
    await page.getByRole('button',{name:'Profile',exact:true}).click();expect(await page.getByText('Profile open',{exact:true}).isVisible()).toBe(true);
    expect((await snapshot()).state).toEqual(before);expect((await snapshot()).playing).toBe(false);
    await page.getByRole('button',{name:'Other scene',exact:true}).click();expect((await snapshot()).state.scenarioId).toBe('f.a.main');expect((await snapshot()).prompt).toHaveLength(1);
    await page.getByRole('button',{name:'Stay here',exact:true}).click();expect((await snapshot()).layer).not.toBeNull();
    await page.getByRole('button',{name:'Other scene',exact:true}).click();await page.getByRole('button',{name:'Switch to “Other”?',exact:false}).click();
    expect((await snapshot()).state).toMatchObject({scenarioId:'f.a.other',position:0});expect((await snapshot()).layer).toBeNull();
  },20000);
  it('real typing, toggle, drag, hover, scroll and plugin recognizer advance only the matching step',async()=>{
    await at('main',1);await page.getByRole('textbox',{name:'Name',exact:true}).fill('A');await position(1);
    await page.getByRole('textbox',{name:'Name',exact:true}).fill('Ada');await position(2);
    await page.locator('[data-jid="lamp"]').click();await position(3);
    await page.locator('[data-jid="tile"]').dragTo(page.locator('[data-jid="drop"]'));await position(4);
    await page.locator('[data-jid="help"]').hover();await position(5);
    await page.locator('[data-jid="list"]').hover();await page.mouse.wheel(0,800);await position(6);
    await page.getByRole('button',{name:'Turn widget',exact:true}).click();await position(7);
    expect((await snapshot()).state.ui).toMatchObject({dragged:true,hovered:true});
  },20000);
  it('coordinate drag owns its pointer instead of stage pan; touch hover degrades to tap',async()=>{
    await at('coordinates');const box=await page.locator('[data-jid="tile"]').boundingBox();expect(box).not.toBeNull();
    await page.mouse.move(box!.x+box!.width/2,box!.y+box!.height/2);await page.mouse.down();await page.mouse.move(900,650,{steps:8});await page.mouse.up();await position(1);
    expect(await page.locator('[data-joplo-stage]').getAttribute('data-user-zoom')).toBeNull();
    const touch=await browser.newPage({viewport:{width:1280,height:1000},hasTouch:true});await open(touch);
    await touch.evaluate(()=>(window as any).fixtureCtl.setScenario('f.a.hover',0));await touch.locator('[data-jid="help"]').tap();await touch.waitForFunction(()=>(window as any).fixtureCtl.getSnapshot().state.position===1);await touch.close();
  });
  it('first stage input only pauses; plugin presentation/cursor freeze and resume from the same engine time',async()=>{
    await at('plugin');await page.evaluate(()=>{void(window as any).fixtureCtl.play();});
    await page.waitForFunction(()=>Number(document.querySelector('[data-jid="widget"]')?.getAttribute('data-progress'))>0.1);
    const before=(await snapshot()).state;await page.locator('[data-jid="lamp"]').click();await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));const frozen=await snapshot();
    expect(frozen.paused).toBe(true);expect(frozen.layer).toBeNull();expect(frozen.state).toEqual(before);
    const drawing=await page.locator('[data-jid="widget"]').getAttribute('data-progress');const cursor=await page.locator('[data-joverlay="cursor"]').getAttribute('style');
    await page.waitForTimeout(200);expect((await snapshot()).time).toBe(frozen.time);expect(await page.locator('[data-jid="widget"]').getAttribute('data-progress')).toBe(drawing);expect(await page.locator('[data-joverlay="cursor"]').getAttribute('style')).toBe(cursor);
    await page.locator('#play').click();await position(1);await page.evaluate(()=>(window as any).fixtureCtl.stop());
  });
  it('play discards every local edit: restored pixels equal a pristine scripted frame',async()=>{
    const start=async(local:boolean)=>{
      await at('main',1);
      if(local){await page.getByRole('textbox',{name:'Name',exact:true}).fill('scratch');await page.locator('[data-jid="check"]').click();await page.getByRole('button',{name:'Profile',exact:true}).click();await page.locator('[data-jid="list"]').hover();await page.mouse.wheel(0,700);}
      await page.mouse.move(1270,950);await page.evaluate(()=>{const c=(window as any).fixtureCtl;c.reducedMotion=true;void c.play();c.pause();});
      await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
      return page.locator('[data-joplo-stage]').screenshot();
    };
    const pristine=await start(false),restored=await start(true);
    fs.mkdirSync(path.join(REPO,'output/playwright'),{recursive:true});fs.writeFileSync(path.join(REPO,'output/playwright/p1d-play-pristine.png'),pristine);fs.writeFileSync(path.join(REPO,'output/playwright/p1d-play-restored.png'),restored);
    expect(hash(restored)).toBe(hash(pristine));expect((await snapshot()).layer).toBeNull();expect(errors).toEqual([]);
  });
  it('discarding a local pan restores the frozen scripted camera geometry',async()=>{
    await at('main',1);await page.evaluate(()=>{const c=(window as any).fixtureCtl;c.reducedMotion=true;void c.play();c.pause();});
    await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
    const camera=page.locator('[data-joplo-stage] > div').first();
    const original=await camera.evaluate(el=>({matrix:getComputedStyle(el).transform,box:JSON.stringify(el.getBoundingClientRect())}));
    const pristine=await page.locator('[data-joplo-stage]').screenshot();
    await page.mouse.move(900,700);await page.mouse.down();await page.mouse.move(960,740,{steps:5});await page.mouse.up();
    expect(await page.locator('[data-joplo-stage]').getAttribute('data-user-zoom')).not.toBeNull();
    await page.locator('#play').click();await page.evaluate(()=>(window as any).fixtureCtl.pause());await page.mouse.move(1270,950);
    await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
    expect(await camera.evaluate(el=>({matrix:getComputedStyle(el).transform,box:JSON.stringify(el.getBoundingClientRect())}))).toEqual(original);
    expect(await page.locator('[data-joplo-stage]').getAttribute('data-user-zoom')).toBeNull();
    const restored=await page.locator('[data-joplo-stage]').screenshot();
    // Chromium can round an antialiased corner by one gray level after a transform.
    // Any geometric/content difference exceeds this strict per-channel tolerance.
    const difference=await page.evaluate(async({a,b})=>{
      const decode=async(s:string)=>{const image=new Image();image.src='data:image/png;base64,'+s;await image.decode();const c=document.createElement('canvas');c.width=image.width;c.height=image.height;const ctx=c.getContext('2d')!;ctx.drawImage(image,0,0);return ctx.getImageData(0,0,c.width,c.height).data;};
      const x=await decode(a),y=await decode(b);let max=0,count=0;for(let i=0;i<x.length;i+=4){let different=false;for(let j=0;j<3;j++){const delta=Math.abs(x[i+j]!-y[i+j]!);max=Math.max(max,delta);different ||= delta>0;}if(different)count++;}return{max,count};
    },{a:pristine.toString('base64'),b:restored.toString('base64')});
    expect(difference.max).toBeLessThanOrEqual(1);expect(difference.count).toBeLessThan(100);
    fs.writeFileSync(path.join(REPO,'output/playwright/p1d-pan-comparison.json'),JSON.stringify(difference));
  });

  it('ships native/free arbitration in the real offline embed, with controls outside Stage',async()=>{
    const out=path.join(root,'published');await buildSite({projectDir:root,outDir:out,home:path.join(root,'home')});
    const offline=await browser.newContext({viewport:{width:1280,height:900}});const requests:string[]=[];
    await offline.route(/^https?:/,route=>{requests.push(route.request().url());return route.abort();});
    const embedded=await offline.newPage();
    try {
      await embedded.goto(pathToFileURL(path.join(out,'index.html')).href+'?embed=1&autoplay=1&scenario=f.a.plugin');
      await embedded.waitForSelector('[data-jid="check"] [role="checkbox"]');
      const field=embedded.locator('[data-jid="check"] [role="checkbox"]');
      await field.click();await embedded.waitForFunction(()=>(window as any).__JOPLO_UI__?.paused===true);
      expect(await field.getAttribute('aria-checked')).toBe('false');
      const timeline=await embedded.evaluate(()=>JSON.stringify((window as any).__JOPLO_STATE__));
      await field.click();expect(await field.getAttribute('aria-checked')).toBe('true');
      expect(await embedded.evaluate(()=>JSON.stringify((window as any).__JOPLO_STATE__))).toBe(timeline);
      expect(await embedded.getByTestId('playground-notice').isVisible()).toBe(true);
      await embedded.getByTestId('playground-reset').focus();await embedded.keyboard.press('Enter');
      expect(await field.getAttribute('aria-checked')).toBe('false');
      await field.click();await embedded.getByTestId('embed-toggle').click();
      await embedded.waitForFunction(()=>(window as any).__JOPLO_UI__?.paused===false);
      expect(await field.getAttribute('aria-checked')).toBe('false');
      expect(await embedded.getByTestId('playground-notice').count()).toBe(0);
      expect(await embedded.getByTestId('embed-bar').locator('[data-joplo-stage]').count()).toBe(0);
      expect(requests).toEqual([]);
    } finally {await offline.close();}
  },120000);

});
