import type { Diagnostic } from '@joplo-app/core';

/** Dev-service policy, deliberately outside the playback/compiler model. */
export function watchConfigDiagnostics(value: unknown, at = 'joplo.config.ts:1:1'): Diagnostic[] {
  if (value === undefined) return [];
  const w = value as { ignore?: unknown } | null;
  if (!w || typeof w !== 'object' || Array.isArray(w) || Object.keys(w).some(k => k !== 'ignore') ||
      (w.ignore !== undefined && (!Array.isArray(w.ignore) || w.ignore.some(p => typeof p !== 'string' || !p || /[\\:*?\[\]{}\x00]/.test(p) || p.startsWith('/') || p.split('/').some(s => !s || s === '.' || s === '..') || /^joplo\.config\.tsx?$/.test(p)))))
    return [{code:'WATCH_CONFIG_INVALID',severity:'error',source:'schema',at,message:'watch.ignore must contain project-relative file or directory paths (no globs, dot segments, or joplo.config.ts); restart dev after changing it'}];
  return [];
}
