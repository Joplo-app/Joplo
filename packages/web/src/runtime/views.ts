/**
 * 看板与发布站共用的只读视图计算：路径树（产品地图）、浏览视图的画面与状态、缺口统计。
 * 不推进业务状态；推进只在 demo.ts 里通过 core 的 applyStep / stateAt 完成。
 */
import { orderedFeatures, nodeLabel, walkNodes, type Coverage, type Option, type PlayState, type Project, type Scenario, type Scene, type SceneNode } from '@joplo-app/core/runtime';

export const optionsOf = (project: Project, featureId: string | null): Option[] =>
  featureId && project.features[featureId] ? project.features[featureId]!.optionIds.map((id) => project.options[id]).filter((o): o is Option => !!o) : [];

export const scenariosOf = (project: Project, optionId: string | null): Scenario[] => (optionId ? Object.values(project.scenarios).filter((s) => s.optionId === optionId) : []);

/**
 * 连续播放的顺序（D92 U2 / R9；看板、发布站、嵌入与录制 --chain 共用）：按声明顺序取不接力的场景（根），每个根之后
 * 深度优先接上 flow({ from }) 接力它的章（多章接同一章时按声明顺序）。autoplay:false 的场景连同接在它后面的章都不进顺序。
 * 因此接力章写在被接章前面也不会被截断，也不会回头重放。
 */
export function playSequence(project: Project, optionId: string | null): Scenario[] {
  const all = scenariosOf(project, optionId);
  const ids = new Set(all.map((s) => s.id));
  const out: Scenario[] = [];
  const seen = new Set<string>();
  const visit = (s: Scenario) => {
    if (seen.has(s.id) || s.autoplay === false) return;
    seen.add(s.id);
    out.push(s);
    for (const child of all) if (child.from === s.id) visit(child);
  };
  for (const s of all) if (!s.from || !ids.has(s.from)) visit(s);
  return out;
}

/** 方案的短名：「A · 单人邮件邀请弹窗」→「A」。 */
export const shortName = (name: string) => (name.includes(' · ') ? name.split(' · ')[0]! : name);

/**
 * 浏览视图（发布视图 `@<路径>`）的画面 ID；该路径只由未选定方案新增时，退回到那个方案的画面。
 */
export function browseSceneId(project: Project, route: string): string | null {
  if (project.scenes[`@${route}`]) return `@${route}`;
  const r = project.routes[route];
  if (r?.addedBy && project.scenes[`${r.addedBy}@${route}`]) return `${r.addedBy}@${route}`;
  return Object.values(project.scenes).find((s) => s.route === route)?.id ?? null;
}

/**
 * 浏览视图的静态状态：合并各功能选定方案（或画面所属方案）第一个场景的初始数据。
 * 这是“看整体长什么样”的静态画面，不能推进步骤。
 */
export function browseState(project: Project, sceneId: string): PlayState {
  const scene = project.scenes[sceneId];
  const ui: Record<string, unknown> = {};
  const data: Record<string, unknown> = {};
  const inputs: Record<string, unknown> = {};
  const optionIds = new Set<string>();
  for (const f of orderedFeatures(project)) if (f.pick) optionIds.add(f.pick);
  if (scene?.optionId) {
    const own = project.options[scene.optionId];
    if (own) for (const id of [...optionIds]) if (project.options[id]?.featureId === own.featureId) optionIds.delete(id);
    optionIds.add(scene.optionId);
  }
  for (const oid of optionIds) {
    const sc = scenariosOf(project, oid)[0];
    if (!sc) continue;
    Object.assign(ui, structuredClone(sc.initial.ui));
    Object.assign(data, structuredClone(sc.initial.data));
    Object.assign(inputs, structuredClone(sc.initial.inputs));
  }
  return { scenarioId: '', position: 0, sceneId, ui, data, inputs, toasts: [], completed: null, sceneStack: [] };
}

export type RouteTreeEntry = {
  path: string;
  title: string;
  depth: number;
  /** 由哪个方案新增（基础路径为 null）。 */
  addedBy: Option | null;
  /** 堆叠在该路径上的功能，以及各自涉及的方案。 */
  features: { featureId: string; name: string; options: Option[] }[];
};

/** 路径树：每个路径上堆叠了哪些功能的哪些方案；方案新增的路径标明来源。 */
export function routeTree(project: Project): RouteTreeEntry[] {
  const paths = Object.keys(project.routes).sort((a, b) => a.localeCompare(b));
  return paths.map((path) => {
    const r = project.routes[path]!;
    const features = orderedFeatures(project).flatMap(f => {
      const options = optionsOf(project, f.id).filter(o => o.routes.includes(path));
      return options.length ? [{ featureId: f.id, name: f.name, options }] : [];
    });
    return {
      path,
      title: r.title,
      depth: path === '/' ? 0 : path.split('/').length - 2,
      addedBy: r.addedBy ? (project.options[r.addedBy] ?? null) : null,
      features,
    };
  });
}

export function gapCounts(option: Option | null | undefined): { missing: number; undecided: number } {
  const cov = Object.values(option?.coverage ?? {}) as Coverage[];
  return { missing: cov.filter((c) => c.status === 'missing').length, undecided: cov.filter((c) => c.status === 'undecided').length };
}


/** 元素来自哪个方案：堆叠节点自带 from；其后代按源文件对应到方案文件。 */
export function optionOfNode(project: Project, node: SceneNode): Option | null {
  if (node.from && project.options[node.from]) return project.options[node.from]!;
  const file = node.source?.replace(/:\d+:\d+$/, '');
  if (!file) return null;
  return Object.values(project.options).find((o) => o.source?.replace(/:\d+:\d+$/, '') === file) ?? null;
}
