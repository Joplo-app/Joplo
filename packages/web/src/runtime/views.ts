/**
 * 看板与发布站共用的只读视图计算：路径树（产品地图）、浏览视图的画面与状态、缺口统计。
 * 不推进业务状态；推进只在 demo.ts 里通过 core 的 applyStep / stateAt 完成。
 */
import { featuresOf, entriesOf, visibleRoutes, type Entry, nodeLabel, walkNodes, type Coverage, type Work, type PlayState, type Project, type Scenario, type Scene, type SceneNode } from '@joplo-app/core/runtime';

/** 作品所属条目从核心投影定位；未选定方案通过功能显式声明的 workIds 定位。 */
export const entryForWork = (project: Project, workId: string | null | undefined): Entry | null =>
  workId ? entriesOf(project).find(e => e.workId === workId || (e.featureId !== null && project.features[e.featureId]?.workIds.includes(workId))) ?? null : null;
export const featureForWork = (project: Project, workId: string | null | undefined) => {
  const entry = entryForWork(project, workId);
  return entry?.featureId ? project.features[entry.featureId] ?? null : null;
};
export const alternativeOf = (project: Project, workId: string | null | undefined) =>
  workId ? featureForWork(project, workId)?.alternatives[workId] : undefined;

export const worksOf = (project: Project, featureId: string | null): Work[] =>
  featureId && project.features[featureId] ? project.features[featureId]!.workIds.map((id) => project.works[id]).filter((o): o is Work => !!o) : [];

// 场景列表与连续播放顺序在 core（entries.ts，D102）：作品投影、outline 与这里共用同一份
export { scenariosOf, playSequence } from '@joplo-app/core/runtime';
import { scenariosOf } from '@joplo-app/core/runtime';

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
  const workIds = new Set<string>();
  for (const e of entriesOf(project)) if (e.workId && (e.featureId === null || project.features[e.featureId]?.pick === e.workId)) workIds.add(e.workId);
  if (scene?.workId) {
    const own = entryForWork(project, scene.workId);
    if (own) for (const id of [...workIds]) if (entryForWork(project, id)?.id === own.id) workIds.delete(id);
    workIds.add(scene.workId);
  }
  for (const oid of workIds) {
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
  addedBy: Work | null;
  /** 堆叠在该路径上的功能，以及各自涉及的方案。 */
  features: { featureId: string; name: string; works: Work[] }[];
};

/** 路径树：每个路径上堆叠了哪些功能的哪些方案；方案新增的路径标明来源。 */
export function routeTree(project: Project): RouteTreeEntry[] {
  const paths = visibleRoutes(project).map(r => r.path).sort((a, b) => a.localeCompare(b));
  return paths.map((path) => {
    const r = project.routes[path]!;
    const features = featuresOf(project).flatMap(f => {
      const works = worksOf(project, f.id).filter(o => o.routes.includes(path));
      return works.length ? [{ featureId: f.id, name: f.name, works }] : [];
    });
    return {
      path,
      title: r.title,
      depth: path === '/' ? 0 : path.split('/').length - 2,
      addedBy: r.addedBy ? (project.works[r.addedBy] ?? null) : null,
      features,
    };
  });
}

export function gapCounts(alternative: { coverage: Record<string, Coverage> } | null | undefined): { missing: number; undecided: number } {
  const cov = Object.values(alternative?.coverage ?? {}) as Coverage[];
  return { missing: cov.filter((c) => c.status === 'missing').length, undecided: cov.filter((c) => c.status === 'undecided').length };
}


/** 元素来自哪个方案：堆叠节点自带 from；其后代按源文件对应到方案文件。 */
export function workOfNode(project: Project, node: SceneNode): Work | null {
  if (node.from && project.works[node.from]) return project.works[node.from]!;
  const file = node.source?.replace(/:\d+:\d+$/, '');
  if (!file) return null;
  return Object.values(project.works).find((o) => o.source?.replace(/:\d+:\d+$/, '') === file) ?? null;
}
