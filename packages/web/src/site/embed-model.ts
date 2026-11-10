/**
 * 发布站嵌入模式（`?embed=1`，云端嵌入契约）的纯函数：参数解析、起始场景、场景切换列表、“在新标签页打开”的地址、键盘。
 *
 * 不变量：
 * - 只有查询参数 `embed` 恰好是 `1` 才进入嵌入模式；否则发布站行为完全不变（parseEmbedParams 返回 null）；
 * - 默认显示封面、不自动播放；只有 `autoplay` 恰好是 `1` 才跳过封面直接播放；
 * - `scenario` 写错（不存在、为空）时从默认场景开始，访客看不到报错；未知参数忽略；
 * - 只有 `review` 恰好是 `1` 才是评审模式（review-bridge.ts）。
 * - 能力（D102 修订，只看 Entry）：切片是章节（sequencing linear）时，没指定场景就从播放顺序里的第一章开始，
 *   切换菜单里的章节带两位编号（支线不编号），封面写“N 章”；独立作品（featureId = null）的封面写作品标题与
 *   「N 章 · 约 M」/「N 个场景 · 约 M」。挂了功能、切片独立的条目，封面与菜单与以前一样。
 */
import { entryForWork } from '../runtime/views';
import { embedScenarioIds, embedStartScenario, entryOf, type Entry, type Project } from '@joplo-app/core/runtime';
import { en, type Dictionary } from '../i18n/en';
import { entryMetaText, entryOfScenario, firstSlice, isLinear, sliceLabel } from '../player/work-view';
import { siteHash } from '../runtime/route';
import { isFullscreenKey } from '../player/fullscreen';

/** review：评审模式（`review=1`，云端契约 8.2），见 review-bridge.ts。 */
export type EmbedParams = { scenario: string | null; autoplay: boolean; review: boolean; diff?: boolean };

/** location.search → 嵌入参数；不是嵌入模式时为 null。 */
export function parseEmbedParams(search: string | null | undefined): EmbedParams | null {
  let q: URLSearchParams;
  try {
    q = new URLSearchParams(search ?? '');
  } catch {
    return null;
  }
  if (q.get('embed') !== '1') return null;
  const scenario = q.get('scenario');
  return { scenario: scenario ? scenario : null, autoplay: q.get('autoplay') === '1', review: q.get('review') === '1', ...(q.get('diff') === '1' ? { diff: true } : {}) };
}

/** 嵌入打开时的状态：从哪个场景开始、是否先显示封面。 */
export function embedInitial(project: Project, params: EmbedParams): { scenarioId: string | null; covered: boolean } {
  // 评审模式（评审版含所有方案）：scenario 可以指向任何方案的场景；普通嵌入只认可播放列表里的场景
  const any = params.review && params.scenario && Object.prototype.hasOwnProperty.call(project.scenarios ?? {}, params.scenario) ? params.scenario : null;
  const start = any ?? embedStartScenario(project, params.scenario);
  // 没指定（或写错）场景、默认落在章节上时：从播放顺序里的第一章开始（封面画在这里）
  const asked = !!any || (!!params.scenario && start === params.scenario);
  const entry = !asked && start ? entryOfScenario(project, start) : null;
  return { scenarioId: (entry && isLinear(entry) ? firstSlice(entry)?.id : null) ?? start, covered: !params.autoplay };
}

/** 场景切换菜单：多个条目时写“条目 · 场景”，只有一个时只写场景名。章节写“01 · 标题”（支线不编号），按播放顺序。 */
export function embedScenarioItems(project: Project, currentId: string | null, i18n: Dictionary = en): { id: string; label: string; current: boolean }[] {
  const ids = embedScenarioIds(project);
  const features = new Set(ids.map((id) => entryForWork(project, project.scenarios[id]!.workId)?.id));
  const linearEntries = new Map(
    [...features].flatMap((fid): (readonly [string, Entry])[] => {
      const entry = fid ? entryOf(project, fid) : null;
      return entry && isLinear(entry) ? [[entry.id, entry] as const] : [];
    }),
  );
  // 章节按 Entry 的切片顺序（顺序里的章节在前、支线在后）；切片独立的条目保持原来的顺序
  const order = linearEntries.size ? ids.map((id, i) => [id, i] as const).sort(([a, i], [b, j]) => {
    const fa = entryForWork(project, project.scenarios[a]!.workId)?.id ?? '';
    const fb = entryForWork(project, project.scenarios[b]!.workId)?.id ?? '';
    if (fa !== fb || !linearEntries.has(fa)) return i - j;
    const w = linearEntries.get(fa)!;
    return w.slices.findIndex((s) => s.id === a) - w.slices.findIndex((s) => s.id === b);
  }).map(([id]) => id) : ids;
  return order.map((id) => {
    const s = project.scenarios[id]!;
    const fid = entryForWork(project, s.workId)?.id ?? '';
    const f = entryOf(project, fid);
    const linear = linearEntries.get(fid);
    const name = linear ? sliceLabel(linear, id, s.name, i18n) : s.name;
    return { id, label: features.size > 1 && f ? `${f.title} · ${name}` : name, current: id === currentId };
  });
}

/** 控制条上当前切片的名字：linear 顺序里的章节「01 · 标题」；其余为 null（调用方照旧写场景名）。 */
export function embedSliceName(project: Project, scenarioId: string | null, i18n: Dictionary = en): string | null {
  const entry = entryOfScenario(project, scenarioId);
  const sc = scenarioId ? project.scenarios[scenarioId] : undefined;
  return entry && sc && isLinear(entry) ? sliceLabel(entry, sc.id, sc.name, i18n) : null;
}

/**
 * 嵌入封面的文字（D102 修订）：
 * - 起始切片属于独立作品：作品标题、「N 章 · 约 M」/「N 个场景 · 约 M」、「播放」；
 * - 挂了功能：项目名、「可点击的原型演示 · N 个场景」，切片全是章节时写“N 章”；「播放演示」（与以前一样）。
 */
export function embedCover(project: Project, scenarioId: string | null, i18n: Dictionary = en): { title: string; meta: string; play: string } {
  const entry = entryOfScenario(project, scenarioId);
  if (entry && entry.featureId === null) return { title: entry.title, meta: entryMetaText(entry, i18n), play: i18n.site.embedPlay };
  const ids = embedScenarioIds(project);
  const owners = new Set(ids.map((id) => entryOfScenario(project, id)));
  const chapters = owners.size > 0 && [...owners].every((e) => !!e && isLinear(e));
  return { title: project.name, meta: chapters ? i18n.site.embedCoverMetaChapters(ids.length) : i18n.site.embedCoverMeta(ids.length), play: i18n.site.embedPlayDemo };
}

/** 步骤进度（0–1）：位置 / 步数；没有步骤时为 0。 */
export function embedProgress(position: number, total: number): number {
  if (!Number.isFinite(position) || !Number.isFinite(total) || total <= 0) return 0;
  return Math.max(0, Math.min(1, position / total));
}

/**
 * 全屏不可用时“在新标签页打开”的地址：同一个分享页，去掉嵌入参数（embed / scenario / autoplay / review），
 * 用发布站的 hash 路由停在当前场景和步骤。其他查询参数保留。
 */
export function fullPageUrl(href: string, play: { featureId: string; scenarioId: string; step: number } | null): string {
  const u = new URL(href);
  for (const k of ['embed', 'scenario', 'autoplay', 'review']) u.searchParams.delete(k);
  u.hash = play ? siteHash({ kind: 'play', play: { featureId: play.featureId, scenarioId: play.scenarioId, ...(play.step > 0 ? { step: play.step } : {}) } }) : '';
  return u.href;
}

/** 嵌入方是否允许全屏（没有 allowfullscreen 或被权限策略禁止时为 false）。 */
export function fullscreenAvailable(doc: { fullscreenEnabled?: boolean; documentElement?: { requestFullscreen?: unknown } } | undefined): boolean {
  return !!doc && doc.fullscreenEnabled === true && typeof doc.documentElement?.requestFullscreen === 'function';
}

export type EmbedKey = 'toggle' | 'prev' | 'next' | 'fullscreen' | null;

/**
 * 键盘：空格 播放 / 暂停（封面上 = 开始播放），← → 切步（封面上不动作），F 全屏。
 * 输入框、原型画面里、按着修饰键时不处理；焦点在按钮或链接上时空格交给它自己（原生点击）。
 */
export function embedKey(e: { key: string; metaKey?: boolean; ctrlKey?: boolean; altKey?: boolean }, target: { closest?: (s: string) => unknown; tagName?: string } | null, covered: boolean): EmbedKey {
  if (target?.closest?.('input,textarea,select,[contenteditable],[data-joplo-stage],[data-testid="playground-notice"],[role="dialog"],[role="menu"]')) return null;
  if (isFullscreenKey(e, target)) return 'fullscreen';
  if (e.metaKey || e.ctrlKey || e.altKey) return null;
  if (e.key === ' ') return target?.tagName === 'BUTTON' || target?.tagName === 'A' ? null : 'toggle';
  if (covered) return null;
  if (e.key === 'ArrowLeft') return 'prev';
  if (e.key === 'ArrowRight') return 'next';
  return null;
}
