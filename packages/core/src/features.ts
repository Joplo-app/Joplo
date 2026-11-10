/** 按首页条目顺序读取真正的功能，作品由 entries.ts 投影。 */
export function featuresOf<T>(project: { features: Record<string, T>; entryIds: readonly string[] }): T[] {
  return project.entryIds.map(id => project.features[id]).filter((f): f is T => f !== undefined);
}
