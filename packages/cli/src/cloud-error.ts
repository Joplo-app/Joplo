/** 云端错误只在 CLI 边界扩展，不改变本地 core 的错误契约。 */
export const CLOUD_MESSAGES = {
  AUTH_REQUIRED: '分享需要登录 Joplo 账号（免费）。请运行 npx joplo login',
  AUTH_EXPIRED: '登录已过期，请重新运行 npx joplo login',
  PLAN_REQUIRED: '此操作需要 Pro：https://app.joplo.app/billing',
  QUOTA_EXCEEDED: '已达到每小时发布上限，请稍后重试',
  TOO_LARGE: '构建产物超过套餐上限，请压缩或删除大素材后重试',
  CLIENT_OUTDATED: '请升级 CLI：npx joplo@latest share',
  NETWORK: '无法完成云端请求，请检查网络后重试',
  BAD_REQUEST: '云端拒绝了发布请求，请检查项目后重试',
  NOT_FOUND: '云端分享不存在，可用 --new 新建',
  CONFLICT: '已有更新的分享版本，请重新发布',
  INVALID_RESPONSE: '云端响应格式无效，请确认服务器地址或升级 CLI',
  AUTH_DENIED: '登录授权已被拒绝，请重新运行 npx joplo login',
} as const;
export type CloudCode = keyof typeof CLOUD_MESSAGES;
export class CloudError extends Error {
  constructor(readonly code: CloudCode, message: string = CLOUD_MESSAGES[code], readonly details?: unknown) { super(message); }
}

export type SizeDetails = {
  kind: 'upload' | 'total'; maxBytes: number; actualBytes: number;
  maxFiles?: number; actualFiles?: number; largestFiles: { path: string; size: number }[];
};
export function sizeError(details: SizeDetails): CloudError {
  const label = details.kind === 'upload' ? '本次新增上传' : '清单总量';
  const count = details.maxFiles === undefined || details.actualFiles === undefined ? '' : `；${details.actualFiles} 个文件，上限 ${details.maxFiles} 个`;
  const largest = details.largestFiles.map(f => `${f.path}（${f.size} 字节）`).join('、') || '未提供';
  return new CloudError('TOO_LARGE', `${label} ${details.actualBytes} 字节，上限 ${details.maxBytes} 字节${count}。最大的文件：${largest}。请压缩或删除大素材后重试`, details);
}
