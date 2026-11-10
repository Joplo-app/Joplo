/** 作品按位置校验；两处创作定义直接进入同一编译循环，不合成其他容器。 */
import type { WorkDef } from '@joplo-app/kit';
import { isNode } from '@joplo-app/kit/node';
import type { Diagnostic } from './result.ts';
type Report = (code: string, message: string, at?: string, severity?: Diagnostic['severity']) => void;
const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
export function validateWork(key: string, f: WorkDef & { file: string }, feature: boolean, report: Report, hasPages = false): boolean {
  const at = f?.source ?? `${f?.file ?? `works/${key}.tsx`}:1:1`;
  if (!f || f.kind !== 'work') {
    report('WORK_INVALID', `Work ${key} must default export work({...})`, at);
    return false;
  }
  let valid = true;
  const invalid = (reason: string) => { report('WORK_INVALID', `Work ${key}: ${reason}`, at); valid = false; };
  if (typeof f.title !== 'string' || !f.title.trim()) invalid('requires a non-empty title');
  if (typeof f.summary !== 'string' || !f.summary.trim()) invalid('requires a non-empty summary');
  if (!record(f.scenarios)) invalid('scenarios must be an object of flow(...) or chapter(...) entries');
  if (f.stage !== undefined && f.layers !== undefined) invalid('stage and layers cannot be combined; choose one');
  if (f.stage !== undefined && !isNode(f.stage)) invalid('stage must be a JSX element');
  if (f.layers !== undefined && !record(f.layers)) invalid('layers must be an object of layer(...) entries');
  if (!hasPages && f.stage === undefined && f.layers === undefined && f.on === undefined && f.routes === undefined)
    invalid('requires stage, layers, on or routes when the project has no pages');
  if (!valid) return false;
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
