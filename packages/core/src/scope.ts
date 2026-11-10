import { entriesOf, entryOf, rolesOf } from './entries.ts';
import { assertExportableEntry, localOnlyWorks, localOnlyElementIds } from './publication.ts';
import { pruneMediaAssets } from './media.ts';
import { scopePluginData } from './plugin-data.ts';
/**
 * 按场景保密分享（D75）：把编译好的 IR 裁剪到若干场景。
 *
 * 不变量：裁剪后的 IR 里不出现范围外功能、方案、场景的 id、名字、目标、角色、说明和步骤文字。
 * - 保留：范围内的场景；它们的方案和功能；场景用得到的画面（起始画面、navigate 能到的画面、方案的层级画面）；这些画面的路径。
 * - 堆叠元素：`from` 是范围外方案的贡献子树默认去掉（when 隐藏的也一样）；范围内步骤引用到子树里的元素时整条子树保留（借用），
 *   并去掉子树里所有指向范围外方案的 `from`。范围内场景跳到别的功能新增的路径时，这个页面也按借用保留，去掉 `addedBy`。
 * - 范围外的分叉去掉；规则、情况、问题只留范围内功能（规则、问题再按方案过滤）；项目说明去掉（常常概述所有功能），项目名保留。
 * dev、publish、review 三种 IR 都能裁剪：share 用它裁剪发布 IR（上传的文件）和 dev IR（评审清单、预览图）。
 */
import { pruneMessages } from './content-i18n.ts';
import { featuresOf } from './features.ts';
import { JoploError } from './result.ts';
import type { Project, Scene, SceneNode, Step } from './schema.ts';

/** 作者要分享的范围：场景 id 与首页条目 id（功能取选定作品；评审版取全部作品；独立作品取自身）。 */
export type ScopeRequest = { scenarios?: readonly string[]; entryIds?: readonly string[] };
/** publish = 只发布选定方案；review = 评审版（全部方案）。 */
export type ScopeMode = 'publish' | 'review';

/** 因为被范围内步骤引用而带上的别的功能的内容（只给作者看：终端输出、看板浮层，不进分享）。 */
export type ScopeBorrowed =
  | { kind: 'element'; entryId: string; entryTitle: string; workId: string; elementId: string; route: string; refs: string[]; scenarios: string[] }
  | { kind: 'page'; entryId: string; entryTitle: string; workId: string; route: string; scenarios: string[] };

export type ScopeInfo = {
  /** `.joplo/cloud.json` 里这个范围的键：排序后的场景 id，用逗号连接；评审版前缀 `review:`。 */
  key: string;
  scenarios: string[];
  entryIds: string[];
  borrowed: ScopeBorrowed[];
};

export const hasScope = (r: ScopeRequest | undefined): r is ScopeRequest => !!r && ((r.scenarios?.length ?? 0) > 0 || (r.entryIds?.length ?? 0) > 0);

export const scopeKey = (scenarios: readonly string[], mode: ScopeMode): string => `${mode === 'review' ? 'review:' : ''}${[...scenarios].sort().join(',')}`;

/** 演示顺序：按功能顺序（entryIds），同一功能里按 IR 顺序。 */
function demoOrder(project: Project): string[] {
  const rank = new Map(project.entryIds.map((id, i) => [id, i]));
  const all = Object.values(project.scenarios);
  const r = (workId: string) => rank.get(project.works[workId]?.featureId ?? workId) ?? rank.size;
  return all.map((s, i) => ({ s, i })).sort((a, b) => r(a.s.workId) - r(b.s.workId) || a.i - b.i).map(({ s }) => s.id);
}

/** 在给定模式下可分享的场景：publish 只有各功能选定方案的场景。 */
function shareable(project: Project, mode: ScopeMode): string[] {
  const local = localOnlyWorks(project);
  const picked = new Set(featuresOf(project).map((f) => f.pick).filter((p): p is string => !!p));
  return Object.values(project.scenarios).filter((s) => !local.has(s.workId) && (mode === 'review' || !project.works[s.workId]?.featureId || picked.has(s.workId))).map((s) => s.id);
}

function listLines(project: Project, ids: string[]): string {
  const shown = ids.slice(0, 20).map((id) => `  ${id}  ${project.scenarios[id]?.name ?? ''}`);
  return shown.length ? `\n${shown.join('\n')}${ids.length > shown.length ? `\n  … ${ids.length - shown.length} more` : ''}` : ' (none)';
}

/**
 * 把作者写的范围解析成场景 id（保持 IR 里的顺序）。写错的场景或功能、没有选定方案、范围为空时报错，调用方不应发布任何东西。
 */
export function resolveScope(project: Project, request: ScopeRequest, mode: ScopeMode): string[] {
  const ok = new Set(shareable(project, mode));
  const out = new Set<string>();
  for (const fid of request.entryIds ?? []) {
    const f = project.features[fid];
    const entry = entryOf(project, fid);
    if (!entry) {
      const known = entriesOf(project).map((x) => x.id).join(', ') || 'none';
      throw new JoploError('NOT_FOUND', `Unknown entry "${fid}"${mode === 'publish' ? ', or it has no picked work' : ''}. Entries: ${known}`, { details: { scope: 'feature', id: fid } });
    }
    assertExportableEntry(project, fid);
    const opts = f ? mode === 'review' ? f.workIds : f.pick ? [f.pick] : [] : [fid];
    if (!opts.length) throw new JoploError('USAGE', `Feature "${fid}" has no picked work, so nothing of it is published. Pick an alternative (feature.pick), or share the review version (--review)`, { details: { scope: 'feature', id: fid } });
    for (const s of Object.values(project.scenarios)) if (opts.includes(s.workId)) out.add(s.id);
  }
  for (const sid of request.scenarios ?? []) {
    const s = project.scenarios[sid];
    if (s) assertExportableEntry(project, project.works[s.workId]?.featureId ?? s.workId);
    if (s && ok.has(sid)) { out.add(sid); continue; }
    if (s) {
      const o = project.works[s.workId];
      throw new JoploError('USAGE', `Scenario ${sid} belongs to work ${s.workId}, which is not the picked work of feature "${o?.featureId ?? '?'}"; only picked works are published. Pick it, or share the review version (--review)`, { details: { scope: 'scenario', id: sid } });
    }
    const all = [...ok];
    const near = all.filter((id) => id.includes(sid) || sid.includes(id));
    const hint = near.length ? `Did you mean:${listLines(project, near)}` : `Scenarios you can share:${listLines(project, all)}`;
    throw new JoploError('NOT_FOUND', `Unknown scenario ${sid}. ${hint}\nNothing was built or uploaded`, { details: { scope: 'scenario', id: sid } });
  }
  const ids = demoOrder(project).filter((id) => out.has(id));
  if (!ids.length) throw new JoploError('USAGE', 'The scope has no scenarios; nothing to share');
  return ids;
}

/** 一步里引用到的元素 id：操作目标、镜头、标注、焦点提示、标注气泡、trace。 */
export function stepRefs(st: Step): string[] {
  const out: string[] = [];
  if ('target' in st.action) out.push(st.action.target);
  if ((st.action.type === 'drag' || st.action.type === 'scroll') && typeof st.action.to === 'string') out.push(st.action.to);
  for (const s of st.shots) out.push(...s.targets);
  for (const m of st.marks) out.push(m.target);
  for (const c of st.cues ?? []) out.push(...c.targets);
  for (const c of st.callouts ?? []) out.push(c.target);
  out.push(...st.references ?? []);
  return out;
}

function idsIn(n: SceneNode, out: string[] = []): string[] {
  out.push(n.id);
  for (const c of n.children ?? []) idsIn(c, out);
  return out;
}

/**
 * 裁剪到给定场景（先用 resolveScope 解析）。返回新的 IR（输入不变）和范围说明。
 */
export function scopeProject(project: Project, scenarioIds: readonly string[], mode: ScopeMode = project.mode === 'review' ? 'review' : 'publish'): { project: Project; info: ScopeInfo } {
  const local = localOnlyWorks(project);
  const privateElements = localOnlyElementIds(project, local);
  for (const id of scenarioIds) {
    const s = project.scenarios[id];
    if (s) assertExportableEntry(project, project.works[s.workId]?.featureId ?? s.workId);
    if (s?.from && local.has(project.scenarios[s.from]?.workId ?? '')) throw new JoploError('USAGE', 'A shared slice cannot continue a draft or empty work');
  }
  const S = new Set(scenarioIds.filter((id) => project.scenarios[id]));
  if (!S.size) throw new JoploError('USAGE', 'The scope has no scenarios; nothing to share');
  for (const sid of S) if (project.scenarios[sid]!.steps.some(st => stepRefs(st).some(id => privateElements.has(id))))
    throw new JoploError('USAGE', 'A shared slice cannot reference draft or private elements');
  const O = new Set([...S].map((id) => project.scenarios[id]!.workId));
  const F = new Set([...O].map((id) => project.works[id]?.featureId).filter((f): f is string => !!f));

  // 引用：元素 id → 引用它的场景
  const refBy = new Map<string, Set<string>>();
  for (const sid of S) for (const st of project.scenarios[sid]!.steps) for (const id of stepRefs(st)) {
    const set = refBy.get(id) ?? new Set<string>();
    set.add(sid);
    refBy.set(id, set);
  }

  // 用得到的画面 → 用到它的场景
  const sceneBy = new Map<string, Set<string>>();
  const useScene = (id: string, sid: string) => {
    if (!project.scenes[id]) return;
    const scene = project.scenes[id]!;
    if (local.has(scene.workId ?? '') || local.has(project.routes[scene.route]?.addedBy ?? '')) throw new JoploError('USAGE', 'A shared slice cannot use a draft or empty work page');
    const set = sceneBy.get(id) ?? new Set<string>();
    set.add(sid);
    sceneBy.set(id, set);
  };
  for (const sid of S) {
    const s = project.scenarios[sid]!;
    useScene(s.initial.sceneId, sid);
    for (const st of s.steps) for (const e of st.effects) if (e.type === 'navigate') useScene(e.sceneId, sid);
    for (const l of Object.values(project.works[s.workId]?.layers ?? {})) useScene(l.sceneId, sid);
  }

  const borrowed: ScopeBorrowed[] = [];
  const entryOwnerOf = (workId: string) => {
    const fid = project.works[workId]?.featureId ?? workId;
    const entry = entryOf(project, fid);
    return { entryId: fid, entryTitle: entry?.title ?? fid };
  };
  /** 借用的子树：整条保留，去掉所有指向范围外方案的 from。 */
  const strip = (n: SceneNode): SceneNode => {
    const { from, children, ...rest } = n;
    return { ...rest, ...(from !== undefined && O.has(from) ? { from } : {}), ...(children ? { children: children.map(strip) } : {}) } as SceneNode;
  };
  const prune = (n: SceneNode, scene: Scene, users: Set<string>): SceneNode | null => {
    if (n.from && local.has(n.from)) {
      if (idsIn(n).some(id => refBy.has(id))) throw new JoploError('USAGE', 'A shared slice cannot borrow draft or private elements');
      return null;
    }
    if (n.from !== undefined && !O.has(n.from)) {
      const ids = idsIn(n);
      const refs = ids.filter((id) => refBy.has(id));
      if (!refs.length) return null;
      const who = new Set(refs.flatMap((id) => [...refBy.get(id)!]).filter((sid) => users.has(sid)));
      borrowed.push({ kind: 'element', ...entryOwnerOf(n.from), workId: n.from, elementId: n.id, route: scene.route, refs, scenarios: [...(who.size ? who : users)] });
      return strip(n);
    }
    if (!n.children) return n;
    return { ...n, children: n.children.map((c) => prune(c, scene, users)).filter((c): c is SceneNode => c !== null) };
  };

  const scenes: Project['scenes'] = {};
  for (const [id, scene] of Object.entries(project.scenes)) {
    const users = sceneBy.get(id);
    if (!users) continue;
    const root = prune(scene.root, scene, users);
    if (!root && local.has(scene.root.from ?? '')) throw new JoploError('USAGE', 'A shared slice cannot use a draft or private stage');
    scenes[id] = { ...scene, root: root ?? scene.root };
  }

  // 路径：只留用得到的画面的路径；别的功能新增的页面按借用保留
  const routes: Project['routes'] = {};
  const paths = new Set(Object.values(scenes).map((s) => s.route));
  for (const [p, r] of Object.entries(project.routes)) {
    if (!paths.has(p)) continue;
    if (r.addedBy && !O.has(r.addedBy)) {
      const users = new Set(Object.entries(scenes).filter(([, s]) => s.route === p).flatMap(([id]) => [...(sceneBy.get(id) ?? [])]));
      borrowed.push({ kind: 'page', ...entryOwnerOf(r.addedBy), workId: r.addedBy, route: p, scenarios: [...users] });
      const { addedBy: _a, ...rest } = r;
      routes[p] = rest;
    } else routes[p] = r;
  }
  // 画面之间不会互相借用页面以外的东西；同一元素在多个画面被借用时合并成一条
  const seen = new Set<string>();
  const merged = borrowed.filter((b) => {
    const k = b.kind === 'element' ? `e|${b.workId}|${b.elementId}|${b.route}` : `p|${b.route}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });

  const scenarios: Project['scenarios'] = {};
  for (const sid of Object.keys(project.scenarios)) {
    if (!S.has(sid)) continue;
    const s = project.scenarios[sid]!;
    const { from, ...rest } = s;
    scenarios[sid] = { ...rest, ...(from && S.has(from) ? { from } : {}), steps: s.steps.map((st) => (st.forks.some((f) => !S.has(f.scenarioId)) ? { ...st, forks: st.forks.filter((f) => S.has(f.scenarioId)) } : st)) };
  }
  const works: Project['works'] = {};
  for (const [id, o] of Object.entries(project.works)) {
    if (!O.has(id)) continue;
    const retained = new Set(Object.values(scenes).filter(s => s.workId === id || s.workId === null).flatMap(s => idsIn(s.root)));
    const free = o.free ? Object.fromEntries(Object.entries(o.free).filter(([, reaction]) => {
      const a = reaction.action;
      return 'target' in a && retained.has(a.target) && (!('to' in a) || typeof a.to !== 'string' || retained.has(a.to));
    })) : undefined;
    works[id] = { ...o, ...(free ? { free } : {}) };
  }
  const features: Project['features'] = {};
  for (const f of featuresOf(project)) {
    if (!F.has(f.id)) continue;
    const workIds = f.workIds.filter((x) => O.has(x));
    const alternatives = Object.fromEntries(workIds.map(id => {
      const alternative = f.alternatives[id]!;
      const coverage = Object.fromEntries(Object.entries(alternative.coverage)
        .filter(([cid]) => F.has(project.cases[cid]?.featureId ?? ''))
        .map(([cid, c]) => [cid, { ...c, scenarioIds: c.scenarioIds.filter(sid => S.has(sid)) }]));
      return [id, { ...alternative, coverage }];
    }));
    features[f.id] = { ...f, workIds, alternatives, pick: f.pick && O.has(f.pick) ? f.pick : null };
  }
  const entryIds = project.entryIds.filter((id) => F.has(id) || O.has(id));
  const inF = (x: { featureId: string; workId?: string }) => F.has(x.featureId) && (x.workId === undefined || O.has(x.workId));
  const roleIds = new Set([...O].flatMap(id => rolesOf(project,id).map((r) => r.id).filter((r): r is string => !!r)));
  const onlyRoles = (r: Record<string, string>) => Object.fromEntries(Object.entries(r).filter(([k]) => roleIds.has(k)));
  const keepRoles = <T extends { roles?: Record<string, string>; locales?: Record<string, { roles?: Record<string, string> }> }>(v: T | undefined): T | undefined =>
    v && (v.roles || v.locales)
      ? {
        ...v,
        ...(v.roles ? { roles: onlyRoles(v.roles) } : {}),
        ...(v.locales ? { locales: Object.fromEntries(Object.entries(v.locales).map(([l, x]) => [l, x.roles ? { ...x, roles: onlyRoles(x.roles) } : x])) } : {}),
      }
      : v;

  const out: Project = {
    ...project,
    // 项目说明常常概述所有功能：范围分享里不带；项目名保留（分享标题与页面标题要用，作者自己决定怎么起）
    description: '',
    routes,
    features,
    entryIds,
    cases: Object.fromEntries(Object.entries(project.cases).filter(([, c]) => F.has(c.featureId))),
    works,
    rules: Object.fromEntries(Object.entries(project.rules).filter(([, r]) => inF(r)).map(([id, r]) => [id, { ...r, elementIds: r.elementIds.filter(element => !privateElements.has(element)) }])),
    scenes,
    scenarios,
    issues: Object.fromEntries(Object.entries(project.issues).filter(([, i]) => inF(i))),
    ...(project.voiceConfig ? { voiceConfig: keepRoles(project.voiceConfig)! } : {}),
    ...(project.voiceIndex ? { voiceIndex: keepRoles(project.voiceIndex)! } : {}),
  };
  const ids = Object.keys(scenarios);
  // 译文只留范围内用得到的（D84）：别的功能的文字不随范围分享出去
  return { project: pruneMediaAssets(pruneMessages(scopePluginData(out))), info: { key: scopeKey(ids, mode), scenarios: ids, entryIds: out.entryIds, borrowed: merged } };
}

/** 一条借用的说明（英文，CLI 与看板共用）。 */
export function borrowedLine(b: ScopeBorrowed): string {
  return b.kind === 'element'
    ? `${b.entryTitle} › element "${b.elementId}" on ${b.route} (referenced by ${b.refs.join(', ')})`
    : `${b.entryTitle} › page ${b.route} (the scenario navigates there)`;
}
