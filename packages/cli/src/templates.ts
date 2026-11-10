import { lstat, readdir, readFile } from 'node:fs/promises';
import { resolve, join, posix } from 'node:path';
import { spawnSync } from 'node:child_process';
import { Parser } from 'tar';
import { JoploError } from '@joplo-app/core';
import { templateMessages as m } from './template-messages.ts';

export type TemplateSource = { kind:'github'; owner:string; repo:string; subdir:string; ref:string } | { kind:'local'; dir:string };
export type TemplateFiles = Map<string, Buffer>;
/** idleMs：下载中多久收不到数据算失败（缺省 30 秒）。不限制总时长，自定义模板或慢网络仍可持续下载。 */
export type TemplateDeps = { fetch?: typeof fetch; env?: Record<string,string|undefined>; ghToken?:()=>string|undefined; idleMs?:number };
const MAX_DOWNLOAD=64*1024*1024, MAX_EXPANDED=256*1024*1024, MAX_FILES=20000;
const fail=(reason:keyof typeof m, code:'USAGE'|'NOT_FOUND'|'PERMISSION_DENIED'='USAGE'):never=>{throw new JoploError(code,`${m[reason]} ${m.fallback}`);};

const builtinSpec = (name:string) => `github:Joplo-app/joplo-templates/${name}`;
export const defaultTemplateSpec = () => builtinSpec('starter');
/** Bare names never depend on cwd; explicit paths retain the local-template behavior. */
function builtinName(spec:string):string|null {
  if(spec.startsWith('github:')||spec.startsWith('.')||/[\\/]/.test(spec))return null;
  if(!/^[a-z0-9][a-z0-9-]*$/.test(spec))return fail('invalidName');
  return spec;
}
function safePath(path:string):boolean {
  return !!path&&!path.includes('\\')&&!/[\u0000-\u001f\u007f]/.test(path)&&!posix.isAbsolute(path)&&!(/^[a-z]:/i.test(path))&&!path.split('/').some(p=>p==='..'||p==='.');
}
export function parseTemplate(spec:string):TemplateSource {
  const name=builtinName(spec);
  if(name)spec=builtinSpec(name);
  if(!spec.startsWith('github:'))return {kind:'local',dir:resolve(spec)};
  const match=/^github:([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)(?:\/([^#]+))?(?:#(.+))?$/.exec(spec);
  if(!match||[match[1],match[2]].some(x=>x==='.'||x==='..'))return fail('invalidSpec');
  const subdir=(match[3]??'').replace(/\/$/,'');
  if(subdir&&!safePath(subdir)||/[\u0000-\u001f\u007f]/.test(match[4]??''))return fail('invalidSpec');
  return {kind:'github',owner:match[1]!,repo:match[2]!,subdir,ref:match[4]??'HEAD'};
}
function add(files:TemplateFiles,path:string,bytes:Buffer) {
  if(!safePath(path))return fail('invalidPath');
  if(files.has(path)||[...files.keys()].some(p=>p.startsWith(path+'/')||path.startsWith(p+'/')))return fail('collision');
  if(files.size>=MAX_FILES)return fail('tooLarge');
  files.set(path,bytes);
}
async function localFiles(dir:string):Promise<TemplateFiles> {
  const stat=await lstat(dir).catch(()=>null);if(!stat?.isDirectory()||stat.isSymbolicLink())return fail('noDirectory','NOT_FOUND');
  const files:TemplateFiles=new Map();let total=0;
  const walk=async(base:string)=>{
    for(const name of await readdir(join(dir,base))){
      if(['.git','node_modules','.joplo','dist','exports'].includes(name))continue;
      const rel=base?base+'/'+name:name;if(!safePath(rel))fail('invalidPath');
      const s=await lstat(join(dir,rel));if(s.isSymbolicLink())fail('invalidPath');
      if(s.isDirectory())await walk(rel);
      else if(s.isFile()){total+=s.size;if(total>MAX_EXPANDED)fail('tooLarge');add(files,rel,await readFile(join(dir,rel)));}
      else fail('invalidPath');
    }
  };
  await walk('');return files;
}
export async function archiveFiles(bytes:Buffer,subdir:string):Promise<TemplateFiles>{
  if(bytes.length>MAX_DOWNLOAD)fail('tooLarge');
  const files:TemplateFiles=new Map();let total=0,count=0,root:string|undefined;
  await new Promise<void>((done,reject)=>{
    let failure=false;
    const parser=new Parser({strict:true});
    const abort=(e:unknown)=>{if(failure)return;failure=true;reject(e instanceof JoploError?e:new JoploError('USAGE',`${m.archive} ${m.fallback}`));parser.abort(new Error('Invalid template archive'));};
    parser.on('error',abort);
    parser.on('entry',entry=>{
      try{
        const name=entry.path.replace(/\/+$/,'');
        if(!safePath(name))fail('invalidPath');
        const parts=name.split('/');root??=parts[0];if(parts[0]!==root)fail('archive');
        total+=entry.size;count++;if(total>MAX_EXPANDED||count>MAX_FILES)fail('tooLarge');
        const relative=parts.slice(1).join('/');
        const selected=!subdir||relative===subdir||relative.startsWith(subdir+'/');
        if(!selected||entry.type==='Directory'){entry.resume();return;}
        if(entry.type!=='File'&&entry.type!=='OldFile')fail('invalidPath');
        const path=subdir?relative.slice(subdir.length+1):relative;
        const chunks:Buffer[]=[];entry.on('data',(chunk:Buffer)=>chunks.push(Buffer.from(chunk)));
        entry.on('end',()=>{if(failure)return;try{add(files,path,Buffer.concat(chunks));}catch(e){abort(e);}});
        entry.on('error',abort);
      }catch(e){entry.resume();abort(e);}
    });
    parser.on('end',()=>{if(!failure)done();});
    parser.end(bytes);
  });
  return files;
}
function githubToken(deps:TemplateDeps):string|undefined {
  const env=deps.env??process.env;
  if(env.GITHUB_TOKEN?.trim())return env.GITHUB_TOKEN.trim();
  if(deps.ghToken)return deps.ghToken();
  const r=spawnSync('gh',['auth','token'],{encoding:'utf8',env,timeout:5000,maxBuffer:16384,stdio:['ignore','pipe','ignore']});
  return r.status===0?r.stdout?.trim()||undefined:undefined;
}
async function download(source:Extract<TemplateSource,{kind:'github'}>,deps:TemplateDeps):Promise<Buffer>{
  const fetcher=deps.fetch??fetch,token=githubToken(deps);
  const owner=encodeURIComponent(source.owner),repo=encodeURIComponent(source.repo),ref=encodeURIComponent(source.ref);
  let url=token?`https://api.github.com/repos/${owner}/${repo}/tarball/${ref}`:`https://codeload.github.com/${owner}/${repo}/tar.gz/${ref}`;
  let response:Response;
  // 空闲超时：等响应头、等下一块数据各自最多 idleMs；只要还在收数据就不中断。
  const controller=new AbortController();let timer:ReturnType<typeof setTimeout>|undefined;
  const touch=()=>{clearTimeout(timer);timer=setTimeout(()=>controller.abort(),deps.idleMs??30000);};
  try{
    touch();
    response=await fetcher(url,{redirect:'manual',signal:controller.signal,headers:token?{'Authorization':`Bearer ${token}`,'Accept':'application/vnd.github+json'}:{}});
    if([301,302,307,308].includes(response.status)){
      const location=response.headers.get('location');if(!location)fail('network');
      const next=new URL(location!,url);if(next.protocol!=='https:'||next.hostname!=='codeload.github.com'||next.username||next.password)fail('network');
      url=next.href;touch();response=await fetcher(url,{redirect:'error',signal:controller.signal});
    }
    if(response.status===401||response.status===403)fail('unauthorized','PERMISSION_DENIED');
    if(response.status===404)fail('missing','NOT_FOUND');
    if(!response.ok||!response.body)fail('network');
    if(Number(response.headers.get('content-length'))>MAX_DOWNLOAD)fail('tooLarge');
    const chunks:Buffer[]=[];let total=0;
    touch();
    for await(const chunk of response.body as unknown as AsyncIterable<Uint8Array>){touch();total+=chunk.length;if(total>MAX_DOWNLOAD)fail('tooLarge');chunks.push(Buffer.from(chunk));}
    return Buffer.concat(chunks);
  }catch(e){if(e instanceof JoploError)throw e;return fail('network');}
  finally{clearTimeout(timer);}
}
export async function loadTemplate(spec?:string,deps:TemplateDeps={}):Promise<{files:TemplateFiles;source:string}>{
  const name=builtinName(spec??'starter');
  const chosen=name?builtinSpec(name):spec!;
  const source=parseTemplate(chosen);
  const files=source.kind==='local'?await localFiles(source.dir):await archiveFiles(await download(source,deps),source.subdir);
  if(!files.size)fail(name?'missingBuiltin':'empty','NOT_FOUND');
  try{const pkg=JSON.parse(files.get('package.json')?.toString('utf8')??'null');if(!pkg||typeof pkg!=='object'||Array.isArray(pkg))fail('noPackage');}catch{fail('noPackage');}
  if(!files.has('joplo.config.ts')&&!files.has('joplo.config.tsx'))fail('noConfig');
  return {files,source:chosen};
}
export function renderTemplate(files:TemplateFiles,values:{version:string;packageName:string;projectName:string}):TemplateFiles{
  return new Map([...files].map(([path,bytes])=>{
    let s=bytes.toString('utf8');if(!Buffer.from(s).equals(bytes))return [path,bytes];
    s=s.replaceAll('__JOPLO_VERSION__',values.version).replaceAll('__PACKAGE_NAME__',values.packageName);
    if(/\.(?:[cm]?[jt]sx?|json)$/.test(path)){
      s=s.replace(/(['"])__PROJECT_NAME__\1/g,()=>JSON.stringify(values.projectName));
      if(s.includes('__PROJECT_NAME__'))fail('placeholder');
    }else s=s.replaceAll('__PROJECT_NAME__',()=>values.projectName);
    return [path,Buffer.from(s)];
  }));
}
