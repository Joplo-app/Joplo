/**
 * 演示页的 URL ↔ 演示控制器（看板与发布站共用）。
 *
 * - resolvePlay：从 URL 算出要播放的方案、场景、位置。情况 c 优先：播放当前方案里覆盖它的第一个场景；
 *   方案没有表达它（覆盖状态不是“已表达”）时返回 gap，画面静态展示方案的页面。
 *   没写场景时：切片独立时取方案的第一个场景；切片是章节（Entry.sequencing = linear）时取播放顺序里的第一章（封面画在它的第 0 步）。
 * - usePlaySync：URL 变化 → 控制器定位（不弹“已切换”提示）；控制器的场景 / 位置变化 → 写回 URL（replaceState）。
 *   两个方向都只在不一致时动作，所以不会来回触发。
 */
import { useEffect, useMemo } from 'react';
import { entryOf, type Coverage, type Project, type Scenario } from '@joplo-app/core/runtime';
import type { DemoController, Snapshot } from '../runtime/demo';
import type { PlayRoute } from '../runtime/route';
import { worksOf, scenariosOf } from '../runtime/views';
import { firstSlice, isLinear } from './work-view';

export type Resolved = {
  ok: boolean;
  workId: string | null;
  scenarioId: string | null;
  step: number;
  caseId: string | null;
  /** 当前方案没有表达所选情况（只在有情况数据的看板上出现）。 */
  gap: { status: Coverage['status'] | 'none'; reason?: string; basis?: Coverage['basis'] } | null;
};

export function resolvePlay(project: Project, play: PlayRoute): Resolved {
  const entry = entryOf(project, play.featureId);
  const f = entry?.featureId ? project.features[entry.featureId] : null;
  if (!entry) return { ok: false, workId: null, scenarioId: null, step: 0, caseId: null, gap: null };
  const works = worksOf(project, entry.featureId);
  const workId = play.workId && works.some((o) => o.id === play.workId) ? play.workId : entry.workId;
  const alternative = workId ? f?.alternatives[workId] : null;
  const scs = scenariosOf(project, workId);
  const caseId = f && play.caseId && project.cases?.[play.caseId] ? play.caseId : null;
  let scenarioId: string | null = null;
  let gap: Resolved['gap'] = null;
  if (play.scenarioId && scs.some((s) => s.id === play.scenarioId) && (!caseId || project.scenarios[play.scenarioId]!.caseIds.includes(caseId) || alternative?.coverage[caseId]?.scenarioIds.includes(play.scenarioId)))
    scenarioId = play.scenarioId;
  else if (caseId) {
    const cov = alternative?.coverage[caseId];
    const ids = (cov?.scenarioIds ?? []).filter((id) => scs.some((s) => s.id === id));
    const byCase = ids[0] ?? scs.find((s) => s.caseIds.includes(caseId))?.id ?? null;
    if (cov?.status === 'expressed' && byCase) scenarioId = byCase;
    else gap = { status: cov?.status ?? 'none', basis: cov?.basis, ...(cov?.reason ? { reason: cov.reason } : {}) };
  } else {
    // 章节从播放顺序里的第一章开始；只认播放用的那件作品（看板里切到功能的其他方案时用那个方案自己的第一个场景）
    scenarioId = (entry && entry.workId === workId && isLinear(entry) ? firstSlice(entry)?.id : null) ?? scs[0]?.id ?? null;
  }
  const total = scenarioId ? project.scenarios[scenarioId]!.steps.length : 0;
  const step = Math.max(0, Math.min(play.step ?? 0, total));
  return { ok: true, workId, scenarioId, step, caseId, gap };
}

/** 方案的静态画面：方案自己的画面优先（它新增或堆叠的路径），没有则用发布视图。 */
export function workSceneId(project: Project, workId: string | null): string | null {
  if (!workId) return null;
  const sc = scenariosOf(project, workId)[0];
  if (sc && project.scenes[sc.initial.sceneId]) return sc.initial.sceneId;
  return Object.values(project.scenes).find((s) => s.workId === workId)?.id ?? null;
}

/** 场景变化时同步情况键；否则旧情况会在 resolvePlay 中把分叉目标重新解析回原场景。 */
export function playForScenario(play: PlayRoute, scenario: Scenario, step: number): PlayRoute {
  const { caseId: previousCase, ...rest } = play;
  const caseId = previousCase && scenario.caseIds.includes(previousCase) ? previousCase : scenario.caseIds[0];
  return { ...rest, workId: scenario.workId, scenarioId: scenario.id, step, ...(caseId ? { caseId } : {}) };
}

export function usePlaySync(ctl: DemoController, snap: Snapshot, project: Project | null, play: PlayRoute, write: (next: PlayRoute) => void): Resolved | null {
  const resolved = useMemo(() => (project ? resolvePlay(project, play) : null), [project, play]);

  // URL → 控制器
  useEffect(() => {
    if (!project || !resolved?.ok || !snap.project) return;
    if (resolved.scenarioId) {
      const same = snap.view === 'stage' && snap.scenarioId === resolved.scenarioId && snap.state?.position === resolved.step;
      if (!same) ctl.setScenario(resolved.scenarioId, resolved.step, { quiet: true });
    } else {
      const sceneId = workSceneId(project, resolved.workId);
      if (sceneId && !(snap.view === 'browse' && snap.browseSceneId === sceneId)) ctl.preview(sceneId);
    }
    // 只在 URL（或首次拿到项目）时定位；控制器自身的变化由下面写回 URL
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resolved, !!snap.project]);

  // 控制器 → URL
  useEffect(() => {
    // 读最新快照：同一次提交里上面的定位可能刚刚改变了控制器
    const s = ctl.getSnapshot();
    if (!resolved?.ok || s.view !== 'stage' || !s.scenarioId || !s.state) return;
    if (s.scenarioId === resolved.scenarioId && s.state.position === resolved.step) return;
    const sc = project?.scenarios[s.scenarioId];
    if (!sc) return;
    write(playForScenario(play, sc, s.state.position));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snap.scenarioId, snap.state?.position, snap.view]);

  return resolved;
}
