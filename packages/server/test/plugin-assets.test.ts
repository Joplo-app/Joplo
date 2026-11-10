import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {afterAll,beforeAll,expect,it,vi} from 'vitest';
import {chromium,type Browser} from 'playwright';
import {buildSite} from '../src/build.ts';
import {startPreview} from '../src/preview.ts';
import {createDev} from '../src/dev.ts';
import * as webAssets from '../src/web-assets.ts';
import {launch,renderQuery} from '../src/render.ts';
import {installFixturePlugins} from '../../../scripts/test/fixtures.ts';
const REPO=path.resolve(import.meta.dirname,'../../..');
let root:string,browser:Browser,server:Awaited<ReturnType<typeof createDev>>;
beforeAll(async()=>{
 root=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'joplo-plugin-assets-')));installFixturePlugins(root);
 const write=(file:string,code:string|Buffer)=>{fs.mkdirSync(path.dirname(path.join(root,file)),{recursive:true});fs.writeFileSync(path.join(root,file),code);};
 write('package.json','{"type":"module"}');
 write('tsconfig.json','{"compilerOptions":{"jsx":"react-jsxdev","jsxImportSource":"@joplo-app/kit"}}');
 write('icon.svg','<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><!--'+'large'.repeat(2500)+'--><rect width="40" height="40" fill="red"/></svg>');
 // CSS url() exercises assets as well as imports. Explicit no-inline must not lose assets either.
 const fonts=path.join(REPO,'packages/web/src/fonts/Excalifont');
 write('font.woff2',fs.readFileSync(path.join(fonts,fs.readdirSync(fonts).filter(f=>f.endsWith('.woff2')).sort()[0]!)));
 write('widget.css',`@font-face{font-family:BRAssetFont;src:url('./font.woff2?no-inline')} .br-assets{font-family:BRAssetFont;color:rgb(12,34,56);background-color:rgb(90,120,150)}.br-assets::before{content:'';display:block;width:40px;height:40px;background-image:url('./icon.svg?no-inline')}`);
 write('runtime.ts',`import './widget.css';import icon from './icon.svg?no-inline';export default {id:'assets',apiVersion:2,components:{Widget:{mount(el){el.className='br-assets';el.textContent='Styled plugin';const img=new Image();img.src=icon;el.append(img);return {update(){},destroy(){el.replaceChildren()}};}}}};`);
 write('plugin.ts',`import{definePlugin,pluginComponent}from'@joplo-app/kit/plugin';const p=definePlugin({id:'assets',title:'Assets',runtime:new URL('./runtime.ts',import.meta.url),components:{Widget:{doc:'Asset fixture'}}});export const Widget=pluginComponent(p,'Widget');export default p;`);
 write('joplo.config.ts',`import{config}from'@joplo-app/kit';import assets from './plugin';export default config({name:'Assets',plugins:[assets]});`);
 write('routes/page.tsx',`import{page}from'@joplo-app/kit';import{Widget}from'../plugin';export default page({title:'Assets',layout:false},<Widget id="widget"/>);`);
 write('features/f/feature.ts',`import{feature}from'@joplo-app/kit';export default feature({name:'F',goal:'G',cases:{},pick:'a'});`);
 write('features/f/works/a.ts',`import{option,flow}from'@joplo-app/kit';export default work({title:'A',summary:'I',scenarios:{s:flow('S',{start:'/'}).system('Observe')}});`);
 browser=await launch({chromium});server=await createDev({projectDir:root,port:0,watch:false,log:()=>{}});
 expect(server.payload().diagnostics.filter(d=>d.severity==='error')).toEqual([]);
},120000);
afterAll(async()=>{await browser?.close();await server?.close();if(root)fs.rmSync(root,{recursive:true,force:true});});
async function verify(url:string,isolated=false){
 // isolated（D98）：发布站通过本机预览服务器打开，除了它自己的地址之外不许有任何网络请求
 const context=await browser.newContext({viewport:{width:1280,height:900}}),page=await context.newPage(),errors:string[]=[];
 if(isolated){const origin=new URL(url).origin;await context.route(u=>u.origin!==origin&&/^https?:/.test(u.href),r=>{errors.push('network:'+r.request().url());return r.abort();});}
 page.on('pageerror',e=>errors.push(e.message));page.on('requestfailed',r=>errors.push(r.url()));
 try{
  await page.goto(url);await page.waitForSelector('.br-assets');
  const result=await page.locator('.br-assets').evaluate(async el=>{
    const img=el.querySelector('img')!;await img.decode().catch(()=>{});
    const style=getComputedStyle(el),cssImage=getComputedStyle(el,'::before').backgroundImage;
    const bg=new Image();bg.src=cssImage.slice(5,-2);await bg.decode().catch(()=>{});
    await document.fonts.ready;const fontLoaded=[...document.fonts].some(f=>f.family==='BRAssetFont'&&f.status==='loaded');
    return{fontLoaded,color:style.color,background:style.backgroundColor,loaded:img.naturalWidth>0,cssLoaded:bg.naturalWidth>0};
  });
  expect(result).toEqual({fontLoaded:true,color:'rgb(12, 34, 56)',background:'rgb(90, 120, 150)',loaded:true,cssLoaded:true});
  expect(errors).toEqual([]);
 }finally{await context.close();}
}
it('BR-2 source dev serves CSS and large imported assets',async()=>{
 const q=renderQuery({projectId:server.projectId,scenarioId:'f.a.s',position:1,theme:'clean'});await verify(server.url+'?'+q);
},120000);
it('BR-2 prebuilt dev runtime endpoint retains CSS and large imported assets',async()=>{
 const app=path.join(root,'prebuilt');fs.mkdirSync(app);fs.writeFileSync(path.join(app,'project.css'),'@import "tailwindcss";');
 // Minimal prebuilt shell; no workspace frontend transforms. Runtime goes through
 // the actual dist-mode compiler, project HTTP endpoint, and dynamic import.
 fs.writeFileSync(path.join(app,'index.html'),`<div id="target"></div><script type="module">const projects=await fetch('/__joplo/projects').then(r=>r.json());const ir=await fetch('/__joplo/p/'+projects.projects[0].id+'/ir').then(r=>r.json());const runtime=(await import(ir.plugins.assets)).default;runtime.components.Widget.mount(document.getElementById('target'));</script>`);
 const mock=vi.spyOn(webAssets,'locateWebAssets').mockReturnValue({mode:'dist',webDir:app,appDir:app,siteFiles:[],projectCss:path.join(app,'project.css'),version:'test'});
 let dist:Awaited<ReturnType<typeof createDev>>|undefined;
 try{
  dist=await createDev({projectDir:root,port:0,watch:false,home:path.join(root,'dist-home'),log:()=>{}});
  expect(dist.payload().plugins!.assets).toContain('/runtime/');
  await verify(dist.url);
 }finally{mock.mockRestore();await dist?.close();}
},120000);
it('BR-2 published site (served over HTTP, D98) retains plugin CSS and every emitted asset with no other network',async()=>{
 const out=path.join(root,'site');await buildSite({projectDir:root,outDir:out,home:path.join(root,'home')});
 const site=await startPreview({dir:out});
 try{await verify(site.url+'index.html#/f/f?s=f.a.s&step=1',true);}finally{await site.close();}
},120000);
