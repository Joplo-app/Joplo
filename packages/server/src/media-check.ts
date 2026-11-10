import { mediaResourceIds, nodeResourceIds, commitGapMs, type Diagnostic, type Project } from '@joplo-app/core';
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
  const diagnostics: Diagnostic[] = mediaBudgetDiagnostics(project, info);
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
    for (const [index, step] of sc.steps.entries()) {
      // 这一步提交之后到下一步提交（或场景播完）的计划时长：与编译期推进配乐快照用同一个函数
      const gap = commitGapMs(project, sc.steps, index);
      const tracks = step.media ?? {};
      for (const key of [...runs.keys()]) if (!tracks[key]) finish(key);
      for (const [key, t] of Object.entries(tracks)) {
        const previous = runs.get(key);
        if (previous && (previous.resource !== t.resource || Math.abs(previous.offset + previous.duration - t.offsetMs) > 1)) finish(key);
        if (!runs.has(key)) runs.set(key, { resource: t.resource, offset: t.offsetMs, duration: 0, loop: t.loop, at: step.source });
        runs.get(key)!.duration += Math.min(gap, t.stopAfterMs ?? Infinity);
        if (t.stopAfterMs !== undefined && t.stopAfterMs <= gap) finish(key);
      }
    }
    for (const key of [...runs.keys()]) finish(key);
  }
  return diagnostics;
}

/** PCM memory is charged per resource, including both sides of an active crossfade. */
export function mediaBudgetDiagnostics(project: Project, info: Record<string, LocalResourceInfo | import('@joplo-app/kit/plugin').AudioRegion>): Diagnostic[] {
  const out: Diagnostic[] = [], budget = 32 * 1024 * 1024;
  for (const sc of Object.values(project.scenarios)) {
    const seen = new Set<string>();
    for (const [position, snapshot, at] of [[0, sc.media, undefined], ...sc.steps.map((s, i) => [i + 1, s.media, s.source] as const)] as const) {
      const ids = [...new Set(Object.values(snapshot ?? {}).filter(t => t.stopAfterMs === undefined || t.stopAfterMs > 0).map(t => t.resource))].sort();
      const key = ids.join(','); if (!key || seen.has(key)) continue; seen.add(key);
      let known = 0;
      const bytes = (rate: number) => ids.reduce((sum, id) => {
        const m = info[id]; if (!m) return sum;
        const seconds = 'decodedFrames' in m ? m.decodedFrames / m.sourceSampleRate : (m.durationMs ?? 0) / 1000;
        if (seconds > 0 && rate === 48000) known++;
        return sum + Math.ceil(seconds * rate) * ('channels' in m ? m.channels : 2) * 4;
      }, 0);
      const at48 = bytes(48000), at96 = bytes(96000);
      const code = at48 > budget ? 'MEDIA_DECODE_BUDGET' : at96 > budget ? 'MEDIA_DECODE_HEADROOM' : null;
      if (code) out.push({ code, severity: 'warning', source: 'structure', at,
        message: `${sc.id} position ${position}: simultaneous audio [${ids.join(', ')}] needs ${(at48 / 1048576).toFixed(2)} MiB at 48 kHz and ${(at96 / 1048576).toFixed(2)} MiB at 96 kHz (32 MiB decoded budget${known < ids.length ? '; some resources unknown' : ''}). Shorten overlapping tracks or avoid crossfading them; actual device sample rate and decoder padding affect usage.` });
    }
  }
  return out;
}
