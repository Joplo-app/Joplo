import { rolesOf } from './entries.ts';
/**
 * 演示投影（纯函数）：第 k 步之后观众看到什么——导演镜头、显示哪一层的画面、过渡卡、角色、流式输出的出字计划、
 * 分叉、标注，以及这一步改了哪些状态。只读 IR 与回放出的状态，不推进状态。
 */
import { DIRECTOR_LAYER, PAGE_LAYER } from './catalog.ts';
import type { Project, Scenario, Step } from './schema.ts';
import { streamMs, voicePacedMs } from './pace.ts';
import { layersOf, layersWithNode, readPath, type PlayState } from './scene-query.ts';
import { stateAt, timelineMemo, timelineState } from './playback.ts';

// ---------- 导演镜头（D43 / T-layers） ----------

/** 某一步的镜头：导演层与每个层级当前对准的元素（空数组 = 这一层的整体）。 */
export type Camera = { directorLayer: string; perLayer: Record<string, string[]> };

/**
 * 第 position 步之后的镜头。纯函数：只由步骤上的 shots / directorLayer 推导，不进入 ui / data / inputs。
 * 初始导演层 = 第一个声明的层级（没有层级时是路径页面 @page），各层都是整体。
 * 没有 shot 的步骤沿用上一步；shot()（@director）让当时的导演层回到整体。
 * 手动、逐步、自动播放、回放、renderStep、视频录制和发布站都用它。
 */
export function cameraAt(project: Project, scenarioId: string, position: number): Camera {
  const sc = project.scenarios[scenarioId];
  if (!sc) return cameraOf(project, scenarioId, position);
  const cameras = timelineMemo(project, sc, 'cameras', () => camerasOf(project, sc));
  const c = cameras[Math.max(0, Math.min(Number.isFinite(position) ? Math.trunc(position) : 0, sc.steps.length))]!;
  return { directorLayer: c.directorLayer, perLayer: Object.fromEntries(Object.entries(c.perLayer).map(([k, v]) => [k, [...v]])) };
}

/** 每个位置（0..步数）的镜头，一次遍历算完。 */
function camerasOf(project: Project, sc: Scenario): Camera[] {
  const layers = layersOf(project, sc.id);
  let directorLayer = (sc.initial.layer && layers.some((l) => l.id === sc.initial.layer) ? sc.initial.layer : layers[0]?.id) ?? PAGE_LAYER;
  let perLayer: Record<string, string[]> = {};
  const out: Camera[] = [{ directorLayer, perLayer }];
  for (const st of sc.steps) {
    if (st.directorLayer) directorLayer = st.directorLayer;
    if (st.shots?.length) {
      perLayer = { ...perLayer };
      for (const s of st.shots) perLayer[s.layer === DIRECTOR_LAYER ? directorLayer : s.layer] = [...s.targets];
    }
    out.push({ directorLayer, perLayer });
  }
  return out;
}

/** cameraAt 的不缓存版本：编译器在 IR 还没定稿时用。 */
export function cameraOf(project: Project, scenarioId: string, position: number): Camera {
  const sc = project.scenarios[scenarioId];
  if (!sc) return { directorLayer: layersOf(project, scenarioId)[0]?.id ?? PAGE_LAYER, perLayer: {} };
  const c = camerasOf(project, sc)[Math.max(0, Math.min(Number.isFinite(position) ? Math.trunc(position) : 0, sc.steps.length))]!;
  return { directorLayer: c.directorLayer, perLayer: Object.fromEntries(Object.entries(c.perLayer).map(([k, v]) => [k, [...v]])) };
}

/** 第 position 步之后用户看到的画面：有层级时是导演层（或手动选的层）的画面，否则是状态里的路径画面。 */
export function displaySceneId(project: Project, scenarioId: string, position: number, layer?: string | null): string {
  const layers = layersOf(project, scenarioId);
  const state = stateAt(project, scenarioId, position);
  if (!layers.length) return state.sceneId;
  const want = layer && layers.some((l) => l.id === layer) ? layer : cameraAt(project, scenarioId, position).directorLayer;
  return (layers.find((l) => l.id === want) ?? layers[0]!).sceneId;
}

/** 第 index 步（0 起）的镜头是否改变了某一层（“只重放这一层”时，不变的步骤快速带过）。 */
export function stepTouchesLayer(project: Project, scenarioId: string, index: number, layer: string): boolean {
  const st = project.scenarios[scenarioId]?.steps[index];
  if (!st) return false;
  if ((st.shots ?? []).some((s) => s.layer === layer || (s.layer === DIRECTOR_LAYER && cameraAt(project, scenarioId, index + 1).directorLayer === layer))) return true;
  // 操作目标在这一层的步骤也算（要看着它被点）
  return 'target' in st.action && layersWithNode(project, scenarioId, st.action.target).includes(layer);
}

// ---------- 过渡卡、角色、流式输出（D56） ----------

export type CardAction = Extract<Step['action'], { type: 'card' }>;
export type RoleInfo = { id: string; name: string; desc: string; color: string };

/** 第 position 步之后是否停在一张过渡卡上（最近执行的一步是过渡卡）；是则返回卡片内容。 */
export function cardAt(project: Project, scenarioId: string | null | undefined, position: number): CardAction | null {
  const st = scenarioId ? project.scenarios[scenarioId]?.steps[position - 1] : undefined;
  return st && st.action.type === 'card' ? st.action : null;
}

/** 方案所属功能里可引用的角色（有 id 的）。 */
export function roleOf(project: Project, workId: string | null | undefined, roleId: string | null | undefined): RoleInfo | null {
  if (!workId || !roleId) return null;
  const r = rolesOf(project, workId).find(x => x.id === roleId);
  return r && r.id ? { id: r.id, name: r.name, desc: r.desc, color: r.color } : null;
}

/** 某个画面是谁的（层级声明了 role 时）；路径页面与没有角色的层级返回 null。 */
export function roleOfScene(project: Project, sceneId: string | null | undefined): RoleInfo | null {
  const scene = sceneId ? project.scenes[sceneId] : undefined;
  if (!scene?.layer || !scene.workId) return null;
  return roleOf(project, scene.workId, project.works[scene.workId]?.layers[scene.layer]?.role);
}

/** 第 index 步（0 起）流式输出的状态路径与文字。 */
export function streamsOf(step: Step | undefined): { path: string; value: string; pace?: 'voice' }[] {
  return (step?.effects ?? []).flatMap((e) => (e.type === 'stream' ? [{ path: e.path, value: e.value, ...(e.pace ? { pace: e.pace } : {}) }] : []));
}

/** 一段流式输出怎么出字：keep 个字一开始就在（原来的值），其余的字在 ms 毫秒（1×）里逐字出现。 */
export type StreamPlan = { path: string; value: string; keep: number; ms: number; pace?: 'voice' };

/**
 * 这一步的流式输出怎么出字（D56，D100）。prev 是这一步之前的状态；不知道时传 null（整段重新出，用于估算）。
 * - 接着往后写：新值以原来的值开头时，原有的字直接显示，只有新加的字逐字出现；
 * - pace: 'voice'：新加的字在这一步朗读（narrate ?? say）的估算时长里出完，读到哪写到哪；没有朗读时退回按字数。
 */
export function streamPlan(step: Step | undefined, prev: Pick<PlayState, 'ui' | 'data' | 'inputs'> | null): StreamPlan[] {
  return streamsOf(step).map((s) => {
    const before = prev ? readPath(prev, s.path) : undefined;
    const keep = typeof before === 'string' && before && s.value.startsWith(before) ? [...before].length : 0;
    const fresh = [...s.value].slice(keep).join('');
    const voiced = s.pace === 'voice' && !step?.mute ? voicePacedMs(step?.narrate ?? step?.say) : 0;
    return { path: s.path, value: s.value, keep, ms: fresh ? (voiced || streamMs(fresh)) : 0, ...(s.pace ? { pace: s.pace } : {}) };
  });
}

// ---------- 分叉、标注与变化（D56 P1） ----------

/** 动作和业务效果完全相同的公共前缀步数；字幕、镜头、分叉等展示信息不参与。 */
export function commonPrefix(a: readonly Pick<Step, 'action' | 'effects'>[], b: readonly Pick<Step, 'action' | 'effects'>[]): number {
  let n = 0;
  while (n < Math.min(a.length, b.length) && sameValue(a[n]!.action, b[n]!.action) && sameValue(a[n]!.effects, b[n]!.effects)) n++;
  return n;
}

function sameValue(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object') return false;
  if (Array.isArray(a) || Array.isArray(b)) return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((v, i) => sameValue(v, b[i]));
  const ak = Object.keys(a), bk = Object.keys(b);
  return ak.length === bk.length && ak.every(k => Object.hasOwn(b, k) && sameValue((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]));
}

export function forksAt(project: Project, scenarioId: string | null | undefined, position: number): Step['forks'] {
  return forksOf(scenarioId ? project.scenarios[scenarioId]?.steps[position - 1] : undefined);
}

/** 与 Toast 一样只显示最近一步，目标是否可见由当前显示画面决定。 */
export function marksAt(project: Project, scenarioId: string | null | undefined, position: number): Step['marks'] {
  return (scenarioId ? project.scenarios[scenarioId]?.steps[position - 1]?.marks : undefined) ?? [];
}

export type StateChange = { path: string; before: unknown; after: unknown };
/** 对比 core 回放产生的相邻状态：对象按叶子展开，数组作为一个值；不包含动画、Toast 等展示状态。 */
export function changedAt(project: Project, scenarioId: string | null | undefined, position: number): StateChange[] {
  const sc = scenarioId ? project.scenarios[scenarioId] : undefined;
  if (!sc || !Number.isInteger(position) || position <= 0 || position > sc.steps.length) return [];
  const before = timelineState(project, sc, position - 1);
  const after = timelineState(project, sc, position);
  const out: StateChange[] = [];
  const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
  const diff = (path: string, a: unknown, b: unknown) => {
    if (sameValue(a, b)) return;
    if ((object(a) || a === undefined) && (object(b) || b === undefined) && (object(a) || object(b))) {
      const keys = [...new Set([...Object.keys(a ?? {}), ...Object.keys(b ?? {})])].sort();
      if (keys.length) { for (const k of keys) diff(`${path}.${k}`, a?.[k], b?.[k]); return; }
    }
    out.push({ path, before: structuredClone(a), after: structuredClone(b) });
  };
  for (const root of ['ui', 'data', 'inputs'] as const) diff(root, before[root], after[root]);
  return out;
}

/** 已定位的一步的路线；字幕也用这一个投影入口。 */
export function forksOf(step: Step | undefined): Step['forks'] { return step?.forks ?? []; }

/** 按键记录的 IR 入口：静态取最近一步，动画预览与键帽分词由 web 负责。 */
export function keyboardActionOf(step: Step | undefined): Extract<Step['action'], { type: 'type' | 'press' }> | null {
  const a = step?.action;
  return a?.type === 'type' || a?.type === 'press' ? a : null;
}

