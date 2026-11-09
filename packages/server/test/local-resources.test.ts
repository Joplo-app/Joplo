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
