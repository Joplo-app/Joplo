import { JoploError, mediaResourceIds, nodeResourceIds } from '@joplo-app/core';
import { createServer } from 'vite';
import { compileProject } from './project.ts';
import { realProjectDir, joploProjectPlugin, locateWebAssets, kitAliases } from './vite-shared.ts';
/** Explicit local-resource generation. No network before per-item confirmation. */
export async function generateResources(directory: string, opts: { work?: string; dryRun?: boolean; allowSpend?: boolean; confirm?: (message:string)=>Promise<boolean>; onProgress?: (message:string)=>void } = {}) {
  const projectDir=realProjectDir(directory), web=locateWebAssets();
  const loader=await createServer({configFile:false,envDir:false,root:projectDir,logLevel:'silent',appType:'custom',resolve:{alias:kitAliases(web,projectDir)},plugins:[joploProjectPlugin(projectDir,web)],server:{middlewareMode:true,hmr:false,watch:null},optimizeDeps:{noDiscovery:true,include:[]}});
  try {
    const compiled=await compileProject(loader,projectDir,'dev',{work:opts.work});
    if(!compiled.project || !compiled.resources || compiled.diagnostics.some(d => d.severity === 'error')) throw new JoploError(compiled.diagnostics.some(d=>d.code==='WORK_NOT_FOUND') ? 'NOT_FOUND' : 'INVALID_SCHEMA', `Project compilation failed: ${compiled.diagnostics.filter(d=>d.severity==='error').map(d=>`${d.code}: ${d.message}`).join('; ')}. Shared sources and referenced dependencies must be valid in the selected scope.`, { diagnostics: compiled.diagnostics });
    const {host,requests}=compiled.resources, results=[];
    // Shared routes still compile, but an unused route must not enlarge a work's spending plan.
    const used = mediaResourceIds(compiled.project);
    const scenes = new Set<string>();
    for (const scenario of Object.values(compiled.project.scenarios)) {
      scenes.add(scenario.initial.sceneId);
      for (const step of scenario.steps) for (const effect of step.effects) if (effect.type === 'navigate') scenes.add(effect.sceneId);
    }
    for (const work of Object.values(compiled.project.works)) for (const layer of Object.values(work.layers)) scenes.add(layer.sceneId);
    for (const [id, scene] of Object.entries(compiled.project.scenes)) if (scene.workId && compiled.project.works[scene.workId]) scenes.add(id);
    for (const id of scenes) nodeResourceIds(compiled.project.scenes[id], used);
    for(const request of requests) {
      if (opts.work && !used.has(request.id)) continue;
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
