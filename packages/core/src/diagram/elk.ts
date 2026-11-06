/**
 * 仅限 Node：同步运行 elkjs（Eclipse Layout Kernel 的 JS 版，EPL-2.0），给编译期的图表布局用（D69）。
 *
 * elkjs 的公开 API 是异步的（Web Worker 或 setTimeout 模拟的 FakeWorker），但它的 Dispatcher 本身是同步的：
 * 直接调用 FakeWorker.dispatcher.saveDispatch，回调在同一个调用栈里返回结果。这样 compile() 保持同步，
 * check、dev、build 的调用方式都不变。elkjs 固定版本（package.json 精确版本），这个内部接口由测试守住。
 *
 * elkjs 只在这里加载：浏览器端（看板、发布站）不打包它，发布站只读 IR 里写好的坐标。
 */
import { createRequire } from 'node:module';
import { DEFAULT_ASPECT, layoutGraph, type ElkNode, type ElkRun, type LayoutGoal } from './graph-layout.ts';
import { structureKey, type GraphLayout, type GraphStructure } from './model.ts';

type FakeWorker = { onmessage: (e: { data: { id: number; data?: unknown; error?: unknown } }) => void; dispatcher: { saveDispatch: (e: { data: unknown }) => void } };

let worker: FakeWorker | null = null;
function elkWorker(): FakeWorker {
  if (worker) return worker;
  const require = createRequire(import.meta.url);
  const mod = require('elkjs/lib/elk-worker.min.js') as { Worker: new () => FakeWorker };
  const w = new mod.Worker();
  w.onmessage = () => {};
  w.dispatcher.saveDispatch({ data: { id: 0, cmd: 'register', algorithms: ['layered'] } });
  worker = w;
  return w;
}

/** 同步运行一次 ELK 布局；ELK 报错时抛出 Error。 */
export const runElk: ElkRun = (graph: ElkNode): ElkNode => {
  const w = elkWorker();
  let out: { data?: unknown; error?: unknown } | null = null;
  w.onmessage = (e) => {
    out = e.data;
  };
  w.dispatcher.saveDispatch({ data: { id: 1, cmd: 'layout', graph, layoutOptions: {}, options: {} } });
  const res = out as { data?: unknown; error?: unknown } | null;
  if (!res) throw new Error('ELK did not return a layout');
  if (res.error) {
    const e = res.error as { message?: string; g?: string };
    throw new Error(String(e.message ?? e.g ?? e).split('\n')[0]!.slice(0, 300));
  }
  return res.data as ElkNode;
};

/** 按结构缓存（dev 每次保存都重新编译，结构没变的图不再跑 ELK）。 */
const cache = new Map<string, GraphLayout>();
const CACHE_MAX = 300;

/** 编译期的图表布局引擎：传给 compile(src, mode, { layout: elkLayout })。goal = 目标外框比例（舞台比例）。 */
export function elkLayout(s: GraphStructure, goal: LayoutGoal = { aspect: DEFAULT_ASPECT }): GraphLayout {
  const key = `${goal.aspect.toFixed(3)}|${goal.width ?? ''}|${goal.height ?? ''}|${structureKey(s)}`;
  const hit = cache.get(key);
  if (hit) return structuredClone(hit);
  const l = layoutGraph(structuredClone(s), runElk, goal);
  cache.set(key, l);
  if (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value!);
  return structuredClone(l);
}
