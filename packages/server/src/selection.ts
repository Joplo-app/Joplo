/**
 * 看板写入 `.joplo/selection.json`（core 的 Selection 类型）。
 *
 * 流向：看板 DOM 的 data-jat → 浏览器提交「选中了谁」→ 这里对照当前 IR 校验，并由服务端
 * 重新计算 at / label / route / featureId（不信任浏览器给的 at）→ 原子写入文件 → `joplo selection` 读取。
 *
 * 不变量：每次写接口返回后，selection.json 与界面显示的选中一致。被拒绝（409）时服务端写入 null，
 * 并在响应里返回 `current: null`，看板据此清除选中并明确提示。
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { findNode, nodeLabel, stateAt, walkNodes, type Project, type Scene, type SceneNode, type Selection } from '@joplo-app/core';

/** 浏览器提交的选中（服务端补全其余字段）。 */
export const SelectionInput = z.strictObject({
  workId: z.string().min(1).max(256).nullable(),
  scenarioId: z.string().min(1).max(256).nullable(),
  position: z.number().int().nonnegative().max(10000),
  sceneId: z.string().min(1).max(256),
  nodeId: z.string().min(1).max(128).nullable(),
  /** 只选中步骤（审阅模式点步骤芯片）时给出。 */
  stepId: z.string().min(1).max(300).nullable().optional(),
});
export type SelectionInput = z.infer<typeof SelectionInput>;
export const SelectionBody = z.strictObject({ selection: SelectionInput.nullable() });

/** 对照当前 IR 校验并补全；返回 Selection 或问题描述。 */
export function resolveSelection(project: Project, input: SelectionInput, now = new Date()): { ok: true; selection: Selection } | { ok: false; problem: string } {
  let sceneId = input.sceneId;
  let stepId: string | null = null;
  let featureId: string | null = null;
  const workId = input.workId;
  if (workId !== null) {
    const opt = project.works[workId];
    if (!opt) return { ok: false, problem: `Option ${workId} does not exist` };
    featureId = opt.featureId ?? null;
  }
  if (input.scenarioId !== null) {
    const sc = project.scenarios[input.scenarioId];
    if (!sc) return { ok: false, problem: `Scenario ${input.scenarioId} does not exist` };
    if (workId !== sc.workId) return { ok: false, problem: `Scenario ${sc.id} does not belong to option ${workId ?? '(none)'}` };
    if (input.position > sc.steps.length) return { ok: false, problem: `Position ${input.position} is outside scenario ${sc.id} range 0..${sc.steps.length}` };
    try {
      sceneId = stateAt(project, sc.id, input.position).sceneId;
    } catch (e) {
      return { ok: false, problem: `Scenario ${sc.id} cannot replay to position ${input.position}: ${e instanceof Error ? e.message : String(e)}` };
    }
    // 有层级的方案：用户看的是某一层的画面（各层共享同一份状态），也接受
    const layerScenes = Object.values(project.works[sc.workId]?.layers ?? {}).map((l) => l.sceneId);
    if (layerScenes.includes(input.sceneId)) sceneId = input.sceneId;
    if (input.sceneId !== sceneId) return { ok: false, problem: `Position ${input.position} has stage ${sceneId}, not ${input.sceneId}` };
    stepId = sc.steps[input.position - 1]?.id ?? null;
    if (input.stepId) {
      if (!sc.steps.some((s) => s.id === input.stepId)) return { ok: false, problem: `Step ${input.stepId} is not in scenario ${sc.id}` };
      stepId = input.stepId;
    }
  } else if (input.position !== 0 || input.stepId) return { ok: false, problem: 'Without a scenario, position must be 0 and no step may be selected' };
  const scene = project.scenes[sceneId];
  if (!scene) return { ok: false, problem: `Stage ${sceneId} does not exist` };
  if (input.scenarioId === null && workId !== null && scene.workId !== workId && scene.workId !== null)
    return { ok: false, problem: `Stage ${sceneId} does not belong to option ${workId}` };

  let at: string | null = null;
  let label: string | null = null;
  if (input.nodeId) {
    const hit = findNode(scene, input.nodeId);
    if (!hit) return { ok: false, problem: `Element ${input.nodeId} is not in stage ${sceneId}` };
    at = hit.node.source ?? null;
    label = nodeLabel(hit.node); // Mantine 输入组件直接带 label 属性
  } else if (input.stepId && input.scenarioId) {
    const st = project.scenarios[input.scenarioId]!.steps.find((s) => s.id === input.stepId)!;
    at = st.source ?? null;
    label = st.caption;
  } else return { ok: false, problem: 'Selection must point to an element or a step' };

  return {
    ok: true,
    selection: {
      featureId,
      workId,
      scenarioId: input.scenarioId,
      position: input.position,
      stepId,
      sceneId,
      route: scene.route,
      nodeId: input.nodeId,
      at,
      label,
      selectedAt: now.toISOString(),
    },
  };
}


/** 临时文件 + rename 的原子写入。 */
export function writeFileAtomic(file: string, data: string): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${crypto.randomBytes(4).toString('hex')}.tmp`;
  fs.writeFileSync(tmp, data);
  fs.renameSync(tmp, file);
}

export const selectionFile = (projectDir: string) => path.join(projectDir, '.joplo', 'selection.json');

export function writeSelection(projectDir: string, sel: Selection | null): void {
  writeFileAtomic(selectionFile(projectDir), JSON.stringify(sel, null, 2) + '\n');
}

export function readSelection(projectDir: string): Selection | null {
  try {
    return JSON.parse(fs.readFileSync(selectionFile(projectDir), 'utf8')) as Selection | null;
  } catch {
    return null;
  }
}
