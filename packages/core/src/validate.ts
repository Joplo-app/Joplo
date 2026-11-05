import { scenarioTargets } from './targets.ts';
import { safeRecords } from './records.ts';
import { Project } from './schema.ts';
import { INTERACTIVE_TYPES } from './catalog.ts';
import { walkNodes, findNode, replay } from './player.ts';
import type { Diagnostic } from './result.ts';
import { JoploError } from './result.ts';
export type ValidationOptions = {
  optionId?: string;
  mode: 'structure' | 'replay' | 'all';
};
export type ValidationReport = {
  diagnostics: Diagnostic[];
  summary: Record<'error' | 'warning' | 'info', number>;
  verification: Record<string, 'unchecked' | 'structure_ok' | 'replay_ok'>;
};
export function validate(
  project: Project,
  opts: ValidationOptions = { mode: 'all' },
): ValidationReport {
  const diagnostics: Diagnostic[] = [];
  const verification: ValidationReport['verification'] = {};
  if (!['structure', 'replay', 'all'].includes(opts.mode))
    throw new JoploError('USAGE', '无效校验模式');
  if (opts.optionId && !project.options[opts.optionId])
    throw new JoploError('NOT_FOUND', `方案不存在：${opts.optionId}`);
  const parsed = Project.safeParse(project);
  if (!parsed.success)
    return {
      diagnostics: [
        {
          severity: 'error',
          source: 'schema',
          code: 'INVALID_SCHEMA',
          message: parsed.error.message,
        },
      ],
      summary: { error: 1, warning: 0, info: 0 },
      verification: Object.fromEntries(
        Object.keys(project.options ?? {}).map((k) => [k, 'unchecked']),
      ),
    };
  const p = safeRecords(parsed.data);
  const emit = (
    severity: Diagnostic['severity'],
    source: Diagnostic['source'],
    code: string,
    message: string,
    kind: string,
    id: string,
    optionId?: string,
  ) =>
    diagnostics.push({
      severity,
      source,
      code,
      message,
      ref: { kind, id, ...(optionId ? { optionId } : {}) },
    });
  const ref = (
    ok: unknown,
    message: string,
    kind: string,
    id: string,
    optionId?: string,
  ) => {
    if (!ok)
      emit(
        'error',
        'reference',
        'INVALID_REFERENCE',
        message,
        kind,
        id,
        optionId,
      );
  };
  const warning = (
    code: string,
    message: string,
    kind: string,
    id: string,
    optionId?: string,
  ) => emit('warning', 'structure', code, message, kind, id, optionId);
  const steps = new Map<string, { optionId: string; featureId?: string }>();
  for (const sc of Object.values(p.scenarios))
    for (const step of sc.steps) {
      ref(
        !steps.has(step.id),
        `步骤 ID 重复：${step.id}`,
        'step',
        step.id,
        sc.optionId,
      );
      steps.set(step.id, {
        optionId: sc.optionId,
        featureId: p.options[sc.optionId]?.featureId,
      });
    }
  const elementExists = (id: string) => {
    const [sceneId, nodeId, ...rest] = id.split('#');
    return (
      rest.length === 0 &&
      sceneId &&
      nodeId &&
      p.scenes[sceneId] &&
      findNode(p.scenes[sceneId], nodeId)
    );
  };
  for (const [kind, table] of Object.entries({
    feature: p.features,
    case: p.cases,
    option: p.options,
    rule: p.rules,
    scene: p.scenes,
    scenario: p.scenarios,
    comment: p.comments,
    issue: p.issues,
    decision: p.decisions,
  }))
    for (const [id, value] of Object.entries(table))
      ref(
        id === value.id,
        `记录键 ${id} 与对象 ID ${value.id} 不一致`,
        kind,
        id,
        'optionId' in value ? value.optionId : undefined,
      );
  for (const f of Object.values(p.features)) {
    for (const id of f.caseIds)
      ref(
        p.cases[id]?.featureId === f.id,
        `功能情况不存在或不属于本功能：${id}`,
        'feature',
        f.id,
      );
    for (const id of f.optionIds)
      ref(
        p.options[id]?.featureId === f.id,
        `功能方案不存在或不属于本功能：${id}`,
        'feature',
        f.id,
      );
    for (const id of f.dependsOn)
      ref(p.features[id], `依赖功能不存在：${id}`, 'feature', f.id);
  }
  for (const c of Object.values(p.cases))
    ref(
      p.features[c.featureId]?.caseIds.includes(c.id),
      `情况的功能不存在或未列出该情况：${c.featureId}`,
      'case',
      c.id,
    );
  for (const o of Object.values(p.options)) {
    ref(
      p.features[o.featureId]?.optionIds.includes(o.id),
      `方案的功能不存在或未列出该方案：${o.featureId}`,
      'option',
      o.id,
      o.id,
    );
    for (const id of o.derivedFrom)
      ref(
        p.options[id]?.featureId === o.featureId,
        `来源方案不存在或跨功能：${id}`,
        'option',
        o.id,
        o.id,
      );
    for (const [id, c] of Object.entries(o.coverage)) {
      ref(
        p.cases[id]?.featureId === o.featureId &&
          p.features[o.featureId]?.caseIds.includes(id),
        `coverage 情况不属于本功能：${id}`,
        'option',
        o.id,
        o.id,
      );
      for (const scId of c.scenarioIds)
        ref(
          p.scenarios[scId]?.optionId === o.id,
          `coverage 场景不存在或跨方案：${scId}`,
          'option',
          o.id,
          o.id,
        );
      if (c.status === 'expressed' && !c.scenarioIds.length)
        warning(
          'EXPRESSED_WITHOUT_SCENARIO',
          '已表达情况没有场景',
          'case',
          id,
          o.id,
        );
      if (
        ['not_applicable', 'excluded'].includes(c.status) &&
        !c.reason?.trim()
      )
        warning(
          'COVERAGE_WITHOUT_REASON',
          '不适用或已排除必须说明原因',
          'case',
          id,
          o.id,
        );
    }
    for (const c of Object.values(p.cases).filter(
      (c) => c.featureId === o.featureId,
    ))
      if (!o.coverage[c.id])
        warning(
          'CASE_NOT_COVERED',
          `待重新检查：${c.title}`,
          'case',
          c.id,
          o.id,
        );
  }
  for (const r of Object.values(p.rules)) {
    ref(
      p.features[r.featureId],
      `规则的功能不存在：${r.featureId}`,
      'rule',
      r.id,
      r.optionId,
    );
    if (r.optionId)
      ref(
        p.options[r.optionId]?.featureId === r.featureId,
        '规则的方案不存在或跨功能',
        'rule',
        r.id,
        r.optionId,
      );
    for (const id of r.caseIds)
      ref(
        p.cases[id]?.featureId === r.featureId,
        `规则情况不存在或跨功能：${id}`,
        'rule',
        r.id,
        r.optionId,
      );
    for (const id of r.stepIds)
      ref(
        steps.has(id) &&
          steps.get(id)?.featureId === r.featureId &&
          (!r.optionId || steps.get(id)?.optionId === r.optionId),
        `规则步骤不存在或跨范围：${id}`,
        'rule',
        r.id,
        r.optionId,
      );
    for (const id of r.elementRefs) {
      const scene = p.scenes[id.split('#')[0]!];
      ref(
        elementExists(id) &&
          scene &&
          p.options[scene.optionId]?.featureId === r.featureId &&
          (!r.optionId || scene.optionId === r.optionId),
        `规则元素不存在或跨范围：${id}`,
        'rule',
        r.id,
        r.optionId,
      );
    }
    if (r.origin === 'ai_assumption' && r.confirmation === 'pending')
      emit(
        'info',
        'structure',
        'PENDING_AI_ASSUMPTION',
        r.text,
        'rule',
        r.id,
        r.optionId,
      );
  }
  for (const s of Object.values(p.scenes)) {
    ref(
      p.options[s.optionId],
      `画面方案不存在：${s.optionId}`,
      'scene',
      s.id,
      s.optionId,
    );
    const ids = new Set<string>();
    walkNodes(s.root, (n) => {
      ref(
        !ids.has(n.id),
        `画面内节点 ID 重复：${n.id}`,
        'element',
        `${s.id}#${n.id}`,
        s.optionId,
      );
      ids.add(n.id);
      if (
        n.disabled !== undefined &&
        n.disabled !== false &&
        !n.disabledReason?.trim()
      )
        warning(
          'DISABLED_WITHOUT_REASON',
          '禁用元素缺少原因',
          'element',
          `${s.id}#${n.id}`,
          s.optionId,
        );
      const targeted = Object.values(p.scenarios).some(
        (sc) =>
          sc.optionId === s.optionId &&
          scenarioTargets(sc).some(
            (t) => t.sceneId === s.id && t.nodeId === n.id,
          ),
      );
      if (
        INTERACTIVE_TYPES.has(n.type) &&
        !targeted &&
        !(n.disabled === true && n.disabledReason?.trim()) &&
        !n.unmodeled
      )
        warning(
          'UNBOUND_INTERACTIVE',
          '可操作元素没有演示行为，请绑定步骤、禁用并说明原因或标记 unmodeled',
          'element',
          `${s.id}#${n.id}`,
          s.optionId,
        );
    });
  }
  for (const s of Object.values(p.scenarios)) {
    const featureId = p.options[s.optionId]?.featureId;
    ref(
      featureId,
      `场景方案不存在：${s.optionId}`,
      'scenario',
      s.id,
      s.optionId,
    );
    ref(
      p.scenes[s.initial.sceneId]?.optionId === s.optionId,
      '初始画面不存在或跨方案',
      'scenario',
      s.id,
      s.optionId,
    );
    for (const id of s.caseIds)
      ref(
        p.cases[id] && p.cases[id]?.featureId === featureId,
        `场景情况不存在或跨功能：${id}`,
        'scenario',
        s.id,
        s.optionId,
      );
    for (const step of s.steps) {
      for (const id of step.ruleIds) {
        const r = p.rules[id];
        ref(
          r &&
            r.featureId === featureId &&
            (!r.optionId || r.optionId === s.optionId),
          `步骤规则不存在或跨范围：${id}`,
          'step',
          step.id,
          s.optionId,
        );
      }
      for (const e of step.effects)
        if (e.type === 'navigate')
          ref(
            p.scenes[e.sceneId]?.optionId === s.optionId,
            '导航目标不存在或跨方案',
            'step',
            step.id,
            s.optionId,
          );
    }
    if (!s.steps.length)
      emit(
        'info',
        'structure',
        'EMPTY_SCENARIO',
        '场景没有步骤',
        'scenario',
        s.id,
        s.optionId,
      );
  }
  for (const i of Object.values(p.issues)) {
    ref(p.features[i.featureId], '问题功能不存在', 'issue', i.id, i.optionId);
    if (i.optionId)
      ref(
        p.options[i.optionId]?.featureId === i.featureId,
        '问题方案不存在或跨功能',
        'issue',
        i.id,
        i.optionId,
      );
  }
  for (const d of Object.values(p.decisions))
    ref(
      p.options[d.optionId]?.featureId === d.featureId &&
        p.features[d.featureId],
      '决策方案或功能不存在',
      'decision',
      d.id,
      d.optionId,
    );
  for (const c of Object.values(p.comments)) {
    const t = c.target;
    const table = {
      feature: p.features,
      option: p.options,
      case: p.cases,
      scene: p.scenes,
      scenario: p.scenarios,
    };
    const exists =
      t.kind === 'element'
        ? elementExists(t.id)
        : t.kind === 'step'
          ? steps.has(t.id)
          : Boolean(table[t.kind][t.id]);
    if (
      !exists ||
      (t.optionId && !p.options[t.optionId]) ||
      (t.scenarioId && !p.scenarios[t.scenarioId]) ||
      (t.stepId && !steps.has(t.stepId))
    )
      warning(
        'COMMENT_TARGET_MISSING',
        '评论原目标已不存在；保留原锚点',
        'comment',
        c.id,
        t.optionId,
      );
  }
  if (opts.mode !== 'structure')
    for (const s of Object.values(p.scenarios))
      if (!opts.optionId || s.optionId === opts.optionId)
        diagnostics.push(
          ...replay(p, s.id).diagnostics.map((d) => ({
            ...d,
            ref: {
              ...d.ref,
              kind: d.ref?.kind ?? 'scenario',
              id: d.ref?.id ?? s.id,
              optionId: s.optionId,
              scenarioId: s.id,
            },
          })),
        );
  const relevant = diagnostics.filter(
    (d) =>
      !opts.optionId || !d.ref?.optionId || d.ref.optionId === opts.optionId,
  );
  for (const o of Object.values(p.options)) {
    verification[o.id] = 'unchecked';
    if (opts.optionId && o.id !== opts.optionId) continue;
    if (
      relevant.some(
        (d) =>
          d.severity === 'error' &&
          d.source !== 'replay' &&
          (!d.ref?.optionId || d.ref.optionId === o.id),
      )
    )
      continue;
    verification[o.id] = 'structure_ok';
    if (
      opts.mode !== 'structure' &&
      Object.values(p.scenarios).some((s) => s.optionId === o.id) &&
      !relevant.some(
        (d) =>
          d.severity === 'error' &&
          d.source === 'replay' &&
          d.ref?.optionId === o.id,
      )
    )
      verification[o.id] = 'replay_ok';
  }
  return {
    diagnostics: relevant,
    summary: {
      error: relevant.filter((d) => d.severity === 'error').length,
      warning: relevant.filter((d) => d.severity === 'warning').length,
      info: relevant.filter((d) => d.severity === 'info').length,
    },
    verification,
  };
}
