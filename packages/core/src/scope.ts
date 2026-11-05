import { scenarioTargets } from './targets.ts';
import { z } from 'zod';
import { Project, Comment } from './schema.ts';
import { RevisionInput, patchJSONSchema, operationJSONSchemas } from './ops.ts';
import { findNode } from './player.ts';
import { readProject, readRevision, readJSON, result } from './store.ts';
import { safePath } from './lock.ts';
import { JoploError } from './result.ts';
import { componentGuide } from './guide.ts';
export const GetInput = z.strictObject({
  scope: z.enum([
    'project',
    'feature',
    'option',
    'case',
    'scenario',
    'scene',
    'comments',
    'selection',
    'schema',
  ]),
  id: z.string().min(1).optional(),
  revision: RevisionInput.optional(),
  status: Comment.shape.status.removeDefault().optional(),
});
export type GetInput = z.input<typeof GetInput>;
export function pendingQuestions(p: Project) {
  return {
    issues: Object.values(p.issues).filter((i) => i.status === 'open').length,
    aiAssumptions: Object.values(p.rules).filter(
      (r) => r.origin === 'ai_assumption' && r.confirmation === 'pending',
    ).length,
  };
}
const Selection = z
  .object({
    kind: z
      .enum([
        'feature',
        'option',
        'case',
        'scene',
        'scenario',
        'step',
        'element',
      ])
      .optional(),
    id: z.string().optional(),
    sceneId: z.string().optional(),
    nodeId: z.string().optional(),
    elementId: z.string().optional(),
    optionId: z.string().optional(),
    scenarioId: z.string().optional(),
    stepId: z.string().optional(),
  })
  .passthrough();
export async function get(dir: string, raw: GetInput) {
  const parsed = GetInput.safeParse(raw);
  if (!parsed.success)
    throw new JoploError('USAGE', '无效读取范围或参数', {
      details: parsed.error.issues,
    });
  const opts = parsed.data;
  const p =
    opts.revision !== undefined
      ? await readRevision(dir, opts.revision)
      : await readProject(dir);
  let content: unknown;
  const tables = {
    feature: 'features',
    option: 'options',
    case: 'cases',
    scenario: 'scenarios',
    scene: 'scenes',
  } as const;
  if (opts.scope in tables) {
    if (!opts.id) throw new JoploError('USAGE', '对象范围需要 id');
    const table = p[tables[opts.scope as keyof typeof tables]];
    const value = table[opts.id];
    if (!value) throw new JoploError('NOT_FOUND', `对象不存在：${opts.id}`);
    if (opts.scope === 'option')
      content = {
        option: value,
        scenes: Object.values(p.scenes).filter((s) => s.optionId === opts.id),
        scenarios: Object.values(p.scenarios).filter(
          (s) => s.optionId === opts.id,
        ),
        rules: Object.values(p.rules).filter(
          (r) =>
            r.optionId === opts.id ||
            (!r.optionId && r.featureId === p.options[opts.id!]!.featureId),
        ),
        cases: Object.values(p.cases).filter(
          (c) => c.featureId === p.options[opts.id!]!.featureId,
        ),
      };
    else if (opts.scope === 'feature')
      content = {
        feature: value,
        cases: Object.values(p.cases).filter((c) => c.featureId === opts.id),
        options: Object.values(p.options).filter(
          (o) => o.featureId === opts.id,
        ),
      };
    else content = value;
  } else
    switch (opts.scope) {
      case 'project':
        content = {
          id: p.id,
          name: p.name,
          description: p.description,
          features: Object.values(p.features).map((f) => ({
            id: f.id,
            name: f.name,
            goal: f.goal,
            caseIds: f.caseIds,
            optionIds: f.optionIds,
          })),
          counts: Object.fromEntries(
            [
              'features',
              'cases',
              'options',
              'rules',
              'scenes',
              'scenarios',
              'comments',
              'issues',
              'decisions',
            ].map((k) => [
              k,
              Object.keys(p[k as keyof Project] as object).length,
            ]),
          ),
        };
        break;
      case 'comments':
        content = Object.values(p.comments).filter(
          (c) =>
            (!opts.status || c.status === opts.status) &&
            (!opts.id || c.id === opts.id),
        );
        break;
      case 'schema':
        content = {
          project: z.toJSONSchema(Project),
          patch: patchJSONSchema(),
          operations: operationJSONSchemas(),
          components: componentGuide,
        };
        break;
      case 'selection': {
        let selection: z.infer<typeof Selection>;
        try {
          const s = Selection.safeParse(
            await readJSON(await safePath(dir, '.joplo', 'selection.json')),
          );
          if (!s.success)
            throw new JoploError('INVALID_SCHEMA', '当前选中格式不合法', {
              details: s.error.issues,
            });
          selection = s.data;
        } catch (e) {
          if (e instanceof JoploError && e.code === 'NOT_FOUND') {
            content = { selection: null, node: null, rules: [], steps: [] };
            break;
          }
          throw e;
        }
        const element = selection.id?.includes('#')
          ? selection.id.split('#')
          : undefined;
        const sceneId = selection.sceneId ?? element?.[0];
        const nodeId =
          selection.nodeId ??
          selection.elementId ??
          element?.[1] ??
          (selection.kind === 'element' ? selection.id : undefined);
        const scene = sceneId ? p.scenes[sceneId] : undefined;
        const node =
          scene && nodeId ? findNode(scene, nodeId)?.node : undefined;
        const scenario = selection.scenarioId
          ? p.scenarios[selection.scenarioId]
          : undefined;
        const stepId =
          selection.stepId ??
          (selection.kind === 'step' ? selection.id : undefined);
        const steps = Object.values(p.scenarios).flatMap((s) =>
          stepId
            ? s.steps
                .filter((st) => st.id === stepId)
                .map((st) => ({ scenarioId: s.id, ...st }))
            : scenarioTargets(s)
                .filter((t) => t.sceneId === sceneId && t.nodeId === nodeId)
                .map((t) => ({ scenarioId: s.id, ...t.step })),
        );
        const ruleIds = new Set(steps.flatMap((s) => s.ruleIds));
        content = {
          selection,
          node: node ?? null,
          scene: scene ?? null,
          scenario: scenario ?? null,
          steps,
          rules: Object.values(p.rules).filter(
            (r) =>
              ruleIds.has(r.id) ||
              (nodeId &&
                sceneId &&
                r.elementRefs.includes(`${sceneId}#${nodeId}`)) ||
              (stepId && r.stepIds.includes(stepId)),
          ),
          targetMissing: Boolean(
            (nodeId && !node) || (stepId && !steps.length),
          ),
        };
        break;
      }
    }
  return result(p, `读取 ${opts.scope}`, {
    content,
    pendingQuestions: pendingQuestions(p),
  });
}
