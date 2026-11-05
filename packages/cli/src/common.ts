import { randomUUID } from 'node:crypto';
import { JoploError, type Diagnostic, type DomainFailure, type DomainResult } from '@joplo/core';

export function result<T>(projectId: string, summary: string, data: T, diagnostics: Diagnostic[] = []): DomainResult<T> {
  return { ok: true, projectId, revision: 0, requestId: randomUUID(), summary, changedIds: [], diagnostics, artifacts: [], data };
}
export function failure(e: unknown): DomainFailure {
  const code = (e as NodeJS.ErrnoException | null)?.code;
  const error = e instanceof JoploError ? e : new JoploError(
    ['ENOENT', 'ENOTDIR'].includes(code ?? '') ? 'NOT_FOUND' : ['EACCES', 'EPERM'].includes(code ?? '') ? 'PERMISSION_DENIED' : e instanceof SyntaxError ? 'INVALID_SCHEMA' : 'UNSUPPORTED_ACTION',
    e instanceof Error ? e.message : String(e),
  );
  return { ok: false, requestId: randomUUID(), error: { code: error.code, message: error.message, ...(error.details === undefined ? {} : { details: error.details }) }, diagnostics: error.diagnostics };
}
export const oneLine = (s: string) => s.replace(/[\r\n\t]+/g, ' ');
export const diagnosticLine = (d: Diagnostic) => `${d.at ?? 'joplo.config.ts:1:1'}  ${d.severity}  ${d.code}  ${oneLine(d.message)}`;
