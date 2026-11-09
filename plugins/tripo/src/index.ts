import { definePlugin, localResource } from '@joplo-app/kit/plugin';
import { normalize, type ModelOptions } from './request.ts';
import { skill } from './guide.ts';
import info from './version.json' with {type:'json'};
export { type ModelOptions } from './request.ts';
export const model = (options: ModelOptions | string) => localResource('tripo','glb',JSON.stringify(normalize(typeof options==='string'?{prompt:options}:options)));
export default definePlugin({id:'tripo',packageName:'@joplo-app/plugin-tripo',title:'Tripo 3D models',version:info.version,components:{},skill,runtime:new URL(new URL(import.meta.url).pathname.endsWith('.ts')?'./runtime.ts':'./runtime.js',import.meta.url),local:new URL(new URL(import.meta.url).pathname.endsWith('.ts')?'./local.ts':'./local.js',import.meta.url)});
