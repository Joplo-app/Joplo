import { Project, type SceneNode } from './schema.ts';
import { INTERACTIVE_TYPES } from './catalog.ts';
import { walkNodes, findNode, replay } from './player.ts';
import { JoploError, type Diagnostic } from './result.ts';

export type ValidationOptions = { optionId?: string; mode: 'structure' | 'replay' | 'all' };
export type ValidationReport = {
  diagnostics: Diagnostic[];
  summary: Record<'error' | 'warning' | 'info', number>;
  verification: Record<string, 'unchecked' | 'structure_ok' | 'replay_ok'>;
};

/** IR v2 的确定性校验。源位置缺失（例如手工构造/发布 IR）时回退到配置文件。 */
export function validate(project: Project, opts: ValidationOptions = { mode: 'all' }): ValidationReport {
  if (!['structure', 'replay', 'all'].includes(opts.mode)) throw new JoploError('USAGE', '无效校验模式');
  const diagnostics: Diagnostic[] = [];
  const verification: ValidationReport['verification'] = {};
  const seen = new Set<string>();
  const emit = (severity: Diagnostic['severity'], code: string, message: string, at: string | undefined,
    ref?: Diagnostic['ref'], source: Diagnostic['source'] = 'structure') => {
    const location = at ?? 'joplo.config.ts:1:1';
    // 同一布局/页面会复制到许多画面。相同问题只输出一次；不同情况/元素的诊断仍保留。
    const key = JSON.stringify([severity, code, location, message]);
    if (seen.has(key)) return;
    seen.add(key);
    diagnostics.push({ severity, code, message, source, at: location, ...(ref ? { ref } : {}) });
  };
  const report = (): ValidationReport => ({ diagnostics, verification, summary: {
    error: diagnostics.filter(d => d.severity === 'error').length,
    warning: diagnostics.filter(d => d.severity === 'warning').length,
    info: diagnostics.filter(d => d.severity === 'info').length,
  } });
  const parsed = Project.safeParse(project);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      let value: unknown = project;
      let at: string | undefined;
      for (const key of issue.path) {
        if (value && typeof value === 'object') {
          if ('source' in value && typeof value.source === 'string') at = value.source;
          value = (value as Record<PropertyKey, unknown>)[key];
        } else break;
      }
      emit('error', 'INVALID_SCHEMA', `${issue.path.join('.') || 'project'}: ${issue.message}`, at, undefined, 'schema');
    }
    return report();
  }
  const p = parsed.data;
  if (opts.optionId && !Object.hasOwn(p.options, opts.optionId)) throw new JoploError('USAGE', `方案不存在：${opts.optionId}`);
  const options = Object.values(p.options).filter(o => !opts.optionId || o.id === opts.optionId);
  const included = (optionId?: string | null) => !opts.optionId || !optionId || optionId === opts.optionId;
  const scenarios = Object.values(p.scenarios).filter(s => included(s.optionId));
  const ref = (ok: unknown, message: string, value: { id: string; source?: string; optionId?: string }, kind: string) => {
    if (!ok) emit('error', 'INVALID_REFERENCE', message, value.source, { kind, id: value.id, optionId: value.optionId }, 'reference');
  };
  for (const o of options) verification[o.id] = 'unchecked';
  if (opts.mode !== 'replay') {
    for (const [kind, table] of Object.entries({ feature: p.features, case: p.cases, option: p.options, rule: p.rules, scenario: p.scenarios, issue: p.issues })) {
      for (const [id, value] of Object.entries(table)) {
        const optionId = 'optionId' in value ? value.optionId : kind === 'option' ? id : undefined;
        if (included(optionId)) ref(id === value.id, `记录键 ${id} 与对象 ID ${value.id} 不一致`, { ...value, optionId }, kind);
      }
    }
    for (const c of Object.values(p.cases).filter(c => !opts.optionId || c.featureId === p.options[opts.optionId]?.featureId)) {
      ref(p.features[c.featureId]?.caseIds.includes(c.id), `情况的功能不存在或未列出情况：${c.featureId}`, c, 'case');
    }
    for (const f of Object.values(p.features).filter(f => !opts.optionId || f.optionIds.includes(opts.optionId))) {
      for (const id of f.caseIds) ref(p.cases[id]?.featureId === f.id, `功能情况不存在或跨功能：${id}`, f, 'feature');
      for (const id of f.optionIds) ref(p.options[id]?.featureId === f.id, `功能方案不存在或跨功能：${id}`, f, 'feature');
      if (f.pick) ref(p.options[f.pick]?.featureId === f.id, `选定方案不存在或跨功能：${f.pick}`, f, 'feature');
    }
    for (const o of options) {
      const value = { ...o, optionId: o.id };
      ref(p.features[o.featureId]?.optionIds.includes(o.id), `方案的功能不存在或未列出方案：${o.featureId}`, value, 'option');
      const cases = Object.values(p.cases).filter(c => c.featureId === o.featureId);
      for (const c of cases) if (!o.coverage[c.id]) emit('warning', 'CASE_NOT_COVERED', `情况缺少覆盖：${c.id} ${c.title}`, o.source, { kind: 'case', id: c.id, optionId: o.id });
      for (const [id, c] of Object.entries(o.coverage)) {
        const r = { kind: 'case', id, optionId: o.id };
        ref(p.cases[id]?.featureId === o.featureId, `coverage 情况不存在或跨功能：${id}`, value, 'option');
        for (const sid of c.scenarioIds) ref(p.scenarios[sid]?.optionId === o.id, `coverage 场景不存在或跨方案：${sid}`, value, 'option');
        if (c.status === 'expressed' && !c.scenarioIds.length) emit('warning', 'EXPRESSED_WITHOUT_SCENARIO', `已表达情况没有场景：${id}`, o.source, r);
        if (['not_applicable', 'excluded'].includes(c.status) && !c.reason?.trim()) emit('warning', 'COVERAGE_WITHOUT_REASON', `不适用或已排除必须说明原因：${id}`, o.source, r);
        if (c.status === 'missing') emit('warning', 'CASE_NOT_COVERED', `情况尚未表达：${id} ${p.cases[id]?.title ?? ''}`, o.source, r);
      }
    }
    for (const r of Object.values(p.rules).filter(r => included(r.optionId) && (!opts.optionId || r.featureId === p.options[opts.optionId]?.featureId))) {
      ref(p.features[r.featureId], `规则的功能不存在：${r.featureId}`, r, 'rule');
      if (r.optionId) ref(p.options[r.optionId]?.featureId === r.featureId, `规则的方案不存在或跨功能：${r.optionId}`, r, 'rule');
      for (const id of r.caseIds) ref(p.cases[id]?.featureId === r.featureId, `规则情况不存在或跨功能：${id}`, r, 'rule');
      const scenes = Object.values(p.scenes).filter(s => s.optionId && (r.optionId ? s.optionId === r.optionId : p.options[s.optionId]?.featureId === r.featureId));
      for (const id of r.elementIds) if (!scenes.some(s => findNode(s, id))) emit('warning', 'RULE_ELEMENT_NOT_FOUND', `规则关联的元素在相关方案的所有画面中均不存在：${id}`, r.source, { kind: 'rule', id: r.id, optionId: r.optionId });
      if (r.origin === 'ai_assumption' && r.confirmation === 'pending') emit('info', 'PENDING_AI_ASSUMPTION', r.text, r.source, { kind: 'rule', id: r.id, optionId: r.optionId });
      if (r.origin === 'ai_assumption' && r.confirmation === 'confirmed') emit('error', 'ASSUMPTION_CONFIRMED', 'AI 假设不能标为已确认', r.source, { kind: 'rule', id: r.id, optionId: r.optionId });
    }
    // 从每个场景的路径和跳转追踪步骤目标；只按 id 全局匹配会误认其他页面的同名元素。
    const identity = (n: SceneNode) => JSON.stringify([n.source ?? '', n.from ?? '', n.id]);
    const bound = new Set<string>();
    for (const sc of Object.values(p.scenarios)) {
      let sceneId = sc.initial.sceneId;
      const stack: string[] = [];
      for (const step of sc.steps) {
        const s = p.scenes[sceneId];
        const hit = s && 'target' in step.action ? findNode(s, step.action.target)?.node : undefined;
        if (hit && (!hit.from || hit.from === sc.optionId)) bound.add(identity(hit));
        if (step.action.type === 'back') sceneId = stack.pop() ?? sceneId;
        for (const e of step.effects) if (e.type === 'navigate') { stack.push(sceneId); sceneId = e.sceneId; }
      }
    }
    for (const s of Object.values(p.scenes).filter(s => included(s.optionId))) {
      const value = { id: s.id, optionId: s.optionId ?? undefined, source: s.root.source ?? (s.optionId ? p.options[s.optionId]?.source : undefined) };
      ref(p.scenes[s.id] === s, `画面键与 ID 不一致：${s.id}`, value, 'scene');
      if (s.optionId) ref(p.options[s.optionId], `画面方案不存在：${s.optionId}`, value, 'scene');
      ref(p.routes[s.route], `画面路径不存在：${s.route}`, value, 'scene');
      const ids = new Set<string>();
      walkNodes(s.root, n => {
        const r = { kind: 'element', id: n.id, optionId: n.from ?? s.optionId ?? undefined };
        if (ids.has(n.id)) emit('error', 'DUPLICATE_ELEMENT', `画面内元素 ID 重复：${n.id}`, n.source, r, 'reference');
        ids.add(n.id);
        if (n.disabled !== undefined && n.disabled !== false && !n.disabledReason?.trim()) emit('warning', 'DISABLED_WITHOUT_REASON', `禁用元素缺少原因：${n.id}`, n.source, r);
        if (INTERACTIVE_TYPES.has(n.type) && !bound.has(identity(n)) && !(n.disabled === true && n.disabledReason?.trim()) && !n.unmodeled) emit('warning', 'UNBOUND_INTERACTIVE', `可操作元素没有演示步骤：${n.id}；请绑定步骤、禁用并说明原因或标记 unmodeled`, n.source, r);
      });
    }
    const stepIds = new Set<string>();
    for (const sc of scenarios) {
      const o = p.options[sc.optionId];
      ref(o, `场景方案不存在：${sc.optionId}`, sc, 'scenario');
      ref(p.scenes[sc.initial.sceneId]?.optionId === sc.optionId, `场景初始画面不存在或跨方案：${sc.initial.sceneId}`, sc, 'scenario');
      for (const id of sc.caseIds) ref(p.cases[id]?.featureId === o?.featureId, `场景情况不存在或跨功能：${id}`, sc, 'scenario');
      if (!sc.steps.length) emit('info', 'EMPTY_SCENARIO', `场景没有步骤：${sc.name}`, sc.source, { kind: 'scenario', id: sc.id, optionId: sc.optionId });
      for (const st of sc.steps) {
        const value = { ...st, optionId: sc.optionId };
        ref(!stepIds.has(st.id), `步骤 ID 重复：${st.id}`, value, 'step'); stepIds.add(st.id);
        for (const id of st.ruleIds) { const rule = p.rules[id]; ref(rule && rule.featureId === o?.featureId && (!rule.optionId || rule.optionId === sc.optionId), `步骤规则不存在或跨范围：${id}`, value, 'step'); }
        for (const e of st.effects) if (e.type === 'navigate') ref(p.scenes[e.sceneId]?.optionId === sc.optionId, `跳转画面不存在或跨方案：${e.sceneId}`, value, 'step');
      }
    }
    for (const o of options) if (!diagnostics.some(d => d.severity === 'error' && (!d.ref?.optionId || d.ref.optionId === o.id))) verification[o.id] = 'structure_ok';
  }
  if (opts.mode !== 'structure') {
    const failed = new Set<string>();
    for (const sc of scenarios) {
      const result = replay(p, sc.id);
      for (const d of result.diagnostics) {
        failed.add(sc.optionId);
        const step = sc.steps.find(st => st.id === (d.ref?.stepId ?? d.ref?.id)) ?? (result.finalState ? sc.steps[result.reached] : undefined);
        emit(d.severity, d.code, d.message, step?.source ?? sc.source ?? p.options[sc.optionId]?.source, { ...d.ref, kind: d.ref?.kind ?? 'scenario', id: d.ref?.id ?? sc.id, optionId: sc.optionId }, 'replay');
      }
    }
    for (const o of options) if (!failed.has(o.id) && scenarios.some(s => s.optionId === o.id) && (opts.mode === 'replay' || verification[o.id] === 'structure_ok')) verification[o.id] = 'replay_ok';
  }
  return report();
}
