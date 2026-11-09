import { stepCaption } from '../i18n/step-caption';
import { en, type Dictionary } from '../i18n/en';
import { stepDwell, voiceMs } from '../runtime/pace';
import { holdMsOf } from '@joplo-app/core/runtime';
/**
 * 场景封面（D61，纯函数）：第 0 步不再是“初始状态”，而是一张封面。内容只由 IR 推导：
 * 所属功能名 · 方案名、flow 的标题与 description、「约 N 步 · 约 M 秒」、出场角色。
 * 时长逐步调用 pace.ts 的 stepDwell 再求和（与演示控制器用同一份文字，见 dwellTexts）；参数在 pace.ts 里调整，这里不写死。
 * 估算不含鼠标移动、逐字输入与连线小点，所以写「约」。
 */
import { cameraAt, cardAt, layersOf, roleOf, roleOfScene, streamPlan, type Project, type RoleInfo, type Scenario, type Step } from '@joplo-app/core/runtime';

export type Duration = { unit: 's' | 'min'; value: number };

export type CoverContent = {
  scenarioId: string;
  /** 所属功能名与方案名（小字）；缺失时为 null。 */
  feature: string | null;
  option: string | null;
  title: string;
  /** flow 的 description；没写时用功能的 goal（D67：封面默认就说清“解决什么”）；两者都没有时为 null。 */
  description: string | null;
  /** description 从哪来：flow = 作者写的场景说明，goal = 功能目标（缺省）。 */
  descriptionFrom: 'flow' | 'goal' | null;
  steps: number;
  /** 估算的播放时长（毫秒，1× 速度）。 */
  ms: number;
  duration: Duration;
  /** 出场角色（导演层的角色与换人的过渡卡），按功能里声明的顺序；没有角色的项目为空。 */
  roles: RoleInfo[];
};

/** 封面显示的条件：场景至少有一步、位置为 0、没在播放、也没有正在执行的一步。 */
export function coverShown(scenario: Scenario | null | undefined, position: number, playing: boolean, activeStep: number | null, exploring = false): boolean {
  return !!scenario && scenario.steps.length > 0 && position === 0 && !playing && activeStep === null && !exploring;
}

/** 一步停留时要读的文字：说明、explain，过渡卡再加副标题与要点（演示控制器与封面估算共用）。 */
export function dwellTexts(step: Step, i18n: Dictionary = en): (string | null | undefined)[] {
  return [stepCaption(step, i18n), step.explain, ...(step.action.type === 'card' ? [step.action.sub, ...(step.action.points ?? [])] : [])];
}

/** 整个场景按 1× 速度播放大约多久（毫秒）：每一步的 stepDwell 之和。 */
export function scenarioMs(_project: Project, scenario: Scenario, i18n: Dictionary = en): number {
  // hold（D70）：作者要求这一步至少停这么久
  // 有旁白 / 台词的步骤按朗读估算（读完才进下一步），封面上的“约 M 秒”与带声音的真实时长一致
  return scenario.steps.reduce((sum, step) => sum + Math.max(holdMsOf(step), voiceMs(step.narrate ?? step.say), stepDwell({ texts: dwellTexts(step, i18n), paced: step.hold !== undefined, cameraMoved: step.shots.length > 0 || !!step.directorLayer, streamMs: Math.max(0, ...streamPlan(step, null).map((x) => x.ms)) })), 0);
}

/** 取整成好读的数：10 秒以内按秒向上取整，一分钟以内按 5 秒取整，再长按分钟四舍五入。 */
export function approxDuration(ms: number): Duration {
  const s = Math.max(0, ms) / 1000;
  if (s <= 10) return { unit: 's', value: Math.max(0, Math.ceil(s - 1e-9)) };
  if (s <= 60) return { unit: 's', value: Math.min(60, Math.round(s / 5) * 5) };
  return { unit: 'min', value: Math.max(1, Math.round(s / 60)) };
}

/** 场景里出场的角色：每个位置导演所在层的角色，加上换人过渡卡的角色；按功能里声明的顺序去重。 */
function rolesIn(project: Project, scenario: Scenario): RoleInfo[] {
  const layers = layersOf(project, scenario.id);
  const ids = new Set<string>();
  for (let i = 0; i <= scenario.steps.length; i++) {
    const layer = cameraAt(project, scenario.id, i).directorLayer;
    const r = roleOfScene(project, layers.find((l) => l.id === layer)?.sceneId);
    if (r) ids.add(r.id);
    const card = cardAt(project, scenario.id, i);
    if (card?.role && roleOf(project, scenario.optionId, card.role)) ids.add(card.role);
  }
  const featureId = project.options[scenario.optionId]?.featureId;
  const declared = (featureId ? project.features[featureId]?.roles : undefined) ?? [];
  return declared.flatMap((r) => (r.id && ids.has(r.id) ? [roleOf(project, scenario.optionId, r.id)!] : []));
}

export function coverFor(project: Project, scenarioId: string | null | undefined, i18n: Dictionary = en): CoverContent | null {
  const sc = scenarioId ? project.scenarios[scenarioId] : undefined;
  if (!sc || sc.steps.length === 0) return null;
  const opt = project.options[sc.optionId];
  const feat = opt ? project.features[opt.featureId] : undefined;
  const ms = scenarioMs(project, sc, i18n);
  return {
    scenarioId: sc.id,
    feature: feat?.name ?? null,
    option: opt?.name ?? null,
    title: sc.name,
    ...describe((sc.description ?? '').trim(), (feat?.goal ?? '').trim()),
    steps: sc.steps.length,
    ms,
    duration: approxDuration(ms),
    roles: rolesIn(project, sc),
  };
}

/** 封面说明：作者写的 flow description 优先，没写时退回功能目标（feature.goal 在发布站也保留）。 */
function describe(flow: string, goal: string): Pick<CoverContent, 'description' | 'descriptionFrom'> {
  if (flow) return { description: flow, descriptionFrom: 'flow' };
  if (goal) return { description: goal, descriptionFrom: 'goal' };
  return { description: null, descriptionFrom: null };
}
