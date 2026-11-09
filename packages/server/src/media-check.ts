import { mediaResourceIds, nodeResourceIds, stepAnchorMs, type Diagnostic, type Project } from '@joplo-app/core';
import type { LocalResourceInfo, ResourceRequest } from '@joplo-app/kit/plugin';
import type { LocalResources } from './local-resources.ts';
export async function inspectResources(project: Project | null, requests: ResourceRequest[], host: LocalResources) {
  const used = project ? mediaResourceIds(project) : new Set<string>();
  for (const id of nodeResourceIds(project)) used.add(id);
  const resourceInfo: Record<string, LocalResourceInfo> = {}, diagnostics: Diagnostic[] = [];
  for (const request of requests) if (used.has(request.id)) {
    const result = await host.inspect(request);
    if (result.info) resourceInfo[request.id] = result.info;
    if (result.diagnostic) diagnostics.push(result.diagnostic);
  }
  return { resourceInfo, diagnostics };
}
/** Measure uninterrupted runs, not each individual step. Stop/replacement ends a run. */
export function mediaDiagnostics(project: Project, info: Record<string, LocalResourceInfo>): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  for (const sc of Object.values(project.scenarios)) {
    const runs = new Map<string, { resource: string; offset: number; duration: number; loop: boolean; at?: string }>();
    const finish = (key: string) => {
      const run = runs.get(key); if (!run) return; runs.delete(key);
      const length = info[run.resource]?.durationMs;
      if (!length) return;
      const left = Math.max(0, length - run.offset);
      const code = run.loop && length < 8000 && run.duration >= Math.max(30000, length * 4) ? 'MUSIC_LOOP_SHORT'
        : !run.loop && run.duration - left > 5000 && left < run.duration * .75 ? 'MUSIC_ENDS_EARLY' : undefined;
      if (code) diagnostics.push({ code, severity: 'warning', source: 'structure', at: run.at, message: `${sc.name}: music ${(length / 1000).toFixed(2)} s, starts ${(run.offset / 1000).toFixed(2)} s, scene playback ${(run.duration / 1000).toFixed(2)} s${run.loop ? '; short loop may become repetitive' : '; music ends well before this run finishes'}` });
    };
    for (const step of sc.steps) {
      const tracks = step.media ?? {};
      for (const key of [...runs.keys()]) if (!tracks[key]) finish(key);
      for (const [key, t] of Object.entries(tracks)) {
        const previous = runs.get(key);
        if (previous && (previous.resource !== t.resource || Math.abs(previous.offset + previous.duration - t.offsetMs) > 1)) finish(key);
        if (!runs.has(key)) runs.set(key, { resource: t.resource, offset: t.offsetMs, duration: 0, loop: t.loop, at: step.source });
        runs.get(key)!.duration += Math.min(stepAnchorMs(step), t.stopAfterMs ?? Infinity);
        if (t.stopAfterMs !== undefined && t.stopAfterMs <= stepAnchorMs(step)) finish(key);
      }
    }
    for (const key of [...runs.keys()]) finish(key);
  }
  return diagnostics;
}
