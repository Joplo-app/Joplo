/**
 * `joplo voice`（D74 / D85）：在终端里生成缺少的朗读音频，给 Agent 与脚本用；与看板同一套缓存、声音来源与默认规则。
 *
 * - 先 check：编译不过时不生成（INVALID_SCHEMA）。
 * - 声音来源：config.voice.profile > 看板里选的 > 没选过时已登录用 Joplo Cloud 朗读（不要 Key，用 CLI 的登录或 JOPLO_API_KEY）。
 * - 错误码：VOICE_UNSUPPORTED（选的来源不再支持；已生成的音频照常播放和发布）、VOICE_NO_SOURCE（没登录也没选、缺 Key、config 写了本机没有的）、
 *   AUTH_REQUIRED / AUTH_EXPIRED（退出 3）、EMAIL_UNVERIFIED、TTS_QUOTA_EXCEEDED（额度不够，退出 7；已生成的保留，
 *   details 带 neededChars、remainingChars、usageUrl、generated、remainingSteps）。
 * - 输出：文本每行一条；JSON 的 data 是 VoiceRunResult（含 quota：生成后响应头里最后一次的剩余字数）。
 */
import { JoploError } from '@joplo-app/core';
import type { buildSite, VoiceRunResult } from '@joplo-app/server';
import { resolveWorkId } from './work.ts';
import { checkWithProject } from './check.ts';
import { cloudBridge } from './cloud-bridge.ts';
import { CloudError } from './cloud-error.ts';
import type { RenderPreview } from './cloud-embed.ts';
import { credentialsHome, type CloudDependencies } from './cloud.ts';
import { voiceQuotaLine } from './cloud-voice.ts';
import { diagnosticLine } from './common.ts';

export type VoiceCommandDeps = {
  version: string;
  cloud?: CloudDependencies;
  generate: () => Promise<(opts: import('@joplo-app/server').VoiceRunOptions) => Promise<VoiceRunResult>>;
  build: typeof buildSite;
  render: () => Promise<RenderPreview>;
  progress: (line: string) => void;
};

const n = (x: number) => x.toLocaleString('en-US');

/** server 包的 VoiceError（code + message + data）→ CLI 的错误码。 */
function mapError(e: unknown, loginFix: string): never {
  const err = (e ?? {}) as { code?: unknown; message?: unknown; data?: unknown };
  const message = typeof err.message === 'string' ? err.message : String(e);
  switch (err.code) {
    case 'UNSUPPORTED':
      throw new CloudError('VOICE_UNSUPPORTED', message);
    case 'INVALID':
    case 'NO_KEY':
    case 'NOT_FOUND':
    case 'CLOUD_UNAVAILABLE':
      throw new CloudError('VOICE_NO_SOURCE', message);
    case 'AUTH_REQUIRED':
    case 'AUTH_EXPIRED':
      throw new CloudError(err.code, message, { fix: loginFix });
    case 'EMAIL_UNVERIFIED':
    case 'FORBIDDEN':
    case 'BAD_REQUEST':
      throw new CloudError(err.code, message);
    case 'TTS_UNAVAILABLE':
    case 'RATE_LIMITED':
    case 'NETWORK':
      throw new CloudError('NETWORK', message);
  }
  throw e;
}

export async function voiceCommand(projectDir: string, opts: { dryRun: boolean; locales: string[]; server?: string; work?: string; scenario?: string }, deps: VoiceCommandDeps): Promise<{ summary: string; lines: string[]; data: VoiceRunResult }> {
  const checked = await (deps.cloud?.check ?? checkWithProject)(projectDir);
  if (!checked.project || checked.summary.error) {
    throw new JoploError('INVALID_SCHEMA', `${checked.summary.error} error. Fix them first (joplo check):\n${checked.diagnostics.filter((d) => d.severity === 'error').slice(0, 5).map(diagnosticLine).join('\n')}`, { diagnostics: checked.diagnostics });
  }
  const env = { ...(deps.cloud?.env ?? process.env), ...(opts.server ? { JOPLO_CLOUD_URL: opts.server } : {}) };
  const bridge = cloudBridge({ version: deps.version, deps: { ...deps.cloud, env }, build: deps.build, render: deps.render });
  const generate = await deps.generate();
  const status = await bridge.voice!.status().catch(() => null);
  const loginFix = status && !status.signedIn ? status.loginCommand : 'npx joplo login';
  let r: VoiceRunResult;
  try {
    r = await generate({ projectDir, project: checked.project, home: credentialsHome(env), cloud: bridge.voice, dryRun: opts.dryRun, ...(opts.work ? { workId: resolveWorkId(checked.project, opts.work) } : {}), ...(opts.scenario ? { scenarioId: opts.scenario } : {}), ...(opts.locales.length ? { locales: opts.locales } : {}), onProgress: deps.progress });
  } catch (e) {
    mapError(e, loginFix);
  }
  const lines: string[] = [];
  const voice = r.profile ? `${r.profile.name}${r.source === 'default' ? ' (default when signed in)' : r.source === 'config' ? ' (joplo.config.ts)' : ''}` : 'browser voice';
  lines.push(`Voice source: ${voice}`);
  for (const l of r.locales) {
    const tag = l.locale ? `${l.locale}: ` : '';
    lines.push(opts.dryRun
      ? `${tag}${l.missing} clip(s) to generate for ${l.segments} step(s), about ${n(l.chars)} characters (steps with the same text share one clip)`
      : `${tag}generated ${l.generated}, ${l.skipped} already had audio${l.failed.length ? `, ${l.failed.length} failed` : ''}`);
    if (opts.dryRun) for (const d of l.details ?? []) lines.push(`  ${d.workId} / ${d.scenarioId} / ${d.stepId}: ${d.chars} characters, ${d.missing ? `${d.estimatedBillableChars} estimated characters to generate (local cache only)` : d.text ? 'cached' : 'silent'}`);
    for (const f of l.failed) lines.push(`  failed ${f.stepId}: ${f.message}`);
  }
  if (r.quota) lines.push(voiceQuotaLine(r.quota));
  if (opts.dryRun && r.quota && r.profile?.kind === 'cloud') {
    const after = r.quota.totalRemainingChars - r.total.chars;
    lines.push(after >= 0 ? `After generating: about ${n(after)} characters left` : `Not enough characters: about ${n(r.total.chars)} needed, ${n(r.quota.totalRemainingChars)} left. Buy a top-up pack: ${r.usageUrl}`);
  }
  if (r.exhausted) {
    const x = r.exhausted;
    const nums = x.neededChars !== null && x.remainingChars !== null ? ` This needs ${x.neededChars} characters, but only ${x.remainingChars} are left.` : '';
    throw new CloudError('TTS_QUOTA_EXCEEDED', `Not enough Joplo Cloud narration characters.${nums} Generated ${r.total.generated} clip(s) and kept them; ${x.remainingSteps} step(s) still have no audio and use the browser voice. Buy a top-up pack: ${r.usageUrl ?? 'the console Usage page'}`,
      { neededChars: x.neededChars, remainingChars: x.remainingChars, usageUrl: r.usageUrl, generated: r.total.generated, remainingSteps: x.remainingSteps });
  }
  const summary = opts.dryRun ? `${r.total.missing} clip(s) to generate, about ${n(r.total.chars)} characters` : `Generated ${r.total.generated} clip(s)${r.total.failed ? `, ${r.total.failed} failed` : ''}`;
  lines.push(r.total.missing || opts.dryRun ? summary : 'Every step already has audio');
  return { summary, lines, data: r };
}
