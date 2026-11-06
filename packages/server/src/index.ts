/**
 * @joplo-app/server：CLI 只依赖这里导出的函数（接口见 contract.ts）。
 *
 * - startDev：单进程 Vite 开发服务，提供看板、编译与热更新；选中写入 .joplo/selection.json。
 * - buildSite：静态发布站（只含选定方案，hash 路由，file:// 可直接打开）。
 * - renderStep：某个场景某一步之后的截图、元素索引（带 at）与渲染告警。
 * - exportRuntimeStatus / installExportRuntime / uninstallExportRuntime：Joplo 托管的导出组件（D65，`joplo setup export`）。
 */
export type { BuildOptions, BuildResult, DevHandle, DevOptions, RenderOptions, RenderResult, RenderedElement } from './contract.ts';
export { startDev } from './dev.ts';
export { buildSite } from './build.ts';
export { renderStep } from './render.ts';
export { EXPORT_DOWNLOAD_MB, PLAYWRIGHT_VERSION, SETUP_COMMAND, exportRuntimeStatus, installExportRuntime, uninstallExportRuntime, type ExportRuntimeStatus, type InstallProgress, type InstallResult } from './export-runtime.ts';
