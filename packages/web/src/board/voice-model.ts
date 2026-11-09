/**
 * 看板朗读（D74 / D85）的纯函数：一个方案要读哪些段、已有几段音频、这次约用多少字、声音来源的顺序与音色的显示。
 * 段落的文字用当前界面语言的字幕（自动字幕在网页里本地化），与播放时 DemoController 读的完全一致。
 */
import { speakerRoleAt, spokenChars, spokenLine, type Project } from '@joplo-app/core/runtime';
import type { Dictionary } from '../i18n/en';
import { stepCaption } from '../i18n/step-caption';
import type { VoiceChoiceView, VoiceCloudView, VoiceProfileView, VoiceSegment, VoiceState } from '../runtime/dev-client';

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

/**
 * 这次要生成的段数与字数（D85）：缺音频的段，同一段（同一个角色、同一段文字）只算一次；字数按 spokenChars（Array.from，与云端扣费一致）。
 * 按钮写“生成缺少的音频（N 步 · 约 X 字）”。
 */
export function voiceEstimate(segments: VoiceSegment[], has: (s: VoiceSegment) => boolean): { steps: number; chars: number } {
  const seen = new Set<string>();
  let chars = 0;
  for (const s of segments) {
    const text = s.text.replace(/\s+/g, ' ').trim();
    const k = `${s.role ?? ''}|${text}`;
    if (!text || seen.has(k) || has(s)) continue;
    seen.add(k);
    chars += spokenChars(text);
  }
  return { steps: seen.size, chars };
}

/**
 * Joplo Cloud 朗读的额度一行（D85）：剩余来自服务端（每段生成后用响应头更新，不在本地估算）；after = 生成后还剩多少（剩余 − 这次约用的字数）。
 * - short：这次估算超过剩余（生成到一半会 402）；
 * - out：已经收到 402，或剩余为 0：不再显示生成按钮，改为“朗读额度不够”与买加油包。
 */
export type CloudQuotaView = { left: number; after: number; short: boolean; out: boolean; needed: number | null; usageUrl: string | null; trial: boolean; resetsAt: string | null };
export function cloudQuotaView(cloud: VoiceCloudView | null | undefined, estimate: { chars: number }): CloudQuotaView | null {
  if (!cloud?.signedIn || !cloud.quota) return null;
  const left = cloud.quota.totalRemainingChars;
  const after = left - estimate.chars;
  const out = !!cloud.exhausted || left <= 0;
  return { left, after, short: after < 0, out, needed: cloud.exhausted?.neededChars ?? (after < 0 ? estimate.chars : null), usageUrl: cloud.usageUrl, trial: cloud.quota.period === 'trial', resetsAt: cloud.quota.resetsAt };
}

/** 有没有能用的 Key（保存的或环境变量）。cloud 不要 Key（看登录）。 */
export const hasKey = (p: VoiceProfileView) => p.kind === 'cloud' || p.key.saved || p.key.envSet;

/** 这个来源现在能不能生成：cloud 要已登录、云端给了朗读（连不上或旧云端 404 时不能）；openai / elevenlabs 要有 Key；不再支持的不能。 */
export function canGenerate(p: VoiceProfileView | null, cloud: VoiceCloudView | null | undefined): boolean {
  if (!p || p.unsupported) return false;
  if (p.kind === 'cloud') return !!cloud?.signedIn && !!cloud.available;
  return hasKey(p);
}

/**
 * 播放时能不能边放边生成、预取后面几步：只有用户自己的 Key（OpenAI / ElevenLabs）。
 * Joplo Cloud 朗读会花用户的字数，只在点「生成缺少的音频」或运行 joplo voice 时请求；播放只用已生成的音频，缺的步骤用浏览器朗读。
 */
export function liveGenerate(p: VoiceProfileView | null, cloud: VoiceCloudView | null | undefined): boolean {
  return !!p && p.kind !== 'cloud' && canGenerate(p, cloud);
}

/**
 * 浮层里声音来源的顺序（D85，原型 cloud_usage）：Joplo Cloud 朗读第一，然后浏览器朗读、OpenAI、ElevenLabs；
 * 本机旧的 profile（不再支持）排最后。正在用的旧 profile 不在列表里时（例如从没存过的 AiHubMix）也补上，好让作者看到它不再支持。
 */
export type SourceRow = { id: string | null; profile: VoiceProfileView | null };
export function sourceRows(profiles: VoiceProfileView[], current: VoiceProfileView | null): SourceRow[] {
  const by = (id: string) => profiles.find((p) => p.id === id) ?? null;
  const legacy = profiles.filter((p) => p.unsupported);
  if (current?.unsupported && !legacy.some((p) => p.id === current.id)) legacy.push(current);
  const cloud = by('cloud');
  return [
    ...(cloud ? [{ id: 'cloud', profile: cloud }] : []),
    { id: null, profile: null },
    ...['openai', 'elevenlabs'].flatMap((id) => (by(id) ? [{ id, profile: by(id) }] : [])),
    ...legacy.map((p) => ({ id: p.id, profile: p })),
  ];
}

/** 音色的显示名：cloud 按界面语言的 labels（没有时英文、再没有时 id）；其他用名字。 */
export function voiceLabel(v: VoiceChoiceView | undefined, id: string, locale: string): string {
  if (!v) return id;
  const l = v.labels;
  return (l && (l[locale] ?? l[locale.split('-')[0]!] ?? l.en)) || v.name || id;
}

/** 样音地址（D85：预先生成在 Cloud 静态地址，试听不扣字数）：先按内容 / 界面语言，没有时英文。 */
export function sampleUrl(v: VoiceChoiceView | undefined, locale: string): string | null {
  const s = v?.samples;
  if (!s) return null;
  return s[locale] ?? s[locale.split('-')[0]!] ?? s.en ?? Object.values(s)[0] ?? null;
}

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
