import { orderedFeatures, worksOf, type Work, type WorkKind } from '@joplo-app/core/runtime';
import { boardEnglish, type BoardMessages } from '../i18n/board/dictionaries';
/**
 * 看板左栏与顶栏下拉的视图模型（纯函数，创作侧，不进发布站）：方案字母与名字、缺口统计、其他方案的小标、
 * 情况行的悬停卡片、缺口汇总命令、功能下拉。
 */
import type { Coverage, Option, Project } from '@joplo-app/core/runtime';
import { optionsOf, shortName } from '../runtime/views';
import { coverageMark, type CoverageStatus } from '../player/status';

export const statusOf = (project: Project, optionId: string, caseId: string): CoverageStatus => project.options[optionId]?.coverage[caseId]?.status ?? 'none';

/** 缺口统计；missingHigh（D67）是缺失里高优先级的情况数（PM 视角：最该先补的验收条件）。 */
export function gapsOf(project: Project, optionId: string | null): { missing: number; undecided: number; missingHigh: number } {
  const f = optionId ? project.features[project.options[optionId]?.featureId ?? ''] : null;
  if (!f || !optionId) return { missing: 0, undecided: 0, missingHigh: 0 };
  let missing = 0;
  let undecided = 0;
  let missingHigh = 0;
  for (const c of f.caseIds) {
    const s = statusOf(project, optionId, c);
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
export function optionLabel(option: Pick<Option, 'name'>, index: number): { letter: string; title: string } {
  const short = shortName(option.name);
  if (short !== option.name && short.length <= 3) return { letter: short, title: option.name.slice(short.length + 3) };
  return { letter: LETTERS[index] ?? String(index + 1), title: option.name };
}

/** 方案在所属功能里的字母（找不到时用 ?）。 */
export function letterOf(project: Project, optionId: string): string {
  const o = project.options[optionId];
  if (!o) return '?';
  const i = project.features[o.featureId]?.optionIds.indexOf(optionId) ?? -1;
  return optionLabel(o, Math.max(0, i)).letter;
}

const gapText = (g: { missing: number; undecided: number }, i18n: BoardMessages = boardEnglish) => [g.missing ? i18n.board.missingCount(g.missing) : '', g.undecided ? i18n.board.undecidedCount(g.undecided) : ''].filter(Boolean).join(' · ');

export function optionMeta(project: Project, optionId: string, i18n: BoardMessages = boardEnglish): { picked: boolean; missing: number; undecided: number; text: string } {
  const o = project.options[optionId];
  if (!o) return { picked: false, missing: 0, undecided: 0, text: '' };
  const { missing, undecided } = gapsOf(project, optionId);
  return { picked: project.features[o.featureId]?.pick === optionId, missing, undecided, text: gapText({ missing, undecided }, i18n) };
}

/** 情况行右侧：其他方案的小标（字母 + 状态图标），悬停写全称“B：缺失”；点一下 = 切到这个方案看同一个情况。 */
export function otherOptionTags(project: Project, featureId: string, currentOptionId: string | null, caseId: string, i18n: BoardMessages = boardEnglish): { optionId: string; letter: string; status: CoverageStatus; tip: string }[] {
  return optionsOf(project, featureId)
    .filter((o) => o.id !== currentOptionId)
    .map((o) => {
      const status = statusOf(project, o.id, caseId);
      const letter = letterOf(project, o.id);
      return { optionId: o.id, letter, status, tip: i18n.board.coverageTip(letter, coverageMark(status, i18n).label) };
    });
}

/** 情况行的悬停卡片：每个方案的状态和原因；点方案名直接切过去。 */
export function caseCard(project: Project, featureId: string, caseId: string, i18n: BoardMessages = boardEnglish): { optionId: string; letter: string; title: string; status: CoverageStatus; label: string; detail: string }[] {
  return optionsOf(project, featureId).map((o, i) => {
    const cov: Coverage | undefined = o.coverage[caseId];
    const status: CoverageStatus = cov?.status ?? 'none';
    const scenario = cov?.scenarioIds.map((id) => project.scenarios[id]?.name).find(Boolean);
    const { letter, title } = optionLabel(o, i);
    return { optionId: o.id, letter, title, status, label: coverageMark(status, i18n).label, detail: cov?.basis === 'derived' && cov.status === 'missing' ? i18n.board.thisCaseIsNotCoveredYet : cov?.reason ?? (scenario ? i18n.board.scenario(scenario) : i18n.board.thisCaseIsNotCoveredYet) };
  });
}

/** 缺口汇总：复制给 Agent 的检查命令。 */
export const gapCommand = (optionId: string) => `npx joplo check --option ${optionId}`;

/** 顶栏「功能 ▾」：本项目的功能、选定方案与缺口数。 */
export function featureMenu(project: Project, currentFeatureId: string | null, i18n: BoardMessages = boardEnglish): { id: string; name: string; hint: string; current: boolean }[] {
  return orderedFeatures(project).map((f) => {
    const pick = f.pick ? project.options[f.pick] : null;
    const g = gapsOf(project, f.pick);
    const hint = pick ? [i18n.board.picked2(letterOf(project, pick.id)), gapText(g, i18n)].filter(Boolean).join(' · ') : i18n.board.notPicked;
    return { id: f.id, name: f.name, hint, current: f.id === currentFeatureId };
  });
}

/** 顶栏作品下拉的一项（D102）：分组标题，或一个作品（名字、右侧摘要、是否当前）。 */
export type WorkMenuEntry = { id: string; heading: string } | { id: string; name: string; hint: string; current: boolean; kind: WorkKind; draft: boolean };

/** 影片在下拉里的摘要：「5 章 · 4:40」，草稿再加「草稿 · 不发布」。时长就是 Work.ms。 */
export function filmMenuHint(work: Work, i18n: BoardMessages = boardEnglish): string {
  const seq = work.slices.filter((s) => s.inSequence).length;
  const size = seq > 0 ? i18n.board.filmMenuHint(seq, i18n.player.clock(work.ms)) : work.slices.length ? i18n.player.sideChapterCount(work.slices.length) : i18n.player.chapterCount(0);
  return work.draft ? `${size} · ${i18n.board.draftNotPublished}` : size;
}

/**
 * 顶栏「作品 ▾」（D102）：按形态分两组，先影片后功能演示；只有一种形态时不出分组标题。
 * 功能演示的一项与原来的 featureMenu 完全相同（选定方案与缺口数），所以只有功能演示的项目下拉不变。
 */
export function workMenu(project: Project, currentFeatureId: string | null, i18n: BoardMessages = boardEnglish): WorkMenuEntry[] {
  const works = new Map(worksOf(project).map((w) => [w.id, w]));
  const films = [...works.values()].filter((w) => w.kind === 'film').map((w) => ({ id: w.id, name: w.title, hint: filmMenuHint(w, i18n), current: w.id === currentFeatureId, kind: 'film' as const, draft: w.draft }));
  const demos = featureMenu(project, currentFeatureId, i18n).filter((f) => works.get(f.id)?.kind !== 'film').map((f) => ({ ...f, kind: 'demo' as const, draft: false }));
  if (!films.length || !demos.length) return [...films, ...demos];
  return [{ id: 'films', heading: i18n.board.films }, ...films, { id: 'demos', heading: i18n.board.featureDemos }, ...demos];
}

/** 审片命令（D102 方案 A）：整支影片的胶片条（硬切与静止），从播放顺序里的第一章开始接力。没有章节时 null。 */
export function filmReviewCommand(work: Work): string | null {
  const first = work.slices.find((s) => s.inSequence) ?? work.slices[0];
  return first ? `npx joplo render --film --chain --scenario-id ${first.id}` : null;
}

/** 空影片的提示里写哪个文件：影片源码的相对路径（Feature.source 去掉行列）；没有时按约定写 films/<键>.tsx。 */
export function filmFile(project: Pick<Project, 'features'>, featureId: string): string {
  const src = project.features[featureId]?.source ?? '';
  const file = src.replace(/:\d+:\d+$/, '');
  return file || `films/${featureId}.tsx`;
}
