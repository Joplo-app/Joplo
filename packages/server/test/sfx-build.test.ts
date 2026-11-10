import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { expect, it } from 'vitest';
import { fixtureConfigSource, installFixturePlugins } from '../../../scripts/test/fixtures.ts';
import { createDev } from '../src/dev.ts';
import { renderVideo } from '../src/film.ts';
import { spawnSync } from 'node:child_process';
import { buildSite } from '../src/build.ts';
const REPO=path.resolve(import.meta.dirname,'../../..');
it('checks actual local asset imports, builds one cached WAV offline and preserves independent cross-chapter events',async()=>{
 const root=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'joplo-sfx-build-')));installFixturePlugins(root);
 fs.symlinkSync(path.join(REPO,'plugins/av'),path.join(root,'node_modules/@joplo-app/plugin-av'));
 const write=(name:string,text:string|Buffer)=>{const f=path.join(root,name);fs.mkdirSync(path.dirname(f),{recursive:true});fs.writeFileSync(f,text);};
 const b=Buffer.alloc(44+32000);b.write('RIFF');b.writeUInt32LE(b.length-8,4);b.write('WAVEfmt ',8);b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);b.writeUInt16LE(1,22);b.writeUInt32LE(8000,24);b.writeUInt32LE(8000,28);b.writeUInt16LE(1,32);b.writeUInt16LE(8,34);b.write('data',36);b.writeUInt32LE(32000,40);for(let i=44;i<b.length;i++)b[i]=128+Math.round(40*Math.sin(i*.3));write('cue.wav',b);
 write('joplo.config.ts',fixtureConfigSource(`import{asset,config}from'@joplo-app/kit';import{withSoundEffects}from'@joplo-app/plugin-av';export default config({name:'SFX',plugins:[withSoundEffects({cue:asset('./cue.wav')})]});`));
 write('routes/page.tsx',`import{page}from'@joplo-app/kit';export default page({title:'Sound'},<div>Local sound</div>);`);
 write('features/f/feature.ts',`import{feature}from'@joplo-app/kit';export default feature({name:'F',goal:'G',cases:{},pick:'a'});`);
 write('features/f/works/a.tsx',`import{flow,work,hold}from'@joplo-app/kit';import{sfx}from'@joplo-app/plugin-av';export default work({title:'A',summary:'I',on:{},scenarios:{one:flow('One',{start:'/'}).system('Send',sfx.play('cue',{volume:.5}),sfx.play('cue',{volume:.3}),hold(.5)),two:flow('Two',{from:'one'}).system('Continue',hold(.5))}});`);
 try{
  const dev=await createDev({projectDir:root,port:0,watch:false,log:()=>{}});try{expect(dev.payload().diagnostics.filter(d=>d.severity==='error')).toEqual([]);}finally{await dev.close();}
  const result=await buildSite({projectDir:root,outDir:path.join(root,'site')});expect(result.diagnostics.filter(d=>d.severity==='error')).toEqual([]);
  const html=fs.readFileSync(path.join(result.outDir,'index.html'),'utf8');const p=JSON.parse(/id="joplo-ir">([\s\S]*?)<\/script>/.exec(html)![1]!).project;
  expect(Object.keys(p.mediaAssets)).toHaveLength(1);const url=Object.values(p.mediaAssets)[0] as string;expect(fs.readFileSync(path.join(result.outDir,url))).toEqual(b);
  expect(Object.keys(p.scenarios['f.a.one'].steps[0].media)).toHaveLength(2);expect(Object.keys(p.scenarios['f.a.two'].media)).toHaveLength(2);
  expect(Object.values(p.scenarios['f.a.two'].media)[0]).toHaveProperty('endAfterMs');expect(html).not.toContain(root);expect(html).not.toContain('local.ts');
  expect(fs.readdirSync(path.join(root,'.joplo/resources')).filter(f=>f.endsWith('.json')&&!f.endsWith('.info.json'))).toHaveLength(1);
  if(process.env.JOPLO_TEST_SFX_VIDEO){
    fs.symlinkSync(path.join(REPO,'packages/server/node_modules/playwright'),path.join(root,'node_modules/playwright'));
    const out=path.resolve(process.env.JOPLO_TEST_SFX_VIDEO);fs.mkdirSync(path.dirname(out),{recursive:true});
    await renderVideo({projectDir:root,scenarioId:'f.a.one',chain:true,voice:'off',out,hide:['cover','cursor','title','subtitles']});
    const decoded=spawnSync('ffmpeg',['-v','error','-i',out,'-map','0:a:0','-f','f32le','-ac','1','pipe:1'],{maxBuffer:16*1024*1024});
    expect(decoded.status).toBe(0);const pcm=decoded.stdout;let peak=0;for(let i=0;i+4<=pcm.length;i+=4)peak=Math.max(peak,Math.abs(pcm.readFloatLE(i)));
    expect(peak).toBeGreaterThan(.01);fs.writeFileSync(out+'.json',JSON.stringify({audioSamples:pcm.length/4,peak,chapters:['f.a.one','f.a.two']},null,2));
  }

 }finally{fs.rmSync(root,{recursive:true,force:true});}
},120000);
