/**
 * 看板直接发布到云端（D76）的纯模型：范围选项 → 请求体；发布进度行 → 阶段；结果里的附加说明。
 * 进度行来自 CLI 的 share()（英文，与终端一致），这里只按开头识别阶段，其余行原样当作说明。
 */
import type { CloudJob, CloudPublishRequest, CloudStorage, CloudStorageFull } from '../runtime/dev-client';

export type CloudScopeChoice = 'scenario' | 'feature' | 'project';
export type CloudContext = { featureId: string; scenarioId: string | null; featureScenarioIds?: string[]; pr?: boolean };

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

// ---------- 账号容量（C27，原型 storage_quota 方案 B） ----------
/** 与 CLI 的 formatBytes 一致：按 1024 进位，MB / GB 一位小数且去掉 .0，不足 1 MB 用 KB。 */
export function formatStorage(bytes: number): string {
  const mb = bytes / 1024 / 1024;
  const trim = (n: number) => n.toFixed(1).replace(/\.0$/, '');
  if (bytes <= 0) return '0 MB';
  if (mb >= 1024) return `${trim(mb / 1024)} GB`;
  if (mb < 1) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${trim(mb)} MB`;
}
/** 用量一档：ok 时浮层只写一行小字；near（≥80%）出现黄色用量条与提醒；over（满了）用红色。 */
export type StorageLevel = 'ok' | 'near' | 'over';
export const STORAGE_NEAR = 0.8;
export function storageView(storage: CloudStorage | undefined | null): { level: StorageLevel; pct: number; used: string; quota: string } | null {
  if (!storage || !(storage.quotaBytes > 0)) return null;
  const ratio = storage.usedBytes / storage.quotaBytes;
  return { level: ratio >= 1 ? 'over' : ratio >= STORAGE_NEAR ? 'near' : 'ok', pct: Math.min(100, Math.round(ratio * 100)), used: formatStorage(storage.usedBytes), quota: formatStorage(storage.quotaBytes) };
}
/** 容量不足的说明：新建写需要多少、还剩多少、还差多少；更新写多占多少；数字缺了只给通用说明。链接原样带上。 */
export function storageFull(f: CloudStorageFull):
  | { kind: 'need'; size: string; left: string; short: string; manageUrl: string; upgradeUrl: string }
  | { kind: 'update'; size: string; left: string; manageUrl: string; upgradeUrl: string }
  | { kind: 'generic'; manageUrl: string; upgradeUrl: string } {
  const links = { manageUrl: f.manageUrl, upgradeUrl: f.upgradeUrl };
  if (f.usedBytes === undefined || f.quotaBytes === undefined || f.shareBytes === undefined) return { kind: 'generic', ...links };
  const left = Math.max(0, f.quotaBytes - f.usedBytes);
  if (f.replacedBytes) return { kind: 'update', size: formatStorage(Math.max(0, f.shareBytes - f.replacedBytes)), left: formatStorage(left), ...links };
  return { kind: 'need', size: formatStorage(f.shareBytes), left: formatStorage(left), short: formatStorage(Math.max(0, f.shareBytes - left)), ...links };
}

/** 看板预填：没有链接是新建（公开）；旧链接未带 visibility 时为私密。CLI 从不读这个默认值。 */
export const defaultVisibility = (link: { visibility?: 'public' | 'private' } | null): 'public' | 'private' => link ? link.visibility ?? 'private' : 'public';
