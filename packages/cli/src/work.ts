/** CLI 的作品选择边界：限定方案 id 与独立作品键映射到同一播放 id。 */
import { entriesOf, entryOf, JoploError, type Project, type ScopeRequest, resolveScope, type ScopeMode } from '@joplo-app/core';

export function resolveWorkId(project: Project, id: string): string {
  const entry = entryOf(project, id);
  if (entry?.featureId === null && entry.workId) return entry.workId;
  if (project.options[id] && entryOf(project, project.options[id]!.featureId)?.featureId !== null) return id;
  const known = entriesOf(project).flatMap(e => e.featureId === null ? [e.id] : project.features[e.featureId]!.optionIds);
  throw new JoploError('USAGE', `Work does not exist: ${id}. Works: ${known.join(', ') || 'none'}`);
}

/** 仍交给 core 裁剪场景；这里只处理条目与草稿的公开语义。 */
export function resolveWorkScope(project: Project, request: ScopeRequest, mode: ScopeMode): string[] {
  for (const id of request.features ?? []) {
    const e = entryOf(project, id);
    if (!e) throw new JoploError('NOT_FOUND', `Unknown work "${id}". Works: ${entriesOf(project).map(e => e.id).join(', ') || 'none'}`);
    if (e.featureId === null && !e.slices.length) throw new JoploError('USAGE', `Work "${id}" has no slices and cannot be published or reviewed. Add at least one flow() or chapter() in scenarios`);
    if (e.draft) throw new JoploError('USAGE', `Work "${id}" is a draft and cannot be published or reviewed. Remove draft: true when it is ready`);
  }
  for (const id of request.scenarios ?? []) {
    const s = project.scenarios[id];
    const e = s && entryOf(project, project.options[s.optionId]?.featureId);
    if (e?.draft) throw new JoploError('USAGE', `Work "${e.id}" is a draft and cannot be published or reviewed. Remove draft: true when it is ready`);
  }
  return resolveScope(project, request, mode);
}
