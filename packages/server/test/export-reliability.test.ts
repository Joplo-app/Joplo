import fs from 'node:fs';
import path from 'node:path';
import { afterAll, expect, it } from 'vitest';
import { chromium } from 'playwright';
import { checkpointCommitsMatch, contentIdentity } from '../src/checkpoint.ts';
import { capture } from '../src/capture.ts';
import { launch } from '../src/render.ts';
import { persistTimeline, type PlaybackTimeline } from '../src/timeline.ts';
import { writeOutput } from '../src/output-file.ts';
const root=path.resolve(`scratch/output/export-reliability-${process.pid}`);
fs.mkdirSync(root,{recursive:true});
afterAll(()=>{/* Evidence intentionally retained. */});
it('invalidates content identity when theme CSS, cached clip bytes or runtime build changes',()=>{
  const source=path.join(root,'source');fs.mkdirSync(path.join(source,'.joplo/voice/clips'),{recursive:true});
  const files=['theme.css','.joplo/voice/clips/audio.wav','runtime.js'];
  for(const name of files)fs.writeFileSync(path.join(source,name),'original');
  let before=contentIdentity([source]);
  for(const name of files){fs.writeFileSync(path.join(source,name),'changed');const after=contentIdentity([source]);expect(after).not.toBe(before);before=after;}
});
it('checks existing audio hashes and atomically repairs corrupt assets only with overwrite',async()=>{
  const file=path.join(root,'timeline.json'),source='data:audio/wav;base64,'+Buffer.from('complete audio').toString('base64');
  const timeline=():PlaybackTimeline=>({schemaVersion:1,origin:'playback',steps:[],chapters:[],mediaEvents:[],timing:{sampleToleranceMs:50,outputOriginMs:0},events:[{at:0,engineMs:0,outputMs:0,type:'narration',source:'clip',clipId:'fixture',file:source}]});
  const first=timeline();await persistTimeline(file,first,{},'http://localhost');
  const asset=path.join(root,first.assets![0]!.file);fs.writeFileSync(asset,'partial');
  await expect(persistTimeline(path.join(root,'other.json'),timeline(),{},'http://localhost')).resolves.toBeUndefined();
  await expect(persistTimeline(file,timeline(),{},'http://localhost')).rejects.toThrow('incomplete or corrupt');
  await persistTimeline(file,timeline(),{},'http://localhost',true);
  expect(fs.readFileSync(asset,'utf8')).toBe('complete audio');
  expect(fs.readdirSync(path.dirname(asset)).some(n=>n.endsWith('.tmp'))).toBe(false);
});
it('atomic output refuses overwrite and preserves the complete existing output',async()=>{
  const out=path.join(root,'existing.mp4');fs.writeFileSync(out,'complete previous output');
  await expect(writeOutput(out,'replacement')).rejects.toMatchObject({code:'EEXIST'});
  expect(fs.readFileSync(out,'utf8')).toBe('complete previous output');
  await writeOutput(out,'complete replacement',true);expect(fs.readFileSync(out,'utf8')).toBe('complete replacement');
});
it('rejects a selector whose sampled crop dimensions change, while fixed numeric crops remain valid',async()=>{
  const browser=await launch({chromium});
  try{
    const page=await browser.newPage();await page.setContent('<div data-jexport style="width:200px;height:100px"><div id="picture" style="width:100px;height:80px;background:red"></div></div>');
    await capture(page,'[data-jexport]','#picture','jpeg',72,undefined,0);
    await page.locator('#picture').evaluate(el=>{(el as HTMLElement).style.width='120px';});
    await expect(capture(page,'[data-jexport]','#picture','jpeg',72,undefined,50)).rejects.toThrow('Crop dimensions changed at 50 ms');
    const fixed=await browser.newPage();await fixed.setContent('<div data-jexport style="width:200px;height:100px;background:blue"></div>');
    await capture(fixed,'[data-jexport]',{x:0,y:0,width:100,height:80},'jpeg',72,undefined,0);
    await capture(fixed,'[data-jexport]',{x:0,y:0,width:100,height:80},'jpeg',72,undefined,50);
  }finally{await browser.close();}
},30000);

it('bounds accepted checkpoint timing jitter and never accepts a different step identity',()=>{const saved=[{stepId:'chapter#1',commitMs:100}];expect(checkpointCommitsMatch(saved,[{stepId:'chapter#1',commitMs:150}])).toBe(true);expect(checkpointCommitsMatch(saved,[{stepId:'chapter#1',commitMs:151}])).toBe(false);expect(checkpointCommitsMatch(saved,[{stepId:'chapter#2',commitMs:100}])).toBe(false);});
