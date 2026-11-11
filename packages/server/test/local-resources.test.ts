import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { LocalResources, inlineResources } from '../src/local-resources.ts';
const dirs: string[] = [];
afterEach(() => dirs.splice(0).forEach(d => fs.rmSync(d, { recursive: true, force: true })));
function setup(version = '1', body = `return new Uint8Array([82,73,70,70]);`) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'joplo-local-')); dirs.push(dir);
  const entry = path.join(dir, 'local.mjs');
  fs.writeFileSync(entry, `export default { compilers: { wav: { version: '${version}', mime: 'audio/wav', async compile(input, ctx) { ${body} } } } };`);
  const req = { id: 'asset', plugin: 'fake', compiler: 'wav', input: 'private-score', source: 'music.ts:12:3' };
  return { dir, entry, req, host: new LocalResources(dir, { fake: entry }) };
}
it('deduplicates concurrent work, persists content cache and invalidates compiler versions', async () => {
  const x = setup();
  // Count invocations through a project-owned file, shared by separate worker processes.
  fs.writeFileSync(x.entry, `import fs from 'node:fs'; export default { compilers: { wav: {version:'1',mime:'audio/wav', async compile(input) { fs.appendFileSync(${JSON.stringify(path.join(x.dir, 'calls'))}, 'x'); await new Promise(r=>setTimeout(r,30)); return new TextEncoder().encode(input); } } } };`);
  const results = await Promise.all(Array.from({ length: 8 }, () => x.host.ensure(x.req)));
  expect(results.every(r => r.url?.startsWith('data:audio/wav;base64,'))).toBe(true);
  expect(fs.readFileSync(path.join(x.dir, 'calls'), 'utf8')).toBe('x');
  await new LocalResources(x.dir, { fake: x.entry }).ensure(x.req);
  expect(fs.readFileSync(path.join(x.dir, 'calls'), 'utf8')).toBe('x');
  fs.writeFileSync(x.entry, fs.readFileSync(x.entry, 'utf8').replace("version:'1'", "version:'2'"));
  await new LocalResources(x.dir, { fake: x.entry }).ensure(x.req);
  expect(fs.readFileSync(path.join(x.dir, 'calls'), 'utf8')).toBe('xx');
  await new LocalResources(x.dir, { fake: x.entry }).ensure({ ...x.req, input: 'changed score' });
  expect(fs.readFileSync(path.join(x.dir, 'calls'), 'utf8')).toBe('xxx');
});
it.each([
  ['throw Object.assign(new Error("tool missing"), {code:"ENOENT"})', 'LOCAL_RESOURCE_FAILED'],
  ['throw new Error("syntax error at line 2")', 'LOCAL_RESOURCE_FAILED'],
  ['await new Promise(()=>{})', 'LOCAL_RESOURCE_TIMEOUT'],
  ['return new Uint8Array(1025)', 'LOCAL_RESOURCE_TOO_LARGE'],
])('turns local failure into located warnings: %s', async (body, code) => {
  const x = setup('1', body);
  const r = await x.host.ensure(x.req, { timeoutMs: code === 'LOCAL_RESOURCE_TIMEOUT' ? 200 : 5000, maxBytes: 1024 });
  expect(r.url).toBeUndefined();
  expect(r.diagnostic).toMatchObject({ severity: 'warning', code, at: 'music.ts:12:3' });
});
it('inlines only referenced artifacts, never local paths or source', async () => {
  const x = setup();
  const project: any = { scenarios: { s: { media: {}, steps: [{ media: { 'fake:bgm': { resource: 'asset' } } }] } } };
  const out = await inlineResources(project, [x.req, { ...x.req, id: 'unused', input: 'unused' }], x.host);
  expect(Object.keys(out.assets)).toEqual(['asset']);
  expect(out.assets.asset).toMatch(/^data:audio\/wav;base64,/);
  expect(JSON.stringify(out)).not.toContain('private-score');
  expect(JSON.stringify(out)).not.toContain(x.dir);
});
it('shares the content lock across independent author processes', async () => {
  const { spawn } = await import('node:child_process');
  const { pathToFileURL } = await import('node:url');
  const x = setup();
  const calls = path.join(x.dir, 'calls');
  fs.writeFileSync(x.entry, `import fs from 'node:fs';export default {compilers:{wav:{version:'1',mime:'audio/wav',async compile(){fs.appendFileSync(${JSON.stringify(calls)},'x');await new Promise(r=>setTimeout(r,250));return new Uint8Array([1,2,3]);}}}};`);
  const code = `import {LocalResources} from ${JSON.stringify(pathToFileURL(path.resolve('packages/server/src/local-resources.ts')).href)};const h=new LocalResources(${JSON.stringify(x.dir)},{fake:${JSON.stringify(x.entry)}});const r=await h.ensure(${JSON.stringify(x.req)});if(!r.url)throw new Error(JSON.stringify(r));`;
  const run = () => new Promise<void>((resolve, reject) => {
    const child = spawn(process.execPath, ['--import','tsx','--input-type=module','-e',code], {cwd:process.cwd(),stdio:['ignore','ignore','pipe']});
    let error='';child.stderr.on('data',b=>error+=b);child.on('error',reject);child.on('exit',status=>status===0?resolve():reject(new Error(error)));
  });
  await Promise.all([run(),run()]);
  expect(fs.readFileSync(calls,'utf8')).toBe('x');
  expect(fs.readdirSync(path.join(x.dir,'.joplo/resources')).some(f=>f.endsWith('.lock'))).toBe(false);
},15000);
it('inspects metadata without rendering, caches success, and invalidates the SoundFont identity', async()=>{
 const x=setup();
 const write=(hash:string)=>fs.writeFileSync(x.entry,`import fs from 'node:fs';export default {compilers:{wav:{version:'font-${hash}-renderer-1-encoder-1',mime:'audio/flac',async inspect(){fs.appendFileSync(${JSON.stringify(path.join(x.dir,'inspections'))},'x');return {durationMs:8000,markers:{chapter:2000},parts:{piano:4}}},compile(){fs.appendFileSync(${JSON.stringify(path.join(x.dir,'renders'))},'x');return new TextEncoder().encode('${hash}')}}}};`);
 write('aaa');const first=await x.host.inspect(x.req);
 expect(first.info).toMatchObject({durationMs:8000,markers:{chapter:2000}});
 expect((await new LocalResources(x.dir,{fake:x.entry}).inspect(x.req)).info).toEqual(first.info);
 expect(fs.readFileSync(path.join(x.dir,'inspections'),'utf8')).toBe('x');
 expect(fs.existsSync(path.join(x.dir,'renders'))).toBe(false);
 const rendered=await x.host.ensure(x.req);
 write('bbb');await new LocalResources(x.dir,{fake:x.entry}).inspect(x.req);
 expect(fs.readFileSync(path.join(x.dir,'inspections'),'utf8')).toBe('xx');
 const changed=await new LocalResources(x.dir,{fake:x.entry}).ensure(x.req);
 expect(changed.url).not.toBe(rendered.url);
 expect(fs.readFileSync(path.join(x.dir,'renders'),'utf8')).toBe('xx');
});
it('recovers artifact credits without score inspection and refuses an unattributed cached artifact',async()=>{
 const x=setup();
 fs.writeFileSync(x.entry,`import fs from 'node:fs';export default {compilers:{wav:{version:'artifact-v1',mime:'audio/mpeg',requiresAttribution:true,inspect(){if(fs.existsSync(${JSON.stringify(path.join(x.dir,'no-alda'))}))throw new Error('Alda unavailable');return {durationMs:1000}},compile(){return {bytes:new Uint8Array([1,2,3]),credit:'Bank authors',license:'Full MIT text'}}}}};`);
 const project:any={scenarios:{s:{steps:[{media:{bgm:{resource:'asset'}}}]}}};
 const first=await inlineResources(project,[x.req],x.host);expect(first.credits).toEqual(['Bank authors']);
 for(const f of fs.readdirSync(path.join(x.dir,'.joplo/resources')).filter(f=>f.endsWith('.info.json')))fs.unlinkSync(path.join(x.dir,'.joplo/resources',f));
 fs.writeFileSync(path.join(x.dir,'no-alda'),'');
 const cached=await inlineResources(project,[x.req],new LocalResources(x.dir,{fake:x.entry}));
 expect(cached.assets.asset).toBe(first.assets.asset);expect(cached.licenses).toContain('Full MIT text');
 expect(cached.diagnostics.some(d=>d.code==='LOCAL_RESOURCE_INSPECTION_FAILED')).toBe(true);
 for(const f of fs.readdirSync(path.join(x.dir,'.joplo/resources')).filter(f=>f.endsWith('.json'))){const p=path.join(x.dir,'.joplo/resources',f);const v=JSON.parse(fs.readFileSync(p,'utf8'));if(v.url){delete v.credit;fs.writeFileSync(p,JSON.stringify(v));}}
 const refused=await inlineResources(project,[x.req],new LocalResources(x.dir,{fake:x.entry}));
 expect(refused.assets).toEqual({});expect(refused.diagnostics).toContainEqual(expect.objectContaining({severity:'error',code:'LOCAL_RESOURCE_ATTRIBUTION_MISSING'}));
});
it('rejects corrupt cached envelopes and regenerates instead of returning unchecked data',async()=>{
 const x=setup();const first=await x.host.ensure(x.req);expect(first.url).toBeTypeOf('string');
 const file=fs.readdirSync(path.join(x.dir,'.joplo/resources')).find(f=>f.endsWith('.json'))!;
 const cache=path.join(x.dir,'.joplo/resources',file);const value=JSON.parse(fs.readFileSync(cache,'utf8'));
 fs.writeFileSync(cache,JSON.stringify({...value,url:123}));
 expect((await new LocalResources(x.dir,{fake:x.entry}).ensure(x.req)).url).toBe(first.url);
});

it.each([[82944, 6542, false], [200000, 15000, true], [2100000, 6542, true], [112320, 9000, false]])('audio budget: %i bytes / %i ms warns=%s', async (bytes, durationMs, warn) => {
  const x = setup();
  fs.writeFileSync(x.entry, `export default {compilers:{wav:{version:'budget-1',mime:'audio/mpeg',inspect(){return {durationMs:${durationMs}}},compile(){return new Uint8Array(${bytes})}}}};`);
  const project: any = { scenarios: { s: { media: {}, steps: [{ media: { 'fake:bgm': { resource: 'asset' } } }] } } };
  const result = await inlineResources(project, [x.req], x.host);
  expect(result.diagnostics.some(d => d.code === 'MEDIA_ASSET_LARGE')).toBe(warn);
});

it('inspects project-relative files without spending context or inherited credential variables', async()=>{
 const x=setup();
 fs.writeFileSync(path.join(x.dir,'source.txt'),'project source');
 const previous=process.env.JOPLO_INSPECT_TEST_SECRET;process.env.JOPLO_INSPECT_TEST_SECRET='private';
 try {
 fs.writeFileSync(x.entry,`import fs from 'node:fs';import path from 'node:path';export default {compilers:{wav:{version:'inspect-root',mime:'audio/wav',inspect(input,ctx){if('keys' in ctx||'allowSpend' in ctx||process.env.JOPLO_INSPECT_TEST_SECRET)throw new Error('authorization leaked');if(ctx.directory===ctx.projectDir)throw new Error('job isolation lost');return {credit:fs.readFileSync(path.join(ctx.projectDir,input),'utf8')}},compile(){throw new Error('must not render')}}}};`);
 expect(await x.host.inspect({...x.req,input:'source.txt'})).toEqual({info:{credit:'project source'}});
 }finally{if(previous===undefined)delete process.env.JOPLO_INSPECT_TEST_SECRET;else process.env.JOPLO_INSPECT_TEST_SECRET=previous;}
});
