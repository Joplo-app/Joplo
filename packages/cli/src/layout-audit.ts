import { JoploError } from '@joplo-app/core';
import type { ExportCrop, LayoutAuditOptions } from '@joplo-app/server';
export function auditArea(value: string): ExportCrop {
  if (!value.includes(',') || !/^\s*[+-]?(?:\d|\.\d)/.test(value)) return value;
  const parts = value.split(',').map(Number);
  if (parts.length !== 4 || !parts.every(Number.isFinite) || parts[2]! <= 0 || parts[3]! <= 0) throw new JoploError('USAGE', 'Audit rectangles use x,y,width,height in CSS pixels with positive width/height; use a CSS selector without commas');
  return { x: parts[0]!, y: parts[1]!, width: parts[2]!, height: parts[3]! };
}
export function auditOptions(opts: { auditLayout?: boolean; auditContent?: string; auditSafeArea?: string[]; auditImportant?: string[]; auditExclude?: string[]; auditEveryMs?: number }): LayoutAuditOptions | undefined {
  const specified = opts.auditContent || opts.auditSafeArea?.length || opts.auditImportant?.length || opts.auditExclude?.length || opts.auditEveryMs !== undefined;
  if (specified && !opts.auditLayout) throw new JoploError('USAGE', 'Layout audit options require --audit-layout');
  if (!opts.auditLayout) return undefined;
  if (opts.auditEveryMs !== undefined && (!Number.isFinite(opts.auditEveryMs) || opts.auditEveryMs < 20 || opts.auditEveryMs > 1000)) throw new JoploError('USAGE', '--audit-every-ms must be 20–1000 engine milliseconds');
  return { ...(opts.auditContent ? { content: auditArea(opts.auditContent) } : {}), ...(opts.auditSafeArea?.length ? { safeAreas: opts.auditSafeArea.map(auditArea) } : {}), ...(opts.auditImportant?.length ? { important: opts.auditImportant } : {}), ...(opts.auditExclude?.length ? { exclude: opts.auditExclude } : {}), ...(opts.auditEveryMs !== undefined ? { everyMs: opts.auditEveryMs } : {}) };
}
