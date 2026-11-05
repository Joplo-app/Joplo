/**
 * 某一步该用的镜头与画面（D43 / T-layers）：看板演示页、发布站、renderStep 静态截图和视频录制共用。
 * 全部由 core 的 cameraAt（纯函数，从步骤推导）算出；manualLayer = 用户手动选的层级（导演关闭），null = 导演跟随。
 *
 * 有层级的方案：每层是独立画面，sceneId 是当前层的画面；镜头在这一层自己的坐标里对准它的焦点。
 * 没有层级的方案：sceneId = null（显示状态里的路径页面），镜头用 shot 写在路径页面上的焦点。
 */
import { DIRECTOR_LAYER, PAGE_LAYER, cameraAt, layersOf, type Project, type Scenario } from '@tokenroll/joplo-core';
import type { CameraSpec } from '../renderer/camera';
import { cardReserve, cardSize } from './callout';

export type CameraPlan = {
  /** 这个场景是否用镜头：方案声明了层级，或步骤里写了 shot。 */
  enabled: boolean;
  layers: { id: string; title: string; sceneId: string }[];
  director: boolean;
  /** 当前显示的层级；没有层级时是 @page。 */
  viewLayer: string;
  /** 当前层级的画面；null = 状态里的路径页面（没有层级）。 */
  sceneId: string | null;
  spec: CameraSpec | null;
};

export function cameraFor(project: Project, scenarioId: string | null, position: number, manualLayer: string | null): CameraPlan {
  const sc = scenarioId ? project.scenarios[scenarioId] : null;
  const layers = layersOf(project, sc?.id ?? null);
  if (!sc) return { enabled: false, layers, director: true, viewLayer: layers[0]?.id ?? PAGE_LAYER, sceneId: layers[0]?.sceneId ?? null, spec: null };
  const cam = cameraAt(project, sc.id, position);
  if (!layers.length) {
    const enabled = sc.steps.some((st) => st.shots?.length);
    const targets = cam.perLayer[PAGE_LAYER] ?? [];
    return { enabled, layers, director: true, viewLayer: PAGE_LAYER, sceneId: null, spec: enabled ? { targets, key: `${PAGE_LAYER}|${targets.join(',')}` } : null };
  }
  const director = manualLayer === null || !layers.some((l) => l.id === manualLayer);
  const want = director ? cam.directorLayer : manualLayer!;
  const def = layers.find((l) => l.id === want) ?? layers[0]!;
  const targets = cam.perLayer[def.id] ?? [];
  return { enabled: true, layers, director, viewLayer: def.id, sceneId: def.sceneId, spec: { targets, key: `${def.id}|${targets.join(',')}` } };
}

/**
 * 镜头用哪一个位置（T-director3）：系统步骤一开始播放就切到这一步之后的镜头，与正在显示的解说卡 / 字幕一致；
 * 用户操作要先在当前画面里点到目标，镜头在提交之后才切（切层由演示控制器先行处理）。
 * 修正：此前系统步骤提交前的停留期间，解说卡已经是这一步，镜头却还停在上一步。
 */
export function cameraPosition(scenario: Scenario | null | undefined, position: number, activeStep: number | null): number {
  if (!scenario || activeStep === null) return position;
  const st = scenario.steps[activeStep];
  return st && st.kind === 'system' && activeStep === position ? position + 1 : position;
}

/**
 * 解说卡的锚点候选（T-director3），按优先级：导演层（viewLayer）本步镜头的主目标（该层第一个 shot 的第一个 id）、
 * 被操作的元素、这一层此刻镜头里的第一个目标。界面取第一个在画面上可见的。
 */
export function cardAnchors(project: Project, scenarioId: string, stepIndex: number, viewLayer: string): string[] {
  const sc = project.scenarios[scenarioId];
  const st = sc?.steps[stepIndex];
  if (!sc || !st) return [];
  const out: string[] = [];
  const add = (id: string | undefined) => {
    if (id && !out.includes(id)) out.push(id);
  };
  const cam = cameraAt(project, scenarioId, stepIndex + 1);
  for (const s of st.shots) {
    const layer = s.layer === DIRECTOR_LAYER ? cam.directorLayer : s.layer;
    if (layer === viewLayer) add(s.targets[0]);
  }
  if ('target' in st.action) add(st.action.target);
  add(cam.perLayer[viewLayer]?.[0]);
  return out;
}

/**
 * 解说卡计划（T-director3）：用镜头的方案在导演跟随时显示；内容是 stepIndex 这一步（播放中的一步，或刚执行完的一步），
 * 锚点候选见 cardAnchors；reserve 是镜头按卡片的估算尺寸给它留的位置。演示页、发布站、renderStep、视频共用。
 */
export function cardPlan(project: Project, scenarioId: string | null, plan: CameraPlan, director: boolean, stepIndex: number | null, W: number) {
  const sc = scenarioId ? project.scenarios[scenarioId] : null;
  if (!sc || !plan.enabled || !director || stepIndex === null || stepIndex < 0) return null;
  const step = sc.steps[stepIndex];
  if (!step) return null;
  return { step, anchors: cardAnchors(project, sc.id, stepIndex, plan.viewLayer), reserve: cardReserve(W, cardSize(step.caption, step.explain, W)) };
}
