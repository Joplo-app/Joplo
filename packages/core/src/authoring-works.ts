/** 独立作品只在入口展开为现有定义；层级、步骤和插件继续走统一编译路径。 */
import type { WorkDef } from '@joplo-app/kit';
import { isNode } from '@joplo-app/kit/node';
import type { AuthoringProject, CompileMode } from './compile.ts';
import type { Diagnostic } from './result.ts';

type Report = (code: string, message: string, at?: string, severity?: Diagnostic['severity']) => void;
const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

export function lowerWorks(src: AuthoringProject, mode: CompileMode, report: Report): { source: AuthoringProject; works: Map<string, WorkDef> } {
  const works = new Map<string, WorkDef>();
  if (!Object.keys(src.works ?? {}).length) return { source: src, works };
  const features = { ...src.features };
  for (const [key, f] of Object.entries(src.works ?? {})) {
    const at = f?.source ?? `${f?.file ?? `works/${key}.tsx`}:1:1`;
    if (Object.hasOwn(features, key)) {
      report('WORK_ID_CONFLICT', `Work ${key} conflicts with features/${key}; rename the work file or the feature directory`, at);
      continue;
    }
    if (!f || f.kind !== 'work') {
      report('WORK_INVALID', `works/${key} must default export work({...})`, at);
      continue;
    }
    if (mode !== 'dev' && f.draft === true) {
      report('WORK_DRAFT_SKIPPED', `Draft work "${f.title}" was skipped; remove draft: true when it is ready to publish or review`, at, 'info');
      continue;
    }
    if (typeof f.title !== 'string' || !f.title.trim() || typeof f.summary !== 'string' || !f.summary.trim()
      || f.stage !== undefined && (f.layers !== undefined || !isNode(f.stage))
      || f.layers !== undefined && !record(f.layers) || !record(f.scenarios)
      || f.stage === undefined && f.layers === undefined && f.on === undefined && f.routes === undefined) {
      report('WORK_INVALID', `Work ${key} requires non-empty title and summary, a scenarios object of flow(...) or chapter(...) entries, and a stage, layers, on or routes (stage and layers cannot be combined)`, at);
      continue;
    }
    if (Object.hasOwn(f, 'cases') || Object.hasOwn(f, 'rules'))
      report('WORK_FEATURE_ONLY', `Work ${key} cannot declare cases or rules. Use a feature with options for design review`, at);
    for (const [sliceKey, slice] of Object.entries(f.scenarios)) {
      if (!slice || !['flow', 'chapter'].includes(slice.kind) || !Array.isArray(slice.steps) || !record(slice.opts)) {
        report('WORK_INVALID', `Work ${key} slice "${sliceKey}" must be flow(title, options?) or chapter(title, options?)`, slice?.source ?? at);
        continue;
      }
      if (Object.hasOwn(slice.opts, 'cases'))
        report('WORK_FEATURE_ONLY', `Work ${key} slice "${sliceKey}" cannot declare cases. Remove cases, or use an option under a feature`, slice.source ?? at);
      for (const st of slice.steps) for (const effect of st.effects) if (effect.type === 'uses')
        report('WORK_FEATURE_ONLY', `Work ${key} slice "${sliceKey}" cannot use uses(). Remove uses(), or use an option under a feature with rules`, st.source ?? slice.source ?? at);
    }
    if (!Object.keys(f.scenarios).length)
      report('WORK_EMPTY', `Work "${f.title}" has no slices. Add scenarios: { opening: chapter('Opening').system('Begin', narrate('Your opening line')) }`, at, 'info');
    works.set(key, f);
    features[key] = {
      def: { kind: 'feature', name: f.title, goal: f.summary, cases: {}, pick: 'main', roles: f.roles, order: f.order, source: f.source, file: f.file },
      options: { main: {
        kind: 'option', name: f.title, idea: f.summary, state: f.state, free: f.free, scenarios: f.scenarios, on: f.on, routes: f.routes,
        layers: f.stage !== undefined ? { stage: { kind: 'layer', title: f.title, tree: f.stage, viewport: f.viewport, source: f.source } } : f.layers,
        source: f.source, file: f.file,
      } },
    };
  }
  return { source: { ...src, features }, works };
}
