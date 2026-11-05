/**
 * 本地预览服务与渲染截图（T-web）。CLI 只依赖这里导出的 startServer / renderStep。
 *
 * 安全边界（PRD 15.1）：
 * - 只绑定 127.0.0.1；每个请求校验 Host（127.0.0.1 / localhost + 端口），防 DNS 重绑定。
 * - 写接口校验 Origin（存在时必须是本服务）、Content-Type 与本地令牌（x-joplo-token）。
 * - 服务不写 project.joplo.json（那是 core 的职责），只写 .joplo/selection.json。
 */
export type { RenderOptions, RenderResult, RenderedElement, ServeHandle, ServeOptions } from './types.ts';
export { startServer } from './serve.ts';
export { renderStep } from './render.ts';
export { ensureWebBuild } from './web-build.ts';
