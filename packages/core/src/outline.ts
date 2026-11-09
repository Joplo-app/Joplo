/**
 * 大纲（D67，`joplo outline`）：不看看板也能检查一个演示“讲给谁、讲什么、讲多久”。只读现有 IR，不新增作者概念：
 * - 功能：goal（解决什么）、roles（给谁，旧的名字数组也算）、cases（PM 的验收条件：维度、优先级、expected = Then）与每个方案的覆盖；
 * - 方案与场景：步数、估算时长（与自动播放同一份 stepDwell）、是否以过渡卡开场 / 收尾、结局、覆盖的情况。
 * 估算按 1× 速度、用 IR 里的英文字幕兜底，不含鼠标移动与逐字输入，所以只是“约”。
 */
import { entryOf, type Entry } from './entries.ts';
import { orderedFeatures } from './features.ts';
import { scenarioPlanMs } from './step-plan.ts';
import { JoploError } from './result.ts';
import type { Coverage, Project, Scenario } from './schema.ts';

export type OutlineCase = {
  id: string;
  key: string;
  title: string;
  dimension: string;
  priority: 'high' | 'medium' | 'low';
  /** 期望结果（PM 的 Then）；没写时为空串。 */
  expected: string;
  /** 每个方案的覆盖状态（dev IR 才有）。 */
  coverage: Record<string, Coverage['status']>;
};
export type OutlineScenario = {
  id: string;
  key: string;
  name: string;
  description: string;
  steps: number;
  /** 估算播放时长（毫秒，1×）。 */
  ms: number;
  cards: number;
  /** 第一步 / 最后一步是过渡卡。 */
  opening: boolean;
  ending: boolean;
  outcome: Scenario['mock']['outcome'];
  caseIds: string[];
};
export type OutlineOption = { id: string; key: string; name: string; picked: boolean; ms: number; missing: number; undecided: number; scenarios: OutlineScenario[] };
export type OutlineFeature = { standalone: boolean; sequencing: Entry['sequencing']; draft: boolean; id: string; name: string; goal: string; roles: string[]; pick: string | null; cases: OutlineCase[]; options: OutlineOption[] };
export type Outline = { name: string; mode: Project['mode']; features: OutlineFeature[] };

/** 一个场景按 1× 自动播放大约多久（毫秒）：每一步的时间计划（stepPlan：操作演示 + 停留与朗读估算中较长者）之和。 */
export function scenarioEstimateMs(project: Pick<Project, 'plugins'>, scenario: Pick<Scenario, 'steps'>): number {
  return scenarioPlanMs(project, scenario.steps);
}

export function outline(project: Project, opts: { optionId?: string } = {}): Outline {
  if (opts.optionId && !Object.hasOwn(project.options, opts.optionId)) throw new JoploError('USAGE', `Option does not exist: ${opts.optionId}`);
  const only = opts.optionId ? project.options[opts.optionId]!.featureId : null;
  const features: OutlineFeature[] = [];
  for (const f of orderedFeatures(project)) {
    if (only && f.id !== only) continue;
    const optionIds = f.optionIds.filter((id) => project.options[id] && (!opts.optionId || id === opts.optionId));
    const cases = f.caseIds.flatMap((cid): OutlineCase[] => {
      const c = project.cases[cid];
      if (!c) return [];
      const coverage: OutlineCase['coverage'] = {};
      for (const oid of optionIds) {
        const cov = project.options[oid]!.coverage[cid];
        if (cov) coverage[oid] = cov.status;
      }
      return [{ id: c.id, key: c.id.slice(f.id.length + 1), title: c.title, dimension: c.dimension, priority: c.priority, expected: c.expected, coverage }];
    });
    const options = optionIds.map((oid): OutlineOption => {
      const o = project.options[oid]!;
      const scenarios = Object.values(project.scenarios)
        .filter((s) => s.optionId === oid)
        .map((s): OutlineScenario => ({
          id: s.id,
          key: s.id.slice(oid.length + 1),
          name: s.name,
          description: s.description,
          steps: s.steps.length,
          ms: scenarioEstimateMs(project, s),
          cards: s.steps.filter((st) => st.action.type === 'card').length,
          opening: s.steps[0]?.action.type === 'card',
          ending: s.steps.length > 0 && s.steps.at(-1)!.action.type === 'card',
          outcome: s.mock.outcome,
          caseIds: s.caseIds,
        }));
      const statuses = Object.values(o.coverage).map((c) => c.status);
      return {
        id: oid,
        key: o.key,
        name: o.name,
        picked: f.pick === oid,
        ms: scenarios.reduce((n, s) => n + s.ms, 0),
        missing: statuses.filter((s) => s === 'missing').length,
        undecided: statuses.filter((s) => s === 'undecided').length,
        scenarios,
      };
    });
    const entry = entryOf(project, f.id)!;
    features.push({ standalone: entry.featureId === null, sequencing: entry.sequencing, draft: entry.draft, id: entry.id, name: entry.title, goal: entry.summary, roles: entry.roles, pick: f.pick, cases, options });
  }
  return { name: project.name, mode: project.mode, features };
}
