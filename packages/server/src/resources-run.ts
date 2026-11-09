import { createServer } from 'vite';
import { compileProject } from './project.ts';
import { realProjectDir, joploProjectPlugin, locateWebAssets, kitAliases } from './vite-shared.ts';
/** Explicit local-resource generation. No network before per-item confirmation. */
export async function generateResources(directory: string, opts: { dryRun?: boolean; allowSpend?: boolean; confirm?: (message:string)=>Promise<boolean>; onProgress?: (message:string)=>void } = {}) {
  const projectDir=realProjectDir(directory), web=locateWebAssets();
  const loader=await createServer({configFile:false,envDir:false,root:projectDir,logLevel:'silent',appType:'custom',resolve:{alias:kitAliases(web,projectDir)},plugins:[joploProjectPlugin(projectDir,web)],server:{middlewareMode:true,hmr:false,watch:null},optimizeDeps:{noDiscovery:true,include:[]}});
  try {
    const compiled=await compileProject(loader,projectDir,'dev');
    if(!compiled.project || !compiled.resources || compiled.diagnostics.some(d => d.severity === 'error')) throw new Error('Project compilation failed; run joplo check for diagnostics.');
    const {host,requests}=compiled.resources, results=[];
    for(const request of requests) {
      const description=await host.describe(request);
      if(!description.persistent) continue;
      const cached=await host.ensure(request);
      if(cached.url) { results.push({id:request.id,cached:true,credits:0}); continue; }
      const message=`${request.plugin}/${request.compiler} ${request.id}: estimated ${description.credits ?? 'unknown'} credits`;
      opts.onProgress?.(message);
      if(opts.dryRun) { results.push({id:request.id,credits:description.credits,diagnostic:cached.diagnostic}); continue; }
      const allowed=opts.allowSpend === true || await opts.confirm?.(`${message}. Generate?`) === true;
      if(!allowed) { results.push({id:request.id,diagnostic:cached.diagnostic}); continue; }
      const result=await host.ensure(request,{allowSpend:true});
      results.push({id:request.id,generated:!!result.url,diagnostic:result.diagnostic});
      if(result.diagnostic) break;
    }
    return results;
  } finally { await loader.close(); }
}
