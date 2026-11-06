import { orderedFeatures } from './features.ts';
import { Project, type SceneNode } from './schema.ts';
import { CAPTION_MAX, EXPLAIN_MAX, INTERACTIVE_TYPES, captionLength } from './catalog.ts';
import { walkNodes, findNode, replay } from './player.ts';
import { JoploError, type Diagnostic } from './result.ts';
import { schemaDiagnostics } from './schema-issues.ts';
import { focusReplayDiagnostics, focusStructureDiagnostics } from './focus-check.ts';

export type ValidationOptions = { optionId?: string; mode: 'structure' | 'replay' | 'all' };
export type ValidationReport = {
  diagnostics: Diagnostic[];
  summary: Record<'error' | 'warning' | 'info', number>;
  verification: Record<string, 'unchecked' | 'structure_ok' | 'replay_ok'>;
};

/** IR v2 的确定性校验。源位置缺失（例如手工构造/发布 IR）时回退到配置文件。 */
export function validate(project: Project, opts: ValidationOptions = { mode: 'all' }): ValidationReport {
  if (!['structure', 'replay', 'all'].includes(opts.mode)) throw new JoploError('USAGE', 'Invalid validation mode');
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
    // 与编译器同一套：定位到最近的作者元素，同一根因合并成一条（schema-issues.ts）
    for (const d of schemaDiagnostics(project, parsed.error.issues)) diagnostics.push({ ...d, at: d.at ?? 'joplo.config.ts:1:1' });
    return report();
  }
  const p = parsed.data;
  if (opts.optionId && !Object.hasOwn(p.options, opts.optionId)) throw new JoploError('USAGE', `Option does not exist: ${opts.optionId}`);
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
        if (included(optionId)) ref(id === value.id, `Record key ${id} does not match object ID ${value.id}`, { ...value, optionId }, kind);
      }
    }
    for (const c of Object.values(p.cases).filter(c => !opts.optionId || c.featureId === p.options[opts.optionId]?.featureId)) {
      ref(p.features[c.featureId]?.caseIds.includes(c.id), `Case feature does not exist or does not list the case: ${c.featureId}`, c, 'case');
    }
    for (const f of orderedFeatures(p).filter(f => !opts.optionId || f.optionIds.includes(opts.optionId))) {
      for (const id of f.caseIds) ref(p.cases[id]?.featureId === f.id, `Feature case is missing or belongs to another feature: ${id}`, f, 'feature');
      for (const id of f.optionIds) ref(p.options[id]?.featureId === f.id, `Feature option is missing or belongs to another feature: ${id}`, f, 'feature');
      if (f.pick) ref(p.options[f.pick]?.featureId === f.id, `Picked option is missing or belongs to another feature: ${f.pick}`, f, 'feature');
    }
    for (const o of options) {
      const value = { ...o, optionId: o.id };
      ref(p.features[o.featureId]?.optionIds.includes(o.id), `Option feature does not exist or does not list the option: ${o.featureId}`, value, 'option');
      const cases = Object.values(p.cases).filter(c => c.featureId === o.featureId);
      for (const c of cases) if (!o.coverage[c.id]) emit('warning', 'CASE_NOT_COVERED', `Case has no coverage: ${c.id} ${c.title}`, o.source, { kind: 'case', id: c.id, optionId: o.id });
      for (const [id, c] of Object.entries(o.coverage)) {
        const r = { kind: 'case', id, optionId: o.id };
        ref(p.cases[id]?.featureId === o.featureId, `coverage case is missing or belongs to another feature: ${id}`, value, 'option');
        for (const sid of c.scenarioIds) ref(p.scenarios[sid]?.optionId === o.id, `coverage scenario is missing or belongs to another option: ${sid}`, value, 'option');
        if (c.status === 'expressed' && !c.scenarioIds.length) emit('warning', 'EXPRESSED_WITHOUT_SCENARIO', `Covered case has no scenario: ${id}`, o.source, r);
        if (['not_applicable', 'excluded'].includes(c.status) && !c.reason?.trim()) emit('warning', 'COVERAGE_WITHOUT_REASON', `Not applicable or Excluded requires a reason: ${id}`, o.source, r);
        if (c.status === 'missing') emit('warning', 'CASE_NOT_COVERED', `Case is not yet Covered: ${id} ${p.cases[id]?.title ?? ''}`, o.source, r);
      }
    }
    for (const r of Object.values(p.rules).filter(r => included(r.optionId) && (!opts.optionId || r.featureId === p.options[opts.optionId]?.featureId))) {
      ref(p.features[r.featureId], `Rule feature does not exist: ${r.featureId}`, r, 'rule');
      if (r.optionId) ref(p.options[r.optionId]?.featureId === r.featureId, `Rule option is missing or belongs to another feature: ${r.optionId}`, r, 'rule');
      for (const id of r.caseIds) ref(p.cases[id]?.featureId === r.featureId, `Rule case is missing or belongs to another feature: ${id}`, r, 'rule');
      const scenes = Object.values(p.scenes).filter(s => s.optionId && (r.optionId ? s.optionId === r.optionId : p.options[s.optionId]?.featureId === r.featureId));
      for (const id of r.elementIds) if (!scenes.some(s => findNode(s, id))) emit('warning', 'RULE_ELEMENT_NOT_FOUND', `Rule element is absent from every stage in the related options: ${id}`, r.source, { kind: 'rule', id: r.id, optionId: r.optionId });
      if (r.origin === 'ai_assumption' && r.confirmation === 'pending') emit('info', 'PENDING_AI_ASSUMPTION', r.text, r.source, { kind: 'rule', id: r.id, optionId: r.optionId });
      if (r.origin === 'ai_assumption' && r.confirmation === 'confirmed') emit('error', 'ASSUMPTION_CONFIRMED', 'An AI assumption cannot be Confirmed', r.source, { kind: 'rule', id: r.id, optionId: r.optionId });
    }
    // 从每个场景的路径和跳转追踪步骤目标；只按 id 全局匹配会误认其他页面的同名元素。
    const identity = (n: SceneNode) => JSON.stringify([n.source ?? '', n.from ?? '', n.id]);
    const bound = new Set<string>();
    for (const sc of Object.values(p.scenarios)) {
      let sceneId = sc.initial.sceneId;
      const stack: string[] = [];
      // 有层级的方案（T-layers）：步骤目标在各层自己的画面里（多层有同一个元素时都算绑定）
      const layerScenes = Object.values(p.options[sc.optionId]?.layers ?? {}).map((l) => p.scenes[l.sceneId]).filter((x): x is NonNullable<typeof x> => !!x);
      for (const step of sc.steps) {
        const s = p.scenes[sceneId];
        const hit = s && 'target' in step.action ? findNode(s, step.action.target)?.node : undefined;
        if (hit && (!hit.from || hit.from === sc.optionId)) bound.add(identity(hit));
        if ('target' in step.action) for (const ls of layerScenes) { const h = findNode(ls, step.action.target)?.node; if (h) bound.add(identity(h)); }
        if (step.action.type === 'back') sceneId = stack.pop() ?? sceneId;
        for (const e of step.effects) if (e.type === 'navigate') { stack.push(sceneId); sceneId = e.sceneId; }
      }
    }
    for (const s of Object.values(p.scenes).filter(s => included(s.optionId))) {
      const value = { id: s.id, optionId: s.optionId ?? undefined, source: s.root.source ?? (s.optionId ? p.options[s.optionId]?.source : undefined) };
      ref(p.scenes[s.id] === s, `Stage key does not match ID: ${s.id}`, value, 'scene');
      if (s.optionId) ref(p.options[s.optionId], `Stage option does not exist: ${s.optionId}`, value, 'scene');
      ref(p.routes[s.route], `Stage route does not exist: ${s.route}`, value, 'scene');
      const ids = new Set<string>();
      walkNodes(s.root, n => {
        const r = { kind: 'element', id: n.id, optionId: n.from ?? s.optionId ?? undefined };
        if (ids.has(n.id)) emit('error', 'DUPLICATE_ELEMENT', `Duplicate element ID in stage: ${n.id}`, n.source, r, 'reference');
        ids.add(n.id);
        if (n.disabled !== undefined && n.disabled !== false && !n.disabledReason?.trim()) emit('warning', 'DISABLED_WITHOUT_REASON', `Disabled element has no reason: ${n.id}. Add disabledReason="…" (for example disabledReason="Only admins can invite"), or bind it to state like disabled: disabledReason={$.ui.sendHint}`, n.source, r);
        if (INTERACTIVE_TYPES.has(n.type) && !bound.has(identity(n)) && !(n.disabled === true && n.disabledReason?.trim()) && !n.unmodeled) emit('warning', 'UNBOUND_INTERACTIVE', `Interactive element has no demo step: ${n.id}; bind a step, disable with a reason, or mark unmodeled`, n.source, r);
      });
    }
    const stepIds = new Set<string>();
    for (const sc of scenarios) {
      const o = p.options[sc.optionId];
      ref(o, `Scenario option does not exist: ${sc.optionId}`, sc, 'scenario');
      ref(p.scenes[sc.initial.sceneId]?.optionId === sc.optionId, `Scenario initial stage is missing or belongs to another option: ${sc.initial.sceneId}`, sc, 'scenario');
      for (const id of sc.caseIds) ref(p.cases[id]?.featureId === o?.featureId, `Scenario case is missing or belongs to another feature: ${id}`, sc, 'scenario');
      if (!sc.steps.length) emit('info', 'EMPTY_SCENARIO', `Scenario has no steps: ${sc.name}`, sc.source, { kind: 'scenario', id: sc.id, optionId: sc.optionId });
      for (const st of sc.steps) {
        const value = { ...st, optionId: sc.optionId };
        ref(!stepIds.has(st.id), `Duplicate step ID: ${st.id}`, value, 'step'); stepIds.add(st.id);
        for (const id of st.ruleIds) { const rule = p.rules[id]; ref(rule && rule.featureId === o?.featureId && (!rule.optionId || rule.optionId === sc.optionId), `Step rule is missing or outside its scope: ${id}`, value, 'step'); }
        for (const e of st.effects) if (e.type === 'navigate') ref(p.scenes[e.sceneId]?.optionId === sc.optionId, `Navigation stage is missing or belongs to another option: ${e.sceneId}`, value, 'step');
        // 字幕只用来点一句（只提示，不截断、不改写作者的文字）；长内容放进单独的说明层，由导演切过去讲
        const r = { kind: 'step' as const, id: st.id, optionId: sc.optionId, stepId: st.id };
        const at = st.source ?? sc.source;
        const cl = captionLength(st.caption);
        if (cl > CAPTION_MAX) emit('warning', 'CAPTION_TOO_LONG', `Caption length is ${cl} units (recommended maximum: ${CAPTION_MAX}; CJK characters count as 1 each, all others as 0.5; whitespace is not counted): "${st.caption}". Keep the caption to one point; move details to a separate explanation layer, for example layers: { why: layer('Design rationale', <Why />) }, then use shot('why_xxx') in this step to present it`, at, r);
        if (st.explain) {
          const el = captionLength(st.explain);
          if (el > EXPLAIN_MAX) emit('warning', 'EXPLAIN_TOO_LONG', `explain note length is ${el} units (recommended maximum: ${EXPLAIN_MAX}; CJK characters count as 1 each, all others as 0.5; whitespace is not counted). Move long content to a separate explanation layer, for example layers: { why: layer('Design rationale', <Why />) }, then switch to it with shot`, at, r);
        }
      }
    }
    focusStructureDiagnostics(p, scenarios, emit); // 焦点提示（D67）
    for (const o of options) if (!diagnostics.some(d => d.severity === 'error' && (!d.ref?.optionId || d.ref.optionId === o.id))) verification[o.id] = 'structure_ok';
  }
  if (opts.mode !== 'structure') {
    const failed = new Set<string>();
    for (const sc of scenarios) {
      const result = replay(p, sc.id);
      if (!result.diagnostics.length) focusReplayDiagnostics(p, sc, emit); // 焦点提示（D67）
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
