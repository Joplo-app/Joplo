/**
 * 看板朗读（D74）的纯函数：一个方案要读哪些段、已有几段音频、表单草稿的规整。
 * 段落的文字用当前界面语言的字幕（自动字幕在网页里本地化），与播放时 DemoController 读的完全一致。
 */
import { DEFAULT_STYLE, speakerRoleAt, spokenLine, type Project } from '@joplo-app/core';
import type { Dictionary } from '../i18n/en';
import { stepCaption } from '../i18n/step-caption';
import type { VoiceKind, VoiceProfileInput, VoiceProfileView, VoiceResponseMode, VoiceSegment, VoiceState } from '../runtime/dev-client';

/**
 * 声音状态只往新的走：推送、选择 / 生成的返回、profile 改动后的重新读取可能乱序到达；晚到的旧状态（rev 更小）丢掉。
 * 没有 rev（旧版 joplo dev）时照收。
 */
export function newerVoiceState(prev: VoiceState | null, next: VoiceState): VoiceState {
  return prev && typeof prev.rev === 'number' && typeof next.rev === 'number' && next.rev < prev.rev ? prev : next;
}

/** 这个方案所有场景要读的段（文字为空的步骤跳过）。 */
export function voiceSegments(project: Project, optionId: string | null, i18n: Dictionary): VoiceSegment[] {
  if (!optionId) return [];
  const out: VoiceSegment[] = [];
  for (const sc of Object.values(project.scenarios)) {
    if (sc.optionId !== optionId) continue;
    sc.steps.forEach((st, i) => {
      const line = spokenLine(st, stepCaption(st, i18n), speakerRoleAt(project, sc.id, i + 1));
      if (line.text) out.push({ stepId: st.id, ...line });
    });
  }
  return out;
}

/** 已有音频的段数与失败数。 */
export function voiceCoverage(segments: VoiceSegment[], has: (s: VoiceSegment) => boolean, failures: Record<string, { stepId: string }>): { total: number; have: number; failed: number } {
  const ids = new Set(segments.map((s) => s.stepId));
  return { total: segments.length, have: segments.filter(has).length, failed: new Set(Object.values(failures).map((f) => f.stepId).filter((id) => ids.has(id))).size };
}

export type VoiceDraft = { name: string; kind: VoiceKind; baseUrl: string; model: string; voice: string; response: VoiceResponseMode; path: string; body: string; style: string };

export const HTTP_BODY_TEMPLATE = '{"input":"{{text}}","voice":"{{voice}}","model":"{{model}}"}';

export function draftOf(p: VoiceProfileView | null): VoiceDraft {
  if (!p) return { name: '', kind: 'openai', baseUrl: '', model: 'gpt-4o-mini-tts', voice: 'marin', response: 'audio', path: '', body: HTTP_BODY_TEMPLATE, style: DEFAULT_STYLE };
  return { name: p.name, kind: p.kind, baseUrl: p.baseUrl, model: p.model, voice: p.voice, response: p.response, path: p.path ?? '', body: p.body ?? HTTP_BODY_TEMPLATE, style: p.style ?? '' };
}

/** 提交给服务端的字段（只带与类型相关的）。 */
export function inputOf(d: VoiceDraft): VoiceProfileInput {
  return {
    name: d.name.trim(),
    kind: d.kind,
    baseUrl: d.baseUrl.trim(),
    model: d.model.trim(),
    voice: d.voice.trim(),
    response: d.response,
    ...(d.response !== 'audio' ? { path: d.path.trim() } : {}),
    ...(d.kind === 'http' ? { body: d.body } : {}),
    ...(d.kind === 'openai' ? { style: d.style.trim() } : {}),
  };
}

/** 改了会影响合成结果的字段（改了就要重新测试才能保存）。 */
export function connectionChanged(a: VoiceDraft, b: VoiceDraft): boolean {
  return a.kind !== b.kind || a.baseUrl.trim() !== b.baseUrl.trim() || a.model.trim() !== b.model.trim() || a.voice.trim() !== b.voice.trim() || a.response !== b.response || a.path.trim() !== b.path.trim() || (a.kind === 'http' && a.body !== b.body) || (a.kind === 'openai' && a.style.trim() !== b.style.trim());
}

/** 表单能不能提交（服务端还会再校验一遍）。 */
export function draftReady(d: VoiceDraft): boolean {
  const url = /^https?:\/\/\S+$/.test(d.baseUrl.trim());
  return !!d.name.trim() && url && (d.kind === 'http' ? d.body.includes('{{text}}') : !!d.voice.trim()) && (d.response === 'audio' || !!d.path.trim());
}

/** 这个 profile 有没有能用的 Key（保存的或环境变量）。自定义 HTTP 可以不要 Key。 */
export const hasKey = (p: VoiceProfileView) => p.kind === 'http' || p.key.saved || p.key.envSet;

/**
 * 旁白的语言（“跟随语言”）：看朗读文字用的是哪种文字——有假名是日语、有谚文是韩语、有汉字是中文，否则跟随界面语言。
 * 看板据此提示“按这种语言、母语口音读”，并把适合的音色排在前面。
 */
export function narrationLanguage(segments: VoiceSegment[], locale: string): string {
  const text = segments.map((s) => s.text).join('');
  const has = (lo: number, hi: number) => [...text].some((ch) => {
    const c = ch.codePointAt(0) ?? 0;
    return c >= lo && c <= hi;
  });
  if (has(0x3040, 0x30ff)) return 'ja';
  if (has(0xac00, 0xd7af)) return 'ko';
  if (has(0x4e00, 0x9fff)) return 'zh';
  return locale.split('-')[0]!.toLowerCase();
}

/** 预设音色排序：推荐的、口音与旁白语言一致的在前。 */
export function sortVoices<T extends { recommended?: boolean; accent?: string }>(voices: T[], lang: string): T[] {
  const score = (v: T) => (v.recommended ? 2 : 0) + (v.accent?.toLowerCase().startsWith(lang) ? 1 : 0);
  return [...voices].sort((a, b) => score(b) - score(a));
}
