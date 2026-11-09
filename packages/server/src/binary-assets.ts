/** Dev serves binary bytes by content hash; builds write every embedded asset as its own file (D98). */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import type { Diagnostic } from '@joplo-app/core';
export function binaryAssets<T>(value: T, opts: {directory?:string;prefix?:string;diagnostics?:Diagnostic[]}, seen = new Set<string>()): T {
  if(typeof value==='string' && /^data:(model\/gltf-binary|audio\/[a-z0-9.+-]+|video\/(?:mp4|webm)|application\/json);base64,/.test(value)) {
    const comma=value.indexOf(','), mime=value.slice(5,comma-7), bytes=Buffer.from(value.slice(comma+1),'base64'), hash=crypto.createHash('sha256').update(bytes).digest('hex');
    if(!seen.has(hash) && mime==='model/gltf-binary' && bytes.length>5*1024*1024) opts.diagnostics?.push({severity:'warning',source:'structure',code:'MODEL_SIZE',message:`GLB model is ${(bytes.length/1024/1024).toFixed(1)} MB; reduce face_limit/textures before publishing (recommended below 5 MB).`});
    seen.add(hash);
    if(opts.directory && opts.prefix) { const file=path.join(opts.directory,hash); fs.mkdirSync(opts.directory,{recursive:true}); if(!fs.existsSync(file)) fs.writeFileSync(file,bytes); return `${opts.prefix}${hash}${mime==='model/gltf-binary'?'.glb':mime==='video/mp4'?'.mp4':mime==='video/webm'?'.webm':mime==='application/json'?'.json':'.audio'}` as T; }
    return value;
  }
  if(Array.isArray(value)) return value.map(v=>binaryAssets(v,opts,seen)) as T;
  if(value && typeof value==='object') return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,binaryAssets(v,opts,seen)])) as T;
  return value;
}

/** 发布素材的扩展名（D98）：IR 里这些类型的 data URL 在构建时写成 assets/<sha256>.<ext>。 */
export const SITE_ASSET_TYPES: Record<string, string> = {
  'image/png': '.png', 'image/jpeg': '.jpg', 'image/gif': '.gif', 'image/webp': '.webp', 'image/svg+xml': '.svg', 'image/avif': '.avif',
  'model/gltf-binary': '.glb',
  'audio/mpeg': '.mp3', 'audio/wav': '.wav', 'audio/x-wav': '.wav', 'audio/ogg': '.ogg', 'audio/flac': '.flac', 'audio/mp4': '.m4a', 'audio/aac': '.aac',
  'video/mp4': '.mp4', 'video/webm': '.webm',
  'application/json': '.json',
};

/**
 * 发布素材改成独立文件（D98，不再 base64 内联）：把 value 里整串是 data URL 的素材写进 directory/<sha256>.<ext>，
 * 换成 prefix + 文件名（页面按相对路径引用）。同一内容只写一次；返回新值与写出的文件名。未知类型原样保留。
 */
export function extractSiteAssets<T>(value: T, opts: { directory: string; prefix: string }): { value: T; files: string[] } {
  const files = new Set<string>();
  const walk = (v: unknown): unknown => {
    if (typeof v === 'string' && v.startsWith('data:')) {
      const m = /^data:([a-z0-9.+/-]+)(;[^,]*)?;base64,/i.exec(v);
      const ext = m ? SITE_ASSET_TYPES[m[1]!.toLowerCase()] : undefined;
      if (!m || !ext) return v;
      const bytes = Buffer.from(v.slice(m[0].length), 'base64');
      const name = `${crypto.createHash('sha256').update(bytes).digest('hex')}${ext}`;
      if (!files.has(name)) {
        fs.mkdirSync(opts.directory, { recursive: true });
        const file = path.join(opts.directory, name);
        if (!fs.existsSync(file)) fs.writeFileSync(file, bytes);
        files.add(name);
      }
      return `${opts.prefix}${name}`;
    }
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, walk(x)]));
    return v;
  };
  return { value: walk(value) as T, files: [...files] };
}
