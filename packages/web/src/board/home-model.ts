/**
 * 看板首页的视图模型（D55「首页」，纯函数）：项目路径缩写、项目徽标、↑↓ 移动选中、项目摘要、功能卡片。
 */
import { displaySceneId, type Project } from '@joplo-app/core';
import type { ProjectSummary } from '../runtime/dev-client';
import { optionsOf, scenariosOf } from '../runtime/views';
import { gapsOf, optionLabel } from './nav-model';

/** 路径缩写：家目录写 ~；家目录之下超过两段时只留最后两段（“…/examples/agent-arch”）。 */
export function shortPath(dir: string): string {
  if (!dir) return '';
  const m = /^\/(?:Users|home)\/[^/]+(\/.*)?$/.exec(dir);
  if (!m) return dir;
  const rest = (m[1] ?? '').split('/').filter(Boolean);
  return rest.length > 2 ? `…/${rest.slice(-2).join('/')}` : `~/${rest.join('/')}`;
}

/** 左栏徽标：编译出错写错误数，目录不存在写“找不到”；正常没有。 */
export function projectBadge(p: Pick<ProjectSummary, 'status' | 'errors'>): { text: string; tone: 'danger' | 'na' } | null {
  if (p.status === 'error') return { text: p.errors > 0 ? `${p.errors} 错误` : '出错', tone: 'danger' };
  if (p.status === 'missing') return { text: '找不到', tone: 'na' };
  return null;
}

/** ↑↓ 移动选中：到头停住；没有选中（或选中的不在列表里）时从第一个开始。 */
export function moveSelection(list: readonly { id: string }[], selectedId: string | null, delta: number): string | null {
  if (!list.length) return null;
  const i = list.findIndex((p) => p.id === selectedId);
  if (i < 0) return list[0]!.id;
  return list[Math.max(0, Math.min(list.length - 1, i + delta))]!.id;
}

export function projectMeta(project: Project): string {
  const fs = Object.values(project.features);
  return `${fs.length} 个功能 · 已选定 ${fs.filter((f) => f.pick).length} / ${fs.length}`;
}

export type FeatureCard = {
  id: string;
  name: string;
  goal: string;
  pick: { letter: string; title: string } | null;
  optionCount: number;
  /** 选定方案（没有时第一个方案）的覆盖小结。 */
  coverage: { missing: number; undecided: number; allExpressed: boolean };
  /** 整张卡片点了打开哪里：有选定方案就用它，否则第一个方案；没有方案时 null（不能打开）。 */
  open: { featureId: string; optionId: string } | null;
  /** 缩略图：这个方案第一个场景的初始画面（render 模式渲染）。 */
  thumb: { scenarioId: string; sceneId: string } | null;
};

export function featureCard(project: Project, featureId: string): FeatureCard | null {
  const f = project.features[featureId];
  if (!f) return null;
  const options = optionsOf(project, featureId);
  const pickIdx = f.pick ? options.findIndex((o) => o.id === f.pick) : -1;
  const target = pickIdx >= 0 ? options[pickIdx]! : (options[0] ?? null);
  const g = gapsOf(project, target?.id ?? null);
  const sc = target ? scenariosOf(project, target.id)[0] : undefined;
  const sceneId = sc ? displaySceneId(project, sc.id, 0) : null;
  return {
    id: f.id,
    name: f.name,
    goal: f.goal,
    pick: pickIdx >= 0 ? optionLabel(options[pickIdx]!, pickIdx) : null,
    optionCount: options.length,
    coverage: { ...g, allExpressed: !!target && f.caseIds.length > 0 && g.missing === 0 && g.undecided === 0 },
    open: target ? { featureId: f.id, optionId: target.id } : null,
    thumb: sc && sceneId && project.scenes[sceneId] ? { scenarioId: sc.id, sceneId } : null,
  };
}
