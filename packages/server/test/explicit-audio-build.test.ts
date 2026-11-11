import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { buildSite } from '../src/build.ts';
import { fixtureConfigSource, installFixturePlugins } from '../../../scripts/test/fixtures.ts';
const dirs:string[]=[];
afterEach(()=>dirs.splice(0).forEach(dir=>fs.rmSync(dir,{recursive:true,force:true})));
function wav(){const b=Buffer.alloc(44+9600);b.write('RIFF');b.writeUInt32LE(b.length-8,4);b.write('WAVEfmt ',8);b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);b.writeUInt16LE(1,22);b.writeUInt32LE(8000,24);b.writeUInt32LE(16000,28);b.writeUInt16LE(2,32);b.writeUInt16LE(16,34);b.write('data',36);b.writeUInt32LE(9600,40);return b;}
function fixture(mode:'missing'|'prepared'|'non-audio'='missing',timingOnly=false){
 const dir=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'joplo-explicit-build-')));dirs.push(dir);installFixturePlugins(dir);
 const write=(file:string,body:string|Buffer)=>{const target=path.join(dir,file);fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,body);};
 write('package.json','{"type":"module"}');write('tsconfig.json','{"compilerOptions":{"jsx":"react-jsxdev","jsxImportSource":"@joplo-app/kit"}}');
 if(mode==='prepared')write('prepared.wav',wav());if(mode==='non-audio')write('prepared.wav',Buffer.from([1,2,3]));
 write('local.mjs',`import fs from 'node:fs';import path from 'node:path';export default {compilers:{audio:{version:'1',mime:${JSON.stringify(mode==='non-audio'?'image/png':'audio/wav')},persistent:true,inspect:async()=>(${mode==='prepared'?'{durationMs:600}':'{}'}),compile(_input,ctx){fs.appendFileSync(path.join(ctx.projectDir,'attempts.jsonl'),JSON.stringify({allowSpend:!!ctx.allowSpend,keys:Object.keys(ctx.keys)})+String.fromCharCode(10));const file=path.join(ctx.projectDir,'prepared.wav');if(!fs.existsSync(file))throw Object.assign(new Error('Prepare existing audio first'),{code:'LOCAL_RESOURCE_SPEND_REQUIRED'});return fs.readFileSync(file);}}}};`);
 write('joplo.config.ts',fixtureConfigSource(`import {config} from '@joplo-app/kit';import {definePlugin} from '@joplo-app/kit/plugin';export default config({name:'Explicit audio build',plugins:[definePlugin({id:'fakeaudio',packageName:'fixture-audio',title:'Offline fixture',version:'1',components:{},skill:'fixture',runtime:${JSON.stringify(path.resolve('plugins/ui/src/runtime.tsx'))},local:${JSON.stringify(path.join(dir,'local.mjs'))}})]});`));
 const ref="localResource('fakeaudio','audio','existing')";
 write('works/spoken.tsx',`import {work,chapter,narrate,hold} from '@joplo-app/kit';import {localResource} from '@joplo-app/kit/plugin';export default work({title:'Spoken',summary:'Existing audio',stage:<div>Speech</div>,scenarios:{intro:chapter('Intro').system('Line',${timingOnly?`narrate(false),hold('audio',${ref},{pad:0})`:`narrate('Existing line',{audio:${ref}}),hold('voice',{pad:0})`})}});`);
 write('works/quiet.tsx',`import {work,chapter,narrate} from '@joplo-app/kit';export default work({title:'Quiet',summary:'Selected quiet work',stage:<div>Quiet</div>,scenarios:{intro:chapter('Intro').system('Quiet',narrate(false))}});`);
 return {dir,out:path.join(dir,'site')};
}
function attempts(dir:string){const file=path.join(dir,'attempts.jsonl');return fs.existsSync(file)?fs.readFileSync(file,'utf8').trim().split('\n').map(s=>JSON.parse(s)):[];}
function noSpend(dir:string){const calls=attempts(dir);expect(calls.length).toBeGreaterThan(0);expect(calls.every(c=>c.allowSpend===false&&c.keys.length===0)).toBe(true);}
function published(out:string){return JSON.parse(/id="joplo-ir">([\s\S]*?)<\/script>/.exec(fs.readFileSync(path.join(out,'index.html'),'utf8'))![1]!).project;}
it('refuses missing explicit audio before creating output without granting generation permission',async()=>{
 const x=fixture();await expect(buildSite({projectDir:x.dir,outDir:x.out})).rejects.toMatchObject({code:'EXPORT_FAILED',diagnostics:expect.arrayContaining([expect.objectContaining({severity:'error',code:'AUDIO_ASSET_MISSING'})])});
 expect(fs.existsSync(x.out)).toBe(false);noSpend(x.dir);
},60000);
it('packages prepared explicit audio without calling a provider',async()=>{
 const x=fixture('prepared');await buildSite({projectDir:x.dir,outDir:x.out});const p=published(x.out),ref=p.scenarios['spoken.intro'].steps[0].audio;expect(ref).toBe('joplo-resource:resource-0');expect(fs.readFileSync(path.join(x.out,p.mediaAssets[ref.slice(15)]))).toEqual(wav());noSpend(x.dir);
},60000);
it('rejects a non-audio resource used as explicit speech without writing output',async()=>{
 const x=fixture('non-audio');await expect(buildSite({projectDir:x.dir,outDir:x.out})).rejects.toMatchObject({code:'EXPORT_FAILED',diagnostics:expect.arrayContaining([expect.objectContaining({code:'AUDIO_ASSET_INVALID'})])});expect(fs.existsSync(x.out)).toBe(false);noSpend(x.dir);
},60000);
it('allows an unavailable timing-only audio reference to remain estimated',async()=>{
 const x=fixture('missing',true);await buildSite({projectDir:x.dir,outDir:x.out});const step=published(x.out).scenarios['spoken.intro'].steps[0];expect(step.audio).toBeUndefined();expect(step.holdFor).toMatchObject({kind:'audio'});expect(step.holdFor.durationMs).toBeUndefined();noSpend(x.dir);
},60000);
it('does not let an excluded work missing explicit audio block the selected work',async()=>{
 const x=fixture();await buildSite({projectDir:x.dir,outDir:x.out,scope:{entryIds:['quiet']}});const p=published(x.out);expect(Object.keys(p.scenarios)).toEqual(['quiet.intro']);expect(p.works.spoken).toBeUndefined();noSpend(x.dir);
},60000);
