import type { Project } from './schema.ts';
/** ID 可以合法地叫 constructor/toString；查找归一化记录时不能命中 Object.prototype。 */
export function safeRecords(project: Project): Project {
  for (const table of [
    project.features,
    project.cases,
    project.options,
    project.rules,
    project.scenes,
    project.scenarios,
    project.comments,
    project.issues,
    project.decisions,
  ])
    Object.setPrototypeOf(table, null);
  for (const option of Object.values(project.options))
    Object.setPrototypeOf(option.coverage, null);
  return project;
}
