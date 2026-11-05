/**
 * 某一步该用的镜头与画面（D43 / T-layers）：看板演示页、发布站、renderStep 静态截图和视频录制共用。
 * 全部由 core 的 cameraAt（纯函数，从步骤推导）算出；manualLayer = 用户手动选的层级（导演关闭），null = 导演跟随。
 *
 * 有层级的方案：每层是独立画面，sceneId 是当前层的画面；镜头在这一层自己的坐标里对准它的焦点。
 * 没有层级的方案：sceneId = null（显示状态里的路径页面），镜头用 shot 写在路径页面上的焦点。
 */
import { PAGE_LAYER, cameraAt, layersOf, type Project, type Scenario } from '@tokenroll/joplo-core';
import type { CameraSpec } from '../renderer/camera';

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
 * 镜头用哪一个位置（T-director3）：系统步骤一开始播放就切到这一步之后的镜头，与字幕区正在显示的这一步一致；
 * 用户操作要先在当前画面里点到目标，镜头在提交之后才切（切层由演示控制器先行处理）。
 * 修正：此前系统步骤提交前的停留期间，说明已经是这一步，镜头却还停在上一步。
 */
export function cameraPosition(scenario: Scenario | null | undefined, position: number, activeStep: number | null): number {
  if (!scenario || activeStep === null) return position;
  const st = scenario.steps[activeStep];
  return st && st.kind === 'system' && activeStep === position ? position + 1 : position;
}
