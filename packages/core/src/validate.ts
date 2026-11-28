import { stepPlan } from './step-plan.ts';
import { pluginSpec } from './catalog.ts';
import { entryOf, playSequence, scenariosOf } from './entries.ts';
import { featuresOf } from './features.ts';
import { Project, type SceneNode, type Step } from './schema.ts';
import { CAPTION_MAX, CARD_POINTS_MAX, DESCRIPTION_MAX, EXPLAIN_MAX, isInteractiveType, SCENARIO_MS_MAX, captionLength } from './catalog.ts';
import { LATIN_MS_PER_CHAR, MS_PER_CHAR, voiceMs } from './pace.ts';
import { narrationText } from './voice.ts';
import { scenarioEstimateMs } from './outline.ts';
import { walkNodes, findNode, replay } from './player.ts';
import { JoploError, type Diagnostic } from './result.ts';
import { schemaDiagnostics } from './schema-issues.ts';
import { focusReplayDiagnostics, focusStructureDiagnostics } from './focus-check.ts';

export type ValidationOptions = { workId?: string; mode: 'structure' | 'replay' | 'all' };
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
  if (opts.workId && !Object.hasOwn(p.works, opts.workId)) throw new JoploError('USAGE', `Work does not exist: ${opts.workId}`);
  const works = Object.values(p.works).filter(o => !opts.workId || o.id === opts.workId);
  const included = (workId?: string | null) => !opts.workId || !workId || workId === opts.workId;
  const scenarios = Object.values(p.scenarios).filter(s => included(s.workId));
  const chapterLabels = new Map<string, string>();
  for (const o of Object.values(p.works)) if (o.sequencing === 'linear') {
    const sequence = playSequence(p, o.id);
    const ids = new Set(sequence.map(s => s.id));
    [...sequence, ...scenariosOf(p, o.id).filter(s => !ids.has(s.id))].forEach((s, i) => chapterLabels.set(s.id, `Chapter ${String(i + 1).padStart(2, '0')}`));
  }
  const ref = (ok: unknown, message: string, value: { id: string; source?: string; workId?: string }, kind: string) => {
    if (!ok) emit('error', 'INVALID_REFERENCE', message, value.source, { kind, id: value.id, workId: value.workId }, 'reference');
  };
  for (const o of works) verification[o.id] = 'unchecked';
  if (opts.mode !== 'replay') {
    for (const [kind, table] of Object.entries({ feature: p.features, case: p.cases, work: p.works, rule: p.rules, scenario: p.scenarios, issue: p.issues })) {
      for (const [id, value] of Object.entries(table)) {
        const workId = 'workId' in value ? value.workId : kind === 'work' ? id : undefined;
        if (included(workId)) ref(id === value.id, `Record key ${id} does not match object ID ${value.id}`, { ...value, workId }, kind);
      }
    }
    for (const c of Object.values(p.cases).filter(c => !opts.workId || c.featureId === p.works[opts.workId]?.featureId)) {
      ref(p.features[c.featureId]?.caseIds.includes(c.id), `Case feature does not exist or does not list the case: ${c.featureId}`, c, 'case');
    }
    for (const f of featuresOf(p).filter(f => !opts.workId || f.workIds.includes(opts.workId))) {
      for (const id of f.caseIds) ref(p.cases[id]?.featureId === f.id, `Feature case is missing or belongs to another feature: ${id}`, f, 'feature');
      for (const id of f.workIds) ref(p.works[id]?.featureId === f.id, `Feature work is missing or belongs to another feature: ${id}`, f, 'feature');
      if (f.pick) ref(p.works[f.pick]?.featureId === f.id, `Picked work is missing or belongs to another feature: ${f.pick}`, f, 'feature');
    }
    for (const o of works) {
      const value = { ...o, workId: o.id };
      if (o.featureId) ref(p.features[o.featureId]?.workIds.includes(o.id), `Work feature does not exist or does not list the work: ${o.featureId}`, value, 'work');
      if (!o.featureId && o.sequencing === 'linear') {
        const chapters = playSequence(p, o.id);
        const workRef = { kind: 'work', id: o.id, workId: o.id };
        const ms = chapters.reduce((sum, sc) => sum + scenarioEstimateMs(p, sc), 0);
        if (!o.draft && ms >= 120_000 && chapters.length < 3)
          emit('info', 'CHAPTERS_TOO_FEW', `Work "${o.title}" plays about ${Math.round(ms / 1000)} s at 1× with ${chapters.length} mainline chapters. Split it into 3–6 chapters of 25–60 s each, so first-time viewers can follow and returning viewers can find a section`, o.source, workRef);
        const generic = chapters.filter(sc => genericChapterTitle(sc.name));
        if (chapters.length >= 2 && generic.length >= 2)
          emit('info', 'CHAPTER_TITLE_GENERIC', `Work "${o.title}" has generic mainline chapter titles: ${generic.map(sc => `"${sc.name}"`).join(', ')}. Name the specific subject and takeaway, for example "Overview" -> "How the ledger blocks duplicate charges", "Summary" -> "Trade-offs of dedup"`, o.source, workRef);
      }
      const cases = Object.values(p.cases).filter(c => c.featureId === o.featureId);
      for (const c of cases) if (!(o.featureId ? p.features[o.featureId]?.alternatives[o.id]?.coverage ?? {} : {})[c.id]) emit('warning', 'CASE_NOT_COVERED', `Case has no coverage: ${c.id} ${c.title}`, o.source, { kind: 'case', id: c.id, workId: o.id });
      for (const [id, c] of Object.entries((o.featureId ? p.features[o.featureId]?.alternatives[o.id]?.coverage ?? {} : {}))) {
        const r = { kind: 'case', id, workId: o.id };
        ref(p.cases[id]?.featureId === o.featureId, `coverage case is missing or belongs to another feature: ${id}`, value, 'work');
        for (const sid of c.scenarioIds) ref(p.scenarios[sid]?.workId === o.id, `coverage scenario is missing or belongs to another work: ${sid}`, value, 'work');
        if (c.status === 'expressed' && !c.scenarioIds.length) emit('warning', 'EXPRESSED_WITHOUT_SCENARIO', `Covered case has no scenario: ${id}`, o.source, r);
        if (['not_applicable', 'excluded'].includes(c.status) && !c.reason?.trim()) emit('warning', 'COVERAGE_WITHOUT_REASON', `Not applicable or Excluded requires a reason: ${id}`, o.source, r);
        if (c.status === 'missing') emit('warning', 'CASE_NOT_COVERED', `Case is not yet Covered: ${id} ${p.cases[id]?.title ?? ''}${caseHint(p.cases[id])}`, o.source, r);
      }
    }
    // 只有顺利路径（D67，Joplo 要解决的“看不全”）：功能只声明了 main 情况，而且参与的方案里每个场景都成功
    for (const f of featuresOf(p).filter(f => !opts.workId || f.workIds.includes(opts.workId))) {
      const own = scenarios.filter(s => p.works[s.workId]?.featureId === f.id);
      const edge = f.caseIds.some(id => p.cases[id] && p.cases[id]!.dimension !== 'main');
      if (entryOf(p, f.id)?.featureId !== null && p.mode === 'dev' && own.length && !edge && own.every(s => s.mock.outcome === 'success'))
        emit('info', 'HAPPY_PATH_ONLY', `Feature "${f.name}" only shows the happy path: every case is a main-flow case and every scenario succeeds. Ask the user about input, permission, async, and lifecycle cases (npx joplo skill cases), then add at least one error-and-recovery scenario`, f.source, { kind: 'feature', id: f.id });
    }
    for (const r of Object.values(p.rules).filter(r => included(r.workId) && (!opts.workId || r.featureId === p.works[opts.workId]?.featureId))) {
      ref(p.features[r.featureId], `Rule feature does not exist: ${r.featureId}`, r, 'rule');
      if (r.workId) ref(p.works[r.workId]?.featureId === r.featureId, `Rule work is missing or belongs to another feature: ${r.workId}`, r, 'rule');
      for (const id of r.caseIds) ref(p.cases[id]?.featureId === r.featureId, `Rule case is missing or belongs to another feature: ${id}`, r, 'rule');
      const scenes = Object.values(p.scenes).filter(s => s.workId && (r.workId ? s.workId === r.workId : p.works[s.workId]?.featureId === r.featureId));
      for (const id of r.elementIds) if (!scenes.some(s => findNode(s, id))) emit('warning', 'RULE_ELEMENT_NOT_FOUND', `Rule element is absent from every stage in the related works: ${id}`, r.source, { kind: 'rule', id: r.id, workId: r.workId });
      if (r.origin === 'ai_assumption' && r.confirmation === 'pending') emit('info', 'PENDING_AI_ASSUMPTION', r.text, r.source, { kind: 'rule', id: r.id, workId: r.workId });
      if (r.origin === 'ai_assumption' && r.confirmation === 'confirmed') emit('error', 'ASSUMPTION_CONFIRMED', 'An AI assumption cannot be Confirmed', r.source, { kind: 'rule', id: r.id, workId: r.workId });
    }
    // 从每个场景的路径和跳转追踪步骤目标；只按 id 全局匹配会误认其他页面的同名元素。
    const identity = (n: SceneNode) => JSON.stringify([n.source ?? '', n.from ?? '', n.id]);
    const bound = new Set<string>();
    for (const sc of Object.values(p.scenarios)) {
      let sceneId = sc.initial.sceneId;
      const stack: string[] = [];
      // 有层级的方案（T-layers）：步骤目标在各层自己的画面里（多层有同一个元素时都算绑定）
      const layerScenes = Object.values(p.works[sc.workId]?.layers ?? {}).map((l) => p.scenes[l.sceneId]).filter((x): x is NonNullable<typeof x> => !!x);
      for (const step of sc.steps) {
        const s = p.scenes[sceneId];
        const hit = s && 'target' in step.action ? findNode(s, step.action.target)?.node : undefined;
        if (hit && (!hit.from || hit.from === sc.workId)) bound.add(identity(hit));
        if ('target' in step.action) for (const ls of layerScenes) { const h = findNode(ls, step.action.target)?.node; if (h) bound.add(identity(h)); }
        if (step.action.type === 'back') sceneId = stack.pop() ?? sceneId;
        for (const e of step.effects) if (e.type === 'navigate') { stack.push(sceneId); sceneId = e.sceneId; }
      }
    }
    for (const work of Object.values(p.works)) for (const reaction of Object.values(work.free ?? {})) {
      if (!('target' in reaction.action)) continue;
      for (const scene of Object.values(p.scenes).filter(s => s.workId === work.id || s.workId === null)) {
        const hit = findNode(scene, reaction.action.target)?.node;
        if (hit && (!hit.from || hit.from === work.id)) bound.add(identity(hit));
      }
    }
    const availableRoles = new Set<string>();
    const kineticProps = new Set<string>();
    for (const pl of Object.values(p.plugins ?? {})) {
      for (const [k, prop] of Object.entries(pl.properties ?? {})) {
        if (prop.type === 'string' || prop.type === 'number') kineticProps.add(k);
      }
      for (const spec of Object.values(pl.components)) {
        if (spec.role && spec.role !== 'layout' && spec.role !== 'stage' && !spec.intrinsic) availableRoles.add(spec.role);
      }
    }
    const rawHtmlWorks = new Set<string>();
    const workStageTotals = new Map<string, { total: number; expressive: number; kinetic: number }>();
    for (const s of Object.values(p.scenes).filter(s => included(s.workId))) {
      const value = { id: s.id, workId: s.workId ?? undefined, source: s.root.source ?? (s.workId ? p.works[s.workId]?.source : undefined) };
      ref(p.scenes[s.id] === s, `Stage key does not match ID: ${s.id}`, value, 'scene');
      if (s.workId) ref(p.works[s.workId], `Stage work does not exist: ${s.workId}`, value, 'scene');
      ref(p.routes[s.route], `Stage route does not exist: ${s.route}`, value, 'scene');
      const ids = new Set<string>();
      let total = 0, intrinsic = 0, expressive = 0, kinetic = 0;
      walkNodes(s.root, n => {
        const spec = pluginSpec(p.plugins, n.type);
        if (spec?.needsId && n.id.startsWith('_')) emit('error', 'MISSING_ID', `<${n.type}> requires an author id; recompile after adding id`, n.source, { kind: 'element', id: n.id });
        const r = { kind: 'element', id: n.id, workId: n.from ?? s.workId ?? undefined };
        if (ids.has(n.id)) emit('error', 'DUPLICATE_ELEMENT', `Duplicate element ID in stage: ${n.id}`, n.source, r, 'reference');
        ids.add(n.id);
        // Plugins may declare disabled as presentation-only, which requires no unavailability reason.
        if (n.disabled !== undefined && n.disabled !== false && !n.disabledReason?.trim() && !n.traits?.disabledPresentation) emit('warning', 'DISABLED_WITHOUT_REASON', `Disabled element has no reason: ${n.id}. Add disabledReason="…" (for example disabledReason="Only admins can invite"), or bind it to state like disabled: disabledReason={$.ui.sendHint}`, n.source, r);
        if (isInteractiveType(n.type, project.plugins) && !bound.has(identity(n)) && !(n.disabled === true && n.disabledReason?.trim()) && !n.unmodeled) emit('warning', 'UNBOUND_INTERACTIVE', `Interactive element has no demo step: ${n.id}; bind a step, disable with a reason, or mark unmodeled`, n.source, r);
        if (n.type !== '#text' && n.type !== '#fragment') {
          total++;
          if (spec?.intrinsic) intrinsic++;
          else if ((spec?.role && spec.role !== 'layout' && spec.role !== 'stage') || (spec && spec.role === undefined) || spec?.interactive || (n.ext && Object.keys(n.ext).length > 0)) expressive++;
          if (n.props && Object.keys(n.props).some(k => kineticProps.has(k))) kinetic++;
        }
      });
      if (p.mode === 'dev' && availableRoles.size > 0 && total >= 16 && intrinsic / total >= 0.75 && expressive === 0 && kinetic === 0) {
        if (s.workId) rawHtmlWorks.add(s.workId);
        const roleList = [...availableRoles].slice(0, 8).join(', ');
        emit('info', 'STAGE_RAW_HTML_HEAVY', `Stage "${s.name}" renders ${intrinsic}/${total} elements as raw HTML fallback tags with no expressive plugin components (enabled roles: ${roleList}). Run npx joplo components or read .claude/skills/joplo-plugins/SKILL.md to combine richer primitives from your enabled plugins`, value.source, { kind: 'scene', id: s.id, workId: s.workId ?? undefined });
      }
      if (s.workId) {
        const cur = workStageTotals.get(s.workId) ?? { total: 0, expressive: 0, kinetic: 0 };
        cur.total += total; cur.expressive += expressive; cur.kinetic += kinetic;
        workStageTotals.set(s.workId, cur);
      }
    }
    if (p.mode === 'dev' && availableRoles.size > 0) {
      const roleList = [...availableRoles].slice(0, 8).join(', ');
      for (const o of works) {
        if (o.draft || rawHtmlWorks.has(o.id)) continue;
        const own = scenarios.filter(sc => sc.workId === o.id);
        const stepCount = own.reduce((sum, sc) => sum + sc.steps.length, 0);
        if (own.length < 2 && stepCount < 4) continue;
        const hasDynamicEffects = own.some(sc =>
          (sc.ext && Object.keys(sc.ext).length > 0)
          || (sc.media && Object.keys(sc.media).length > 0)
          || sc.steps.some(st => (st.ext && Object.keys(st.ext).length > 0) || (st.media && Object.keys(st.media).length > 0)),
        );
        if (hasDynamicEffects) continue;
        const totals = workStageTotals.get(o.id);
        if (totals && totals.total >= 12 && totals.expressive === 0 && totals.kinetic === 0) {
          emit('info', 'WORK_TEXT_ONLY_STAGE', `Work "${o.title}" builds its stages solely from layout and text containers with no expressive or interactive plugin components (enabled roles: ${roleList}). Run npx joplo components or read .claude/skills/joplo-plugins/SKILL.md to use specialized visuals instead of text cards`, o.source, { kind: 'work', id: o.id, workId: o.id });
        }
      }
    }
    const stepIds = new Set<string>();
    for (const sc of scenarios) {
      const o = p.works[sc.workId];
      ref(o, `Scenario work does not exist: ${sc.workId}`, sc, 'scenario');
      ref(p.scenes[sc.initial.sceneId]?.workId === sc.workId, `Scenario initial stage is missing or belongs to another work: ${sc.initial.sceneId}`, sc, 'scenario');
      for (const id of sc.caseIds) ref(p.cases[id]?.featureId === o?.featureId, `Scenario case is missing or belongs to another feature: ${id}`, sc, 'scenario');
      const chapter = chapterLabels.get(sc.id);
      const sr = { kind: 'scenario', id: sc.id, workId: sc.workId };
      if (!sc.steps.length) emit('info', 'EMPTY_SCENARIO', chapter ? `${chapter} has no steps: ${sc.name}` : `Scenario has no steps: ${sc.name}`, sc.source, sr);
      // 叙事（D67）：封面说明 30 字以内（D61）；一个场景讲一件事，太长时拆开
      const dl = captionLength(sc.description);
      if (dl > DESCRIPTION_MAX) emit('warning', 'DESCRIPTION_TOO_LONG', `${chapter ? `${chapter} description (the chapter cover text)` : 'flow description (the scenario cover text)'} is ${dl} units (recommended maximum: ${DESCRIPTION_MAX}; CJK characters count as 1 each, all others as 0.5): "${sc.description}". Say in one sentence what this ${chapter ? 'chapter' : 'scenario'} shows; the cover clips longer text`, sc.source, sr);
      const ms = scenarioEstimateMs(p, sc);
      if (ms > SCENARIO_MS_MAX) emit('info', 'SCENARIO_TOO_LONG', `${chapter ?? 'Scenario'} "${sc.name}" plays about ${Math.round(ms / 1000)} s at 1× (${sc.steps.length} steps; recommended maximum: ${SCENARIO_MS_MAX / 1000} s). ${chapter ? 'One chapter tells one thing: split it into chapters' : 'One scenario tells one thing: split it into scenarios (for example the happy path and each recovery)'}, or branch with fork(); run npx joplo outline to see the pacing`, sc.source, sr);
      for (const st of sc.steps) {
        const timing = stepPlan(p, st);
        const measuredVoiceMs = st.holdFor && (st.holdFor.kind === 'voice' || st.holdFor.audio === st.audio) ? st.holdFor.durationMs : undefined;
        if (st.holdFor) {
          emit('info', timing.timingSource === 'measured' ? 'AUDIO_TIMING_MEASURED' : 'AUDIO_TIMING_ESTIMATED', `${st.id}: ${timing.timingSource} ${st.holdFor.kind} timing, ${((timing.audioMs ?? 0) / 1000).toFixed(3)} s including ${(st.holdFor.padMs / 1000).toFixed(3)} s pad; no audio is generated by check`, st.source, sr);
        }
        const value = { ...st, workId: sc.workId };
        ref(!stepIds.has(st.id), `Duplicate step ID: ${st.id}`, value, 'step'); stepIds.add(st.id);
        for (const id of st.ruleIds) { const rule = p.rules[id]; ref(rule && rule.featureId === o?.featureId && (!rule.workId || rule.workId === sc.workId), `Step rule is missing or outside its scope: ${id}`, value, 'step'); }
        for (const e of st.effects) if (e.type === 'navigate') ref(p.scenes[e.sceneId]?.workId === sc.workId, `Navigation stage is missing or belongs to another work: ${e.sceneId}`, value, 'step');
        // 字幕只用来点一句（只提示，不截断、不改写作者的文字）；长内容放进单独的说明层，由导演切过去讲
        const r = { kind: 'step' as const, id: st.id, workId: sc.workId, stepId: st.id };
        const at = st.source ?? sc.source;
        const cl = captionLength(st.caption);
        if (cl > CAPTION_MAX) emit('warning', 'CAPTION_TOO_LONG', `Caption length is ${cl} units (recommended maximum: ${CAPTION_MAX}; CJK characters count as 1 each, all others as 0.5; whitespace is not counted): "${st.caption}". This is the top-left step title, also used as the fallback subtitle when narrate()/say() is absent. Keep it to one point; move details to a separate explanation layer, for example layers: { why: layer('Design rationale', <Why />) }, then use shot('why_xxx') in this step to present it`, at, r);
        const readingMs = readingDemandMs(st);
        const visibleMs = Math.max(timing.dwellMs, timing.voiceMs);
        if (readingMs > visibleMs + 1500)
          emit('info', 'READING_BUDGET_SHORT', `Visible text needs about ${(readingMs / 1000).toFixed(1)} s to read, but this step is visible for about ${(visibleMs / 1000).toFixed(1)} s at 1×. Shorten the text, split the step, or add hold() to allow reading time`, at, r);
        if (st.action.type === 'card') {
          const sub = st.action.sub ? captionLength(st.action.sub) : 0;
          const points = st.action.points ?? [];
          const longPoint = points.map(captionLength).find((n) => n > CAPTION_MAX);
          const issues = [
            ...(sub > EXPLAIN_MAX ? [`sub is ${sub} units (maximum ${EXPLAIN_MAX})`] : []),
            ...(longPoint !== undefined ? [`a point is ${longPoint} units (maximum ${CAPTION_MAX})`] : []),
            ...(points.length > CARD_POINTS_MAX ? [`${points.length} points (maximum ${CARD_POINTS_MAX})`] : []),
          ];
          if (issues.length) emit('info', 'CARD_TEXT_TOO_LONG', `Transition card "${st.action.title}": ${issues.join('; ')}. A card is read in a few seconds: keep one sentence and at most ${CARD_POINTS_MAX} short points, and move details into the scenario steps`, at, r);
        }
        if (st.explain) {
          const el = captionLength(st.explain);
          if (el > EXPLAIN_MAX) emit('warning', 'EXPLAIN_TOO_LONG', `explain note length is ${el} units (recommended maximum: ${EXPLAIN_MAX}; CJK characters count as 1 each, all others as 0.5; whitespace is not counted). Move long content to a separate explanation layer, for example layers: { why: layer('Design rationale', <Why />) }, then switch to it with shot`, at, r);
        }
        // 朗读预算按时长判断；已绑定的实长只属于当前朗读的那条文本，不含作者额外留的 pad。
        for (const [fn, code, text] of [['say', 'SAY_TOO_LONG', st.say], ['narrate', 'NARRATE_TOO_LONG', st.narrate]] as const) {
          const measured = (fn === 'narrate' ? !!st.narrate : !st.narrate) ? measuredVoiceMs : undefined;
          const ms = measured ?? voiceMs(text);
          if (text && ms > 10_000) emit('warning', code, `${fn}() is ${measured === undefined ? 'estimated' : 'measured'} at ~${(ms / 1000).toFixed(1)} s (recommended: ≤ 10 s). Autoplay waits until it is read, so say less or split the step`, at, r);
        }
      }
    }
    focusStructureDiagnostics(p, scenarios, emit); // 焦点提示（D70）
    for (const o of works) if (!diagnostics.some(d => d.severity === 'error' && (!d.ref?.workId || d.ref.workId === o.id))) verification[o.id] = 'structure_ok';
  }
  if (opts.mode !== 'structure') {
    const failed = new Set<string>();
    for (const sc of scenarios) {
      const result = replay(p, sc.id);
      if (!result.diagnostics.length) focusReplayDiagnostics(p, sc, emit); // 焦点提示（D70）
      for (const d of result.diagnostics) {
        failed.add(sc.workId);
        const step = sc.steps.find(st => st.id === (d.ref?.stepId ?? d.ref?.id)) ?? (result.finalState ? sc.steps[result.reached] : undefined);
        emit(d.severity, d.code, d.message, step?.source ?? sc.source ?? p.works[sc.workId]?.source, { ...d.ref, kind: d.ref?.kind ?? 'scenario', id: d.ref?.id ?? sc.id, workId: sc.workId }, 'replay');
      }
    }
    for (const o of works) if (!failed.has(o.id) && scenarios.some(s => s.workId === o.id) && (opts.mode === 'replay' || verification[o.id] === 'structure_ok')) verification[o.id] = 'replay_ok';
  }
  return report();
}

/** 阅读不足只作创作提示：沿用阅读速率，但不把需求封顶为播放器的 7 秒。 */
function readingDemandMs(step: Step): number {
  const texts = step.action.type === 'card'
    ? [step.action.title, step.action.sub, ...(step.action.points ?? [])]
    : [...new Set([step.caption, step.explain, narrationText(step, step.caption)].map(text => text?.trim()))];
  let ms = 0;
  for (const text of texts) if (text) for (const ch of text) {
    if (/\s/.test(ch)) continue;
    ms += (ch.codePointAt(0) ?? 0) > 0x2e80 ? MS_PER_CHAR : LATIN_MS_PER_CHAR;
  }
  return ms;
}

const GENERIC_CHAPTER_TITLES = new Set([
  '\u7b80\u4ecb', '\u539f\u7406', '\u603b\u7ed3', '\u6982\u8ff0', '\u80cc\u666f', '\u5f15\u8a00', '\u7ed3\u8bed',
  'intro', 'introduction', 'overview', 'summary', 'conclusion',
]);
function genericChapterTitle(title: string): boolean {
  const name = title.trim().replace(/^(?:\u7b2c\s*(?:\d+|[\u4e00\u4e8c\u4e09\u56db\u4e94\u516d\u4e03\u516b\u4e5d\u5341\u767e\u96f6\u3007\u4e24]+)\s*\u7ae0|\d+)[\s.\uff0e\u3001:\uff1a)\uff09/\uff0f\u2013\u2014-]*/u, '').trim().toLowerCase();
  return GENERIC_CHAPTER_TITLES.has(name);
}

/** CASE_NOT_COVERED 的补充：高优先级与期望结果（PM 的 Then），帮 Agent 知道该补什么场景。 */
function caseHint(c: { priority: string; expected: string } | undefined): string {
  if (!c) return '';
  const parts = [...(c.priority === 'high' ? ['high priority'] : []), ...(c.expected.trim() ? [`expected: ${c.expected.trim()}`] : [])];
  return parts.length ? ` (${parts.join('; ')})` : '';
}
