import { readCliVersion } from './skill.ts';
import { CloudClient } from './cloud.ts';
import { resolveWorkId } from './work.ts';
import { existsSync } from 'node:fs';
import { realpath } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tsImport } from 'tsx/esm/api';
import { nodeResourceIds, compile, validate, type Diagnostic, type Project, type ValidationReport } from '@joplo-app/core';
import { isPluginDef, type ResourceRequest, type LocalResourceInfo, type AudioRegion } from '@joplo-app/kit/plugin';
import { loadAuthoring } from '@joplo-app/core/node';

export type CheckReport = ValidationReport & { name: string };

/** `joplo check` 的输出（不含 IR，`check --format json` 保持不变）。 */
export async function check(dir: string, workId?: string): Promise<CheckReport> {
  const { project: _project, ...report } = await checkWithProject(dir, workId);
  return report;
}

/** check 加上本次编译的 dev IR（share 用它生成评审清单，不再编译第二次）；编译失败时 project 为 null。 */
export async function checkWithProject(dir: string, workId?: string): Promise<CheckReport & { project: Project | null }> {
  const root = await realpath(resolve(dir));
  const tsconfig = join(root, 'tsconfig.json');
  const loaded = await loadAuthoring(root, p => tsImport(p, { parentURL: import.meta.url, tsconfig: existsSync(tsconfig) ? tsconfig : false }));
  if (loaded.authoring?.config.watch !== undefined) {
    const { watchConfigDiagnostics } = await import('@joplo-app/server');
    loaded.diagnostics.push(...watchConfigDiagnostics(loaded.authoring.config.watch, loaded.authoring.config.source));
  }
  // 与看板同一套布局（D69）：布局失败的图表在 check 里报 DIAGRAM_LAYOUT_FAILED
  const requests: ResourceRequest[] = [];
  let compiled = loaded.authoring ? compile(loaded.authoring, 'dev', { onResource:r=>requests.push(r) }) : null;
  const resourceDiagnostics: Diagnostic[] = [];
  const timingAssets: Record<string, string> = {};
  const timingInfo: Record<string, AudioRegion> = {};
  let resourceInfo: Record<string, LocalResourceInfo> = {};
  if (requests.length && loaded.authoring) {
    const { LocalResources, inspectResources } = await import('@joplo-app/server');
    const plugins = loaded.authoring.config.plugins ?? [];
    const host = new LocalResources(root,Object.fromEntries(plugins.filter(isPluginDef).filter(p=>p.local).map(p=>[p.id,p.local!])));
    const inspected = await inspectResources(compiled?.project ?? null, requests, host);
    resourceInfo = inspected.resourceInfo;
    resourceDiagnostics.push(...inspected.diagnostics);
    if (Object.keys(inspected.resourceInfo).length) compiled = compile(loaded.authoring, 'dev', { resourceInfo: inspected.resourceInfo });
    for (const request of requests) {
      if (!nodeResourceIds(compiled?.project).has(request.id)) continue;
      const description = await host.describe(request);
      if (!description.persistent) continue;
      const result = await host.ensure(request);
      if (result.diagnostic) resourceDiagnostics.push(result.diagnostic);
      if (result.url) timingAssets[request.id] = result.url;
      if (result.audio) timingInfo[request.id] = result.audio;
    }
  }
  if (loaded.authoring && compiled?.project && Object.values(compiled.project.scenarios).some(sc => sc.steps.some(st => st.audio || st.holdFor))) {
    const { readAudioTiming } = await import('@joplo-app/server');
    const signedIn = await new CloudClient(undefined, await readCliVersion(), () => {}, () => {}, { interactive: false }).auth().then(Boolean, () => false);
    const timing = await readAudioTiming(root, { ...compiled.project, mediaAssets: { ...compiled.project.mediaAssets, ...timingAssets }, mediaInfo: { ...compiled.project.mediaInfo, ...timingInfo } }, { defaultProfile: signedIn ? 'cloud' : null });
    resourceDiagnostics.push(...timing.diagnostics);
    compiled = compile(loaded.authoring, 'dev', { resourceInfo, audioDurationFor: timing.audioDurationFor, voiceDurationFor: timing.voiceDurationFor });
    if (compiled.project && Object.keys(timingAssets).length) compiled.project.mediaAssets = { ...compiled.project.mediaAssets, ...timingAssets };
    if (compiled.project && Object.keys(timingInfo).length) compiled.project.mediaInfo = { ...compiled.project.mediaInfo, ...timingInfo };
  }
  if (compiled?.project && Object.keys(resourceInfo).length) {
    const { mediaDiagnostics } = await import('@joplo-app/server');
    resourceDiagnostics.push(...mediaDiagnostics(compiled.project, resourceInfo));
  }
  const selected = workId && compiled?.project ? resolveWorkId(compiled.project, workId) : undefined;
  const validated = compiled?.project ? validate(compiled.project, { workId: selected, mode: 'all' }) : null;
  // 编译器也会为同一布局的每份画面输出相同诊断；在 CLI 边界统一去重。
  const seen = new Set<string>();
  const diagnostics: Diagnostic[] = [...resourceDiagnostics, ...loaded.diagnostics, ...(compiled?.diagnostics ?? []), ...(validated?.diagnostics ?? [])].map(d => ({ ...d, at: d.at ?? 'joplo.config.ts:1:1' })).filter(d => {
    const key = JSON.stringify([d.at, d.code, d.message, d.severity]);
    if (seen.has(key)) return false;
    seen.add(key); return true;
  });
  return {
    name: compiled?.project?.name ?? loaded.authoring?.config.name ?? root,
    diagnostics,
    summary: { error: diagnostics.filter(d => d.severity === 'error').length, warning: diagnostics.filter(d => d.severity === 'warning').length, info: diagnostics.filter(d => d.severity === 'info').length },
    verification: validated?.verification ?? {},
    project: compiled?.project ?? null,
  };
}
