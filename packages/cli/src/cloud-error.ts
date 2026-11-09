import { stripVTControlCharacters } from 'node:util';

/** 用于终端中的数据片段：去除 ANSI 序列、C0/C1、换行和分隔符。 */
export const terminalText = (text: string) => stripVTControlCharacters(text).replace(/[\x00-\x1f\x7f-\x9f\u2028\u2029]/g, '');

/** 云端错误只在 CLI 边界扩展，不改变本地 core 的错误契约。 */
export const CLOUD_MESSAGES = {
  PR_APP_MISSING: 'Configure, install and link the GitHub App with access to this repository, then run joplo diff prepare again',
  PR_CLOSED: 'The PR is closed. Stop this publication',
  PR_STALE_HEAD: 'The PR head changed. Prepare again and rebuild the latest head against the returned pinned baseline',
  PR_STALE_GENERATION: 'A newer prepare exists. Prepare again and rebuild; do not reuse the old bundle',
  PR_MISMATCH: 'Repository, PR number, baseline or head does not match prepare. Correct the parameters and rebuild',
  PR_UNAVAILABLE: 'GitHub PR metadata is temporarily unavailable. Retry later; do not downgrade to an unverified share',
  AUTH_REQUIRED: 'Sharing requires a free Joplo account. Run npx joplo login',
  AUTH_EXPIRED: 'Your session has expired. Run npx joplo login again',
  PLAN_REQUIRED: 'This action requires Pro',
  ACCOUNT_UNAVAILABLE: 'This account cannot publish shares right now. Sign in on the website to check its status',
  FORBIDDEN: 'This action is forbidden. Check your account permissions',
  RATE_LIMITED: 'Too many login requests. Try again later',
  UPLOAD_EXPIRED: 'The upload URL has expired. Run joplo share again',
  QUOTA_EXCEEDED: 'The cloud quota has been reached. Try again later',
  TOO_LARGE: 'The build exceeds the plan limit. Reduce large assets and try again',
  CLIENT_OUTDATED: 'This Joplo CLI is too old for the cloud. Update it; inside a project, upgrade joplo and @joplo-app/kit to the same new version',
  NETWORK: 'The cloud request failed. Check your network and try again',
  BAD_REQUEST: 'The cloud rejected the publication request. Check the project and try again',
  NOT_FOUND: 'The cloud share does not exist. Use --new to create one',
  CONFLICT: 'Another publication is in progress or upload preparation failed. Run joplo share again later',
  INVALID_RESPONSE: 'Invalid cloud response. Check the server address or update the CLI',
  AUTH_DENIED: 'Login authorization was denied. Run npx joplo login again',
  /** 托管朗读（D85）额度不够（402）；CLI 以退出码 7 结束。 */
  TTS_QUOTA_EXCEEDED: 'Not enough Joplo Cloud narration characters. Buy a top-up pack in the console (Usage)',
  EMAIL_UNVERIFIED: 'Verify your email (or sign in with GitHub) to use Joplo Cloud narration',
  /** 选用的声音来源不再支持（D85：AiHubMix、OpenAI 兼容、自定义 HTTP）。 */
  VOICE_UNSUPPORTED: 'This voice source is no longer supported. Switch to Joplo Cloud narration, OpenAI or ElevenLabs',
  /** joplo voice：没有可用的声音来源（没登录、没选、缺 Key）。 */
  VOICE_NO_SOURCE: 'No voice source can generate audio for this project. Sign in with npx joplo login for Joplo Cloud narration, or add an OpenAI / ElevenLabs key in the board',
} as const;
export type CloudCode = keyof typeof CLOUD_MESSAGES;
export class CloudError extends Error {
  /** status：远端 HTTP 状态（只有按状态归类的错误才有），用于区分“请求被拒”的 400 与其他归为 BAD_REQUEST 的状态。 */
  constructor(readonly code: CloudCode, message: string = CLOUD_MESSAGES[code], readonly details?: unknown, readonly retry?: { afterMs?: number; createSafe?: boolean }, readonly status?: number) { super(terminalText(message)); }
}

/** 容量显示（C27）：按 1024 进位，GB 以上保留 1 位小数，MB 保留 1 位小数，整数去掉 .0；不足 1 MB 显示 KB。 */
export function formatBytes(bytes: number): string {
  const mb = bytes / 1024 / 1024;
  const trim = (n: number) => n.toFixed(1).replace(/\.0$/, '');
  if (bytes <= 0) return '0 MB';
  if (mb >= 1024) return `${trim(mb / 1024)} GB`;
  if (mb < 1) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${trim(mb)} MB`;
}
export type StorageDetails = { kind: 'storage'; usedBytes?: number; quotaBytes?: number; shareBytes?: number; replacedBytes?: number; manageUrl: string; upgradeUrl: string };
/**
 * Cloud 的 STORAGE_FULL（413）→ QUOTA_EXCEEDED（kind: storage，退出码 6）：这次放不下，没有上传，已有链接不受影响。
 * 数字只在都合法时才写进说明；控制台路径拼上当前 server（不信任服务端给的绝对地址）。
 */
export function storageError(value: unknown, server: string): CloudError {
  const d = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const n = (k: string) => Number.isSafeInteger(d[k]) && Number(d[k]) >= 0 ? Number(d[k]) : undefined;
  const path = (k: string, fallback: string) => typeof d[k] === 'string' && /^\/[A-Za-z0-9/_-]*$/.test(d[k] as string) ? d[k] as string : fallback;
  const manageUrl = server + path('managePath', '/shares'), upgradeUrl = server + path('upgradePath', '/settings/billing');
  const used = n('usedBytes'), quota = n('quotaBytes'), size = n('shareBytes'), replaced = n('replacedBytes');
  const details: StorageDetails = { kind: 'storage', ...(used === undefined ? {} : { usedBytes: used }), ...(quota === undefined ? {} : { quotaBytes: quota }), ...(size === undefined ? {} : { shareBytes: size }), ...(replaced === undefined ? {} : { replacedBytes: replaced }), manageUrl, upgradeUrl };
  const tail = `Nothing was uploaded. Existing links keep working. Free up space: ${manageUrl} · More storage: ${upgradeUrl}`;
  if (used === undefined || quota === undefined || size === undefined) return new CloudError('QUOTA_EXCEEDED', `Not enough storage for this share. ${tail}`, details);
  const left = `only ${formatBytes(Math.max(0, quota - used))} of your ${formatBytes(quota)} is left (${formatBytes(used)} used)`;
  const what = replaced ? `This update adds ${formatBytes(Math.max(0, size - replaced))} (${formatBytes(replaced)} → ${formatBytes(size)})` : `This share needs ${formatBytes(size)}`;
  return new CloudError('QUOTA_EXCEEDED', `${what}, but ${left}. ${tail}`, details);
}

type SizeBase = { maxBytes: number; actualBytes: number; largestFiles: { path: string; size: number }[] };
export type SizeDetails = SizeBase & (
  | { kind: 'upload' | 'total'; maxFiles?: number; actualFiles?: number }
  | { kind: 'files'; maxFiles: number; actualFiles: number }
);
export function sizeError(details: SizeDetails): CloudError {
  const largest = details.largestFiles.map(f => `${f.path} (${f.size} bytes)`).join(', ') || 'Not provided';
  if (details.kind === 'files') return new CloudError('TOO_LARGE', `File count exceeds the limit: ${details.actualFiles} files, limit ${details.maxFiles}; manifest total ${details.actualBytes} bytes, limit ${details.maxBytes} bytes. Largest files: ${largest}. Reduce the file count and try again`, details);
  const label = details.kind === 'upload' ? 'New upload' : 'Manifest total';
  const count = details.maxFiles === undefined || details.actualFiles === undefined ? '' : `; ${details.actualFiles} files, limit ${details.maxFiles}`;
  return new CloudError('TOO_LARGE', `${label}: ${details.actualBytes} bytes, limit ${details.maxBytes} bytes${count}. Largest files: ${largest}. Reduce large assets and try again`, details);
}
