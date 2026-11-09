import { en, type Dictionary } from '../i18n/en';
/** 发布站（观众侧，D55「发布站」）的视图模型（纯函数）：选定方案的场景列表。只用发布 IR 里有的信息。 */
import type { Project } from '@joplo-app/core/runtime';
import { scenariosOf } from '../runtime/views';

export function siteScenarioRows(project: Project, optionId: string | null, currentScenarioId: string | null, i18n: Dictionary = en): { id: string; name: string; steps: string; current: boolean }[] {
  return scenariosOf(project, optionId).map((s) => ({ id: s.id, name: s.name, steps: i18n.site.stepCount(s.steps.length), current: s.id === currentScenarioId }));
}
