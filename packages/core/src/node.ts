/** 仅限 Node 端的入口（文件系统加载）。浏览器端只用 `@joplo-app/core`。 */
export * from './load.ts';
/** 编译期图表布局引擎（elkjs，D69）：compile(src, mode, { layout: elkLayout })。 */
export { elkLayout, runElk } from './diagram/elk.ts';
