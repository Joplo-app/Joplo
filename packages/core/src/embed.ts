/**
 * 嵌入模式（发布站 `?embed=1`）与 `joplo share` 预览图共用的场景选择（纯函数）。
 *
 * - 可播放的场景：按功能在 IR 里的顺序，每个功能的选定方案（没有选定时用第一个方案）的场景，按场景在 IR 里的顺序；
 * - 默认场景是其中第一个；`scenario` 参数指向列表里的场景时从它开始，写错（不存在、为空、不是字符串）时退回默认，不报错。
 *
 * 只读 features / options / scenarios 的少量字段，所以既能用于完整 IR，也能用于发布站内联的发布 IR。
 */

type EmbedProject = {
  features: Record<string, { id: string; optionIds: readonly string[]; pick?: string | null }>;
  options: Record<string, { id: string }>;
  scenarios: Record<string, { id: string; optionId: string }>;
};

/** 嵌入模式里可以播放和切换的场景 ID（有序、不重复）。 */
export function embedScenarioIds(project: EmbedProject): string[] {
  const ids: string[] = [];
  const scenarios = Object.values(project.scenarios ?? {});
  for (const f of Object.values(project.features ?? {})) {
    const optionIds = (f.optionIds ?? []).filter((id) => project.options?.[id]);
    const optionId = f.pick && project.options?.[f.pick] ? f.pick : optionIds[0];
    if (!optionId) continue;
    for (const s of scenarios) if (s.optionId === optionId && !ids.includes(s.id)) ids.push(s.id);
  }
  return ids;
}

/** 嵌入从哪个场景开始：requested 合法时用它，否则用默认场景；项目没有场景时为 null。 */
export function embedStartScenario(project: EmbedProject, requested?: unknown): string | null {
  const ids = embedScenarioIds(project);
  if (typeof requested === 'string' && requested && ids.includes(requested)) return requested;
  return ids[0] ?? null;
}
