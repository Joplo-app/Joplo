import type { MediaSnapshot } from '@joplo-app/kit/plugin';
import type { Project } from './schema.ts';
/** Pure clock projection. Neither resource compilation nor plugin semantics run here. */
export function advanceMedia(snapshot: MediaSnapshot, elapsedMs: number): MediaSnapshot {
  const elapsed = Math.max(0, elapsedMs);
  return Object.fromEntries(Object.entries(snapshot).flatMap(([id, t]) => t.stopAfterMs !== undefined && elapsed >= t.stopAfterMs ? [] : [[id, { ...t, offsetMs: t.offsetMs + elapsed, ...(t.stopAfterMs !== undefined ? { stopAfterMs: t.stopAfterMs - elapsed, volume: t.volume * (1 - elapsed / t.stopAfterMs) } : {}) }]]));
}
export function mediaAt(project: Project, scenarioId: string, position: number, elapsedMs = 0): MediaSnapshot {
  const sc = project.scenarios[scenarioId];
  const snapshot = position ? sc?.steps[position - 1]?.media : sc?.media;
  return advanceMedia(snapshot ?? {}, elapsedMs);
}
export function mediaResourceIds(project: Pick<Project, 'scenarios'>): Set<string> {
  return new Set(Object.values(project.scenarios).flatMap(sc => [sc, ...sc.steps].flatMap(s => Object.values(s.media ?? {}).map(t => t.resource))));
}
export function pruneMediaAssets<T extends Project>(project: T): T {
  if (!project.mediaAssets) return project;
  const used = mediaResourceIds(project);
  return { ...project, mediaAssets: Object.fromEntries(Object.entries(project.mediaAssets).filter(([id]) => used.has(id))) };
}
