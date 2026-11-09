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
  for(const id of nodeResourceIds(project)) used.add(id);
  return { ...project, ...(project.mediaInfo ? {mediaInfo:Object.fromEntries(Object.entries(project.mediaInfo).filter(([id])=>used.has(id)))} : {}), mediaAssets: Object.fromEntries(Object.entries(project.mediaAssets).filter(([id]) => used.has(id))) };
}

/** Node-local references are data only; the input and compiler stay on the author machine. */
export function nodeResourceIds(value: unknown, out = new Set<string>()): Set<string> {
  if (typeof value === 'string' && value.startsWith('joplo-resource:')) out.add(value.slice(15));
  else if (Array.isArray(value)) for (const v of value) nodeResourceIds(v,out);
  else if (value && typeof value === 'object') for (const [k,v] of Object.entries(value)) if(k !== 'mediaAssets') nodeResourceIds(v,out);
  return out;
}
export function resolveResourceProps<T>(value: T, urls: Readonly<Record<string,string>>): T {
  if (typeof value === 'string' && value.startsWith('joplo-resource:')) return (urls[value.slice(15)] ?? '') as T;
  if (Array.isArray(value)) return value.map(v=>resolveResourceProps(v,urls)) as T;
  if(value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,resolveResourceProps(v,urls)])) as T;
  return value;
}
