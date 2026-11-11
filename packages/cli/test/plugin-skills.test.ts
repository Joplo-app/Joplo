import { afterEach, expect, test } from 'vitest';
import { mkdtemp, mkdir, readFile, writeFile, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { installSkill, managedSkillFile, PLUGIN_SKILL_MANIFEST } from '../src/skill.ts';
import { runCli } from '../src/cli.ts';
const dirs:string[]=[];
afterEach(async()=>{await Promise.all(dirs.splice(0).map(d=>rm(d,{recursive:true,force:true})));});
async function temp(){const d=await mkdtemp(join(tmpdir(),'joplo-plugin-skills-'));dirs.push(d);await writeFile(join(d,'package.json'),'{"type":"module"}');return d;}
const base={kind:'plugin',apiVersion:2,id:'test',title:'Test provider',version:'1.0',packageName:'joplo-plugin-test',components:{},skill:'Read this entry before authoring.',skillTopics:{recipe:{description:'A recipe',body:'# Recipe\nUse the project contract.'}}};
async function config(root:string,plugins:unknown[]){await writeFile(join(root,'joplo.config.ts'),`export default ${JSON.stringify({plugins})};\n`);}
const file=(root:string,path:string)=>join(root,'.claude/skills',path);
test('installed plugin skill names route entries and topics, including engine-name collisions',async()=>{
 const root=await temp();await config(root,[base,{...base,id:'check',skill:'Plugin check entry.'},{...base,id:'joplo-plugin-direct',skill:'Existing prefixed plugin id.'}]);
 const cwd=process.cwd();process.chdir(root);
 const read=async(topic:string)=>{let output='';const code=await runCli(['skill',topic],{stdout:s=>{output+=s;},stderr:s=>{output+=s;},loadServer:async()=>{throw Error('guide reads must not load server');}});return {code,output};};
 try {
  expect(await read('joplo-plugin-test')).toEqual(await read('test'));
  expect(await read('joplo-plugin-test/recipe')).toEqual(await read('test/recipe'));
  expect(await read('joplo-plugin-check')).toEqual(await read('plugin:check'));
  expect((await read('check')).output).not.toContain('Plugin check entry.');
  expect((await read('joplo-plugin-direct')).output).toContain('Existing prefixed plugin id.');
  expect(await read('joplo-plugin-joplo-plugin-direct')).toEqual(await read('plugin:joplo-plugin-direct'));
  const disabled=await read('joplo-plugin-missing');
  expect(disabled.code).toBe(2);expect(disabled.output).toContain('not enabled in config.plugins');expect(disabled.output).not.toContain('Did you mean plugins');
  const missing=await read('joplo-plugin-test/missing');
  expect(missing.code).toBe(2);expect(missing.output).toContain('Available: recipe');
 } finally {process.chdir(cwd);}
});
test('config.plugins drives installed entries, topics and index; adding/removing synchronizes only owned files',async()=>{
 const root=await temp();await config(root,[base]);
 const first=await installSkill(root,'1.0');expect(first.code).toBe(0);
 expect(await readFile(file(root,'joplo-plugins/SKILL.md'),'utf8')).toContain('test/recipe');
 expect(await readFile(file(root,'joplo-plugin-test/topics/recipe.md'),'utf8')).toContain('# Recipe');
 await mkdir(file(root,'personal'),{recursive:true});await writeFile(file(root,'personal/SKILL.md'),'mine');
 await config(root,[base,{...base,id:'other',skillTopics:{}}]);
 expect((await installSkill(root,'1.0')).written).toContain('.claude/skills/joplo-plugin-other/SKILL.md');
 await config(root,[]);
 const diff=await installSkill(root,'1.0',{diff:true});expect(diff.output).toContain('+++ /dev/null');
 expect(await readFile(file(root,'joplo-plugin-test/topics/recipe.md'),'utf8')).toContain('# Recipe');
 const removed=await installSkill(root,'1.0');expect(removed.removed).toContain('.claude/skills/joplo-plugin-test/topics/recipe.md');
 await expect(stat(file(root,'joplo-plugin-test/SKILL.md'))).rejects.toMatchObject({code:'ENOENT'});
 expect(await readFile(file(root,'personal/SKILL.md'),'utf8')).toBe('mine');
 expect(JSON.parse(await readFile(file(root,PLUGIN_SKILL_MANIFEST),'utf8')).files).toEqual([]);
});
test('modified plugin topic blocks the whole update/removal; diff is read-only, force is explicit',async()=>{
 const root=await temp();await config(root,[base]);await installSkill(root,'1.0');
 const path=file(root,'joplo-plugin-test/topics/recipe.md');await writeFile(path,'My edited recipe');
 const engineBefore=await readFile(file(root,'joplo/SKILL.md'));
 await config(root,[]);const blocked=await installSkill(root,'2.0');
 expect(blocked.code).toBe(1);expect(blocked.written).toEqual([]);expect(blocked.removed).toEqual([]);
 expect(await readFile(file(root,'joplo/SKILL.md'))).toEqual(engineBefore);
 expect((await installSkill(root,'2.0',{diff:true})).output).toContain('-My edited recipe');
 expect(await readFile(path,'utf8')).toBe('My edited recipe');
 expect((await installSkill(root,'2.0',{force:true})).code).toBe(0);
 await expect(stat(path)).rejects.toMatchObject({code:'ENOENT'});
});
test('missing dependency and corrupt manifest preserve installed skills; outside project installs only engine',async()=>{
 const root=await temp();const initial=await installSkill(root,'1.0');expect(initial.output).toContain('engine skills only');
 await writeFile(join(root,'joplo.config.ts'),"import p from 'uninstalled-author-package';export default {plugins:[p]}");
 await expect(installSkill(root,'2.0')).rejects.toThrow('No skills were changed');
 const before=await readFile(file(root,'joplo/SKILL.md'));expect(before.toString()).toContain('joplo-skill 1.0');
 await config(root,[base]);await writeFile(file(root,PLUGIN_SKILL_MANIFEST),JSON.stringify({format:1,files:['../../outside']}));
 await expect(installSkill(root,'2.0')).rejects.toThrow('manifest paths');
 expect(await readFile(file(root,'joplo/SKILL.md'))).toEqual(before);
});
test('template guides before dependencies use the same modification protection',async()=>{
 const root=await temp();const guide=managedSkillFile('joplo-plugin-test','joplo-plugin-test/SKILL.md','# Template plugin','1.0');
 await installSkill(root,'1.0',{engineOnly:true,templateSkills:[guide],agentsMd:true});
 const p=file(root,guide.path);await writeFile(p,'edited');
 const result=await installSkill(root,'2.0',{engineOnly:true,templateSkills:[guide],agentsMd:true});
 expect(result.code).toBe(1);expect(await readFile(p,'utf8')).toBe('edited');
});

test('malformed or duplicate config.plugins never silently removes installed plugin skills',async()=>{
 const root=await temp();await config(root,[base]);await installSkill(root,'1.0');
 const path=file(root,'joplo-plugin-test/SKILL.md'),before=await readFile(path);
 for(const plugins of [[{...base,apiVersion:1}],[base,base],['invalid']]){
  await config(root,plugins);await expect(installSkill(root,'1.0')).rejects.toThrow(/Invalid joplo\.config\.ts: config\.plugins.*No skills were changed/);
  expect(await readFile(path)).toEqual(before);
 }
});

test('config.plugins entry that is an uncalled factory names the index and suggests calling it (#60)',async()=>{
 const root=await temp();
 await writeFile(join(root,'joplo.config.ts'),`const ok=${JSON.stringify(base)};\nexport function alda(scores){return {...ok,id:'alda'};}\nexport default {plugins:[ok,alda]};\n`);
 const err=await installSkill(root,'1.0').catch(e=>e as Error);
 expect(err.message).toContain('config.plugins[1] is a function (alda)');
 expect(err.message).toContain('plugins: [alda(…)]');
 expect(err.message).not.toContain('Install this project');
});
