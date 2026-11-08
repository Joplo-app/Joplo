import { flow, type EffectDef, type OptionDef } from '@joplo-app/kit';

/** Deliberately public narration, curated from evidence; never a private review export. */
export type PublicDesignRecord = {
  problem: string;
  exploration: string;
  decision: string;
  current: string;
  evidence: string;
  scenario: string;
};

/** Keep every original scenario intact; frame one actual interaction as a design replay. */
export function withDesignRecord(definition: OptionDef, record: PublicDesignRecord): OptionDef {
  const example = definition.scenarios[record.scenario];
  if (!example) throw new Error(`Missing design replay scenario: ${record.scenario}`);
  const replay = flow('设计回放 · 问题、原型与后续取舍', {
    ...example.opts,
    description: record.problem,
    mock: '根据仓库记录整理的设计回放；界面与操作结果为原型',
    expected: record.current,
  }).card(record.problem, { sub: record.exploration }).key('design-context');
  const completion: EffectDef[] = [];
  // done() ends a scenario immediately. Move only this copied replay's completion
  // to its closing card so the current boundary remains reachable by playback.
  for (const step of example.steps) {
    completion.push(...step.effects.filter(effect => effect.type === 'complete'));
    replay.steps.push({ ...step, effects: step.effects.filter(effect => effect.type !== 'complete') });
  }
  replay.card(record.decision, {
    sub: record.current,
    points: [...record.evidence.split('；'), '本地看板保留全部备选与待决问题'],
  }, ...completion).key('design-current-boundary');
  return { ...definition, scenarios: { design_journey: replay, ...definition.scenarios } };
}
