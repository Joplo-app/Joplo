import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { generateResources } from '../src/resources-run.ts';
import { fixtureConfigSource, installFixturePlugins } from '../../../scripts/test/fixtures.ts';
const dirs:string[]=[];
afterEach(()=>dirs.splice(0).forEach(d=>fs.rmSync(d,{recursive:true,force:true})));
function fixture(){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'resource-work-'));dirs.push(root);installFixturePlugins(root);
 fs.mkdirSync(path.join(root,'works'));
 fs.writeFileSync(path.join(root,'local.mjs'),`export default {compilers:{image:{version:'1',mime:'image/png',persistent:true,estimate:()=>({credits:7}),compile(){throw new Error('offline fixture; no generation')}}}};`);
 fs.writeFileSync(path.join(root,'package.json'),'{"type":"module"}');
 fs.writeFileSync(path.join(root,'tsconfig.json'),'{"compilerOptions":{"jsx":"react-jsxdev","jsxImportSource":"@joplo-app/kit"}}');
 fs.writeFileSync(path.join(root,'joplo.config.ts'),fixtureConfigSource(`import {config} from '@joplo-app/kit';import {definePlugin} from '@joplo-app/kit/plugin';export default config({name:'Scoped',plugins:[definePlugin({id:'image',packageName:'fixture-image',title:'Fixture',version:'1',components:{},runtime:${JSON.stringify(path.resolve('plugins/ui/src/runtime.tsx'))},local:${JSON.stringify(path.join(root,'local.mjs'))},skill:'Fixture'})]});`));
 fs.writeFileSync(path.join(root,'works/good.tsx'),`import {work,chapter} from '@joplo-app/kit';import {Image} from '@joplo-app/plugin-ui';import {localResource} from '@joplo-app/kit/plugin';export default work({title:'Good',summary:'Working resource scope',stage:<div><Image src={localResource('image','image','private image request')}/></div>,scenarios:{start:chapter('Start').system('Ready')}});`);
 fs.writeFileSync(path.join(root,'works/broken.tsx'),`throw new Error('unrelated work must never evaluate');`);
 return root;
}
it('resources --work skips unrelated module failures while full generation still rejects',async()=>{
 const root=fixture();
 expect(await generateResources(root,{work:'good',dryRun:true})).toEqual([expect.objectContaining({credits:7,id:'resource-0'})]);
 await expect(generateResources(root,{dryRun:true})).rejects.toThrow('unrelated work must never evaluate');
 await expect(generateResources(root,{work:'missing',dryRun:true})).rejects.toThrow('WORK_NOT_FOUND');
},20000);
it('qualified feature scope does not load another option or inherit its pick',async()=>{
 const root=fixture();fs.mkdirSync(path.join(root,'features/f/works'),{recursive:true});
 fs.writeFileSync(path.join(root,'features/f/feature.ts'),`import {feature} from '@joplo-app/kit';export default feature({name:'Choice',goal:'Test',cases:{},pick:'broken'});`);
 fs.copyFileSync(path.join(root,'works/good.tsx'),path.join(root,'features/f/works/good.tsx'));
 fs.copyFileSync(path.join(root,'works/broken.tsx'),path.join(root,'features/f/works/broken.tsx'));
 expect(await generateResources(root,{work:'f.good',dryRun:true})).toEqual([expect.objectContaining({credits:7,id:'resource-0'})]);
},20000);

it('CLI exposes scoped dry-run estimates without granting paid generation',async()=>{
 const root=fixture();
 const {execFile}=await import('node:child_process');const {promisify}=await import('node:util');
 const result=await promisify(execFile)(process.execPath,['--import','tsx',path.resolve('packages/cli/src/bin.ts'),'resources',root,'--work','good','--dry-run','--format','json'],{cwd:process.cwd()});
 expect(JSON.parse(result.stdout)).toMatchObject({ok:true,data:[{id:'resource-0',credits:7}]});
 expect(result.stdout).not.toContain('private image request');
},20000);
it('shared route load failures remain blocking for scoped generation',async()=>{
 const root=fixture();fs.mkdirSync(path.join(root,'routes'));fs.writeFileSync(path.join(root,'routes/page.tsx'),`throw new Error('shared route is broken');`);
 await expect(generateResources(root,{work:'good',dryRun:true})).rejects.toThrow('shared route is broken');
},20000);

it('unused shared-route resources do not enlarge the selected work spending plan',async()=>{
 const root=fixture();fs.mkdirSync(path.join(root,'routes'));
 fs.writeFileSync(path.join(root,'routes/page.tsx'),`import {page} from '@joplo-app/kit';import {Image} from '@joplo-app/plugin-ui';import {localResource} from '@joplo-app/kit/plugin';export default page({title:'Unused',layout:false},<div><Image src={localResource('image','image','unrelated shared image')}/></div>);`);
 const results=await generateResources(root,{work:'good',dryRun:true});expect(results).toHaveLength(1);expect(results[0]?.credits).toBe(7);
},20000);

it('scope gives an exact dotted standalone key precedence over a qualified option',async()=>{
 const root=fixture();fs.copyFileSync(path.join(root,'works/good.tsx'),path.join(root,'works/f.good.tsx'));
 fs.mkdirSync(path.join(root,'features/f/works'),{recursive:true});
 fs.writeFileSync(path.join(root,'features/f/feature.ts'),`throw new Error('must prefer exact standalone key');`);
 fs.copyFileSync(path.join(root,'works/broken.tsx'),path.join(root,'features/f/works/good.tsx'));
 await expect(generateResources(root,{work:'f.good',dryRun:true})).rejects.toThrow('entryIds.0');
},20000);
it('dotted qualified names are matched before the existing IR ID validation rejects them',async()=>{
 const root=fixture();fs.mkdirSync(path.join(root,'features/f.with.dot/works'),{recursive:true});
 fs.writeFileSync(path.join(root,'features/f.with.dot/feature.ts'),`import {feature} from '@joplo-app/kit';export default feature({name:'Choice',goal:'Test',cases:{}});`);
 fs.copyFileSync(path.join(root,'works/good.tsx'),path.join(root,'features/f.with.dot/works/good.with.dot.tsx'));
 await expect(generateResources(root,{work:'f.with.dot.good.with.dot',dryRun:true})).rejects.toThrow('entryIds.0');
},20000);
it('cross-work continuation outside the selection reports a dependency error',async()=>{
 const root=fixture(),file=path.join(root,'works/good.tsx');
 fs.writeFileSync(file,fs.readFileSync(file,'utf8').replace("chapter('Start')","chapter('Start',{from:'other.start'})"));
 await expect(generateResources(root,{work:'good',dryRun:true})).rejects.toThrow(/FROM|from/);
},20000);
