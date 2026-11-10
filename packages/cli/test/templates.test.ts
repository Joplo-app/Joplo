import { afterEach, describe, expect, test, vi } from 'vitest';
import { mkdtemp, mkdir, readFile, writeFile, rm, stat, readdir, symlink } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fixtureArchive, releaseFixture, tar } from '../../../scripts/test/init-fixture.ts';
import { archiveFiles, defaultTemplateSpec, loadTemplate, parseTemplate, renderTemplate } from '../src/templates.ts';
import { initProject, initSummary } from '../src/init.ts';
import { skillFiles, installSkill, pluginSkillFiles, pluginSkillManifest } from '../src/skill.ts';
import { checkWithProject } from '../src/check.ts';
import { entriesOf, stateAt } from '@joplo-app/core';
import { runCli } from '../src/cli.ts';
import ui from '../../../plugins/ui/src/plugin.ts';

const dirs:string[]=[];
afterEach(async()=>{await Promise.all(dirs.splice(0).map(d=>rm(d,{recursive:true,force:true})));});
async function temp(){const d=await mkdtemp(join(tmpdir(),'joplo-template-'));dirs.push(d);return d;}
const fixture=()=>tar({'repo/starter/package.json':'{"name":"__PACKAGE_NAME__","devDependencies":{"joplo":"__JOPLO_VERSION__"}}','repo/starter/joplo.config.ts':'export default { name: "__PROJECT_NAME__", plugins: [] };'});
const reply=(bytes=fixture())=>new Response(new Uint8Array(bytes));
test('default selects the template repository default branch; custom refs/subdirectories and local paths are supported',()=>{
 expect(defaultTemplateSpec()).toBe('github:Joplo-app/joplo-templates/starter');
 expect(parseTemplate('github:owner/repo/templates/team#feature/name')).toEqual({kind:'github',owner:'owner',repo:'repo',subdir:'templates/team',ref:'feature/name'});
 expect(parseTemplate('./local-source').kind).toBe('local');
 expect(()=>parseTemplate('github:owner/repo/../secret')).toThrow(/模板/);
});
test('anonymous download selects only requested subdirectory and initializes exact versions',async()=>{
 const parent=await temp(),root=join(parent,'new-project');const fetcher=vi.fn(async()=>reply());
 const r=await initProject(root,'Quote " and newline\n project',{skill:false,templateDeps:{fetch:fetcher as typeof fetch,env:{},ghToken:()=>undefined}});
 expect(fetcher.mock.calls[0]![0]).toContain('codeload.github.com/Joplo-app/joplo-templates/tar.gz/HEAD');
 expect(r.version).toBe(JSON.parse(await readFile(join(root,'package.json'),'utf8')).devDependencies.joplo);
 expect(await readFile(join(root,'joplo.config.ts'),'utf8')).toContain('Quote \\" and newline\\n project');
 expect(r.written).toEqual(['package.json','joplo.config.ts']);
});
test.each(['env','gh'])('private token from %s reaches only GitHub API, never codeload or files',async source=>{
 const token='private-test-token';const fetcher=vi.fn(async(url:unknown)=>String(url).startsWith('https://api.github.com')?new Response(null,{status:302,headers:{location:'https://codeload.github.com/owner/repo/legacy.tar.gz/ref'}}):reply());
 const result=await loadTemplate('github:owner/repo/starter#ref',{env:source==='env'?{GITHUB_TOKEN:token}:{},ghToken:()=>source==='gh'?token:undefined,fetch:fetcher as typeof fetch});
 expect(fetcher.mock.calls[0]![1]).toMatchObject({headers:{Authorization:`Bearer ${token}`}});
 expect(fetcher.mock.calls[1]![1]).not.toHaveProperty('headers');
 expect([...result.files.values()].map(x=>x.toString()).join('')).not.toContain(token);
});
test.each([401,403,404,500])('HTTP %s reports Chinese recovery and leaves no project directory',async status=>{
 const root=join(await temp(),'new');
 await expect(initProject(root,undefined,{templateDeps:{env:{GITHUB_TOKEN:'never-print-me'},fetch:vi.fn(async()=>new Response(null,{status})) as typeof fetch}})).rejects.toThrow(/--template <本地路径>/);
 await expect(stat(root)).rejects.toMatchObject({code:'ENOENT'});
});
test('offline, bad archive, missing subdirectory, unsafe redirects never expose token or leave files',async()=>{
 for(const fetcher of [async()=>{throw Error('offline token-secret');},async()=>reply(Buffer.from('not tar')),async()=>reply(tar({'repo/elsewhere/file':'a'})),async()=>new Response(null,{status:302,headers:{location:'https://evil.example/archive'}})]){
  const root=join(await temp(),'new');
  try{await initProject(root,undefined,{templateDeps:{env:{GITHUB_TOKEN:'token-secret'},fetch:fetcher as typeof fetch}});expect.fail('must reject');}catch(e){expect(String(e)).toContain('--template <本地路径>');expect(String(e)).not.toContain('token-secret');}
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

// Bare names are reserved for the product, regardless of directories in cwd.
test.each(['starter', 'work', 'new-show-2', '0'])('built-in %s downloads only its default-branch repository subdirectory', async name => {
 const fetcher = vi.fn(async () => reply(tar({
  [`repo/${name}/package.json`]: '{"name":"__PACKAGE_NAME__"}',
  [`repo/${name}/joplo.config.ts`]: 'export default {}',
  'repo/other/private.txt': 'not selected',
 })));
 const result = await loadTemplate(name, { env:{}, ghToken:()=>undefined, fetch:fetcher as typeof fetch});
 expect(result.source).toBe(`github:Joplo-app/joplo-templates/${name}`);
 expect([...result.files.keys()]).toEqual(['package.json', 'joplo.config.ts']);
 expect(fetcher.mock.calls[0]![0]).toBe('https://codeload.github.com/Joplo-app/joplo-templates/tar.gz/HEAD');
});
test.each(['work#main', 'starter%2fsecret', '', 'Work', 'work_show', '-work', 'work?', 'work:secret', 'a b', '中', 'work\0'])('invalid bare name %j fails before download or destination creation', async name => {
 const fetcher = vi.fn(); const target = join(await temp(), 'new');
 await expect(initProject(target, undefined, {template:name, templateDeps:{fetch:fetcher}})).rejects.toThrow(/名称.*小写.*数字.*连字符/);
 expect(fetcher).not.toHaveBeenCalled();
 await expect(stat(target)).rejects.toMatchObject({code:'ENOENT'});
});
test('a new name needs no CLI release; missing directory links to the template repository', async () => {
 const target=join(await temp(),'missing');
 const fetcher=vi.fn(async()=>reply(tar({'repo/starter/package.json':'{}','repo/starter/joplo.config.ts':'export default {}'})));
 await expect(initProject(target,undefined,{template:'new-template',templateDeps:{env:{},ghToken:()=>undefined,fetch:fetcher as typeof fetch}})).rejects.toThrow(/模板仓库里没有这个模板.*https:\/\/github.com\/Joplo-app\/joplo-templates/);
 expect(fetcher.mock.calls[0]![0]).toBe('https://codeload.github.com/Joplo-app/joplo-templates/tar.gz/HEAD');
 await expect(stat(target)).rejects.toMatchObject({code:'ENOENT'});
 expect(parseTemplate('github:owner/repo/team')).toEqual({kind:'github',owner:'owner',repo:'repo',subdir:'team',ref:'HEAD'});
});

test('a template without plugin guides still installs engine skills and explains the next step', async () => {
 const root=join(await temp(),'plain');
 const result=await initProject(root,undefined,{templateDeps:{env:{},ghToken:()=>undefined,fetch:vi.fn(async()=>reply(fixtureArchive('starter',false))) as typeof fetch}});
 expect(result.skill?.error).toBeUndefined(); expect(result.skill?.pendingPlugins).toBe(true);
 for(const f of skillFiles(result.version))expect(await readFile(join(root,'.claude/skills',f.path))).toEqual(f.content);
 await expect(stat(join(root,'.claude/skills/joplo-plugin-ui'))).rejects.toMatchObject({code:'ENOENT'});
 expect(initSummary(result,{}).join('\n')).toContain('after installing dependencies run npx joplo skill install');
 expect(initSummary(result,{}).join('\n')).not.toContain('guides are ready');
});
test.each(['../work', '/work', 'local/work', 'work/secret', 'work\\secret', './work', '.work', 'C:\\work'])('path %j never resolves as a built-in', spec => {
 expect(parseTemplate(spec)).toEqual({kind:'local',dir:resolve(spec)});
});
test('a same-named local work directory requires ./work; built-in wins', async () => {
 const cwd = process.cwd(), base = await temp();
 await mkdir(join(base,'work')); await writeFile(join(base,'work/package.json'), '{"local":true}');
 await writeFile(join(base,'work/joplo.config.ts'), 'export default {}');
 try {
  process.chdir(base);
  const builtin = await loadTemplate('work', {env:{},ghToken:()=>undefined,fetch:vi.fn(async()=>reply(fixtureArchive('work'))) as typeof fetch});
  expect(builtin.files.has('works/explainer.tsx')).toBe(true);
  const local = await loadTemplate('./work');
  expect(JSON.parse(local.files.get('package.json')!.toString())).toEqual({local:true});
 } finally { process.chdir(cwd); }
});
async function fileTree(root:string, base=''):Promise<Record<string,string>> {
 const files:Record<string,string>={};
 for(const e of await readdir(join(root,base),{withFileTypes:true})) {
  if(['node_modules','.joplo','dist'].includes(e.name))continue;
  const path = base ? `${base}/${e.name}` : e.name;
  if(e.isDirectory())Object.assign(files,await fileTree(root,path));
  else files[path]=(await readFile(join(root,path))).toString('base64');
 }
 return Object.fromEntries(Object.entries(files).sort());
}
test('default, explicit starter and the offline fixture produce identical project files', async () => {
 const roots = await Promise.all([undefined,'starter',releaseFixture('feature')].map(async template => {
  const root=join(await temp(),'same-name'); await initProject(root,'Same project',{template,templateDeps:{env:{},ghToken:()=>undefined,fetch:vi.fn(async()=>reply(fixtureArchive('starter',false))) as typeof fetch}}); return root;
 }));
 const trees = await Promise.all(roots.map(r=>fileTree(r)));
 expect(trees[0]).toEqual(trees[1]); expect(trees[0]).toEqual(trees[2]);
 // Local fixtures and downloaded bytes pass through the same rendering path.
 const source = await loadTemplate(releaseFixture('feature'));
 const version=JSON.parse(await readFile(join(roots[0]!,'package.json'),'utf8')).devDependencies.joplo;
 for(const [path,bytes] of renderTemplate(source.files,{version,packageName:'same-name',projectName:'Same project'}))if(!path.startsWith('.claude/'))expect(trees[0]![path]).toBe(bytes.toString('base64'));
});
test('work init installs the shared skills before dependencies, then compiles two continuing chapters with 0 errors and warnings', async () => {
 const root=join(await temp(),'show'); const result=await initProject(root, 'My show', {template:'work',templateDeps:{env:{},ghToken:()=>undefined,fetch:vi.fn(async()=>reply(fixtureArchive('work'))) as typeof fetch}});
 expect(result.skill?.error).toBeUndefined(); expect(result.skill?.pendingPlugins).toBe(true);
 for(const file of skillFiles(result.version))expect(await readFile(join(root,'.claude/skills',file.path))).toEqual(file.content);
 const guides=pluginSkillFiles(result.version,[{...ui,version:result.version}]);
 const bundled=pluginSkillFiles('0.0.1',[{...ui,version:'0.0.1'}]);
 for(const file of bundled)expect(await readFile(join(root,'.claude/skills',file.path))).toEqual(file.content);
 expect(await readFile(join(root,'.claude/skills/.joplo-plugins.json'))).toEqual(pluginSkillManifest(bundled));
 expect(await readFile(join(root,'AGENTS.md'),'utf8')).toContain('<!-- joplo:start -->');
 const tree=await fileTree(root);
 expect(Object.keys(tree).filter(p=>!p.startsWith('.claude/')&&p!=='AGENTS.md')).toEqual(['.gitignore','joplo.config.ts','package.json','tsconfig.json','works/explainer.tsx']);
 const pkg=JSON.parse(await readFile(join(root,'package.json'),'utf8'));
 expect(pkg.type).toBe('module'); expect(Object.values(pkg.devDependencies)).toEqual([result.version,result.version,result.version]);
 expect(await readFile(join(root,'joplo.config.ts'),'utf8')).toContain('My show');
 await symlink(resolve('node_modules'),join(root,'node_modules'));
 const synced=await installSkill(root,result.version,{agentsMd:true}); expect(synced.code).toBe(0); expect(synced.written).toEqual(guides.map(f=>`.claude/skills/${f.path}`));
 for(const file of guides)expect(await readFile(join(root,'.claude/skills',file.path))).toEqual(file.content);
 const report=await checkWithProject(root); expect(report.summary).toMatchObject({error:0,warning:0});
 expect(report.project).not.toBeNull(); const project=report.project!;
 expect(Object.keys(project.features)).toEqual([]);
 const entries=entriesOf(project); expect(entries).toHaveLength(1);
 expect(entries[0]).toMatchObject({id:'explainer',featureId:null,sequencing:'linear'});
 expect(entries[0]!.slices).toHaveLength(2);
 const [first,second]=Object.values(project.scenarios);
 expect(second!.from).toBe(first!.id);
 const ending=stateAt(project,first!.id,first!.steps.length);
 expect(second!.initial.ui).toEqual(ending.ui); expect(second!.initial.inputs).toEqual(ending.inputs);
 const typed=stateAt(project,second!.id,1);
 expect(typed.inputs.message).toBe('A show you can try');
 expect(typed.ui.message).toBe(typed.inputs.message);
 const source=await readFile(join(root,'works/explainer.tsx'),'utf8');
 expect(source).not.toMatch(/\bcases\s*:|\bpick\s*:|\bfrom\s*:/);
 // A visible literal is source-editable; changing it must reach the compiled scene.
 await writeFile(join(root,'works/explainer.tsx'),source.replace('Change this line. Change the picture.','My own show.'));
 const edited=await checkWithProject(root); expect(JSON.stringify(edited.project!.scenes)).toContain('My own show.');
});
test('init help explains built-in priority and explicit local paths', async () => {
 let out=''; expect(await runCli(['init','--help'],{stdout:s=>{out+=s;},stderr:()=>{}})).toBe(0);
 expect(out).toContain('starter'); expect(out).toContain('work'); expect(out).toContain('./work'); expect(out).toContain('default branch'); expect(out).toContain('https://github.com/Joplo-app/joplo-templates');
});


describe('模板下载的空闲超时', () => {
  const slow = (bytes: Buffer, gapMs: number, stallAfter = Infinity) => async (_url: string | URL | Request, init?: RequestInit) => {
    const signal = init?.signal as AbortSignal | undefined;
    const parts = [bytes.subarray(0, 512), bytes.subarray(512, 1024), bytes.subarray(1024)];
    const body = new ReadableStream<Uint8Array>({
      async start(controller) {
        for (let i = 0; i < parts.length; i++) {
          await new Promise<void>((resolve, reject) => {
            const timer = setTimeout(resolve, i >= stallAfter ? 60_000 : gapMs);
            signal?.addEventListener('abort', () => { clearTimeout(timer); reject(signal.reason); }, { once: true });
          }).catch((e) => { controller.error(e); throw e; });
          controller.enqueue(parts[i]!);
        }
        controller.close();
      },
    });
    return new Response(body, { status: 200 });
  };
  const deps = (fetcher: unknown) => ({ env: {}, ghToken: () => undefined, fetch: fetcher as typeof fetch, idleMs: 80 });

  test('总时长超过空闲上限但一直有数据：下载成功', async () => {
    // 三块各隔 50ms，总共约 150ms > idleMs 80ms；以前的“总时长 30 秒”会在大模板包 + 慢网络下误判失败。
    const result = await loadTemplate('starter', deps(slow(fixture(), 50)));
    expect([...result.files.keys()]).toContain('package.json');
  });

  test('中途停住超过空闲上限：报网络错误并给出离线做法', async () => {
    await expect(loadTemplate('starter', deps(slow(fixture(), 10, 1)))).rejects.toThrow(/--template <本地路径>/);
  });
});
