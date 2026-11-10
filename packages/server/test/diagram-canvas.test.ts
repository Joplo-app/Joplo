import { expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright';
import { fixtureConfigSource, installFixturePlugins } from '../../../scripts/test/fixtures.ts';
import { createDev } from '../src/dev.ts';
import { launch } from '../src/render.ts';
const REPO=path.resolve(import.meta.dirname,'../../..');
it('Canvas keeps screen geometry while trace highlights; diagram scale doubles readable design size',async()=>{
 const root=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'joplo-diagram-canvas-')));
 installFixturePlugins(root);
 const write=(name:string,source:string)=>{const file=path.join(root,name);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,source);};
 write('joplo.config.ts',fixtureConfigSource(`import {config} from '@joplo-app/kit';export default config({name:'Diagram Canvas'});`));
 write('routes/page.tsx',`import {page} from '@joplo-app/kit';import {Canvas} from '@joplo-app/plugin-content';import {Diagram} from '@joplo-app/plugin-diagram';export default page({title:'Canvas',layout:false},<div style={{width:1280,height:720}}><Canvas id="canvas" w={3840} h={1080} view={[1920,1080]} drift={false}><div id="block" style={{position:'absolute',left:0,top:0,width:1920,height:1080}}><div style={{width:1800,height:450}}><Diagram id="dg" scale={2} h="100%"><Diagram.Node id="one" label="First"/><Diagram.Node id="two" label="Second"/><Diagram.Edge from="one" to="two"/></Diagram></div><div style={{width:1800,height:450}}><Diagram id="small" h="100%"><Diagram.Node id="plain" label="Normal"/></Diagram></div></div><div id="marker" screen style={{position:'absolute',left:20,top:20}}>Fixed marker</div></Canvas></div>);`);
 write('features/f/works/a.ts',`import {work,flow,hold} from '@joplo-app/kit';import {camera} from '@joplo-app/plugin-content';import {trace} from '@joplo-app/plugin-diagram';export default work({title:'Demo',summary:'Canvas test',scenarios:{s:flow('S',{start:'/'}).system('Frame',camera('block',{pad:0,drift:false}),hold(1)).system('Trace',trace('one','two',{focus:false}),hold(1))}});`);
 write('features/f/feature.ts',`import {feature} from '@joplo-app/kit';export default feature({name:'F',goal:'G',cases:{},pick:'a'});`);
 write('harness.ts',`import{createElement}from'react';import{createRoot}from'react-dom/client';import{stateAt}from'@joplo-app/core';import{Stage}from${JSON.stringify(path.join(REPO,'packages/web/src/renderer/Stage.tsx'))};import{loadPluginRuntimes}from${JSON.stringify(path.join(REPO,'packages/web/src/renderer/plugins.ts'))};let r,p;window.start=async(project,urls)=>{p=project;await loadPluginRuntimes(urls);r=createRoot(document.getElementById('root'));window.at(1)};window.at=n=>r.render(createElement(Stage,{project:p,state:stateAt(p,'f.a.s',n),mode:'demo',animate:false}));`);
 write('fixture.html',`<div id="root"></div><script type="module">import R from '/@react-refresh';R.injectIntoGlobalHook(window);window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>t=>t;window.__vite_plugin_react_preamble_installed__=true;await import('./harness.ts');</script>`);
 const server=await createDev({projectDir:root,port:0,watch:false,log:()=>{}});const browser=await launch({chromium});
 try{
  expect(server.payload().diagnostics.filter(d=>d.severity==='error')).toEqual([]);
  const page=await browser.newPage({viewport:{width:1440,height:900}});const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.status()>=400)errors.push(`${r.status()} ${r.url()}`)});await page.goto(`${server.url}@fs/${root}/fixture.html`);await page.waitForFunction(()=>typeof(window as any).start==='function',null,{timeout:10000}).catch(()=>{throw new Error(errors.join('; '))});
  const payload=server.payload();await page.evaluate(({project,plugins})=>(window as any).start(project,plugins),payload);
  await page.waitForSelector('[data-jid="marker"]');
  const measure=()=>page.evaluate(()=>{const box=(id:string)=>{const e=document.querySelector(`[data-jid="${id}"]`)!;const r=e.getBoundingClientRect();return{x:r.x,y:r.y,w:r.width,h:r.height};};return{marker:box('marker'),canvas:box('canvas'),large:box('one'),normal:box('plain'),scale:document.querySelector('[data-jid="dg"]')?.getAttribute('data-scale')};});
  await page.waitForFunction(()=>document.querySelector('[data-jid="dg"]')?.getAttribute('data-scale')==='2');
  const before=await measure();await page.evaluate(()=>(window as any).at(2));await page.waitForFunction(()=>document.querySelector('[data-jid="one"]')?.getAttribute('data-state')==='active');
  const after=await measure();expect(after.marker).toEqual(before.marker);expect(after.canvas).toEqual(before.canvas);expect(after.large.w/after.normal.w).toBeCloseTo(2,1);expect(after.scale).toBe('2');
  if(process.env.JOPLO_TEST_EVIDENCE_DIR){fs.mkdirSync(process.env.JOPLO_TEST_EVIDENCE_DIR,{recursive:true});await page.screenshot({path:path.join(process.env.JOPLO_TEST_EVIDENCE_DIR,'diagram-canvas.png')});console.log(JSON.stringify({before,after}));}
 }finally{await browser.close();await server.close();fs.rmSync(root,{recursive:true,force:true});}
},120000);
