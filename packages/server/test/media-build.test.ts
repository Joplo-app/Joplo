import { fixtureConfigSource } from '../../../scripts/test/fixtures.ts';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { expect, it } from 'vitest';
import { createDev } from '../src/dev.ts';
import { buildSite } from '../src/build.ts';

it('publishes scoped fake WAV artifacts offline without author text, paths or local code', async () => {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'joplo-media-build-')));
  try {
    fs.writeFileSync(path.join(dir, 'private.sf3'), 'PRIVATE_SOUNDFONT_BYTES');
    fs.mkdirSync(path.join(dir, 'routes')); fs.mkdirSync(path.join(dir, 'features/f/options'), {recursive:true});
    fs.writeFileSync(path.join(dir,'tsconfig.json'),JSON.stringify({compilerOptions:{jsx:'react-jsx',jsxImportSource:'@joplo-app/kit'}}));
    fs.writeFileSync(path.join(dir,'runtime.ts'), `export default {id:'fake',apiVersion:2,components:{},media:async({audio,destination,bytes})=>{const buffer=await audio.decodeAudioData(bytes.buffer.slice(0));let source;return {update(f){if(source){source.stop();source=null;}if(f.playing){source=audio.createBufferSource();source.buffer=buffer;source.connect(destination);source.start(0,(f.offsetMs/1000)%buffer.duration);}},destroy(){source?.stop();}};}};`);
    fs.writeFileSync(path.join(dir,'local.ts'), `export default {compilers:{wav:{version:'1',mime:'audio/wav',compile(input){
      // PRIVATE_LOCAL_IMPLEMENTATION
      const b=Buffer.alloc(44+800);b.write('RIFF');b.writeUInt32LE(b.length-8,4);b.write('WAVEfmt ',8);b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);b.writeUInt16LE(1,22);b.writeUInt32LE(8000,24);b.writeUInt32LE(8000,28);b.writeUInt16LE(1,32);b.writeUInt16LE(8,34);b.write('data',36);b.writeUInt32LE(800,40);for(let i=44;i<b.length;i++)b[i]=128+Math.round(40*Math.sin(i*input.length));return b;
    }}}};`);
    fs.writeFileSync(path.join(dir,'joplo.config.ts'), fixtureConfigSource(`import {config} from '@joplo-app/kit';
      export default config({name:'Media fixture',plugins:[{kind:'plugin',apiVersion:2,id:'fake',title:'Fake WAV',components:{},runtime:${JSON.stringify(path.join(dir,'runtime.ts'))},local:${JSON.stringify(path.join(dir,'local.ts'))},compile:{effect(e,ctx){return {media:[{track:'bgm',action:'play',resource:ctx.resource({compiler:'wav',input:e.payload}),loop:true}]};}}}]});`));
    fs.writeFileSync(path.join(dir,'routes/page.tsx'), `import {page} from '@joplo-app/kit';export default page({title:'Home'},<div>Home</div>);`);
    fs.writeFileSync(path.join(dir,'features/f/feature.ts'), `import {feature} from '@joplo-app/kit';export default feature({name:'F',goal:'g',cases:{},pick:'a'});`);
    fs.writeFileSync(path.join(dir,'features/f/options/a.tsx'), `import {option,flow} from '@joplo-app/kit';import {pluginEffect} from '@joplo-app/kit/plugin';export default option({name:'A',idea:'i',on:{},scenarios:{a:flow('Included',{start:'/'}).system('Play',pluginEffect('fake','play','PRIVATE_SCORE_ALPHA')),b:flow('Omitted',{start:'/'}).system('Play',pluginEffect('fake','play','PRIVATE_SCORE_BETA'))}});`);
    const dev = await createDev({ projectDir: dir, port: 0, watch: false, log: () => undefined });
    try {
      expect(fs.readdirSync(path.join(dir, '.joplo/resources')).filter(f => f.endsWith('.json'))).toEqual([]);
      const runtime = await fetch(`http://127.0.0.1:${dev.port}${dev.payload().plugins!.fake}`);
      expect(runtime.status).toBe(200);
      const [url] = Object.values(dev.payload().project!.mediaAssets!);
      const address = `http://127.0.0.1:${dev.port}${url}`;
      const denied = await fetch(address, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
      expect(denied.status).toBe(403);
      const request = () => fetch(address, { method: 'POST', headers: { 'content-type': 'application/json', 'x-joplo-token': dev.token }, body: '{}' }).then(r => r.json());
      const generated = await Promise.all([request(), request()]);
      expect(generated[0]).toEqual(generated[1]);
      expect(generated[0].url).toMatch(/^data:audio\/wav;base64,/);
      expect(dev.payload().diagnostics.filter(d=>d.severity==='error')).toEqual([]);
    } finally { await dev.close(); }
    const result=await buildSite({projectDir:dir,outDir:path.join(dir,'site'),scope:{scenarios:['f.a.a']}});
    expect(result.diagnostics.filter(d=>d.severity==='error')).toEqual([]);
    const html=fs.readFileSync(path.join(result.outDir,'index.html'),'utf8');
    const p=JSON.parse(/id="joplo-ir">([\s\S]*?)<\/script>/.exec(html)![1]!).project;
    expect(Object.keys(p.mediaAssets)).toHaveLength(1);
    expect(Object.values(p.mediaAssets)[0]).toMatch(/^data:audio\/wav;base64,UklGR/);
    expect(Object.keys(p.scenarios)).toEqual(['f.a.a']);
    for(const forbidden of ['PRIVATE_SCORE_ALPHA','PRIVATE_SCORE_BETA','PRIVATE_LOCAL_IMPLEMENTATION','PRIVATE_SOUNDFONT_BYTES','private.sf3',dir,'local.ts'])expect(html).not.toContain(forbidden);
    expect(fs.readdirSync(path.join(dir,'.joplo/resources')).filter(f=>f.endsWith('.json'))).toHaveLength(1);
    fs.writeFileSync(path.join(dir,'local.ts'),`export default {compilers:{wav:{version:'2',mime:'audio/wav',compile(){throw new Error('No native tool')}}}};`);
    const silent=await buildSite({projectDir:dir,outDir:path.join(dir,'silent'),scope:{scenarios:['f.a.a']}});
    expect(silent.diagnostics).toContainEqual(expect.objectContaining({code:'LOCAL_RESOURCE_FAILED',severity:'warning',at:expect.stringMatching(/features\/f\/options\/a.tsx:\d+:\d+/)}));
    expect(fs.existsSync(path.join(silent.outDir,'index.html'))).toBe(true);
    const broken = await createDev({ projectDir: dir, port: 0, watch: false, log: () => undefined });
    try {
      const [url] = Object.values(broken.payload().project!.mediaAssets!);
      await fetch(`http://127.0.0.1:${broken.port}${url}`, { method:'POST',headers:{'content-type':'application/json','x-joplo-token':broken.token},body:'{}' });
      expect(broken.payload().ok).toBe(true);
      expect(broken.payload().diagnostics).toContainEqual(expect.objectContaining({code:'LOCAL_RESOURCE_FAILED',severity:'warning'}));
    } finally { await broken.close(); }

  }finally{fs.rmSync(dir,{recursive:true,force:true});}
},120000);
