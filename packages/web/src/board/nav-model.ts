import { featuresOf, entriesOf, type Entry } from '@joplo-app/core/runtime';
import { isLinear } from '../player/work-view';
import { boardEnglish, type BoardMessages } from '../i18n/board/dictionaries';
/**
 * 看板左栏与顶栏下拉的视图模型（纯函数，创作侧，不进发布站）：方案字母与名字、缺口统计、其他方案的小标、
 * 情况行的悬停卡片、缺口汇总命令、功能下拉。
 */
import type { Coverage, Work, Project } from '@joplo-app/core/runtime';
import { worksOf, shortName, alternativeOf, featureForWork } from '../runtime/views';
import { coverageMark, type CoverageStatus } from '../player/status';

export const statusOf = (project: Project, workId: string, caseId: string): CoverageStatus => alternativeOf(project, workId)?.coverage[caseId]?.status ?? 'none';

/** 缺口统计；missingHigh（D67）是缺失里高优先级的情况数（PM 视角：最该先补的验收条件）。 */
export function gapsOf(project: Project, workId: string | null): { missing: number; undecided: number; missingHigh: number } {
  const f = featureForWork(project, workId);
  if (!f || !workId) return { missing: 0, undecided: 0, missingHigh: 0 };
  let missing = 0;
  let undecided = 0;
  let missingHigh = 0;
  for (const c of f.caseIds) {
    const s = statusOf(project, workId, c);
    if (s === 'missing' || s === 'none') {
      missing++;
      if (project.cases[c]?.priority === 'high') missingHigh++;
    } else if (s === 'undecided') undecided++;
  }
  return { missing, undecided, missingHigh };
}

/** 情况的 PM 视角摘要（D67）：是否高优先级、期望结果（Then；没写时为 null）。只读现有的 case.priority / case.expected。 */
export function caseBrief(project: Project, caseId: string): { high: boolean; expected: string | null } {
  const c = project.cases[caseId];
  return { high: c?.priority === 'high', expected: c?.expected.trim() ? c.expected.trim() : null };
}

/** 功能是给谁的：feature.roles 的名字（旧的名字数组与 role() 键都算），按声明顺序去重。 */
export function rolesOfFeature(project: Pick<Project, 'features'>, featureId: string): string[] {
  return [...new Set((project.features[featureId]?.roles ?? []).map((r) => r.name.trim()).filter(Boolean))];
}

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

/** 「A · 单人邮件邀请弹窗」→ 字母 A + 名字；没有短前缀（≤ 3 个字符）时按顺序补字母。 */
export function workLabel(work: Pick<Work, 'title'>, index: number): { letter: string; title: string } {
  const short = shortName(work.title);
  if (short !== work.title && short.length <= 3) return { letter: short, title: work.title.slice(short.length + 3) };
  return { letter: LETTERS[index] ?? String(index + 1), title: work.title };
}

/** 方案在所属功能里的字母（找不到时用 ?）。 */
export function letterOf(project: Project, workId: string): string {
  const o = project.works[workId];
  if (!o) return '?';
  const i = featureForWork(project, workId)?.workIds.indexOf(workId) ?? -1;
  return workLabel(o, Math.max(0, i)).letter;
}

const gapText = (g: { missing: number; undecided: number }, i18n: BoardMessages = boardEnglish) => [g.missing ? i18n.board.missingCount(g.missing) : '', g.undecided ? i18n.board.undecidedCount(g.undecided) : ''].filter(Boolean).join(' · ');

export function workMeta(project: Project, workId: string, i18n: BoardMessages = boardEnglish): { picked: boolean; missing: number; undecided: number; text: string } {
  const o = project.works[workId];
  if (!o) return { picked: false, missing: 0, undecided: 0, text: '' };
  const { missing, undecided } = gapsOf(project, workId);
  return { picked: featureForWork(project, workId)?.pick === workId, missing, undecided, text: gapText({ missing, undecided }, i18n) };
}

/** 情况行右侧：其他方案的小标（字母 + 状态图标），悬停写全称“B：缺失”；点一下 = 切到这个方案看同一个情况。 */
export function otherWorkTags(project: Project, featureId: string, currentWorkId: string | null, caseId: string, i18n: BoardMessages = boardEnglish): { workId: string; letter: string; status: CoverageStatus; tip: string }[] {
  return worksOf(project, featureId)
    .filter((o) => o.id !== currentWorkId)
    .map((o) => {
      const status = statusOf(project, o.id, caseId);
      const letter = letterOf(project, o.id);
      return { workId: o.id, letter, status, tip: i18n.board.coverageTip(letter, coverageMark(status, i18n).label) };
    });
}

/** 情况行的悬停卡片：每个方案的状态和原因；点方案名直接切过去。 */
export function caseCard(project: Project, featureId: string, caseId: string, i18n: BoardMessages = boardEnglish): { workId: string; letter: string; title: string; status: CoverageStatus; label: string; detail: string }[] {
  return worksOf(project, featureId).map((o, i) => {
    const cov: Coverage | undefined = alternativeOf(project, o.id)?.coverage[caseId];
    const status: CoverageStatus = cov?.status ?? 'none';
    const scenario = cov?.scenarioIds.map((id) => project.scenarios[id]?.name).find(Boolean);
    const { letter, title } = workLabel(o, i);
    return { workId: o.id, letter, title, status, label: coverageMark(status, i18n).label, detail: cov?.basis === 'derived' && cov.status === 'missing' ? i18n.board.thisCaseIsNotCoveredYet : cov?.reason ?? (scenario ? i18n.board.scenario(scenario) : i18n.board.thisCaseIsNotCoveredYet) };
  });
}

/** 缺口汇总：复制给 Agent 的检查命令。 */
export const gapCommand = (workId: string) => `npx joplo check --work ${workId}`;

/** 顶栏「功能 ▾」：本项目的功能、选定方案与缺口数。 */
export function featureMenu(project: Project, currentFeatureId: string | null, i18n: BoardMessages = boardEnglish): { id: string; name: string; hint: string; current: boolean }[] {
  return featuresOf(project).map((f) => {
    const pick = f.pick ? project.works[f.pick] : null;
    const g = gapsOf(project, f.pick);
    const hint = pick ? [i18n.board.picked2(letterOf(project, pick.id)), gapText(g, i18n)].filter(Boolean).join(' · ') : i18n.board.notPicked;
    return { id: f.id, name: f.name, hint, current: f.id === currentFeatureId };
  });
}

/** 顶栏条目下拉的一项（D102 修订）：分组标题，或一个条目（名字、右侧摘要、是否当前、挂着的功能、草稿）。 */
export type WorkMenuEntry = { id: string; heading: string } | { id: string; name: string; hint: string; current: boolean; featureId: string | null; draft: boolean };

/** 独立作品在下拉里的摘要（按能力）：「5 章 · 4:40」/「3 个场景 · 0:40」，草稿再加「草稿 · 不发布」。时长就是 Entry.ms。 */
export function entryMenuHint(entry: Entry, i18n: BoardMessages = boardEnglish): string {
  const linear = isLinear(entry);
  const seq = entry.slices.filter((s) => s.inSequence).length;
  const time = i18n.player.clock(entry.ms);
  const size = seq > 0
    ? (linear ? i18n.board.chaptersClock(seq, time) : i18n.board.scenariosClock(seq, time))
    : entry.slices.length
      ? (linear ? i18n.player.sideChapterCount(entry.slices.length) : i18n.player.sideScenarioCount(entry.slices.length))
      : linear ? i18n.player.chapterCount(0) : i18n.site.scenarioCount(0);
  return entry.draft ? `${size} · ${i18n.board.draftNotPublished}` : size;
}

/**
 * 顶栏「条目 ▾」（D102 修订）：分两组，先“作品”（独立作品）后“功能”；只有一组时不出分组标题。
 * 功能的一项与原来的 featureMenu 完全相同（选定方案与缺口数），所以只有功能的项目下拉与以前一样。
 */
export function workMenu(project: Project, currentFeatureId: string | null, i18n: BoardMessages = boardEnglish): WorkMenuEntry[] {
  const entries = new Map(entriesOf(project).map((e) => [e.id, e]));
  const works = [...entries.values()].filter((e) => e.featureId === null).map((e) => ({ id: e.id, name: e.title, hint: entryMenuHint(e, i18n), current: e.id === currentFeatureId, featureId: null, draft: e.draft }));
  const features = featureMenu(project, currentFeatureId, i18n).filter((f) => entries.get(f.id)?.featureId != null).map((f) => ({ ...f, featureId: f.id, draft: false }));
  if (!works.length || !features.length) return [...works, ...features];
  return [{ id: 'works', heading: i18n.site.works }, ...works, { id: 'features', heading: i18n.site.features }, ...features];
}

/** 审片命令（D102 方案 A，只有切片是章节时）：整组章节的胶片条（硬切与静止），从播放顺序里的第一章开始接力。没有切片时 null。 */
export function reviewStripCommand(entry: Entry): string | null {
  if (!isLinear(entry)) return null;
  const first = entry.slices.find((s) => s.inSequence) ?? entry.slices[0];
  return first ? `npx joplo render --film --chain --scenario-id ${first.id}` : null;
}

/** 空作品的提示里写哪个文件：作品源码的相对路径（Feature.source 去掉行列）；没有时按约定写 works/<键>.tsx。 */
export function workFile(project: Pick<Project, 'works'>, workId: string): string {
  const src = project.works[workId]?.source ?? '';
  const file = src.replace(/:\d+:\d+$/, '');
  return file || `works/${workId}.tsx`;
}
