/** 发布站（观众侧，D55「发布站」）的视图模型（纯函数）：选定方案的场景列表。只用发布 IR 里有的信息。 */
import type { Project } from '@joplo-app/core';
import { scenariosOf } from '../runtime/views';

export function siteScenarioRows(project: Project, optionId: string | null, currentScenarioId: string | null): { id: string; name: string; steps: string; current: boolean }[] {
  return scenariosOf(project, optionId).map((s) => ({ id: s.id, name: s.name, steps: `${s.steps.length} 步`, current: s.id === currentScenarioId }));
}
