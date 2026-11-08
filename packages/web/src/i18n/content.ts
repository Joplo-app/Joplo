/**
 * 作者内容多语言（D84）在网页里的入口：看板、发布站、嵌入、截图都经这里把 IR 换成内容语言。
 *
 * - 内容语言：发布站 = contentLocaleFor(项目, 界面语言)（项目没有这种语言时退回默认语言）；看板 = 作者在「内容语言」菜单里选的。
 * - viewProject：localizeProject 之后，内容语言和界面语言不同时，把自动字幕（captionAuto）按内容语言的词典写成字幕，
 *   让舞台、字幕、时间线、朗读都是同一种语言。没有 i18n 的项目原样返回（行为不变）。
 * - 朗读的声音：voiceIndex.locales[内容语言]（发布站）或 VoiceState.byLocale[内容语言]（看板），没有时用默认声音。
 */
import { contentLocaleFor, localizeProject, collectMessages, type Project, type VoiceIndex } from '@joplo-app/core';
import { dictionary } from './dictionaries';
import { isLocale, matchLocale, type Locale } from './locale';
import { stepCaption } from './step-caption';
import type { VoiceLookup } from '../runtime/voice';
import type { VoiceState } from '../runtime/dev-client';

export type ContentInfo = {
  /** 项目的内容语言（第一个是默认语言）。 */
  locales: string[];
  default: string;
  /** 现在显示的内容语言。 */
  locale: string;
  /** 观众的界面语言不在项目里，内容退回了默认语言。 */
  fallback: boolean;
  /** 只在看板：每种内容语言的翻译进度（菜单第二行）与过期条数。 */
  details?: Record<string, { description?: string; stale?: string }>;
  /** 只在看板：菜单底部怎样加语言。 */
  footer?: string;
};

/** 发布站：按界面语言决定内容语言；没有 i18n 时为 null。 */
export function siteContent(project: Pick<Project, 'i18n'>, uiLocale: string): ContentInfo | null {
  const i18n = project.i18n;
  if (!i18n) return null;
  const locale = contentLocaleFor(project, uiLocale)!;
  return { locales: i18n.locales, default: i18n.default, locale, fallback: locale !== uiLocale };
}

/** 把 IR 换成内容语言；内容语言与界面语言不同时，自动字幕也用内容语言生成。 */
export function viewProject(project: Project, contentLocale: string | null | undefined, uiLocale: string): Project {
  if (!project.i18n || !contentLocale) return project;
  const p = localizeProject(project, contentLocale);
  if (contentLocale === uiLocale || !isLocale(contentLocale)) return p;
  const t = dictionary(contentLocale);
  return {
    ...p,
    scenarios: Object.fromEntries(Object.entries(p.scenarios).map(([id, sc]) => [id, sc.steps.some((st) => st.captionAuto) ? {
      ...sc,
      steps: sc.steps.map((st) => {
        if (!st.captionAuto) return st;
        const { captionAuto: _a, ...rest } = st;
        return { ...rest, caption: stepCaption(st, t) };
      }),
    } : sc])),
  };
}

/** 发布站的声音指纹：这种内容语言有单独的声音就用它，否则用默认声音。 */
export function siteVoiceLookup(index: VoiceIndex | null | undefined, contentLocale: string | null | undefined): VoiceLookup | null {
  if (!index) return null;
  const own = contentLocale ? index.locales?.[contentLocale] : undefined;
  return { narrator: own ? own.narrator : index.narrator, roles: own ? own.roles : index.roles, clips: index.clips };
}

/** 看板的声音指纹：服务端给了这种内容语言的声音（byLocale）就用它，否则用默认声音。 */
export function boardVoiceLookup(state: Pick<VoiceState, 'voices' | 'clips' | 'byLocale'> | null, contentLocale: string | null | undefined): VoiceLookup | null {
  if (!state) return null;
  const own = contentLocale ? state.byLocale?.[contentLocale]?.voices : undefined;
  const v = own ?? state.voices;
  return { narrator: v.narrator, roles: v.roles, clips: state.clips };
}

/** `?lang=<tag>`（发布站与嵌入）：观众界面语言的显式指定，按 D57 的规则匹配到 10 种之一；不写回 storage。 */
export function langParam(search: string): Locale | undefined {
  const raw = new URLSearchParams(search).get('lang');
  return raw ? (matchLocale(raw) ?? undefined) : undefined;
}

/** 看板「内容语言」菜单的一项：非默认语言给出已译 / 总数与过期条数。 */
export type ContentMenuRow = { locale: string; isDefault: boolean; translated: number; total: number; stale: number };

/** 看板菜单：总数 = 这份 dev IR 要翻译的原文数，已译 = 有译文的条数；过期来自编译器（i18n.stale）。 */
export function contentMenuRows(project: Project): ContentMenuRow[] {
  const i18n = project.i18n;
  if (!i18n) return [];
  const texts = collectMessages(project).map((m) => m.text);
  return i18n.locales.map((locale) => {
    if (locale === i18n.default) return { locale, isDefault: true, translated: texts.length, total: texts.length, stale: 0 };
    const table = i18n.messages[locale] ?? {};
    return { locale, isDefault: false, translated: texts.filter((t) => !!table[t]).length, total: texts.length, stale: i18n.stale?.[locale] ?? 0 };
  });
}
