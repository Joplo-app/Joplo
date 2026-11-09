/**
 * 作品（D102，纯函数）：项目里可以独立观看的一件东西。现在有两种形态——功能演示（demo）与影片（film），
 * 以后的形态（例如交互作品）也走这里。
 *
 * 不变量：任何形态的作品都能投影成同一个 Work——标题、一句话简介、给谁看、按播放顺序的切片与时长。
 * 项目的首页（作品卡片）和每个作品的封面只读 Work，不认识具体形态的内部结构；所以新增形态时，
 * 首页与封面的能力自动具备，只需要在这里给出它的投影。
 *
 * IR 里两种形态共用 Feature / Option / Scenario：
 * - demo：播放的是选定的方案（没有选定时取第一个方案），切片 = 这个方案的场景；
 * - film：只有一个方案（作者看不到这一层），切片 = 章节。
 */
import { scenarioPlanMs } from './step-plan.ts';
import { orderedFeatures } from './features.ts';
import type { Project, Scenario } from './schema.ts';

export type WorkKind = 'demo' | 'film';

/** 作品里可以单独打开的一段：功能演示的场景、影片的章节。 */
export type WorkSlice = {
  /** 场景 id（深链、分享、导出都用它）。 */
  id: string;
  /** 作者写的键（场景键 / 章节键）。 */
  key: string;
  title: string;
  description: string;
  steps: number;
  /** 按 1× 自动播放的估算时长（毫秒，stepPlan 之和）。 */
  ms: number;
  /** 是否在连续播放的顺序里（autoplay: false 的支线不在）。 */
  inSequence: boolean;
};

export type Work = {
  /** 作品 id = IR 的 feature id。 */
  id: string;
  kind: WorkKind;
  title: string;
  /** 一句话简介：功能演示是目标（goal），影片是 summary。 */
  summary: string;
  /** 给谁看的一句话：影片的 audience；没写时为 null。 */
  audience: string | null;
  /** 角色的名字（去重，按声明顺序）：功能演示用它表达“面向谁”，影片里是出场说话的人。界面按自己的语言连接。 */
  roles: string[];
  /** 草稿：不进发布与分享。 */
  draft: boolean;
  /** 播放用的方案：影片唯一的那个；功能演示是选定的方案，没有选定时取第一个；没有方案时为 null。 */
  optionId: string | null;
  /** 切片：先是连续播放顺序里的（playSequence），再是不在顺序里的支线，各自按声明顺序。 */
  slices: WorkSlice[];
  /** 连续播放顺序里各切片的时长之和（毫秒）。 */
  ms: number;
};

export const workKind = (feature: { kind?: WorkKind } | null | undefined): WorkKind => feature?.kind ?? 'demo';

/** 某个方案的场景，按声明顺序。 */
export const scenariosOf = (project: Pick<Project, 'scenarios'>, optionId: string | null | undefined): Scenario[] =>
  optionId ? Object.values(project.scenarios).filter((s) => s.optionId === optionId) : [];

/**
 * 连续播放的顺序（D92 U2 / R9；看板、发布站、嵌入与录制 --chain 共用）：按声明顺序取不接力的场景（根），每个根之后
 * 深度优先接上 from 接力它的章（多章接同一章时按声明顺序）。autoplay: false 的场景连同接在它后面的章都不进顺序。
 */
export function playSequence(project: Pick<Project, 'scenarios'>, optionId: string | null | undefined): Scenario[] {
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

/** 一个作品的投影；feature 不存在时为 null。 */
export function workOf(project: Project, featureId: string | null | undefined): Work | null {
  const f = featureId ? project.features[featureId] : undefined;
  if (!f) return null;
  const optionId = (f.pick && project.options[f.pick] ? f.pick : f.optionIds.find((id) => project.options[id])) ?? null;
  const sequence = playSequence(project, optionId);
  const inSequence = new Set(sequence.map((s) => s.id));
  const ordered = [...sequence, ...scenariosOf(project, optionId).filter((s) => !inSequence.has(s.id))];
  const slices = ordered.map((s): WorkSlice => ({
    id: s.id,
    key: s.id.slice(s.optionId.length + 1),
    title: s.name,
    description: s.description,
    steps: s.steps.length,
    ms: scenarioPlanMs(project, s.steps),
    inSequence: inSequence.has(s.id),
  }));
  const roles = f.roles.map((r) => r.name.trim()).filter(Boolean);
  return {
    id: f.id,
    kind: workKind(f),
    title: f.name,
    summary: f.goal,
    audience: f.audience?.trim() || null,
    roles: [...new Set(roles)],
    draft: f.draft === true,
    optionId,
    slices,
    ms: slices.reduce((sum, s) => sum + (s.inSequence ? s.ms : 0), 0),
  };
}

/** 项目里的全部作品，按演示顺序（orderedFeatures）。首页的卡片、看板顶栏的下拉、outline 都从这里取。 */
export function worksOf(project: Project): Work[] {
  return orderedFeatures(project).map((f) => workOf(project, f.id)!).filter(Boolean);
}
