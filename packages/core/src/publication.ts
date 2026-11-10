/** 发布边界：本地作品可以完整保留在 dev，但不能成为其他作品的公开依赖。 */
import type { Project, SceneNode } from './schema.ts';
import { JoploError } from './result.ts';

export function localOnlyWorks(project: Project): Set<string> {
  const ids = new Set<string>();
  for (const w of Object.values(project.works)) {
    if (w.featureId) continue;
    const slices = Object.values(project.scenarios).some(s => s.workId === w.id);
    if (w.draft || !slices) ids.add(w.id);
  }
  return ids;
}

export function assertExportableEntry(project: Project, featureId: string): void {
  const w = project.works[featureId];
  if (!w || w.featureId) return;
  if (w.draft) throw new JoploError('USAGE', `Work "${featureId}" is a draft and cannot be published or reviewed. Remove draft: true when it is ready`);
  if (!Object.values(project.scenarios).some(s => s.workId === w.id))
    throw new JoploError('USAGE', `Work "${featureId}" has no slices and cannot be published or reviewed. Add at least one flow() or chapter() in scenarios`);
}

/** 先裁掉完整贡献子树，再算父元素标签，避免祖先标签把子树文字重新带回来。 */
export function withoutLocalContributions(node: SceneNode, local: ReadonlySet<string>): SceneNode | null {
  if (node.from && local.has(node.from)) return null;
  if (!node.children) return node;
  return { ...node, children: node.children.map(n => withoutLocalContributions(n, local)).filter((n): n is SceneNode => n !== null) };
}

/** id 可跨作品复用：仅保护在公开画面里没有独立出现的本地元素。 */
export function localOnlyElementIds(project: Project, local: ReadonlySet<string>): Set<string> {
  if (!local.size) return new Set();
  const privateIds = new Set<string>(), publicIds = new Set<string>();
  const walk = (node: SceneNode, owned: boolean) => {
    const privateOwner = node.from ? local.has(node.from) : owned;
    (privateOwner ? privateIds : publicIds).add(node.id);
    node.children?.forEach(n => walk(n, privateOwner));
  };
  for (const scene of Object.values(project.scenes))
    walk(scene.root, local.has(scene.workId ?? '') || local.has(project.routes[scene.route]?.addedBy ?? ''));
  for (const id of publicIds) privateIds.delete(id);
  return privateIds;
}
