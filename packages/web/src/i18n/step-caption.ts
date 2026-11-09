import type { Step, Scenario, Project, Selection } from '@joplo-app/core/runtime';
import { en, type Dictionary } from './en';
import { m, type Text } from './messages';

type CaptionStep = Pick<Step, 'caption' | 'captionAuto'>;
export function stepCaption(step: CaptionStep, t?: Dictionary): string;
export function stepCaption(step: CaptionStep, t: typeof m): Text;
/** The only web boundary reading IR captions. Deferred messages stay reactive to language changes. */
export function stepCaption(step: CaptionStep, t: Dictionary | typeof m = en): Text {
  const auto = step.captionAuto;
  if (!auto) return step.caption;
  switch (auto.kind) {
    case 'drag': return t.player.autoDrag(auto.label, auto.value ?? '');
    case 'hover': return t.player.autoHover(auto.label);
    case 'scroll': return t.player.autoScroll(auto.label, auto.value ?? '');
    case 'click': return t.player.autoClick(auto.label);
    case 'type': return t.player.autoType(auto.label, auto.value ?? '');
    case 'select': return t.player.autoSelect(auto.label, auto.value ?? '');
    case 'check': return t.player.autoCheck(auto.label);
    case 'uncheck': return t.player.autoUncheck(auto.label);
    case 'switch_on': return t.player.autoSwitchOn(auto.label);
    case 'switch_off': return t.player.autoSwitchOff(auto.label);
    case 'back': return t.player.autoBack;
    case 'press': return t.player.autoPress(auto.keys ?? '');
  }
}

export function mockLabel(mock: Scenario['mock'], t: Dictionary): string {
  if (!mock.auto) return mock.label;
  return { success: t.player.mockSuccess, failure: t.player.mockFailure, denied: t.player.mockDenied, other: t.player.mockOther }[mock.outcome];
}

/** Selection storage stays English for Agent; UI notices and inspector titles resolve the selected step. */
export function selectionLabel(project: Project, selection: Selection): Text {
  const step = !selection.nodeId && selection.scenarioId && selection.stepId
    ? project.scenarios[selection.scenarioId]?.steps.find(s => s.id === selection.stepId) : null;
  return step ? stepCaption(step, m) : selection.label ?? selection.nodeId ?? '';
}
