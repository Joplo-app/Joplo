import { stepCaption } from '../i18n/step-caption';
import { en, type Dictionary } from '../i18n/en';
/**
 * 场景封面（D61，纯函数）：第 0 步不再是“初始状态”，而是一张封面。内容只由 IR 推导：
 * 所属功能名 · 方案名、flow 的标题与 description、「约 N 步 · 约 M 秒」、出场角色。
 * 时长是每一步时间计划（core 的 stepPlan，与演示控制器同一份：操作演示 + 停留与朗读估算中较长者）之和，文字用当前语言的字幕（dwellTexts）。
 * 朗读是估算、切层引导只在播放时才知道，所以写「约」。
 *
 * 影片（D102）：形态的判断在这里（Entry 能力），播放器、嵌入与截图页（RenderApp）都只按 film 字段画。
 * - 第一章（顺序里的第一个切片）的第 0 步是影片封面：标题、简介、给谁看、「N 章 · 约 M」；
 * - 从中间某一章打开时是这一章的封面：「第 n 章 · 影片标题」、章节标题与 description；支线不编号。
 * 影片封面的标题、简介、给谁看与时长只从 Entry 取（Entry.ms / EntrySlice.ms），不另算。功能演示的封面不变（film = null）。
 */
import { cameraAt, cardAt, layersOf, roleOf, roleOfScene, scenarioPlanMs, entryOf, type Project, type RoleInfo, type Scenario, type Step, type Entry } from '@joplo-app/core/runtime';
import { chapterNumber, filmMetaText, firstSlice } from './work-view';

export type Duration = { unit: 's' | 'min'; value: number };

export type CoverContent = {
  scenarioId: string;
  /** 所属功能名与方案名（小字）；缺失时为 null。 */
  feature: string | null;
  option: string | null;
  title: string;
  /** flow 的 description；没写时用功能的 goal（D67：封面默认就说清“解决什么”）；两者都没有时为 null。 */
  description: string | null;
  /** description 从哪来：flow = 作者写的场景说明，goal = 功能目标（缺省）。 */
  descriptionFrom: 'flow' | 'goal' | null;
  steps: number;
  /** 估算的播放时长（毫秒，1× 速度）。 */
  ms: number;
  duration: Duration;
  /** 出场角色（导演层的角色与换人的过渡卡），按功能里声明的顺序；没有角色的项目为空。 */
  roles: RoleInfo[];
  /** 影片的封面信息；功能演示为 null（外观不变）。 */
  film: FilmCover | null;
};

/** 影片封面（at = film，第一章）或章节封面（at = chapter，从中间某一章打开）。 */
export type FilmCover = {
  at: 'film' | 'chapter';
  /** 影片标题、简介、给谁看（Entry）。 */
  title: string;
  summary: string | null;
  audience: string | null;
  /** 「5 章 · 约 4 分 40 秒」（filmMetaText）。 */
  meta: string;
  /** 章节在播放顺序里的编号（1 起）；影片封面与支线为 null。 */
  chapter: number | null;
};

function filmCover(work: Entry, scenarioId: string, i18n: Dictionary): FilmCover {
  return {
    at: work.sequencing !== 'linear' || firstSlice(work)?.id === scenarioId ? 'film' : 'chapter',
    title: work.title,
    summary: work.summary.trim() || null,
    audience: work.audience,
    meta: filmMetaText(work, i18n),
    chapter: chapterNumber(work, scenarioId),
  };
}

/** 封面显示的条件：场景至少有一步、位置为 0、没在播放、也没有正在执行的一步。 */
export function coverShown(scenario: Scenario | null | undefined, position: number, playing: boolean, activeStep: number | null, exploring = false): boolean {
  return !!scenario && scenario.steps.length > 0 && position === 0 && !playing && activeStep === null && !exploring;
}

/** 一步停留时要读的文字：说明、explain，过渡卡再加副标题与要点（演示控制器与封面估算共用）。 */
export function dwellTexts(step: Step, i18n: Dictionary = en): (string | null | undefined)[] {
  return [stepCaption(step, i18n), step.explain, ...(step.action.type === 'card' ? [step.action.sub, ...(step.action.points ?? [])] : [])];
}

/** 整个场景按 1× 速度播放大约多久（毫秒）：每一步时间计划的合计之和。 */
export function scenarioMs(project: Project, scenario: Scenario, i18n: Dictionary = en): number {
  return scenarioPlanMs(project, scenario.steps, (step) => dwellTexts(step, i18n));
}

/** 取整成好读的数：10 秒以内按秒向上取整，一分钟以内按 5 秒取整，再长按分钟四舍五入。 */
export function approxDuration(ms: number): Duration {
  const s = Math.max(0, ms) / 1000;
  if (s <= 10) return { unit: 's', value: Math.max(0, Math.ceil(s - 1e-9)) };
  if (s <= 60) return { unit: 's', value: Math.min(60, Math.round(s / 5) * 5) };
  return { unit: 'min', value: Math.max(1, Math.round(s / 60)) };
}

/** 场景里出场的角色：每个位置导演所在层的角色，加上换人过渡卡的角色；按功能里声明的顺序去重。 */
function rolesIn(project: Project, scenario: Scenario): RoleInfo[] {
  const layers = layersOf(project, scenario.id);
  const ids = new Set<string>();
  for (let i = 0; i <= scenario.steps.length; i++) {
    const layer = cameraAt(project, scenario.id, i).directorLayer;
    const r = roleOfScene(project, layers.find((l) => l.id === layer)?.sceneId);
    if (r) ids.add(r.id);
    const card = cardAt(project, scenario.id, i);
    if (card?.role && roleOf(project, scenario.optionId, card.role)) ids.add(card.role);
  }
  const featureId = project.options[scenario.optionId]?.featureId;
  const declared = (featureId ? project.features[featureId]?.roles : undefined) ?? [];
  return declared.flatMap((r) => (r.id && ids.has(r.id) ? [roleOf(project, scenario.optionId, r.id)!] : []));
}

export function coverFor(project: Project, scenarioId: string | null | undefined, i18n: Dictionary = en): CoverContent | null {
  const sc = scenarioId ? project.scenarios[scenarioId] : undefined;
  if (!sc || sc.steps.length === 0) return null;
  const opt = project.options[sc.optionId];
  const feat = opt ? project.features[opt.featureId] : undefined;
  const work = feat && (entryOf(project, feat.id)?.featureId === null || entryOf(project, feat.id)?.sequencing === 'linear') ? entryOf(project, feat.id) : null;
  const film = work ? filmCover(work, sc.id, i18n) : null;
  // 影片：时长只读 Entry（影片封面 = 顺序里各章之和，章节封面 = 这一章）；说明只用章节自己的 description
  const slice = work?.slices.find((s) => s.id === sc.id);
  const ms = film ? (film.at === 'film' ? work!.ms : (slice?.ms ?? 0)) : scenarioMs(project, sc, i18n);
  return {
    scenarioId: sc.id,
    feature: feat?.name ?? null,
    option: opt?.name ?? null,
    title: sc.name,
    ...(film ? describe((sc.description ?? '').trim(), '') : describe((sc.description ?? '').trim(), (feat?.goal ?? '').trim())),
    steps: sc.steps.length,
    ms,
    duration: approxDuration(ms),
    roles: rolesIn(project, sc),
    film,
  };
}


/** 封面说明：作者写的 flow description 优先，没写时退回功能目标（feature.goal 在发布站也保留）。 */
function describe(flow: string, goal: string): Pick<CoverContent, 'description' | 'descriptionFrom'> {
  if (flow) return { description: flow, descriptionFrom: 'flow' };
  if (goal) return { description: goal, descriptionFrom: 'goal' };
  return { description: null, descriptionFrom: null };
}
