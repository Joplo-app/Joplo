import { stripVTControlCharacters } from 'node:util';

/** 用于终端中的数据片段：去除 ANSI 序列、C0/C1、换行和分隔符。 */
export const terminalText = (text: string) => stripVTControlCharacters(text).replace(/[\x00-\x1f\x7f-\x9f\u2028\u2029]/g, '');

/** 云端错误只在 CLI 边界扩展，不改变本地 core 的错误契约。 */
export const CLOUD_MESSAGES = {
  AUTH_REQUIRED: 'Sharing requires a free Joplo account. Run npx joplo login',
  AUTH_EXPIRED: 'Your session has expired. Run npx joplo login again',
  PLAN_REQUIRED: 'This action requires Pro',
  ACCOUNT_UNAVAILABLE: 'This account cannot publish shares right now. Sign in on the website to check its status',
  FORBIDDEN: 'This action is forbidden. Check your account permissions',
  RATE_LIMITED: 'Too many login requests. Try again later',
  UPLOAD_EXPIRED: 'The upload URL has expired. Run joplo share again',
  QUOTA_EXCEEDED: 'The cloud quota has been reached. Try again later',
  TOO_LARGE: 'The build exceeds the plan limit. Reduce large assets and try again',
  CLIENT_OUTDATED: 'Update the CLI: npx joplo@latest share',
  NETWORK: 'The cloud request failed. Check your network and try again',
  BAD_REQUEST: 'The cloud rejected the publication request. Check the project and try again',
  NOT_FOUND: 'The cloud share does not exist. Use --new to create one',
  CONFLICT: 'Another publication is in progress or upload preparation failed. Run joplo share again later',
  INVALID_RESPONSE: 'Invalid cloud response. Check the server address or update the CLI',
  AUTH_DENIED: 'Login authorization was denied. Run npx joplo login again',
} as const;
export type CloudCode = keyof typeof CLOUD_MESSAGES;
export class CloudError extends Error {
  constructor(readonly code: CloudCode, message: string = CLOUD_MESSAGES[code], readonly details?: unknown, readonly retry?: { afterMs?: number; createSafe?: boolean }) { super(terminalText(message)); }
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
