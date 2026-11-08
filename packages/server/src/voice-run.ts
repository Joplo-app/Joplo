/**
 * `joplo voice`（D74 / D85）：在终端里生成缺少的朗读音频，与看板的「生成缺少的音频」同一套缓存与规则，给 Agent 和脚本用。
 *
 * - 范围：每个功能选定方案（feature.pick）的全部场景；项目写了 locales 时每种内容语言各一遍（D84，按 resolveVoices(…, 语言) 选音色），
 *   可以用 locales 只做其中几种。朗读文字与 build 打包时算片段键的文字相同（字幕用 step.caption；自动字幕在看板里按界面语言生成，
 *   这里用编译出的字幕）。
 * - 声音来源：与看板相同——config.voice.profile > 看板里选的 > 没选过时已登录用 Joplo Cloud 朗读（defaultProfile）。
 *   没有来源、来源不再支持、缺 Key 时抛 VoiceError（NO_SOURCE / UNSUPPORTED / NO_KEY），CLI 给出错误码与换用提示。
 * - dryRun：只算这次要生成几段、约多少字（estimateVoice，Array.from 计字），不请求。
 * - cloud 每段成功后用响应头的剩余字数更新 quota；402 时停止（已生成的保留），结果里的 quota 记需要 / 剩余，CLI 以 TTS_QUOTA_EXCEEDED 结束。
 */
import type { Project } from '@joplo-app/core';
import { localizeProject, speakerRoleAt, spokenLine } from '@joplo-app/core';
import type { CloudVoiceBridge, CloudVoiceStatus, VoiceQuota } from './cloud.ts';
import { joploHome } from './home.ts';
import { ProfileStore, UNSUPPORTED_MESSAGE, VoiceCache, VoiceError, estimateVoice, resolveVoices, voiceLocaleOf, type GenerateSummary, type Segment } from './voice.ts';

export type VoiceRunOptions = {
  projectDir: string;
  /** 编译出的 IR（CLI 用 check 的结果）。 */
  project: Project;
  /** 本机目录（缺省 JOPLO_HOME 或 ~/.joplo）。 */
  home?: string;
  /** 托管朗读（CLI 的 cloud bridge 的 voice）。 */
  cloud?: CloudVoiceBridge;
  dryRun?: boolean;
  /** 只做这几种内容语言（必须是项目声明的）；缺省全部。 */
  locales?: string[];
  onProgress?: (line: string) => void;
  /** 测试：OpenAI / ElevenLabs 的 fetch。 */
  fetch?: (url: string, init?: RequestInit) => Promise<Response>;
};

export type VoiceRunLocale = { locale: string | null; segments: number; missing: number; chars: number; generated: number; skipped: number; failed: { stepId: string; message: string }[] };
export type VoiceRunResult = {
  profile: { id: string; name: string; kind: string } | null;
  source: 'config' | 'board' | 'default' | null;
  dryRun: boolean;
  locales: VoiceRunLocale[];
  /** 合计：要生成的段数与字数（dryRun 时是估算；否则是这次开始前缺的）、生成了几段、失败几段。 */
  total: { segments: number; missing: number; chars: number; generated: number; failed: number };
  /** cloud 的额度（已登录、云端给了 /api/v1/voice 时）；生成后是响应头里最后一次的剩余。 */
  quota: VoiceQuota | null;
  usageUrl: string | null;
  /** 额度不够（402）时：需要 / 剩余；还有几段没生成。 */
  exhausted: { neededChars: number | null; remainingChars: number | null; remainingSteps: number } | null;
};

/** 选定方案的全部场景里，每一步要读的段（文字为空的跳过）。 */
export function projectSegments(project: Project): Segment[] {
  const picked = new Set(Object.values(project.features ?? {}).map((f) => (f as { pick?: string | null }).pick).filter((x): x is string => !!x));
  const out: Segment[] = [];
  for (const sc of Object.values(project.scenarios)) {
    const fid = project.options[sc.optionId]?.featureId;
    const pick = fid ? (project.features?.[fid] as { pick?: string | null } | undefined)?.pick : null;
    // 选定方案的 id 可能是 “功能.方案” 或只有方案名：两种都认
    if (!(picked.has(sc.optionId) || (pick && sc.optionId === `${fid}.${pick}`))) continue;
    sc.steps.forEach((st, i) => {
      const line = spokenLine(st, st.caption, speakerRoleAt(project, sc.id, i + 1));
      if (line.text) out.push({ stepId: st.id, text: line.text, role: line.role });
    });
  }
  return out;
}

export async function generateProjectVoice(opts: VoiceRunOptions): Promise<VoiceRunResult> {
  const status: CloudVoiceStatus | null = opts.cloud ? await opts.cloud.status().catch(() => null) : null;
  const live = status?.signedIn && status.voice ? status.voice : null;
  const store = new ProfileStore(opts.home ?? joploHome(), process.env, { catalog: () => live });
  if (live) store.rememberCloudCatalog(live);
  // 没选过来源时：已登录（含云端暂时连不上）用 cloud，与看板一致
  const fallback = opts.cloud && (!status || status.signedIn) ? 'cloud' : null;
  const cache = new VoiceCache(opts.projectDir);
  const selected = cache.selection();
  const project = opts.project;
  const base = resolveVoices(project.voiceConfig, selected, store, null, fallback);
  const usageUrl = status ? `${status.server}/usage` : null;
  if (!base.profile) {
    if (base.missing) throw new VoiceError('NOT_FOUND', `joplo.config.ts asks for voice profile "${base.missing}", which is not set up on this computer. Use cloud, openai or elevenlabs`);
    const login = status && !status.signedIn ? ` Sign in for Joplo Cloud narration: ${status.loginCommand}.` : '';
    throw new VoiceError('INVALID', `No voice source is selected for this project, so steps use the browser voice.${login} Or choose OpenAI / ElevenLabs in the board (Voice).`);
  }
  if (base.profile.unsupported) throw new VoiceError('UNSUPPORTED', UNSUPPORTED_MESSAGE(base.profile.name));
  if (base.profile.kind !== 'cloud' && !store.keyOf(base.profile)) throw new VoiceError('NO_KEY', `No API key for ${base.profile.name}. Add one in the board (Voice → Manage keys) or set ${base.profile.kind === 'openai' ? 'OPENAI_API_KEY' : 'ELEVENLABS_API_KEY'}`);
  if (base.profile.kind === 'cloud' && status && !status.signedIn) throw new VoiceError('AUTH_REQUIRED', `Joplo Cloud narration needs a Joplo account. Run ${status.loginCommand}`);

  const declared = project.i18n?.locales ?? [];
  const bad = (opts.locales ?? []).filter((l) => !declared.includes(l));
  if (bad.length) throw new VoiceError('INVALID', declared.length ? `Unknown content language: ${bad.join(', ')} (this project has ${declared.join(', ')})` : 'This project has no content languages (config locales); run joplo voice without --locale');
  const locales: (string | null)[] = project.i18n ? (opts.locales?.length ? opts.locales : declared) : [null];

  let quota: VoiceQuota | null = live?.quota ? { ...live.quota } : null;
  const result: VoiceRunResult = { profile: { id: base.profile.id, name: base.profile.name, kind: base.profile.kind }, source: base.source, dryRun: !!opts.dryRun, locales: [], total: { segments: 0, missing: 0, chars: 0, generated: 0, failed: 0 }, quota, usageUrl, exhausted: null };
  for (const locale of locales) {
    const p = locale ? localizeProject(project, locale) : project;
    const resolved = resolveVoices(project.voiceConfig, selected, store, voiceLocaleOf(project, locale), fallback);
    const segments = projectSegments(p);
    const est = estimateVoice(segments, resolved, cache);
    const row: VoiceRunLocale = { locale, segments: segments.length, missing: est.steps, chars: est.chars, generated: 0, skipped: 0, failed: [] };
    result.locales.push(row);
    result.total.segments += segments.length;
    result.total.missing += est.steps;
    result.total.chars += est.chars;
    if (opts.dryRun || !est.steps || result.exhausted) continue;
    opts.onProgress?.(`Generating ${est.steps} clip(s)${locale ? ` for ${locale}` : ''} with ${base.profile.name} (about ${est.chars} characters)...`);
    const summary: GenerateSummary = await cache.generate(segments, locale ?? 'en', resolved, store, {
      cloud: opts.cloud,
      fetch: opts.fetch,
      project: project.name,
      speechLocale: project.i18n ? locale : null,
      onCloud: (r) => {
        if (quota && r.remaining !== null) quota = { ...quota, totalRemainingChars: r.remaining };
      },
    });
    row.generated = summary.generated;
    row.skipped = summary.skipped;
    row.failed = summary.failed;
    result.total.generated += summary.generated;
    result.total.failed += summary.failed.length;
    if (summary.quota) {
      if (quota && summary.quota.remainingChars !== null) quota = { ...quota, totalRemainingChars: summary.quota.remainingChars };
      result.exhausted = { ...summary.quota, remainingSteps: 0 };
    } else if (summary.error) throw new VoiceError(summary.error.code as VoiceError['code'], summary.error.message);
  }
  if (result.exhausted) result.exhausted.remainingSteps = result.total.missing - result.total.generated - result.total.failed;
  result.quota = quota;
  return result;
}
