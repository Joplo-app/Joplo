import { mkdir, readdir, readFile, writeFile, lstat, unlink, rmdir } from 'node:fs/promises';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { JoploError } from '@joplo-app/core';
import { detectPackageManager, pmCommands, type PackageManager } from './pm.ts';
import { installSkill, skillFiles, type SkillFile } from './skill.ts';
import { cliVersion } from './startup.ts';
import { loadTemplate, renderTemplate, type TemplateDeps } from './templates.ts';
import { templateMessages as templateMessage } from './template-messages.ts';

/**
 * skill：init 同时安装的 Agent 技能（D64，等同 `joplo skill install --agents-md`）；--no-skill 时为 null。
 * written 是写入的技能文件与 AGENTS.md；modified 是用户改过而保留的技能（此时一个都不写）；error 是 AGENTS.md 标记损坏等原因。
 */
export type InitSkill = { written: string[]; modified: string[]; unchanged?: string[]; error?: string; pendingPlugins?: boolean };
/** gitignoreMissing：保留了已有的 .gitignore 时，它缺少的 Joplo 条目（只提示，不改用户的文件）。 */
export type InitResult = { root: string; written: string[]; skipped: string[]; version: string; skill: InitSkill | null; template: string; gitignoreMissing?: string[] };

/**
 * 不算“目录非空”的条目（D65）：Agent 配置与版本控制文件。用户常先 git init、npx skills add 再 joplo init .，
 * 这时目录里只有这些；init 照常写入，已有的同名文件（例如 .gitignore、AGENTS.md 的托管段之外）一律保留。
 */
export const AGENT_AND_VCS_FILES: ReadonlySet<string> = new Set(['.git', '.gitignore', '.gitattributes', '.agents', '.claude', '.codex', '.cursor', 'AGENTS.md', 'CLAUDE.md', 'skills-lock.json', '.DS_Store']);
const GITIGNORE = ['node_modules/', '.joplo/', 'dist/', 'exports/'];

/** 目录名 → 合法的 npm 包名（小写、无空格；无法推导时用 joplo-demo）。 */
export function packageName(dirName: string): string {
  const n = dirName.toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^[._-]+|[-._]+$/g, '').slice(0, 214);
  return n || 'joplo-demo';
}

const shellArg = (s: string) => (/^[\w@%+=:,./-]+$/.test(s) ? s : `'${s.replace(/'/g, `'\\''`)}'`);

/** init 结尾的一行：进入目录、安装、打开看板（与用户的包管理器一致）。 */
export function nextStepLine(pm: PackageManager, relDir: string): string {
  const c = pmCommands(pm);
  const steps = [...(relDir && relDir !== '.' ? [`cd ${shellArg(relDir)}`] : []), c.install, `${c.run} dev`];
  return `Next: ${steps.join(' && ')}`;
}

export async function initProject(dir: string, name?: string, opts: { keep?: boolean; skill?: boolean; env?: Record<string, string | undefined>; template?: string; templateDeps?: TemplateDeps } = {}): Promise<InitResult> {
  const root = resolve(dir);
  const version = cliVersion();
  let entries: string[] = [];
  try { entries = await readdir(root); }
  catch (e) { if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e; }
  const others = entries.filter((f) => !AGENT_AND_VCS_FILES.has(f)).sort();
  if (!opts.keep && others.length) {
    const rel = relative(process.cwd(), root) || '.';
    const run = pmCommands(detectPackageManager(opts.env ?? process.env)).run;
    const names = others.slice(0, 5).join(', ') + (others.length > 5 ? ', …' : '');
    throw new JoploError('UNSUPPORTED_ACTION', `${rel}/ is not empty (contains ${others.length} files): ${names}; agent and Git files such as .git, .claude, .agents, AGENTS.md do not count. Nothing was written. Choose another directory, or enter it and run ${run} init . --keep to add missing files only.`);
  }
  // 只有 Agent / 版本控制文件时按 --keep 写入：已有的文件一字不改
  const keep = opts.keep || entries.length > 0;
  // Download/read/validate completely before touching the destination (D89).
  const template=await loadTemplate(version,opts.template,{env:opts.env,...opts.templateDeps});
  const files=renderTemplate(template.files,{version,packageName:packageName(basename(root)),projectName:name??(basename(root)||'Joplo')});
  // Skill installation is a separate all-or-nothing D64 transaction, including template guides.
  const templateSkills:SkillFile[]=[];
  const enginePaths=new Set(skillFiles(version).map(f=>f.path));
  for(const [path,content] of files)if(path.startsWith('.claude/skills/')){
    const relative=path.slice('.claude/skills/'.length);
    if(opts.skill===false||enginePaths.has(relative)||relative==='.joplo-plugins.json'){files.delete(path);continue;}
    if(/^joplo-(?:plugins|plugin-[a-z][a-z0-9-]*)\/(?:SKILL\.md|topics\/[a-z][a-z0-9-]*\.md)$/.test(relative)){templateSkills.push({name:relative.split('/')[0]!,path:relative,content});files.delete(path);}
  }
  const written:string[]=[], skipped:string[]=[], createdDirs:string[]=[];
  const ensureDir=async(path:string):Promise<void>=>{
    const stat=await lstat(path).catch(()=>null);
    if(stat){if(!stat.isDirectory()||stat.isSymbolicLink())throw new JoploError('USAGE',templateMessage.invalidPath);return;}
    const parent=dirname(path);if(parent!==path)await ensureDir(parent);
    await mkdir(path);createdDirs.push(path);
  };
  // Ancestors outside the requested root can include OS links (/tmp on macOS).
  const ensureRoot=async()=>{
    const stat=await lstat(root).catch(()=>null);
    if(stat){if(!stat.isDirectory()||stat.isSymbolicLink())throw new JoploError('USAGE',templateMessage.invalidPath);return;}
    const first=await mkdir(root,{recursive:true});
    if(first){let d=root;while(d.startsWith(first)){createdDirs.unshift(d);if(d===first)break;d=dirname(d);}}
  };
  try{
    // Re-check the nonempty rule after potentially slow network access.
    const latest=await readdir(root).catch((e:NodeJS.ErrnoException)=>{if(e.code==='ENOENT')return [];throw e;});
    if(!opts.keep&&latest.some(f=>!AGENT_AND_VCS_FILES.has(f)))throw new JoploError('UNSUPPORTED_ACTION',templateMessage.changed);
    await ensureRoot();
    for(const [path,content] of files){
      await ensureDir(dirname(join(root,path)));
      try{await writeFile(join(root,path),content,{flag:'wx'});written.push(path);}
      catch(e){if((e as NodeJS.ErrnoException).code!=='EEXIST'||!keep)throw e;const st=await lstat(join(root,path));if(!st.isFile()||st.isSymbolicLink())throw new JoploError('USAGE',templateMessage.invalidPath);skipped.push(path);}
    }
  }catch(e){
    for(const path of written.reverse()){
      const current=await readFile(join(root,path)).catch(()=>null);
      if(current?.equals(files.get(path)!))await unlink(join(root,path)).catch(()=>{});
    }
    for(const path of createdDirs.reverse())await rmdir(path).catch(()=>{});
    if(e instanceof JoploError)throw e;
    throw new JoploError('UNSUPPORTED_ACTION',templateMessage.changed);
  }
  let gitignoreMissing: string[] | undefined;
  if (skipped.includes('.gitignore')) {
    const lines = new Set((await readFile(join(root, '.gitignore'), 'utf8')).split(/\r?\n/).map((l) => l.trim()));
    gitignoreMissing = GITIGNORE.filter((g) => !lines.has(g) && !lines.has(g.slice(0, -1)) && !lines.has(`/${g}`) && !lines.has(`/${g.slice(0, -1)}`));
  }
  // 项目文件写完后再装技能；技能装不上（用户改过、AGENTS.md 标记损坏）不影响 init 成功
  let skill: InitSkill | null = null;
  if (opts.skill !== false) {
    try {
      let pendingPlugins=false;
      let r;
      try{r=await installSkill(root,version,{agentsMd:true});}
      catch(e){
        if(!(e instanceof JoploError)||!e.message.startsWith('Cannot read config.plugins:'))throw e;
        pendingPlugins=true;r=await installSkill(root,version,{agentsMd:true,engineOnly:true,templateSkills});
      }
      // unchanged：已经是这个版本、没被改过的技能（例如 npx skills add 装的同版本官方技能），跳过不写
      const unchanged = r.modified.length ? [] : skillFiles(version).map((f) => `.claude/skills/${f.path}`).filter((f) => !r.written.includes(f));
      skill = { written: r.written, modified: r.modified, unchanged, ...(pendingPlugins ? {pendingPlugins:true} : {}) };
    } catch (e) {
      if (!(e instanceof JoploError)) throw e;
      skill = { written: [], modified: [], error: e.message };
    }
  }
  return { root, written, skipped, version, skill, template: template.source, ...(gitignoreMissing?.length ? { gitignoreMissing } : {}) };
}

/** `joplo init` 的输出（最后一行是下一步命令）。 */
export function initSummary(r: InitResult, env: Record<string, string | undefined> = process.env): string[] {
  const rel = relative(process.cwd(), r.root) || '.';
  const top = [...new Set(r.written.map((f) => (f.includes('/') ? `${f.split('/')[0]}/` : f)))].filter((f) => !['package.json', 'tsconfig.json', '.gitignore'].includes(f));
  const lines = [`✓ Created ${rel === '.' ? './' : `${rel}/`}${top.length ? `: ${top.join(', ')}` : ''}`];
  lines.push(`Template: ${r.template}`);
  if (r.written.includes('package.json')) lines.push(`✓ package.json  devDependencies: { "joplo": "${r.version}", "@joplo-app/kit": "${r.version}" } (pinned to the same version)`);
  if (r.written.includes('tsconfig.json')) lines.push('✓ tsconfig.json jsxImportSource: "@joplo-app/kit"');
  if (r.skipped.length) lines.push(`! Existing files preserved: ${r.skipped.join(', ')}${r.skipped.includes('package.json') ? ` (check that devDependencies includes "joplo": "${r.version}" and "@joplo-app/kit": "${r.version}")` : ''}${r.gitignoreMissing?.length ? `; consider adding ${r.gitignoreMissing.join(', ')} to .gitignore` : ''}`);
  const s = r.skill;
  const run = pmCommands(detectPackageManager(env)).run;
  if (s?.error) lines.push(`! Agent skills not installed: ${s.error}`);
  else if (s?.modified.length) lines.push(`! Agent skills not installed: ${s.modified.join(', ')} ${s.modified.length > 1 ? 'were' : 'was'} modified; compare with ${run} skill install --diff, replace with --force`);
  else if (s) {
    const unchanged = s.unchanged ?? [];
    const skills = unchanged.length === skillFiles(r.version).length ? `.claude/skills/joplo, .claude/skills/joplo-feedback and engine references already installed (Joplo ${r.version}, unchanged)` : `.claude/skills/joplo, .claude/skills/joplo-feedback, engine references and enabled plugin skills${unchanged.length ? ` (${unchanged.join(', ')} already up to date)` : ''}`;
    lines.push(`✓ Agent skills: ${skills}, AGENTS.md (Joplo block${s.written.includes('AGENTS.md') ? '' : ', already up to date'}); skip with --no-skill`);
  }
  if(s?.pendingPlugins)lines.push(`! Template plugin guides are ready to read; after installing dependencies run ${run} skill install to verify config.plugins.`);
  lines.push(nextStepLine(detectPackageManager(env), rel));
  return lines;
}
