import type { Scenario, Step } from './schema.ts';
/** 仅索引声明的目标位置，不执行回放或推断业务正确性。 */
export function scenarioTargets(
  scenario: Scenario,
): { sceneId: string; nodeId: string; step: Step }[] {
  let sceneId = scenario.initial.sceneId;
  const stack: string[] = [];
  const targets: { sceneId: string; nodeId: string; step: Step }[] = [];
  for (const step of scenario.steps) {
    if ('target' in step.action)
      targets.push({ sceneId, nodeId: step.action.target, step });
    if (step.action.type === 'back') sceneId = stack.pop() ?? sceneId;
    for (const effect of step.effects)
      if (effect.type === 'navigate') {
        stack.push(sceneId);
        sceneId = effect.sceneId;
      }
  }
  return targets;
}
