import { createHash } from 'node:crypto';
import { access, mkdir, readFile, writeFile, unlink } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { agentsBlock, agentSkills, JoploError, skillMarkdown, skillTopic, SKILL_TOPICS, pluginSkillTopic, type PluginSkillSource } from '@joplo-app/core';

import { projectPlugins } from './plugins.ts';

const SKILL_DIR = '.claude/skills';
const START = '<!-- joplo:start -->';
const END = '<!-- joplo:end -->';
export type InstallSkillOptions = { force?: boolean; diff?: boolean; agentsMd?: boolean; engineOnly?: boolean; templateSkills?: SkillFile[] };

/** 每次运行从当前 CLI 的包元数据读取，不另存一份版本常量。 */
export async function readCliVersion(file = new URL('../package.json', import.meta.url)): Promise<string> {
  const metadata: unknown = JSON.parse(await readFile(file, 'utf8'));
  if (!metadata || typeof metadata !== 'object' || !('version' in metadata) || typeof metadata.version !== 'string' || !metadata.version.trim()) throw new JoploError('INVALID_SCHEMA', 'Cannot read the version from @joplo-app/cli package.json');
  return metadata.version;
}

/**
 * 官方技能（仓库 skills/）与 `skill install` 写进项目的技能共用这一份输出（D64）：
 * 正文来自 core 的 agent-skill.ts，末尾加 `<!-- joplo-skill <版本> sha256:<正文哈希> -->`。
 * 哈希让安装器分辨“没改过的旧生成内容”（可自动更新）与“用户改过”（需 --force）。
 */
export type SkillFile = { name: string; path: string; content: Buffer };
export function managedSkillFile(name: string, path: string, markdown: string, version: string): SkillFile {
  const body=Buffer.from(markdown.trimEnd()+'\n');
  return { name, path, content:Buffer.concat([body,Buffer.from(`<!-- joplo-skill ${version} sha256:${hash(body)} -->\n`)]) };
}
export function skillFiles(version: string): SkillFile[] {
  return [
    ...agentSkills().map(skill => managedSkillFile(skill.name, `${skill.name}/SKILL.md`, skillMarkdown(skill), version)),
    ...SKILL_TOPICS.map(topic => managedSkillFile('joplo', `joplo/topics/${topic.name}.md`, skillTopic(topic.name), version)),
  ];
}
export const PLUGIN_SKILL_MANIFEST = '.joplo-plugins.json';
export function pluginSkillFiles(version: string, plugins: readonly PluginSkillSource[]): SkillFile[] {
  if (!plugins.length) return [];
  const files: SkillFile[]=[];
  const index=['---','name: joplo-plugins','description: Discover the plugins explicitly enabled in this Joplo project and read their installed versioned skills.','---','','# Enabled project plugins','','Source: config.plugins. Run joplo skill install after installing, adding or removing packages.'];
  const seen=new Set<string>();
  for (const p of plugins) {
    if (!/^[a-z][a-z0-9-]{0,49}$/.test(p.id) || seen.has(p.id)) throw new JoploError('INVALID_SCHEMA',`Invalid or duplicate plugin skill id: ${p.id}`);
    seen.add(p.id);
    const name=`joplo-plugin-${p.id}`;
    const topicLinks=Object.entries(p.skillTopics??{}).map(([key,t])=>{
      if (!/^[a-z][a-z0-9-]*$/.test(key) || !t || typeof t.body!=='string' || typeof t.description!=='string') throw new JoploError('INVALID_SCHEMA',`Plugin ${p.id}: invalid skill topic ${key}`);
      files.push(managedSkillFile(name,`${name}/topics/${key}.md`,t.body,version));
      return `- [${key}](./topics/${key}.md): ${t.description}`;
    });
    const description=`Use the ${p.title.replace(/\s+/g,' ')} plugin in Joplo; read its entry, component recipes and recovery rules for this project.`;
    const entry=['---',`name: ${name}`,`description: ${JSON.stringify(description)}`,'---','',pluginSkillTopic(p),'','## Installed references',...topicLinks,'','Engine contracts: [plugins](../joplo/topics/plugins.md).'].join('\n');
    files.push(managedSkillFile(name,`${name}/SKILL.md`,entry,version));
    index.push('',`- [${p.id}](../${name}/SKILL.md): ${p.title}${p.version?` · ${p.version}`:''}${p.packageName?` · ${p.packageName}`:''}`,
      ...Object.entries(p.skillTopics??{}).map(([key,t])=>`  - [${p.id}/${key}](../${name}/topics/${key}.md): ${t.description}`));
  }
  files.push(managedSkillFile('joplo-plugins','joplo-plugins/SKILL.md',index.join('\n'),version));
  return files;
}
export function pluginSkillManifest(files: readonly SkillFile[]): Buffer {
  return Buffer.from(JSON.stringify({format:1,files:files.map(f=>f.path).sort()},null,2)+'\n');
}
const hash = (body: Buffer) => createHash('sha256').update(body).digest('hex');
const MARKER = /<!-- joplo-skill ([^\s]+) sha256:([a-f0-9]{64}) -->\n$/;
function untouched(content: Buffer): boolean {
  const text = content.toString('utf8');
  const marker = MARKER.exec(text);
  if (!marker || marker.index === 0 || text[marker.index - 1] !== '\n') return false;
  const offset = content.length - Buffer.byteLength(text.slice(marker.index));
  return hash(content.subarray(0, offset)) === marker[2];
}
/** 文件末尾版本标记里的版本（没有标记时为 null）。 */
const markerVersion = (content: Buffer | null) => (content ? MARKER.exec(content.toString('utf8'))?.[1] ?? null : null);
async function optionalFile(path: string): Promise<Buffer | null> {
  try { return await readFile(path); }
  catch (e) { if ((e as NodeJS.ErrnoException).code === 'ENOENT') return null; throw e; }
}

function agentsContent(current: Buffer | null): Buffer {
  const block = Buffer.from(`${START}\n${agentsBlock()}\n${END}`);
  if (current === null) return Buffer.concat([block, Buffer.from('\n')]);
  const start = current.indexOf(START), end = current.indexOf(END);
  if (start === -1 && end === -1) return Buffer.concat([current, Buffer.from(current.length ? current.at(-1) === 10 ? '\n' : '\n\n' : ''), block, Buffer.from('\n')]);
  if (start < 0 || end < start || current.indexOf(START, start + START.length) !== -1 || current.indexOf(END, end + END.length) !== -1) throw new JoploError('UNSUPPORTED_ACTION', 'AGENTS.md has unpaired or duplicate joplo:start/end markers; fix them first. No files were written');
  // Buffer 切片保留托管段之外的原始字节，包括 BOM、CRLF、非 UTF-8 内容。
  return Buffer.concat([current.subarray(0, start), block, current.subarray(end + Buffer.byteLength(END))]);
}

/** written：本次写入的文件；modified：用户改过、因此没有覆盖的技能文件（此时什么都不写，code 1）。 */
export type InstallSkillResult = { code: number; output: string; written: string[]; removed: string[]; modified: string[] };
type Planned = { name:string; path:string; current:Buffer|null; next:Buffer|null; skill:boolean };

export async function installSkill(dir: string, version: string, options: InstallSkillOptions = {}): Promise<InstallSkillResult> {
  const root=resolve(dir),lines:string[]=[];
  const hasConfig=await access(join(root,'joplo.config.ts')).then(()=>true,()=>false) || await access(join(root,'joplo.config.tsx')).then(()=>true,()=>false);
  let plugins:PluginSkillSource[]=[];
  if (!options.engineOnly) {
    const loaded=await projectPlugins(root);
    if(loaded.error) throw new JoploError('INVALID_SCHEMA',`Cannot read config.plugins: ${loaded.error}. Install this project's dependencies, then run joplo skill install again. No skills were changed.`);
    plugins=loaded.plugins;
  }
  if(!hasConfig)lines.push('No joplo.config.ts here: installing engine skills only. In a project, enable plugins and read joplo skill <plugin-id> or <plugin-id>/<topic>.');
  if(options.engineOnly)lines.push('Template plugin guides are preserved. After installing dependencies, run joplo skill install to synchronize them with config.plugins.');
  const generated=options.engineOnly ? (options.templateSkills??[]) : pluginSkillFiles(version,plugins), files=[...skillFiles(version),...generated];
  const planned:Planned[]=await Promise.all(files.map(async f=>({name:`${SKILL_DIR}/${f.path}`,path:join(root,SKILL_DIR,f.path),current:await optionalFile(join(root,SKILL_DIR,f.path)),next:f.content,skill:true})));
  const manifestPath=join(root,SKILL_DIR,PLUGIN_SKILL_MANIFEST),manifest=await optionalFile(manifestPath);
  if((!options.engineOnly || options.templateSkills) && (manifest || generated.length)){
    let previous:string[]=[];
    if(manifest){
      let parsed:unknown;try{parsed=JSON.parse(manifest.toString('utf8'));}catch{throw new JoploError('INVALID_SCHEMA','Invalid plugin skill manifest; no files were changed.');}
      const m=parsed as {format?:unknown;files?:unknown};
      if(m?.format!==1 || !Array.isArray(m.files) || m.files.some(f=>typeof f!=='string'||!/^joplo-(?:plugins|plugin-[a-z][a-z0-9-]*)\/(?:SKILL\.md|topics\/[a-z][a-z0-9-]*\.md)$/.test(f))) throw new JoploError('INVALID_SCHEMA','Invalid plugin skill manifest paths; no files were changed.');
      previous=m.files as string[];
    }
    const desired=new Set(generated.map(f=>f.path));
    for(const path of previous)if(!desired.has(path))planned.push({name:`${SKILL_DIR}/${path}`,path:join(root,SKILL_DIR,path),current:await optionalFile(join(root,SKILL_DIR,path)),next:null,skill:true});
    planned.push({name:`${SKILL_DIR}/${PLUGIN_SKILL_MANIFEST}`,path:manifestPath,current:manifest,next:pluginSkillManifest(generated),skill:false});
  }
  const agentsPath=join(root,'AGENTS.md'),agents=await optionalFile(agentsPath);
  if(agents!==null||options.agentsMd)planned.push({name:'AGENTS.md',path:agentsPath,current:agents,next:agentsContent(agents),skill:false});
  const modified=planned.filter(f=>f.skill&&f.current!==null&&!untouched(f.current));
  if(!options.diff&&!options.force&&modified.length)return {code:1,written:[],removed:[],modified:modified.map(f=>f.name),output:[...lines,...modified.map(f=>`${f.name} was modified; it was preserved.`),`View changes: npx joplo skill install ${displayDir(dir)}--diff`,`Explicit replacement/removal: npx joplo skill install ${displayDir(dir)}--force`,''].join('\n')};
  const changed=planned.filter(f=>f.current===null?f.next!==null:f.next===null||!f.current.equals(f.next));
  const written:string[]=[],removed:string[]=[];
  if(options.diff){for(const f of changed)lines.push(unifiedDiff(f.name,f.current,f.next));}
  else{
    for(const f of changed){const latest=await optionalFile(f.path);if(f.current===null?latest!==null:latest===null||!f.current.equals(latest))throw new JoploError('UNSUPPORTED_ACTION',`${f.name} changed during installation; no files were written. Run again to view the diff`);}
    const applied:Planned[]=[];
    try{
      for(const f of changed){
        if(f.next===null){await unlink(f.path);removed.push(f.name);lines.push(`Removed ${f.name} (plugin is no longer enabled)`);}
        else{await mkdir(dirname(f.path),{recursive:true});await writeFile(f.path,f.next,{flag:f.current===null?'wx':'w'});written.push(f.name);lines.push(`Wrote ${f.name}${markerVersion(f.current)&&markerVersion(f.current)!==version?` (updated from ${markerVersion(f.current)} to ${version})`:''}`);}
        applied.push(f);
      }
    }catch(e){
      for(const f of applied.reverse()){
        const current=await optionalFile(f.path);
        if(f.next===null?current===null:current?.equals(f.next)){
          if(f.current===null)await unlink(f.path).catch(()=>{});else await writeFile(f.path,f.current,{flag:current===null?'wx':'w'});
        }
      }
      throw e;
    }
    if(changed.length)lines.push(`Tip: Commit ${SKILL_DIR}/ and AGENTS.md so agents read the same project skills.`);
  }
  if(!changed.length)lines.push('Already up to date');
  return {code:0,output:lines.join('\n')+'\n',written,removed,modified:[]};
}
function displayDir(dir: string): string {
  return dir === '.' ? '' : "'" + dir.replace(/'/g, "'\\''") + "' ";
}

/** 单个连续 hunk，保留前后 3 行上下文；不依赖 Git/diff，不输出颜色。 */
function unifiedDiff(name: string, before: Buffer | null, after: Buffer | null): string {
  const split = (buffer: Buffer | null) => {
    const text = buffer?.toString('utf8') ?? '';
    const lines = text ? text.split('\n') : [];
    const newline = text.endsWith('\n');
    if (newline) lines.pop();
    return { lines, newline };
  };
  const a = split(before), b = split(after);
  const equal = (i: number, j: number) => a.lines[i] === b.lines[j] && (i !== a.lines.length - 1 && j !== b.lines.length - 1 || a.newline === b.newline);
  let prefix = 0;
  while (prefix < Math.min(a.lines.length, b.lines.length) && equal(prefix, prefix)) prefix++;
  let suffix = 0;
  while (suffix < Math.min(a.lines.length, b.lines.length) - prefix && equal(a.lines.length - suffix - 1, b.lines.length - suffix - 1)) suffix++;
  const start = Math.max(0, prefix - 3);
  const aEnd = a.lines.length - Math.max(0, suffix - 3), bEnd = b.lines.length - Math.max(0, suffix - 3);
  const range = (length: number) => `${length ? start + 1 : start},${length}`;
  const output = [`--- ${before === null ? '/dev/null' : `a/${name}`}`, `+++ ${after === null ? '/dev/null' : `b/${name}`}`, `@@ -${range(aEnd - start)} +${range(bEnd - start)} @@`];
  const append = (sign: string, lines: string[], i: number, newline: boolean) => {
    output.push(sign + lines[i]);
    if (i === lines.length - 1 && !newline) output.push('\\ No newline at end of file');
  };
  for (let i = start; i < prefix; i++) append(' ', a.lines, i, a.newline);
  for (let i = prefix; i < a.lines.length - suffix; i++) append('-', a.lines, i, a.newline);
  for (let i = prefix; i < b.lines.length - suffix; i++) append('+', b.lines, i, b.newline);
  for (let i = a.lines.length - suffix; i < aEnd; i++) append(' ', a.lines, i, a.newline);
  return output.join('\n') + '\n';
}
