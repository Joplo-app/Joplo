/** 首页条目：外部只读此投影，内部 Feature / Option 的接缝留在这里。 */
import { scenarioPlanMs } from './step-plan.ts';
import { orderedFeatures } from './features.ts';
import type { Project, Scenario } from './schema.ts';

/** 作品里可以单独打开的一段：功能演示的场景、影片的章节。 */
export type EntrySlice = {
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

export type Entry = {
  /** 作品 id = IR 的 feature id。 */
  id: string;
  /** 功能所属 id；独立作品为 null，不从情况或方案数量推断。 */
  featureId: string | null;
  /** 播放用作品的切片接续能力，与是否挂功能相互独立。 */
  sequencing: 'independent' | 'linear';
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
  workId: string | null;
  /** 切片：先是连续播放顺序里的（playSequence），再是不在顺序里的支线，各自按声明顺序。 */
  slices: EntrySlice[];
  /** 连续播放顺序里各切片的时长之和（毫秒）。 */
  ms: number;
};

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
export function entryOf(project: Project, featureId: string | null | undefined): Entry | null {
  const f = featureId ? project.features[featureId] : undefined;
  if (!f) return null;
  const optionId = (f.pick && project.options[f.pick] ? f.pick : f.optionIds.find((id) => project.options[id])) ?? null;
  const sequence = playSequence(project, optionId);
  const inSequence = new Set(sequence.map((s) => s.id));
  const ordered = [...sequence, ...scenariosOf(project, optionId).filter((s) => !inSequence.has(s.id))];
  const slices = ordered.map((s): EntrySlice => ({
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
    featureId: f.standalone === true ? null : f.id,
    sequencing: optionId ? project.options[optionId]?.sequencing ?? 'independent' : 'independent',
    title: f.name,
    summary: f.goal,
    audience: f.audience?.trim() || null,
    roles: [...new Set(roles)],
    draft: f.draft === true,
    workId: optionId,
    slices,
    ms: slices.reduce((sum, s) => sum + (s.inSequence ? s.ms : 0), 0),
  };
}

/** 项目里的全部作品，按演示顺序（orderedFeatures）。首页的卡片、看板顶栏的下拉、outline 都从这里取。 */
export function entriesOf(project: Project): Entry[] {
  return orderedFeatures(project).map((f) => entryOf(project, f.id)!).filter(Boolean);
}
