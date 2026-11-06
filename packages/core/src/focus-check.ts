/**
 * 焦点相关的 check 提示（D70），少而准：
 * - FOCUS_OFF_LAYER（warning）：提示 / 气泡 / 标注的目标不在这一步导演所在的层，观众看不到（之前静默不画）；
 * - FOCUS_CONFLICT（warning）：这一步自己写了 shot，提示的目标却在 shot 之外：镜头对准一处、提示指向另一处；
 * - CALLOUT_TOO_LONG（warning）：气泡与字幕同一口径（CAPTION_MAX）；
 * - FOCUS_IDLE（info，需要回放）：连续 FOCUS_IDLE_RUN 个系统步骤画面上什么都没变，观众只能读字幕。
 * 焦点目标不存在（FOCUS_UNKNOWN）、参数不合法由编译器报 error。
 */
import { CAPTION_MAX, DIRECTOR_LAYER, PAGE_LAYER, captionLength } from './catalog.ts';
import { focusTimeline, inShotFrame } from './focus.ts';
import { cameraAt, findNode, layersOf } from './player.ts';
import type { Diagnostic } from './result.ts';
import type { Project, Scenario, Scene } from './schema.ts';

export const FOCUS_IDLE_RUN = 3;

type Emit = (severity: Diagnostic['severity'], code: string, message: string, at: string | undefined, ref?: Diagnostic['ref']) => void;

/** 结构类提示：只看 IR，不回放。 */
export function focusStructureDiagnostics(p: Project, scenarios: Scenario[], emit: Emit): void {
  for (const sc of scenarios) {
    const layers = layersOf(p, sc.id);
    const sceneOfLayer = (lk: string): Scene | undefined => p.scenes[layers.find((l) => l.id === lk)?.sceneId ?? ''];
    sc.steps.forEach((st, i) => {
      const at = st.source ?? sc.source;
      const ref = { kind: 'step' as const, id: st.id, optionId: sc.optionId, stepId: st.id };
      for (const c of st.callouts ?? []) {
        const n = captionLength(c.text);
        if (n > CAPTION_MAX) emit('warning', 'CALLOUT_TOO_LONG', `callout("${c.target}") text is ${n} units (recommended maximum: ${CAPTION_MAX}, same as captions): "${c.text}". Say one reason in a few words; put the rest in explain()`, at, ref);
      }
      const named: { id: string; fn: string }[] = [
        ...(st.cues ?? []).flatMap((c) => c.targets.map((id) => ({ id, fn: c.kind === 'number' ? 'numbered' : c.kind }))),
        ...(st.callouts ?? []).map((c) => ({ id: c.target, fn: 'callout' })),
        ...(st.marks ?? []).map((m) => ({ id: m.target, fn: 'mark' })),
      ];
      if (!named.length) return;
      const layer = layers.length ? cameraAt(p, sc.id, i + 1).directorLayer : PAGE_LAYER;
      const scene = layers.length ? sceneOfLayer(layer) : undefined;
      // 有层级：目标要在导演层里，否则这一步看不到它
      if (scene) {
        for (const { id, fn } of named) {
          if (findNode(scene, id)) continue;
          const elsewhere = layers.filter((l) => { const s = p.scenes[l.sceneId]; return !!s && !!findNode(s, id); }).map((l) => l.id);
          emit('warning', 'FOCUS_OFF_LAYER', `${fn}("${id}") is in layer ${elsewhere.join(', ') || '?'}, but after this step the director is on layer ${layer}, so viewers will not see it. Add shot('${id}') to switch there, or point at an element in ${layer}`, at, ref);
        }
      }
      // 这一步写了 shot：提示的目标要在镜头里（镜头目标、它的子元素，或 D69 取景一定带上的父分组 / 两端参与者，见 inShotFrame）
      const shots = (st.shots ?? []).filter((s) => (s.layer === layer || s.layer === DIRECTOR_LAYER) && s.targets.length);
      const frameScene = scene ?? (layers.length ? undefined : sceneAtStep(p, sc, i));
      if (!shots.length || !frameScene) return;
      const frame = shots.flatMap((s) => s.targets);
      for (const { id, fn } of named) {
        if (fn === 'mark' || !findNode(frameScene, id)) continue;
        const inside = inShotFrame(frameScene.root, id, frame);
        if (!inside) emit('warning', 'FOCUS_CONFLICT', `This step frames ${frame.map((x) => `"${x}"`).join(', ')} with shot, but ${fn}("${id}") points outside that frame; it may be off-screen or dimmed. Point both at the same thing, add "${id}" to the shot, or split this into two steps`, at, ref);
      }
    });
  }
}

/** 回放类提示：需要每一步的状态（只对回放成功的场景调用）。 */
export function focusReplayDiagnostics(p: Project, sc: Scenario, emit: Emit): void {
  const tl = focusTimeline(p, sc.id);
  let run: number[] = [];
  const flush = () => {
    if (run.length >= FOCUS_IDLE_RUN) {
      const first = sc.steps[run[0]!]!;
      emit('info', 'FOCUS_IDLE', `${run.length} system steps in a row (${run.map((i) => i + 1).join(', ')}) change nothing on stage, so viewers only read captions. Merge them into one step, or show what happens: shot / highlight / callout the element, or set() state that the stage displays`, first.source ?? sc.source, { kind: 'step', id: first.id, optionId: sc.optionId, stepId: first.id });
    }
    run = [];
  };
  sc.steps.forEach((st, i) => {
    const f = tl[i + 1];
    if (st.kind === 'system' && f && f.subject === 'caption') run.push(i);
    else flush();
  });
  flush();
}

/** 没有层级的方案：第 i 步执行之后的路径画面（按 navigate / back 推算，与回放相同的页面栈）。 */
function sceneAtStep(p: Project, sc: Scenario, i: number): Scene | undefined {
  let sceneId = sc.initial.sceneId;
  const stack: string[] = [];
  for (let k = 0; k <= i; k++) {
    const st = sc.steps[k]!;
    if (st.action.type === 'back') sceneId = stack.pop() ?? sceneId;
    for (const e of st.effects) if (e.type === 'navigate') { stack.push(sceneId); sceneId = e.sceneId; }
  }
  return p.scenes[sceneId];
}
