/** 作品按位置校验；两处创作定义直接进入同一编译循环，不合成其他容器。 */
import type { WorkDef } from '@joplo-app/kit';
import { isNode } from '@joplo-app/kit/node';
import type { Diagnostic } from './result.ts';
type Report = (code: string, message: string, at?: string, severity?: Diagnostic['severity']) => void;
const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
export function validateWork(key: string, f: WorkDef & { file: string }, feature: boolean, report: Report, hasPages = false): boolean {
  const at = f?.source ?? `${f?.file ?? `works/${key}.tsx`}:1:1`;
  if (!f || f.kind !== 'work' || typeof f.title !== 'string' || !f.title.trim() || typeof f.summary !== 'string' || !f.summary.trim()
    || f.stage !== undefined && (f.layers !== undefined || !isNode(f.stage))
    || f.layers !== undefined && !record(f.layers) || !record(f.scenarios)
    || !hasPages && f.stage === undefined && f.layers === undefined && f.on === undefined && f.routes === undefined) {
    report('WORK_INVALID', `Work ${key} requires non-empty title and summary and a scenarios object of flow(...) or chapter(...) entries (stage and layers cannot be combined)`, at);
    return false;
  }
  const forbidden = feature ? ['audience', 'roles', 'draft', 'order'] : ['cases', 'focus', 'tradeoffs', 'coverage', 'rules', 'questions'];
  for (const field of forbidden) if (Object.hasOwn(f, field))
    report(feature ? 'WORK_STANDALONE_ONLY' : 'WORK_FEATURE_ONLY', `Work ${key}: ${field} is only available ${feature ? 'on an independent work' : 'under a feature for design review'}`, at);
  for (const [sliceKey, slice] of Object.entries(f.scenarios)) {
    if (!slice || !['flow', 'chapter'].includes(slice.kind) || !Array.isArray(slice.steps) || !record(slice.opts)) {
      report('WORK_INVALID', `Work ${key} slice "${sliceKey}" must be flow(title, settings?) or chapter(title, settings?)`, slice?.source ?? at);
      continue;
    }
    if (feature) continue;
    if (Object.hasOwn(slice.opts, 'cases'))
      report('WORK_FEATURE_ONLY', `Work ${key} slice "${sliceKey}" cannot declare cases. Remove cases, or use an alternative under a feature`, slice.source ?? at);
    for (const st of slice.steps) for (const effect of st.effects) if (effect.type === 'uses')
      report('WORK_FEATURE_ONLY', `Work ${key} slice "${sliceKey}" cannot use uses(). Remove uses(), or use an alternative under a feature with rules`, st.source ?? slice.source ?? at);
  }
  return true;
}
