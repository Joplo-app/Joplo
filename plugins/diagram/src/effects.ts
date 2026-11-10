import type { PluginEffectDef } from '@joplo-app/kit/plugin';
const pluginEffect = (plugin: string, name: string, payload: unknown): PluginEffectDef => ({ kind: 'effect', type: 'plugin', plugin, name, payload });
/**
 * 调用链（D48）：这一步沿 Diagram 的连线走了哪条路径。节点与连线的 state 由每一步的 trace 自动推算，不用再手写 set / state 绑定：
 * 本步 trace 到的是 active，之前 trace 过、本步没再 trace 的是 ok，trace.fail 的是 error（保持到之后又被 trace 成功），
 * trace.skip 的是 dim，从未涉及的是 idle；节点或连线上显式写的 state 优先。
 * 参数是节点 id 或连线 id：trace('brain', 'biz', 'local') 是 brain→biz、biz→local 两段；每段要有对应的连线，
 * 方向 from→to 或 to→from 都算（反向时流动的小点逆向走）；同一方向有多条连线时写连线 id：trace('e_brain_biz')。
 * trace(...ids, { focus: false }) 只更新状态，不建议宿主镜头；默认同时相当于一个 shot（节点作为镜头目标，顺序有意义）；同一步再写 shot 时两者合并。
 */
export type TraceOptions = { /** false keeps the host camera unchanged (for Canvas-owned framing). */ focus?: boolean };
type TraceArgs = [...ids: string[], options: TraceOptions] | string[];
const traceEffect = (mode: 'ok' | 'fail' | 'skip', args: TraceArgs): PluginEffectDef => {
  const last = args.at(-1);
  const options = typeof last === 'object' ? last : {};
  const ids = typeof last === 'object' ? args.slice(0, -1) : args;
  return pluginEffect('diagram', 'trace', { ids, mode, ...options });
};
export const trace = Object.assign((...args: TraceArgs): PluginEffectDef => traceEffect('ok', args), {
  /** 这段失败：连线和终点节点标为 error（保持到场景结束，除非之后又被 trace 成功）。 */
  fail: (...args: TraceArgs): PluginEffectDef => traceEffect('fail', args),
  /** 这次没被调用：节点（以及它们之间的连线）标为 dim；不移动镜头。 */
  skip: (...ids: string[]): PluginEffectDef => pluginEffect('diagram', 'trace', { ids, mode: 'skip' }),
});
