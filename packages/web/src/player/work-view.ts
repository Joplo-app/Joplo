import { en, type Dictionary } from '../i18n/en';
/**
 * 作品的呈现（D102，纯函数，看板、发布站、嵌入、截图页共用；不引用 board/）。
 *
 * 不变量：
 * - 形态只由 entryOf(project, id) 决定，这里不按“有没有情况”“有几个方案”推断；
 * - 标题、简介、给谁看、切片与时长只从 core 的 Entry 取（entries.ts），时长就是 Entry.ms / EntrySlice.ms（stepPlan 之和），不另算；
 * - 章节编号按连续播放顺序（Entry.slices 里 inSequence 的顺序）从 1 开始，显示为两位（01）；支线不编号、单独一组。
 *   作者写在标题里的文字原样显示。
 */
import { entryOf, entriesOf, type Project, type Entry, type EntrySlice } from '@joplo-app/core/runtime';

/** 约略时长（分 + 秒）：一分钟以内沿用封面的取整（10 秒内向上取整、其余按 5 秒）；再长按 10 秒四舍五入。 */
export function approxLength(ms: number): { min: number; sec: number } {
  const s = Math.max(0, ms) / 1000;
  if (s <= 10) return { min: 0, sec: Math.ceil(s - 1e-9) };
  if (s < 60) return { min: 0, sec: Math.min(60, Math.round(s / 5) * 5) };
  let min = Math.floor(s / 60);
  let sec = Math.round((s - min * 60) / 10) * 10;
  if (sec === 60) (min += 1), (sec = 0);
  return { min, sec };
}

export type ChapterRow = EntrySlice & {
  /** 自动编号（1 起）；支线为 null。 */
  n: number | null;
  /** 两位编号文字（01）；支线为 null。 */
  no: string | null;
  current: boolean;
};

/** 影片的章节清单：连续播放顺序里的章节（编号）与支线（不编号），各自按 Entry.slices 的顺序。 */
export function chapterRows(work: Entry, currentScenarioId: string | null, i18n: Dictionary = en): { chapters: ChapterRow[]; side: ChapterRow[] } {
  let n = 0;
  const rows = work.slices.map((s): ChapterRow => {
    const num = work.sequencing === 'linear' && s.inSequence ? ++n : null;
    return { ...s, n: num, no: num === null ? null : i18n.player.chapterNo(num), current: s.id === currentScenarioId };
  });
  return { chapters: rows.filter((r) => r.inSequence), side: rows.filter((r) => !r.inSequence) };
}

/** 某个切片在播放顺序里的编号（1 起）；支线或不在这个作品里时为 null。 */
export function chapterNumber(work: Entry, scenarioId: string | null | undefined): number | null {
  if (work.sequencing !== 'linear') return null;
  const seq = work.slices.filter((s) => s.inSequence);
  const i = seq.findIndex((s) => s.id === scenarioId);
  return i < 0 ? null : i + 1;
}

/** 影片的摘要：「5 章 · 约 4 分 40 秒」；全是支线时「2 条支线」；还没有章节时「0 章」。 */
export function filmMetaText(work: Entry, i18n: Dictionary = en): string {
  const seq = work.slices.filter((s) => s.inSequence).length;
  if (seq === 0 && work.slices.length > 0) return i18n.player.sideChapterCount(work.slices.length);
  if (seq === 0) return i18n.player.chapterCount(0);
  const d = approxLength(work.ms);
  return i18n.player.filmMeta(seq, d.min, d.sec);
}

/** 打开作品时先落在哪个切片：顺序里的第一章（没有时第一个支线）。影片的封面就画在这里。 */
export const firstSlice = (work: Entry): EntrySlice | null => work.slices.find((s) => s.inSequence) ?? work.slices[0] ?? null;

/** 项目里出现的形态（按 Entry 的 kind）。 */
export const formsOf = (works: readonly Entry[]): Set<boolean> => new Set(works.map((w) => w.featureId === null));

/**
 * 发布站打开时落在哪里（不变量：先落在首页或封面上，不直接播放）：只有一个作品 → 这个作品（演示页第 0 步 = 封面）；
 * 多个或没有作品 → 首页。范围分享与普通发布同一条规则。
 */
export function siteLanding(project: Project): { kind: 'home' } | { kind: 'work'; featureId: string } {
  const works = entriesOf(project);
  return works.length === 1 ? { kind: 'work', featureId: works[0]!.id } : { kind: 'home' };
}

/** 场景所属的作品是影片时返回它的 Entry；功能演示或找不到时 null。 */
export function filmOfScenario(project: Project, scenarioId: string | null | undefined): Entry | null {
  const sc = scenarioId ? project.scenarios[scenarioId] : undefined;
  const featureId = sc ? project.options[sc.optionId]?.featureId : undefined;
  const f = featureId ? project.features[featureId] : undefined;
  const entry = f ? entryOf(project, f.id) : null;
  return entry?.sequencing === 'linear' ? entry : null;
}

/** 影片的切片在列表里的名字：顺序里的章节「01 · 标题」，支线只有标题（嵌入的场景切换菜单、下一章卡片等单行场合）。 */
export function sliceLabel(work: Entry, scenarioId: string, title: string, i18n: Dictionary = en): string {
  const n = chapterNumber(work, scenarioId);
  return n === null ? title : `${i18n.player.chapterNo(n)} · ${title}`;
}
