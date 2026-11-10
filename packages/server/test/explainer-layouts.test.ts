import fs from 'node:fs';
import path from 'node:path';
import { expect, it } from 'vitest';
import { chromium } from 'playwright';
import { createDev } from '../src/dev.ts';
import { launch, renderQuery } from '../src/render.ts';
it('keeps long bilingual attribution, proportion bar and fixed status separate in both aspect ratios',async()=>{
 const root=path.resolve(import.meta.dirname,'../../../examples/explainer-layouts');
 const server=await createDev({projectDir:root,port:0,watch:false,log:()=>{}});const browser=await launch({chromium});
 try{
  expect(server.payload().diagnostics.filter(d=>d.severity==='error')).toEqual([]);
  const evidence=[];
  for(const [work,width,height] of [['landscape',1280,720],['portrait',720,1280]] as const){
   const page=await browser.newPage({viewport:{width,height},reducedMotion:'reduce'});
   const q=renderQuery({projectId:server.projectId,scenarioId:work+'.long',position:1,theme:'content:studio',viewport:{width,height}});
   await page.goto(`${server.url}?${q}&vw=${width}&vh=${height}&noframe=1`);await page.waitForFunction(()=>(window as any).__JOPLO_READY__===true);await page.evaluate(()=>document.fonts.ready);
   const geometry=await page.evaluate(()=>{const box=(id:string)=>{const e=document.querySelector(`[data-jid="${id}"]`)!;const r=e.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,bottom:r.bottom,right:r.right};};return {quote:box('long'),ratio:box('ratio'),photo:box('photo'),status:box('source-status'),view:box('content')};});
   expect(geometry.quote.bottom).toBeLessThan(geometry.status.y);expect(geometry.ratio.bottom).toBeLessThan(geometry.status.y);
   expect(geometry.photo.bottom).toBeLessThanOrEqual(geometry.ratio.y);
   expect(geometry.quote.right).toBeLessThanOrEqual(width);expect(geometry.quote.x).toBeGreaterThanOrEqual(0);
   expect(await page.locator('[data-jid="long"]').textContent()).toContain('来源：虚构档案馆');
   if(process.env.JOPLO_TEST_EVIDENCE_DIR){fs.mkdirSync(process.env.JOPLO_TEST_EVIDENCE_DIR,{recursive:true});await page.locator('[data-jshot]').screenshot({path:path.join(process.env.JOPLO_TEST_EVIDENCE_DIR,work+'-frame.png')});}
   evidence.push({work,width,height,...geometry});await page.close();
  }
  if(process.env.JOPLO_TEST_EVIDENCE_DIR)fs.writeFileSync(path.join(process.env.JOPLO_TEST_EVIDENCE_DIR,'layout-geometry.json'),JSON.stringify(evidence,null,2));
 }finally{await browser.close();await server.close();}
},120000);
