import { randomUUID } from 'node:crypto';
import { CloudError, type CloudCode } from './cloud-error.ts';
import { JoploError, type Diagnostic, type DomainFailure, type DomainResult } from '@joplo-app/core';

export function result<T>(projectId: string, summary: string, data: T, diagnostics: Diagnostic[] = []): DomainResult<T> {
  return { ok: true, projectId, revision: 0, requestId: randomUUID(), summary, changedIds: [], diagnostics, artifacts: [], data };
}
type CliFailure = Omit<DomainFailure, 'error'> & { error: { code: DomainFailure['error']['code'] | CloudCode | 'CHOICE_REQUIRED'; message: string; details?: unknown } };
export function failure(e: unknown): CliFailure {
  if (e instanceof CloudError) return { ok: false, requestId: randomUUID(), error: { code: e.code, message: e.message, ...(e.details === undefined ? {} : { details: e.details }) }, diagnostics: [] };
  const code = (e as NodeJS.ErrnoException | null)?.code;
  const error = e instanceof JoploError ? e : new JoploError(
    ['ENOENT', 'ENOTDIR'].includes(code ?? '') ? 'NOT_FOUND' : ['EACCES', 'EPERM'].includes(code ?? '') ? 'PERMISSION_DENIED' : e instanceof SyntaxError ? 'INVALID_SCHEMA' : 'UNSUPPORTED_ACTION',
    e instanceof Error ? e.message : String(e),
  );
  return { ok: false, requestId: randomUUID(), error: { code: error.code === 'USAGE' && (error.details as { code?: string } | undefined)?.code === 'CHOICE_REQUIRED' ? 'CHOICE_REQUIRED' : error.code, message: error.message, ...(error.details === undefined ? {} : { details: error.details }) }, diagnostics: error.diagnostics };
}
export const oneLine = (s: string) => s.replace(/[\r\n\t]+/g, ' ');
export const diagnosticLine = (d: Diagnostic) => `${d.at ?? 'joplo.config.ts:1:1'}  ${d.severity}  ${d.code}  ${oneLine(d.message)}`;
