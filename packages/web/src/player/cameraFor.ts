/**
 * 某一步该用的镜头（D43）：看板演示页、发布站、renderStep 静态截图和视频录制共用。
 * 全部由 core 的 cameraAt（纯函数，从步骤推导）算出；manualLayer = 用户手动选的层级（导演关闭），null = 导演跟随。
 */
import { OVERVIEW_LAYER, cameraAt, layersOf, type Project } from '@tokenroll/joplo-core';
import type { CameraSpec } from '../renderer/camera';

export type CameraPlan = {
  /** 这个场景是否用镜头：方案声明了层级，或步骤里写了 shot。 */
  enabled: boolean;
  layers: { id: string; title: string; roots: string[] }[];
  director: boolean;
  viewLayer: string;
  spec: CameraSpec | null;
};

export function cameraFor(project: Project, scenarioId: string | null, position: number, manualLayer: string | null): CameraPlan {
  const sc = scenarioId ? project.scenarios[scenarioId] : null;
  const layers = layersOf(project, sc?.id ?? null);
  if (!sc) return { enabled: false, layers, director: true, viewLayer: OVERVIEW_LAYER, spec: null };
  const enabled = layers.length > 1 || sc.steps.some((st) => st.shots?.length);
  const cam = cameraAt(project, sc.id, position);
  const director = manualLayer === null || !layers.some((l) => l.id === manualLayer);
  const viewLayer = director ? cam.directorLayer : manualLayer!;
  const def = layers.find((l) => l.id === viewLayer) ?? layers[0]!;
  const targets = cam.perLayer[def.id] ?? [];
  return { enabled, layers, director, viewLayer: def.id, spec: enabled ? { targets, roots: def.roots, key: `${def.id}|${targets.join(',')}` } : null };
}
