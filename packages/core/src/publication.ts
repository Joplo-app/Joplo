/** 发布边界：本地作品可以完整保留在 dev，但不能成为其他作品的公开依赖。 */
import type { Project, SceneNode } from './schema.ts';
import { JoploError } from './result.ts';

export function localOnlyOptions(project: Project): Set<string> {
  const ids = new Set<string>();
  for (const f of Object.values(project.features)) {
    if (!f.standalone) continue;
    const slices = Object.values(project.scenarios).some(s => f.optionIds.includes(s.optionId));
    if (f.draft || !slices) for (const id of f.optionIds) ids.add(id);
  }
  return ids;
}

export function assertExportableFeature(project: Project, featureId: string): void {
  const f = project.features[featureId];
  if (!f?.standalone) return;
  if (f.draft) throw new JoploError('USAGE', `Work "${featureId}" is a draft and cannot be published or reviewed. Remove draft: true when it is ready`);
  if (!Object.values(project.scenarios).some(s => f.optionIds.includes(s.optionId)))
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
    walk(scene.root, local.has(scene.optionId ?? '') || local.has(project.routes[scene.route]?.addedBy ?? ''));
  for (const id of publicIds) privateIds.delete(id);
  return privateIds;
}
