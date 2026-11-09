import { afterEach, expect, test, vi } from 'vitest';
import { mkdtemp, mkdir, readFile, writeFile, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { gzipSync } from 'node:zlib';
import { archiveFiles, defaultTemplateSpec, loadTemplate, parseTemplate } from '../src/templates.ts';
import { initProject } from '../src/init.ts';

const dirs:string[]=[];
afterEach(async()=>{await Promise.all(dirs.splice(0).map(d=>rm(d,{recursive:true,force:true})));});
async function temp(){const d=await mkdtemp(join(tmpdir(),'joplo-template-'));dirs.push(d);return d;}
// Construct the archive bytes ourselves so malformed names are not normalized by a tar writer.
function tar(entries:Record<string,string>,type='0'){
 const parts:Buffer[]=[];
 for(const [name,body] of Object.entries(entries)){
  const bytes=Buffer.from(body),header=Buffer.alloc(512);
  header.write(name,0,100);header.write('0000644\0',100);header.write('0000000\0',108);header.write('0000000\0',116);
  header.write(bytes.length.toString(8).padStart(11,'0')+'\0',124);header.write('00000000000\0',136);header.fill(32,148,156);header.write(type,156);header.write('ustar\0',257);header.write('00',263);
  header.write([...header].reduce((a,b)=>a+b,0).toString(8).padStart(6,'0')+'\0 ',148);
  parts.push(header,bytes,Buffer.alloc((512-bytes.length%512)%512));
 }
 return gzipSync(Buffer.concat([...parts,Buffer.alloc(1024)]));
}
const fixture=()=>tar({'repo/templates/starter/package.json':'{"name":"__PACKAGE_NAME__","devDependencies":{"joplo":"__JOPLO_VERSION__"}}','repo/templates/starter/joplo.config.ts':'export default { name: "__PROJECT_NAME__", plugins: [] };'});
const reply=(bytes=fixture())=>new Response(new Uint8Array(bytes));
test('default is the exact CLI tag; custom refs/subdirectories and local paths are supported',()=>{
 expect(defaultTemplateSpec('2.3.4')).toBe('github:Joplo-app/Joplo/templates/starter#v2.3.4');
 expect(parseTemplate('github:owner/repo/templates/team#feature/name')).toEqual({kind:'github',owner:'owner',repo:'repo',subdir:'templates/team',ref:'feature/name'});
 expect(parseTemplate('./templates/starter').kind).toBe('local');
 expect(()=>parseTemplate('github:owner/repo/../secret')).toThrow(/模板/);
});
test('anonymous download selects only requested subdirectory and initializes exact versions',async()=>{
 const parent=await temp(),root=join(parent,'new-project');const fetcher=vi.fn(async()=>reply());
 const r=await initProject(root,'Quote " and newline\n project',{skill:false,templateDeps:{fetch:fetcher as typeof fetch,env:{},ghToken:()=>undefined,localStarter:null}});
 expect(fetcher.mock.calls[0]![0]).toContain('codeload.github.com/Joplo-app/Joplo/tar.gz/v');
 expect(r.version).toBe(JSON.parse(await readFile(join(root,'package.json'),'utf8')).devDependencies.joplo);
 expect(await readFile(join(root,'joplo.config.ts'),'utf8')).toContain('Quote \\" and newline\\n project');
 expect(r.written).toEqual(['package.json','joplo.config.ts']);
});
test.each(['env','gh'])('private token from %s reaches only GitHub API, never codeload or files',async source=>{
 const token='private-test-token';const fetcher=vi.fn(async(url:unknown)=>String(url).startsWith('https://api.github.com')?new Response(null,{status:302,headers:{location:'https://codeload.github.com/owner/repo/legacy.tar.gz/ref'}}):reply());
 const result=await loadTemplate('2.0.0','github:owner/repo/templates/starter#ref',{env:source==='env'?{GITHUB_TOKEN:token}:{},ghToken:()=>source==='gh'?token:undefined,fetch:fetcher as typeof fetch});
 expect(fetcher.mock.calls[0]![1]).toMatchObject({headers:{Authorization:`Bearer ${token}`}});
 expect(fetcher.mock.calls[1]![1]).not.toHaveProperty('headers');
 expect([...result.files.values()].map(x=>x.toString()).join('')).not.toContain(token);
});
test.each([401,403,404,500])('HTTP %s reports Chinese recovery and leaves no project directory',async status=>{
 const root=join(await temp(),'new');
 await expect(initProject(root,undefined,{templateDeps:{localStarter:null,env:{GITHUB_TOKEN:'never-print-me'},fetch:vi.fn(async()=>new Response(null,{status})) as typeof fetch}})).rejects.toThrow(/--template <本地路径>/);
 await expect(stat(root)).rejects.toMatchObject({code:'ENOENT'});
});
test('offline, bad archive, missing subdirectory, unsafe redirects never expose token or leave files',async()=>{
 for(const fetcher of [async()=>{throw Error('offline token-secret');},async()=>reply(Buffer.from('not tar')),async()=>reply(tar({'repo/elsewhere/file':'a'})),async()=>new Response(null,{status:302,headers:{location:'https://evil.example/archive'}})]){
  const root=join(await temp(),'new');
  try{await initProject(root,undefined,{templateDeps:{localStarter:null,env:{GITHUB_TOKEN:'token-secret'},fetch:fetcher as typeof fetch}});expect.fail('must reject');}catch(e){expect(String(e)).toContain('--template <本地路径>');expect(String(e)).not.toContain('token-secret');}
  await expect(stat(root)).rejects.toMatchObject({code:'ENOENT'});
 }
});
test.each(['repo/../escape','/absolute','repo/dir/../../escape','repo/dir\\escape'])('rejects archive traversal %s',async name=>{await expect(archiveFiles(tar({[name]:'danger'}),'')).rejects.toThrow(/模板/);});
test('rejects links and archive file/directory collisions',async()=>{
 await expect(archiveFiles(tar({'repo/link':'target'},'2'),'')).rejects.toThrow();
 await expect(archiveFiles(tar({'repo/file':'a','repo/file/child':'b'}),'')).rejects.toThrow();
});
test('empty or incomplete local templates fail before creating target; existing files are preserved',async()=>{
 const source=await temp(),target=join(await temp(),'new');
 await expect(initProject(target,undefined,{template:source})).rejects.toThrow(/--template <本地路径>/);
 await writeFile(join(source,'joplo.config.ts'),'export default {}');
 await expect(initProject(target,undefined,{template:source})).rejects.toThrow(/package.json/);
 await expect(stat(target)).rejects.toMatchObject({code:'ENOENT'});
 await writeFile(join(source,'package.json'),'{}');await mkdir(target);await writeFile(join(target,'AGENTS.md'),'mine\n');
 await initProject(target,undefined,{template:source,skill:false});expect(await readFile(join(target,'AGENTS.md'),'utf8')).toBe('mine\n');
});
