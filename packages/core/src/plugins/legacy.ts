/** Compatibility input only; new compiler outputs use namespaced slots. */
export { Trace as LegacyTraceSchema } from '@joplo-app/plugin-diagram/schema';
import { standardAliases } from './standard-catalog.ts';
import type { Diagnostic } from '../result.ts';

const record = (v: unknown): Record<string, unknown> => v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : {};
export function legacyDiagnostics(value: unknown): Diagnostic[] {
  const out: Diagnostic[] = [];
  const report = (o: Record<string, unknown>, message: string) => out.push({ severity: 'warning', code: 'PLUGIN_LEGACY_TYPE', message, source: 'structure', ...(typeof o.source === 'string' ? { at: o.source } : {}) });
  const node = (v: unknown) => {
    const o = record(v);
    const replacement = typeof o.type === 'string' ? standardAliases[o.type] : undefined;
    if (replacement) report(o, `Legacy type ${String(o.type)}: recompile the author TSX with the current kit to emit ${replacement} and plugin snapshots`);
    for (const child of Array.isArray(o.children) ? o.children : []) node(child);
  };
  const project = record(value);
  for (const scene of Object.values(record(project.scenes))) node(record(scene).root);
  for (const scenario of Object.values(record(project.scenarios))) {
    const steps = record(scenario).steps;
    for (const step of Array.isArray(steps) ? steps : []) {
      const o = record(step);
      if (Array.isArray(o.traces) && o.traces.length) report(o, 'Legacy effect data: recompile the author TSX with the current kit to emit plugin snapshots');
    }
  }
  return out;
}
