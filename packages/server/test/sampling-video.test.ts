import fs from 'node:fs';
import path from 'node:path';
import {beforeAll,afterAll,expect,it} from 'vitest';
import {chromium,type Browser,type Page} from 'playwright';
import {createDev} from '../src/dev.ts';
import {launch} from '../src/render.ts';
import {waitForSample} from '../src/film.ts';
import {renderFrames,renderFilm} from '../src/index.ts';
import {installFixturePlugins,fixtureConfigSource} from '../../../scripts/test/fixtures.ts';
const root=path.resolve(`scratch/output/sampling-video-${process.pid}`);
let server:Awaited<ReturnType<typeof createDev>>,browser:Browser;
const write=(name:string,value:string|Buffer)=>{const file=path.join(root,name);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,value);};
beforeAll(async()=>{
 fs.mkdirSync(root,{recursive:true});installFixturePlugins(root);
 fs.symlinkSync(path.resolve('packages/server/node_modules/playwright-core'),path.join(root,'node_modules/playwright-core'),'dir');
 write('clip.mp4',fs.readFileSync(new URL('./fixtures/numbered-video.mp4',import.meta.url)));
 write('joplo.config.ts',fixtureConfigSource(`import {config} from '@joplo-app/kit';import media from ${JSON.stringify(path.resolve('plugins/av/src/plugin.ts'))};import {definePlugin} from '@joplo-app/kit/plugin';const probe=definePlugin({id:'probe',title:'Clock evidence',components:{Probe:{doc:'Test probe'}},runtime:new URL('./probe.tsx',import.meta.url)});export default config({name:'Sampling',home:'/',plugins:[media,probe]});`));
 write('probe.tsx',`import {useLayoutEffect} from 'react';import {defineRuntime} from '@joplo-app/kit/plugin';import {useEngineFrame} from '@joplo-app/kit/renderer';export default defineRuntime({id:'probe',components:{Probe:{react:({ctx})=>{useEngineFrame(true);useLayoutEffect(()=>{if(!ctx.frame.sampling||ctx.frame.position===0)return;const done=ctx.hold(),timer=setTimeout(done,200);return()=>{clearTimeout(timer);done();};},[ctx.frame.scenarioId,ctx.frame.position]);return <div data-probe={JSON.stringify(ctx.frame.clock??{})} data-sampling={String(ctx.frame.sampling===true)} data-reset={ctx.frame.resetKey}/>;}}}});`);
 write('routes/page.tsx',`import {asset,page} from '@joplo-app/kit';import {Video} from ${JSON.stringify(path.resolve('plugins/av/src/plugin.ts'))};import {pluginComponent} from '@joplo-app/kit/plugin';import config from '../joplo.config';const Probe=pluginComponent(config.plugins.find(p=>p.id==='probe'),'Probe');export default page({title:'Numbers',layout:false},<><Video id="a" src={asset('../clip.mp4')} w={128} h={32}/><Video id="b" src={asset('../clip.mp4')} start={.2} w={128} h={32}/><Probe/></>);`);
 write('features/f/feature.ts',`import {feature} from '@joplo-app/kit';export default feature({name:'F',goal:'Pixels',cases:{},pick:'a'});`);
 write('features/f/works/a.tsx',`import {work,chapter,hold,narrate} from '@joplo-app/kit';import {playClip} from ${JSON.stringify(path.resolve('plugins/av/src/plugin.ts'))};export default work({title:'A',summary:'Numbers',pace:{systemLead:.05},scenarios:{one:chapter('One',{start:'/'}).system('go',playClip('a',{from:0,to:.8}),playClip('b',{from:.2,to:1}),hold(.5),narrate(false)).system('rewind',playClip('a',{from:.1,to:.6}),playClip('b',{from:.4,to:.9}),hold(.5),narrate(false)),two:chapter('Two').system('second',playClip('a',{from:1,to:1.6}),playClip('b',{from:.7,to:1.3}),hold(.5),narrate(false))}});`);
 server=await createDev({projectDir:root,port:0,watch:false,log:()=>{}});expect(server.payload().diagnostics.filter(d=>d.severity==='error')).toEqual([]);browser=await launch({chromium});
},120000);
afterAll(async()=>{await browser?.close();await server?.close();});
async function open(sampling=true,clean=true,scale=1,theme='clean'){
 const context=await browser.newContext({viewport:{width:256,height:128},deviceScaleFactor:scale}),page=await context.newPage();
 if(sampling){await page.clock.install({time:0});await page.clock.pauseAt(86400000);}
 const query=new URLSearchParams({render:'1',project:server.projectId,scenario:'f.a.one',position:'0',theme,record:'1',frame:'1',chain:'1',audio:'0',...(clean?{hide:'cover,cursor,title,subtitles'}:{}),vw:'256',vh:'128',w:'256',h:'128',...(sampling?{sampling:'1'}:{})});
 await page.goto(server.url+'?'+query,{waitUntil:'domcontentloaded'});
 if(sampling){const began=Date.now();while(!await page.evaluate(()=>(window as any).__JOPLO_READY__===true)){if(Date.now()-began>20000)throw Error('not ready');await page.clock.runFor(16);await page.waitForTimeout(5);}}
 else await page.waitForFunction(()=>(window as any).__JOPLO_READY__===true);
 expect(await page.evaluate(()=>(window as any).__JOPLO_ERROR__??null)).toBeNull();
 await waitForSample(page,0);return {context,page};
}
async function observed(page:Page){return page.evaluate(()=>{
 const probe=document.querySelector<HTMLElement>('[data-probe]')!;
 const images=Array.from(document.querySelectorAll<HTMLCanvasElement>('canvas[data-jvideo-presented]')).map(canvas=>{
  const g=canvas.getContext('2d')!;let index=0;for(let bit=0;bit<8;bit++)if(g.getImageData(bit*16+8,16,1,1).data[0]!>128)index|=1<<bit;
  return {index,presented:canvas.dataset.jvideoPresented};
 });
 return {clock:JSON.parse(probe.dataset.probe!),sampling:probe.dataset.sampling,reset:probe.dataset.reset,images,progress:(window as any).__JOPLO_RECORD__.progress,videos:Array.from(document.querySelectorAll('video')).map(v=>({time:v.currentTime,paused:v.paused}))};
});}
function verify(value:Awaited<ReturnType<typeof observed>>){
 const project=server.payload().project!,scenario=project.scenarios[value.progress.scenarioId]!,step=scenario.steps[value.progress.position-1],clips=((step?.ext??scenario.ext) as any).media.clips;
 for(const [i,id]of ['a','b'].entries()){
  const clip=clips[id],target=clip.live&&(value.clock.running||value.clock.paused)?Math.min(clip.to,clip.from+value.clock.elapsedMs/1000):clip.to;
  expect(value.videos[i]!.time).toBeCloseTo(target,4);
  expect(value.images[i]!.index,JSON.stringify({id,target,...value})).toBe(Math.min(19,Math.floor(target*10+1e-6)));
  expect(value.images[i]!.presented).toBe('1');expect(value.videos[i]!.paused).toBe(true);
 }
}
it('samples every numbered frame for two videos with pause/resume, rewind and continuing chapters',async()=>{
 const {context,page}=await open();try{
  expect((await observed(page)).sampling).toBe('true');
  await page.evaluate(()=>(window as any).__JOPLO_RECORD__.play());
  const evidence:any[]=[];let paused=false,seenTwo=false;
  for(let t=50;t<=5000;t+=50){await page.clock.runFor(50);await waitForSample(page,t);let value=await observed(page);verify(value);evidence.push(value);
   if(!paused&&value.progress.position===1&&value.clock.elapsedMs>200){
    const reset=value.reset;await page.evaluate(()=>(window as any).__JOPLO_RECORD__.pause());await waitForSample(page,t);const pausedAt=await observed(page);verify(pausedAt);await page.clock.runFor(300);await waitForSample(page,t);const still=await observed(page);verify(still);expect(still.clock.timeMs).toBeCloseTo(pausedAt.clock.timeMs,0);expect(still.reset).toBe(reset);await page.evaluate(()=>(window as any).__JOPLO_RECORD__.resume());paused=true;
   }
   if(value.progress.scenarioId==='f.a.two')seenTwo=true;if(value.progress.done)break;
  }
  expect(paused&&seenTwo).toBe(true);
  await page.evaluate(()=>(window as any).__JOPLO_RECORD__.seek('f.a.one',0));await waitForSample(page,0);verify(await observed(page));
  fs.writeFileSync(path.join(root,'numbered-evidence.json'),JSON.stringify(evidence,null,2));
  // A real decoder failure must fail the sample, never silently retain its old canvas.
  await page.evaluate(()=>{for(const video of document.querySelectorAll('video'))video.src='data:video/mp4;base64,YmFk';});
  await page.waitForFunction(()=>Array.from(document.querySelectorAll('video')).every(v=>v.error));
  await page.clock.runFor(50);await page.evaluate(()=>(window as any).__JOPLO_RECORD__.seek('f.a.one',1));
  await expect(waitForSample(page,50)).rejects.toThrow('Video decode failed');
  expect(await page.evaluate(()=>(window as any).__JOPLO_RECORD__.frameStatus().pending)).toBe(0);
 }finally{await context.close();}
},120000);
async function numberedJpeg(page:Page,bytes:Buffer){
 return page.evaluate(async b64=>{
  const image=new Image();image.src='data:image/jpeg;base64,'+b64;await image.decode();
  const canvas=document.createElement('canvas');canvas.width=image.width;canvas.height=image.height;
  const g=canvas.getContext('2d')!;g.drawImage(image,0,0);
  const bands=Array.from({length:8},(_,bit)=>g.getImageData(Math.floor((bit+.5)*image.width/8),Math.floor(image.height/2),1,1).data[0]!);
  return {width:image.width,height:image.height,bands,index:bands.reduce((n,v,bit)=>n|(v>128?1<<bit:0),0)};
 },bytes.toString('base64'));
}
async function verifyExport(directory:string,timelineFile:string){
 const timeline=JSON.parse(fs.readFileSync(timelineFile,'utf8')),page=await browser.newPage();
 try {const decoded:number[]=[];for(const file of fs.readdirSync(directory).filter(n=>/^[0-9]+\.jpg$/.test(n)).sort()){
  const t=Number(file.slice(0,-4));
  const image=await numberedJpeg(page,fs.readFileSync(path.join(directory,file)));
  const {index}=image,diagnostic=JSON.stringify({file:path.join(directory,file),t,...image});
  const step=timeline.steps.filter((s:any)=>s.outputCommitMs<=t).at(-1);
  if(!step)expect(index,diagnostic).toBe(0);else {
   const from=step.position===1?0:.1,to=step.position===1?.8:.6,elapsed=Math.max(0,t-step.outputCommitMs)/1000;
   const low=Math.floor(Math.min(to,from+Math.max(0,elapsed-.05))*10+1e-6),high=Math.floor(Math.min(to,from+elapsed+.05)*10+1e-6);
   expect(index,`${diagnostic} position ${step.position}`).toBeGreaterThanOrEqual(low);expect(index,diagnostic).toBeLessThanOrEqual(high);
  }decoded.push(index);
 }expect(new Set(decoded).size).toBeGreaterThan(6);return decoded;
 }finally{await page.close();}
}
it('a cropped source video can legitimately be covered by the default film curtain',async()=>{
 const {context,page}=await open(true,false,.5,'sketch');try{
  // Reproduce the CI timing deterministically: font/load work can leave the cover fully entered.
  await page.clock.runFor(400);await waitForSample(page,0);
  await page.evaluate(()=>(window as any).__JOPLO_RECORD__.play());await waitForSample(page,0);
  const value=await observed(page);expect(value.progress.position).toBe(0);expect(value.images[0]!.index).toBe(0);
  const box=await page.locator('[data-jid="a"]').boundingBox();expect(box).not.toBeNull();
  const screenshot=await page.screenshot({type:'jpeg',clip:box!});
  const proof=await numberedJpeg(page,screenshot);
  expect(await page.locator('[data-jlayer="curtain"]').count()).toBeGreaterThan(0);
  // Hold engine time and decoder pixels fixed; hide only the composited curtain.
  const before=await page.evaluate(()=>Date.now());
  await page.locator('[data-jlayer="curtain"]').evaluateAll(elements=>elements.forEach(el=>(el as HTMLElement).style.visibility='hidden'));
  const unobstructed=await numberedJpeg(page,await page.screenshot({type:'jpeg',clip:box!}));
  expect(await page.evaluate(()=>Date.now())).toBe(before);expect(unobstructed.index).toBe(0);
  expect(proof.bands,JSON.stringify(proof)).not.toEqual(unobstructed.bands);
  fs.writeFileSync(path.join(root,'curtain-pixel-proof.jpg'),screenshot);fs.writeFileSync(path.join(root,'curtain-pixel-proof.json'),JSON.stringify({source:value.images[0],screenshot:proof,unobstructed},null,2));
 }finally{await context.close();}
},30000);
it('public frames and film use sampling; native video route stays real-time even in an automated browser',async()=>{
 const frame=await renderFrames({projectDir:root,scenarioId:'f.a.one',framesOut:path.join(root,'frames'),fps:10,voice:'off',logicalViewport:{width:256,height:128},crop:'[data-jid="a"]'});expect(frame.frames).toBeGreaterThan(10);await verifyExport(frame.directory,frame.timeline);
 const film=await renderFilm({projectDir:root,scenarioId:'f.a.one',out:path.join(root,'film.png'),sampleMs:100,every:100,hide:['cover','cursor','title','subtitles'],frames:path.join(root,'film-frames'),timeline:path.join(root,'film-timeline.json'),voice:'off',logicalViewport:{width:256,height:128},crop:'[data-jid="a"]'});expect(film.samples).toBeGreaterThan(10);await verifyExport(path.join(root,'film-frames'),path.join(root,'film-timeline.json'));
 const {context,page}=await open(false);try{await page.evaluate(()=>(window as any).__JOPLO_RECORD__.play());await page.waitForTimeout(300);const value=await observed(page);expect(value.sampling).toBe('false');expect(await page.evaluate(()=>navigator.webdriver)).toBe(true);expect(value.videos.some(v=>!v.paused)).toBe(true);}finally{await context.close();}
},120000);
it('fails rejected/timed-out readiness and supports cancellation without moving frozen time',async()=>{
 const page=await browser.newPage();try{
  await page.clock.install({time:0});await page.clock.pauseAt(86400000);await page.setContent('<div/>');
  await page.evaluate(()=>(window as any).__JOPLO_RECORD__={frameStatus:()=>({pending:1,error:null})});
  await page.evaluate(()=>(window as any).__JOPLO_RECORD__.cancelFrame=()=>{(window as any).__cancelled=true;});
  const before=await page.evaluate(()=>Date.now());await expect(waitForSample(page,123,30)).rejects.toThrow('timed out at 123 ms');expect(await page.evaluate(()=>Date.now())).toBe(before);expect(await page.evaluate(()=>(window as any).__cancelled)).toBe(true);
  const controller=new AbortController();controller.abort();await expect(waitForSample(page,456,30,controller.signal)).rejects.toThrow('cancelled at 456 ms');
  const midflight=new AbortController();setTimeout(()=>midflight.abort(),10);await expect(waitForSample(page,500,100,midflight.signal)).rejects.toThrow('cancelled at 500 ms');
  await page.evaluate(()=>{let calls=0;(window as any).__JOPLO_RECORD__={frameStatus:()=>{calls++;(window as any).__calls=calls;return calls===2?{pending:1,error:null,revision:2}:{pending:0,error:null,revision:calls>2?3:1};}};});
  await waitForSample(page,600,500);expect(await page.evaluate(()=>(window as any).__calls)).toBeGreaterThanOrEqual(4);
  await page.evaluate(()=>(window as any).__JOPLO_RECORD__={frameStatus:()=>({pending:0,error:'clip: bad decoder'})});await expect(waitForSample(page,789)).rejects.toThrow('bad decoder');
 }finally{await page.close();}
});
