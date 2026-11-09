/** Node-only; never exported by the runtime. Committed output is the first and offline fast path. */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import type { PluginLocal } from '@joplo-app/kit/plugin';
import { normalize, estimate, type ModelRequest } from './request.ts';
export { estimate };
const BASE = 'https://openapi.tripo3d.ai/v3';
function fail(code: string, message: string): never { throw Object.assign(new Error(message), {code:`LOCAL_RESOURCE_${code}`}); }
const sha = (value: string | Uint8Array) => crypto.createHash('sha256').update(value).digest('hex');
export const modelPath = (root: string, request: ModelRequest) => path.join(root,'assets','models',`${sha(JSON.stringify(normalize(request)))}.glb`);
export function validateGLB(bytes: Uint8Array) {
  const b=Buffer.from(bytes);
  if (b.length < 24 || b.toString('ascii',0,4)!=='glTF' || b.readUInt32LE(4)!==2 || b.readUInt32LE(8)!==b.length) fail('GLB_INVALID','Invalid GLB v2 header or length; replace the damaged model.');
  try {
    if (b.readUInt32LE(16)!==0x4e4f534a || b.readUInt32LE(12)>b.length-20) throw new Error();
    const json=JSON.parse(b.toString('utf8',20,20+b.readUInt32LE(12)));
    // Self-contained GLB only: external textures/buffers break offline and can leak viewer requests.
    if ([...(json.buffers??[]),...(json.images??[])].some((v:{uri?:string})=>v.uri && !v.uri.startsWith('data:'))) throw new Error();
  } catch { fail('GLB_INVALID','Invalid or externally referenced GLB; export a self-contained binary GLB.'); }
}
export type GenerateOptions = { projectDir: string; key?: string; allowSpend?: boolean; maxBytes?: number; timeoutMs?: number; fetch?: typeof fetch; sleep?: (ms:number)=>Promise<void>; home?: string };
function keyOf(home?: string) {
  if (process.env.TRIPO_API_KEY?.trim()) return process.env.TRIPO_API_KEY.trim();
  try { return JSON.parse(fs.readFileSync(path.join(home ?? process.env.JOPLO_HOME ?? path.join(os.homedir(),'.joplo'),'tripo.json'),'utf8')).key as string; } catch { return undefined; }
}
function write(file: string, value: unknown) { const temp=`${file}.${crypto.randomUUID()}.tmp`; fs.writeFileSync(temp,JSON.stringify(value,null,2)+'\n'); fs.renameSync(temp,file); }
function apiError(code: number): never {
  const errors: Record<number,[string,string]> = {2:['AUTH','Invalid Tripo key; update it in Manage keys.'],1002:['AUTH','Invalid Tripo key; update it in Manage keys.'],2010:['BALANCE','Insufficient Tripo credits. No automatic purchase or retry.'],2008:['MODERATION','Tripo rejected the content. Revise the description or reference image.'],1004:['INPUT','Tripo rejected the parameters. Check face_limit and texture options.'],2015:['VERSION','Tripo model version retired. Update the plugin.']};
  const e=errors[code] ?? ['API',`Tripo request failed (code ${Number.isFinite(code)?code:'unknown'}). Check the account/task before retrying.`]; fail(`TRIPO_${e[0]}`,e[1]!);
}
export async function generate(input: ModelRequest, opts: GenerateOptions): Promise<Uint8Array> {
  const r=normalize(input), file=modelPath(opts.projectDir,r), max=opts.maxBytes ?? 50*1024*1024;
  const existing = () => { if (!fs.existsSync(file)) return; if(fs.statSync(file).size>max) fail('TOO_LARGE','Model exceeds the resource size limit.'); const b=fs.readFileSync(file); validateGLB(b); return b; };
  const hit=existing(); if(hit) return hit;
  if(!opts.allowSpend) fail('SPEND_REQUIRED',`Model missing. Estimated ${estimate(r)} credits. Run joplo resources --allow-spend (or confirm interactively) to generate it; check/build/render never generate.`);
  const key=opts.key ?? keyOf(opts.home); if(!key) fail('TRIPO_NO_KEY','Set TRIPO_API_KEY or save a key in the board → Voice → Manage keys.');
  fs.mkdirSync(path.dirname(file),{recursive:true});
  const lock=`${file}.lock`;
  try { fs.writeFileSync(lock,String(process.pid),{flag:'wx'}); } catch {
    let alive=true; try { process.kill(Number(fs.readFileSync(lock,'utf8')),0); } catch(e) { if((e as NodeJS.ErrnoException).code==='ESRCH') alive=false; }
    if(alive) fail('TRIPO_BUSY','This model is already being generated. Wait for that process to finish.');
    fs.rmSync(lock); return generate(r,opts);
  }
  try {
    const hit=existing(); if(hit) return hit;
    const journal=file.replace(/\.glb$/,'.json');
    let saved: {status?:string;task_id?:string;credits_consumed?:number|null;created_at?:string;generated_at?:string} = {};
    if(fs.existsSync(journal)) { try { saved=JSON.parse(fs.readFileSync(journal,'utf8')); } catch { fail('TRIPO_UNKNOWN','Unreadable task journal; recover task_id from Tripo before retrying.'); } }
    if(saved.status==='creating' || saved.status==='unknown') fail('TRIPO_UNKNOWN','Creation outcome unknown. Recover task_id from Tripo task history and set journal status to queued; do not delete the journal or blindly retry.');
    if(saved.status==='failed' || saved.status==='cancelled') fail('TRIPO_FAILED','Task failed/cancelled; Tripo refunds frozen credits. Verify in your account; revise input for a new confirmed task.');
    const deadline=Date.now()+(opts.timeoutMs ?? 20*60*1000), net=opts.fetch ?? fetch, sleep=opts.sleep ?? (ms=>new Promise(resolve=>setTimeout(resolve,ms)));
    const check = () => { if(Date.now()>=deadline) fail('TRIPO_TIMEOUT','Tripo timed out; the recorded task can be resumed with joplo resources.'); };
    const api=async (endpoint: string, body?: unknown, form?: FormData):Promise<any> => {
      for(let attempt=0;attempt<5;attempt++) {
        check(); let response: Response;
        try { response=await net(`${BASE}${endpoint}`,{method:body!==undefined||form?'POST':'GET',headers:{Authorization:`Bearer ${key}`,...(!form&&body!==undefined?{'Content-Type':'application/json'}:{})},...(body!==undefined?{body:JSON.stringify(body)}:form?{body:form}:{}),signal:AbortSignal.timeout(Math.max(1,Math.min(30000,deadline-Date.now()))),redirect:'error'}); }
        catch { fail('TRIPO_NETWORK','Tripo connection interrupted. Resume the recorded task; creation outcome may be unknown.'); }
        if(response.status===429) { const retry=Number(response.headers.get('Retry-After')); await sleep(Math.min(30000, Math.max(1000, Number.isFinite(retry)?retry*1000:1000*2**attempt))); continue; }
        let envelope; try { envelope=await response.json(); } catch { fail('TRIPO_UNKNOWN','Invalid Tripo response; creation outcome may be unknown. Check task history.'); }
        if(!response.ok || envelope.code!==0) apiError(envelope.code ?? (response.status===401?1002:-1));
        return envelope.data;
      }
      fail('TRIPO_RATE_LIMIT','Tripo rate limit persists; wait and resume. No duplicate creation was sent after an unknown result.');
    };
    const {image,...parameters}=r;
    const metadata={...parameters,...(image?{image_sha256:sha(image)}:{})};
    const persist=()=>write(journal,{...metadata,...saved});
    if(!saved.task_id) {
      let token: string | undefined;
      if(image) { const [header,data]=image.split(','); const bytes=Buffer.from(data!,'base64'); if(bytes.length>20*1024*1024) fail('TRIPO_INPUT','Reference image exceeds 20 MB.'); const form=new FormData(); form.append('file',new Blob([bytes],{type:header!.includes('png')?'image/png':'image/jpeg'}),'reference.'+(header!.includes('png')?'png':'jpg')); token=(await api('/files',undefined,form))?.file_token; if(typeof token!=='string'||!token) fail('TRIPO_API','Upload returned no file token.'); }
      saved={status:'creating',created_at:new Date().toISOString()}; persist();
      try {
        const {prompt,...imageParameters}=parameters;
        const result=await api(`/generation/${image?'image':'text'}-to-model`,image?{...imageParameters,input:token}:parameters);
        if(typeof result?.task_id!=='string' || !/^[\w-]+$/.test(result.task_id)) fail('TRIPO_UNKNOWN','Creation outcome unknown: missing task_id; inspect task history.');
        saved={...saved,task_id:result.task_id,status:'queued'}; persist();
      } catch(e) {
        const code=(e as {code?:string}).code;
        // An explicit rejection did not create a task; transport/invalid responses remain ambiguous.
        if(['LOCAL_RESOURCE_TRIPO_AUTH','LOCAL_RESOURCE_TRIPO_BALANCE','LOCAL_RESOURCE_TRIPO_MODERATION','LOCAL_RESOURCE_TRIPO_VERSION','LOCAL_RESOURCE_TRIPO_RATE_LIMIT','LOCAL_RESOURCE_TRIPO_INPUT'].includes(code??'')) { fs.rmSync(journal); throw e; }
        saved.status='unknown'; persist(); fail('TRIPO_UNKNOWN','Creation outcome unknown. Recover task_id from Tripo history before retrying; no automatic duplicate POST.');
      }
    }
    while(true) {
      check(); const task=await api(`/tasks/${encodeURIComponent(saved.task_id!)}`);
      if(task.status==='failed'||task.status==='cancelled') { saved.status=task.status; persist(); if(task.error_code) apiError(task.error_code); fail('TRIPO_FAILED','Tripo task failed/cancelled; frozen credits are refunded by Tripo. Check the account before starting another task.'); }
      if(task.status==='success') {
        const url=task.output?.model_url;
        if(typeof url!=='string'||!url.startsWith('https://')) fail('TRIPO_DOWNLOAD','Tripo returned no HTTPS GLB URL. Resume to refresh the URL.');
        saved={...saved,status:'success',generated_at:saved.generated_at ?? new Date().toISOString(),credits_consumed:typeof task.credits_consumed==='number'?task.credits_consumed:null}; persist();
        let response:Response; try { response=await net(url,{signal:AbortSignal.timeout(Math.max(1,Math.min(60000,deadline-Date.now()))),redirect:'error'}); } catch { fail('TRIPO_DOWNLOAD','Model download interrupted; resume the task to obtain a fresh URL.'); }
        if(!response.ok) fail('TRIPO_DOWNLOAD','Model download failed; resume the task to refresh the signed URL.');
        const chunks:Uint8Array[]= []; let length=0;
        for await(const chunk of response.body ?? []) { length+=chunk.length; if(length>max) fail('TOO_LARGE','Generated model exceeds the size limit; reduce face_limit or texture quality.'); chunks.push(chunk); }
        const bytes=Buffer.concat(chunks); validateGLB(bytes);
        const temp=`${file}.${crypto.randomUUID()}.tmp`; fs.writeFileSync(temp,bytes); fs.renameSync(temp,file); return bytes;
      }
      await sleep(1500);
    }
  } finally { fs.rmSync(lock,{force:true}); }
}
export default {compilers:{glb:{version:'tripo-v3-1',mime:'model/gltf-binary',persistent:true,estimate:(input:string)=>({credits:estimate(normalize(JSON.parse(input)))}),compile:(input,ctx)=>generate(normalize(JSON.parse(input)),{projectDir:ctx.projectDir!,allowSpend:ctx.allowSpend,maxBytes:ctx.maxBytes,home:ctx.home})}}} satisfies PluginLocal;
