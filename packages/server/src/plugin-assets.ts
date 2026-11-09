import path from 'node:path';
import type {Rollup} from 'vite';
import {JoploError} from '@joplo-app/core';

/** Reserved build base: every generated local asset reference must be consumed before delivery. */
export const PLUGIN_ASSET_BASE='/__joplo_plugin_asset__/';
const MIME:Record<string,string>={
 '.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.gif':'image/gif','.webp':'image/webp','.avif':'image/avif','.ico':'image/x-icon','.bmp':'image/bmp',
 '.woff2':'font/woff2','.woff':'font/woff','.ttf':'font/ttf','.otf':'font/otf','.eot':'application/vnd.ms-fontobject',
 '.mp3':'audio/mpeg','.wav':'audio/wav','.ogg':'audio/ogg','.mp4':'video/mp4','.webm':'video/webm',
 '.wasm':'application/wasm','.json':'application/json','.txt':'text/plain','.js':'text/javascript','.glb':'model/gltf-binary','.gltf':'model/gltf+json',
};
/** Inline emitted resources and install CSS with the runtime in both npm dev and file:// builds. */
export function inlinePluginAssets(id:string,code:string,output:readonly Rollup.OutputAsset[]):string{
 const css=output.filter(a=>a.fileName.endsWith('.css'));
 const assets=output.filter(a=>!a.fileName.endsWith('.css'));
 const references=assets.flatMap(a=>{
  const mime=MIME[path.extname(a.fileName).toLowerCase()]??'application/octet-stream';
  const data=`data:${mime};base64,${Buffer.from(a.source).toString('base64')}`;
  return [...new Set([a.fileName,encodeURI(a.fileName)])].map(name=>[PLUGIN_ASSET_BASE+name,data] as const);
 });
 const inline=(text:string)=>{
  for(const [reference,url] of references)text=text.replaceAll(reference,()=>url);
  if(text.includes(PLUGIN_ASSET_BASE))throw new JoploError('EXPORT_FAILED',`Plugin ${id}: a generated asset reference could not be bundled`);
  return text;
 };
 const body=inline(code);
 if(!css.length)return body;
 const styles=inline(css.map(a=>typeof a.source==='string'?a.source:Buffer.from(a.source).toString('utf8')).join('\n'));
 const key=JSON.stringify(`joplo-plugin-style:${id}`);
 // A block avoids colliding with the bundler's local names; replacing text updates HMR
 // without duplicate style sheets. textContent cannot break out of a style element.
 return `{const key=${key};let style=document.getElementById(key);if(!style){style=document.createElement('style');style.id=key;document.head.append(style);}style.textContent=${JSON.stringify(styles)};}\n${body}`;
}
