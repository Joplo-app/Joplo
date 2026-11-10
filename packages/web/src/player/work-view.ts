import { en, type Dictionary } from '../i18n/en';
/**
 * 条目的呈现（D102 修订，纯函数，看板、发布站、嵌入、截图页共用；不引用 board/）。
 *
 * 不变量：
 * - 没有“形态”：只问 Entry 的能力——featureId（有没有挂功能）、sequencing（切片是章节还是场景）、draft；
 *   不读内部的桥接字段（功能上的“独立”标记、方案上的接续标记），也不按“有没有情况”“有几个方案”推断；
 * - 标题、简介、给谁看、切片与时长只从 core 的 Entry 取（entries.ts），时长就是 Entry.ms / EntrySlice.ms（stepPlan 之和），不另算；
 * - linear 时章节编号按连续播放顺序（Entry.slices 里 inSequence 的顺序）从 1 开始，显示为两位（01）；支线不编号、单独一组。
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
  /** 自动编号（1 起）；independent 与支线为 null。 */
  n: number | null;
  /** 两位编号文字（01）；independent 与支线为 null。 */
  no: string | null;
  current: boolean;
};

/** 切片的叫法只看能力（entry.sequencing）：linear = 章节（编号、时长），independent = 场景。 */
export const isLinear = (entry: Pick<Entry, 'sequencing'>): boolean => entry.sequencing === 'linear';

/** 切片清单与分组的标题：「章节 / 支线」或「场景 / 支线场景」。 */
export function sliceWords(entry: Pick<Entry, 'sequencing'>, i18n: Dictionary = en): { list: string; side: string } {
  return isLinear(entry) ? { list: i18n.player.watchChapters, side: i18n.player.sideChapters } : { list: i18n.site.scenarios, side: i18n.player.sideScenarios };
}

/**
 * 切片清单：连续播放顺序里的（main）与不在顺序里的支线（side），各自按 Entry.slices 的顺序。
 * linear 时 main 按顺序编号（01 起）；independent 与支线不编号。
 */
export function sliceRows(entry: Entry, currentScenarioId: string | null, i18n: Dictionary = en): { main: ChapterRow[]; side: ChapterRow[] } {
  let n = 0;
  const rows = entry.slices.map((s): ChapterRow => {
    const num = isLinear(entry) && s.inSequence ? ++n : null;
    return { ...s, n: num, no: num === null ? null : i18n.player.chapterNo(num), current: s.id === currentScenarioId };
  });
  return { main: rows.filter((r) => r.inSequence), side: rows.filter((r) => !r.inSequence) };
}

/** 某个切片在播放顺序里的章节编号（1 起）；independent、支线或不在这个条目里时为 null。 */
export function chapterNumber(entry: Entry, scenarioId: string | null | undefined): number | null {
  if (!isLinear(entry)) return null;
  const seq = entry.slices.filter((s) => s.inSequence);
  const i = seq.findIndex((s) => s.id === scenarioId);
  return i < 0 ? null : i + 1;
}

/**
 * 条目的摘要：「5 章 · 约 4 分 40 秒」/「3 个场景 · 约 40 秒」；全是支线时「2 条支线」；还没有切片时「0 章」/「0 个场景」。
 * 数量 = 顺序里的切片数，时长 = approxLength(Entry.ms)。
 */
export function entryMetaText(entry: Entry, i18n: Dictionary = en): string {
  const linear = isLinear(entry);
  const seq = entry.slices.filter((s) => s.inSequence).length;
  if (seq === 0 && entry.slices.length > 0) return linear ? i18n.player.sideChapterCount(entry.slices.length) : i18n.player.sideScenarioCount(entry.slices.length);
  if (seq === 0) return linear ? i18n.player.chapterCount(0) : i18n.site.scenarioCount(0);
  const d = approxLength(entry.ms);
  return linear ? i18n.player.chaptersAbout(seq, d.min, d.sec) : i18n.player.scenariosAbout(seq, d.min, d.sec);
}

/** 打开条目时先落在哪个切片：顺序里的第一个（没有时第一个支线）。封面就画在这里。 */
export const firstSlice = (entry: Entry): EntrySlice | null => entry.slices.find((s) => s.inSequence) ?? entry.slices[0] ?? null;

/**
 * 发布站打开时落在哪里（不变量 5：先落在首页或封面上，不直接播放）：只有一个条目 → 这个条目（演示页第 0 步 = 封面），
 * 发布站就是这件作品，没有首页与条目切换；多个或没有条目 → 首页。范围分享与普通发布同一条规则。
 */
export function siteLanding(project: Project): { kind: 'home' } | { kind: 'work'; featureId: string } {
  const entries = entriesOf(project);
  return entries.length === 1 ? { kind: 'work', featureId: entries[0]!.id } : { kind: 'home' };
}

/** 场景所属的条目（只认播放用的那件作品里的切片：功能没选定的方案里的场景返回 null）。 */
export function entryOfScenario(project: Project, scenarioId: string | null | undefined): Entry | null {
  const sc = scenarioId ? project.scenarios[scenarioId] : undefined;
  const featureId = sc ? project.options[sc.optionId]?.featureId : undefined;
  const entry = featureId ? entryOf(project, featureId) : null;
  return entry && entry.workId === sc!.optionId ? entry : null;
}

/** 单行场合的切片名（嵌入的切换菜单等）：linear 顺序里的章节「01 · 标题」，其余只有标题。 */
export function sliceLabel(entry: Entry, scenarioId: string, title: string, i18n: Dictionary = en): string {
  const n = chapterNumber(entry, scenarioId);
  return n === null ? title : `${i18n.player.chapterNo(n)} · ${title}`;
}
