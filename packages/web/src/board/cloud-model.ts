/**
 * 看板直接发布到云端（D76）的纯模型：范围选项 → 请求体；发布进度行 → 阶段；结果里的附加说明。
 * 进度行来自 CLI 的 share()（英文，与终端一致），这里只按开头识别阶段，其余行原样当作说明。
 */
import type { CloudJob, CloudPublishRequest } from '../runtime/dev-client';

export type CloudScopeChoice = 'scenario' | 'feature' | 'project';
export type CloudContext = { featureId: string; scenarioId: string | null };

/** 范围选项 → 请求体（D75）：当前场景 / 当前功能（选定方案的全部场景）/ 整个项目（空）。没有当前场景时退回当前功能。 */
export function cloudRequest(choice: CloudScopeChoice, ctx: CloudContext): CloudPublishRequest {
  if (choice === 'scenario' && ctx.scenarioId) return { scenarios: [ctx.scenarioId] };
  if (choice === 'project') return {};
  return { features: [ctx.featureId] };
}

/** 默认范围：有当前场景时是当前场景（D76）。 */
export const defaultChoice = (ctx: CloudContext): CloudScopeChoice => (ctx.scenarioId ? 'scenario' : 'feature');

export const CLOUD_STAGES = ['checking', 'building', 'uploading', 'finalizing'] as const;
export type CloudStage = (typeof CLOUD_STAGES)[number];

const STAGE_OF: [RegExp, CloudStage][] = [
  [/^Checking the project/, 'checking'],
  [/^Validation passed/, 'building'],
  [/^Built \d+ files/, 'uploading'],
  [/^Upload complete/, 'finalizing'],
];

/** 当前阶段：出现过的最后一个阶段（没有进度行时是 checking）。 */
export function cloudStage(lines: readonly string[]): CloudStage {
  let stage: CloudStage = 'checking';
  for (const l of lines) for (const [re, s] of STAGE_OF) if (re.test(l) && CLOUD_STAGES.indexOf(s) > CLOUD_STAGES.indexOf(stage)) stage = s;
  return stage;
}

/** 结果里值得作者看的说明：不是阶段行、也不是借用（借用单独列出）的行，例如“跳过预览图”“朗读音频”。 */
export function cloudNotes(lines: readonly string[]): string[] {
  return lines.filter((l) => !STAGE_OF.some(([re]) => re.test(l)) && !/^Borrowed from another feature:/.test(l) && !/^Sharing requires/.test(l) && l.trim());
}

/** 失败是否因为没登录（显示登录命令，而不是错误信息）。 */
export const needsLogin = (job: CloudJob | null): job is CloudJob & { error: { loginCommand: string } } =>
  !!job && job.state === 'failed' && !!job.error?.loginCommand && (job.error.code === 'AUTH_REQUIRED' || job.error.code === 'AUTH_EXPIRED');

/** 发布只包含每个功能确认过的方案（feature.pick）。这里记下当前范围各级是否有确认的方案。 */
export type CloudPicks = { scenario: boolean; feature: boolean; project: boolean };
type PickSource = { features: Record<string, { pick?: string | null } | undefined>; scenarios: Record<string, { optionId: string } | undefined> };

export function cloudPicks(project: PickSource, ctx: CloudContext): CloudPicks {
  const pick = project.features[ctx.featureId]?.pick ?? null;
  const sc = ctx.scenarioId ? project.scenarios[ctx.scenarioId] : undefined;
  return {
    scenario: !!pick && !!sc && sc.optionId === pick,
    feature: !!pick,
    project: Object.values(project.features).some((f) => !!f?.pick),
  };
}

/** 发布前检查：所选范围里没有确认的方案时返回是哪一级（scenario / feature / project），可以发布时返回 null。 */
export function cloudUnpicked(choice: CloudScopeChoice, ctx: CloudContext, picks: CloudPicks): CloudScopeChoice | null {
  const scope: CloudScopeChoice = choice === 'scenario' && !ctx.scenarioId ? 'feature' : choice;
  return picks[scope] ? null : scope;
}
