/** Dev serves binary bytes by content hash; static builds keep data URIs for file://. */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import type { Diagnostic } from '@joplo-app/core';
export function binaryAssets<T>(value: T, opts: {directory?:string;prefix?:string;diagnostics?:Diagnostic[]}, seen = new Set<string>()): T {
  if(typeof value==='string' && /^data:(model\/gltf-binary|audio\/[a-z0-9.+-]+);base64,/.test(value)) {
    const comma=value.indexOf(','), mime=value.slice(5,comma-7), bytes=Buffer.from(value.slice(comma+1),'base64'), hash=crypto.createHash('sha256').update(bytes).digest('hex');
    if(!seen.has(hash) && mime==='model/gltf-binary' && bytes.length>5*1024*1024) opts.diagnostics?.push({severity:'warning',source:'structure',code:'MODEL_SIZE',message:`GLB model is ${(bytes.length/1024/1024).toFixed(1)} MB; reduce face_limit/textures before publishing (recommended below 5 MB).`});
    seen.add(hash);
    if(opts.directory && opts.prefix) { const file=path.join(opts.directory,hash); fs.mkdirSync(opts.directory,{recursive:true}); if(!fs.existsSync(file)) fs.writeFileSync(file,bytes); return `${opts.prefix}${hash}${mime==='model/gltf-binary'?'.glb':'.audio'}` as T; }
    return value;
  }
  if(Array.isArray(value)) return value.map(v=>binaryAssets(v,opts,seen)) as T;
  if(value && typeof value==='object') return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,binaryAssets(v,opts,seen)])) as T;
  return value;
}
