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
import { findNode, nodeLabel, stateAt, walkNodes, type Project, type Scene, type SceneNode, type Selection } from '@joplo/core';

/** 浏览器提交的选中（服务端补全其余字段）。 */
export const SelectionInput = z.strictObject({
  optionId: z.string().min(1).max(256).nullable(),
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
  const optionId = input.optionId;
  if (optionId !== null) {
    const opt = project.options[optionId];
    if (!opt) return { ok: false, problem: `方案 ${optionId} 不存在` };
    featureId = opt.featureId;
  }
  if (input.scenarioId !== null) {
    const sc = project.scenarios[input.scenarioId];
    if (!sc) return { ok: false, problem: `场景 ${input.scenarioId} 不存在` };
    if (optionId !== sc.optionId) return { ok: false, problem: `场景 ${sc.id} 不属于方案 ${optionId ?? '(无)'}` };
    if (input.position > sc.steps.length) return { ok: false, problem: `位置 ${input.position} 超出场景 ${sc.id} 的范围 0..${sc.steps.length}` };
    try {
      sceneId = stateAt(project, sc.id, input.position).sceneId;
    } catch (e) {
      return { ok: false, problem: `场景 ${sc.id} 无法回放到位置 ${input.position}：${e instanceof Error ? e.message : String(e)}` };
    }
    if (input.sceneId !== sceneId) return { ok: false, problem: `位置 ${input.position} 的画面是 ${sceneId}，不是 ${input.sceneId}` };
    stepId = sc.steps[input.position - 1]?.id ?? null;
    if (input.stepId) {
      if (!sc.steps.some((s) => s.id === input.stepId)) return { ok: false, problem: `步骤 ${input.stepId} 不在场景 ${sc.id} 中` };
      stepId = input.stepId;
    }
  } else if (input.position !== 0 || input.stepId) return { ok: false, problem: '没有场景时位置必须为 0，且不能选中步骤' };
  const scene = project.scenes[sceneId];
  if (!scene) return { ok: false, problem: `画面 ${sceneId} 不存在` };
  if (input.scenarioId === null && optionId !== null && scene.optionId !== optionId && scene.optionId !== null)
    return { ok: false, problem: `画面 ${sceneId} 不属于方案 ${optionId}` };

  let at: string | null = null;
  let label: string | null = null;
  if (input.nodeId) {
    const hit = findNode(scene, input.nodeId);
    if (!hit) return { ok: false, problem: `元素 ${input.nodeId} 不在画面 ${sceneId} 中` };
    at = hit.node.source ?? null;
    label = nodeLabel(hit.node); // Mantine 输入组件直接带 label 属性
  } else if (input.stepId && input.scenarioId) {
    const st = project.scenarios[input.scenarioId]!.steps.find((s) => s.id === input.stepId)!;
    at = st.source ?? null;
    label = st.caption;
  } else return { ok: false, problem: '选中必须指向一个元素或一个步骤' };

  return {
    ok: true,
    selection: {
      featureId,
      optionId,
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
